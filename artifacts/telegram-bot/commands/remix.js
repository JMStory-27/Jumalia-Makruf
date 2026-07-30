'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const ui = require('./ui.cjs');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../');

const TELEGRAM_MAX_BYTES = 49 * 1024 * 1024;   // 49 MB safety margin
const CHUNK_SIZE = 45 * 1024 * 1024;            // 45 MB per part

// ─── Whitelist: folder sumber yang PENTING untuk di-backup ───────────────────
// Hanya folder ini yang akan di-scan. node_modules, dist, .cache dll
// TIDAK akan pernah masuk karena tidak ada dalam whitelist ini.
const SOURCE_DIRS = [
    // Anisub — website streaming anime
    'artifacts/anisub/src',
    'artifacts/anisub/public',
    'artifacts/anisub/scripts',
    // Telegram Bot — seluruh logika bot
    'artifacts/telegram-bot/commands',
    'artifacts/telegram-bot/src',
    'artifacts/telegram-bot/web',
    'artifacts/telegram-bot/scripts',
    'artifacts/telegram-bot/data',
    'artifacts/telegram-bot/public',
    // API Server
    'artifacts/api-server/src',
    // Mockup sandbox
    'artifacts/mockup-sandbox/src',
    // Shared libraries & utility scripts
    'lib',
    'scripts/src',
    'scripts',
];

// Root artifact: ambil hanya file langsung (bukan rekursif) dengan ekstensi source
const ARTIFACT_ROOTS = [
    'artifacts/anisub',
    'artifacts/telegram-bot',
    'artifacts/api-server',
    'artifacts/mockup-sandbox',
    'artifacts/api-spec',
    '',   // workspace root
];
const SOURCE_ROOT_EXTS = new Set([
    '.ts', '.tsx', '.js', '.mjs', '.cjs', '.jsx',
    '.json', '.yaml', '.yml', '.toml', '.md', '.txt',
    '.html', '.css', '.svg', '.sh', '.env',
    '.eslintrc', '.prettierrc', '.editorconfig',
]);

// Dalam setiap folder yang di-scan, SKIP direktori ini
const SKIP_DIR_NAMES = new Set([
    'node_modules', 'dist', 'dist-cjs', '.git', '.cache', '.vite',
    '.turbo', '.pnpm', '.pnpm-store', '.nyc_output', 'coverage',
    'bot_extracted', '.expo', '__pycache__', '.idea', '.vscode',
]);

// Skip ekstensi binary/besar — tidak perlu untuk rebuild source
const SKIP_BINARY_EXTS = new Set([
    '.apk', '.aab', '.zip', '.tar', '.gz', '.rar', '.7z',
    '.exe', '.dmg', '.pkg', '.deb', '.rpm', '.bin',
    '.sqlite', '.db', '.map', '.pyc',
]);

// Skip gambar berat — untuk rebuild tidak dibutuhkan, bisa di-download ulang
const SKIP_IMAGE_EXTS = new Set([
    '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico',
    '.bmp', '.tiff', '.psd', '.ai',
]);

// Skip file lock dan log
const SKIP_FILE_NAMES = new Set([
    'pnpm-lock.yaml', 'package-lock.json', 'yarn.lock',
    '.DS_Store', 'Thumbs.db',
]);

const MAX_FILE_BYTES = 3 * 1024 * 1024; // 3 MB per file — safety net

function shouldSkipFile(fname) {
    if (SKIP_FILE_NAMES.has(fname)) return true;
    const ext = path.extname(fname).toLowerCase();
    if (SKIP_BINARY_EXTS.has(ext)) return true;
    if (SKIP_IMAGE_EXTS.has(ext)) return true;
    if (/^\.cache-/.test(fname)) return true;
    if (/\.log$/.test(fname)) return true;
    return false;
}

function walkDir(rootDir, dirAbs, seen, result) {
    const stack = [dirAbs];
    while (stack.length) {
        const dir = stack.pop();
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            const abs = path.join(dir, e.name);
            if (seen.has(abs)) continue;
            seen.add(abs);
            if (e.isDirectory()) {
                if (!SKIP_DIR_NAMES.has(e.name)) stack.push(abs);
            } else if (e.isFile()) {
                if (shouldSkipFile(e.name)) continue;
                try {
                    const stat = fs.statSync(abs);
                    if (stat.size > MAX_FILE_BYTES) continue;
                    result.push({ abs, rel: path.relative(rootDir, abs).replace(/\\/g, '/') });
                } catch {}
            }
        }
    }
}

function collectAllFiles(rootDir) {
    const result = [];
    const seen   = new Set();

    // 1. Scan semua SOURCE_DIRS (whitelist rekursif)
    for (const srcDir of SOURCE_DIRS) {
        const abs = path.join(rootDir, srcDir);
        if (fs.existsSync(abs)) walkDir(rootDir, abs, seen, result);
    }

    // 2. Root files artifact: hanya file langsung dengan ekstensi source
    for (const arDir of ARTIFACT_ROOTS) {
        const dirAbs = path.join(rootDir, arDir);
        let entries;
        try { entries = fs.readdirSync(dirAbs, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            if (!e.isFile()) continue;
            const abs = path.join(dirAbs, e.name);
            if (seen.has(abs)) continue;
            const ext = path.extname(e.name).toLowerCase();
            if (!SOURCE_ROOT_EXTS.has(ext)) continue;
            if (shouldSkipFile(e.name)) continue;
            try {
                const stat = fs.statSync(abs);
                if (stat.size > MAX_FILE_BYTES) continue;
                seen.add(abs);
                result.push({ abs, rel: path.relative(rootDir, abs).replace(/\\/g, '/') });
            } catch {}
        }
    }

    return result.sort((a, b) => a.rel.localeCompare(b.rel));
}

function fmtSize(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

// ── GitHub upload helpers (fallback jika archive terlalu besar untuk Telegram) ──
async function ghFetch(token, method, urlPath, body, isUpload = false, uploadBuffer = null) {
    const baseUrl = isUpload ? 'https://uploads.github.com' : 'https://api.github.com';
    const r = await fetch(baseUrl + urlPath, {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': isUpload ? 'application/gzip' : 'application/json',
            'User-Agent': 'AlbumAbadiBot',
        },
        body: isUpload ? uploadBuffer : (body ? JSON.stringify(body) : undefined),
    });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _raw: text }; }
    if (!r.ok) {
        const err = new Error(`GH ${r.status}: ${json.message || text.slice(0, 200)}`);
        err.status = r.status;
        throw err;
    }
    return json;
}

async function uploadToGithub(token, owner, repo, archiveName, archiveBuffer) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const tagName = `remix-${timestamp}`;
    let release;
    try {
        release = await ghFetch(token, 'GET', `/repos/${owner}/${repo}/releases/tags/${tagName}`);
    } catch (e) {
        if (e.status !== 404) throw e;
        release = await ghFetch(token, 'POST', `/repos/${owner}/${repo}/releases`, {
            tag_name: tagName,
            name: `Workspace Remix — ${tagName}`,
            body: 'Auto-generated workspace archive oleh /remix',
            draft: false,
            prerelease: false,
        });
    }
    const uploadUrl = release.upload_url.replace('{?name,label}', '');
    const r = await fetch(`${uploadUrl}?name=${encodeURIComponent(archiveName)}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/gzip',
            'User-Agent': 'AlbumAbadiBot',
        },
        body: archiveBuffer,
    });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _raw: text }; }
    if (!r.ok) throw new Error(`Upload GitHub gagal ${r.status}: ${json.message || text.slice(0, 200)}`);
    return json.browser_download_url;
}

// ── Split archive jadi beberapa part ──
async function sendSplitParts(bot, chatId, archivePath, archiveStat, totalBytes, files, folderSummary, edit) {
    const archiveBuffer = fs.readFileSync(archivePath);
    const parts = [];
    for (let i = 0; i < archiveBuffer.length; i += CHUNK_SIZE) {
        parts.push(archiveBuffer.slice(i, i + CHUNK_SIZE));
    }

    edit(`✂️ _Membagi arsip menjadi ${parts.length} bagian (@${fmtSize(CHUNK_SIZE)}/part)…_`);

    const partPaths = [];
    for (let i = 0; i < parts.length; i++) {
        const pp = archivePath + `.part${i + 1}`;
        fs.writeFileSync(pp, parts[i]);
        partPaths.push(pp);
    }

    edit(`📤 _Mengirim ${parts.length} bagian ke Telegram…_`);

    for (let i = 0; i < partPaths.length; i++) {
        await bot.sendDocument(chatId, partPaths[i], {
            caption:
                `🗂️ *WORKSPACE PART ${i + 1}/${parts.length}*\n` +
                `${ui.divider()}\n` +
                `📁 Total file: *${files.length}* file\n` +
                `📦 Ukuran source: *${fmtSize(totalBytes)}*\n` +
                `🗜️ Arsip total: *${fmtSize(archiveStat.size)}*\n` +
                (i === 0
                    ? `${ui.divider()}\n` +
                      `*📂 Isi per folder:*\n${folderSummary}\n`
                    : '') +
                (i === parts.length - 1
                    ? `${ui.divider()}\n` +
                      `*🚀 CARA GABUNG & EKSTRAK:*\n` +
                      `\`\`\`\n` +
                      `cat workspace.tar.gz.part* > workspace.tar.gz\n` +
                      `tar -xzf workspace.tar.gz\n` +
                      `\`\`\`` +
                      `\n\n_Lalu isi .env dan jalankan botnya._`
                    : `\n_Tunggu semua bagian dikirim sebelum digabung._`),
            parse_mode: 'Markdown',
        });
    }

    for (const pp of partPaths) {
        try { fs.unlinkSync(pp); } catch {}
    }
}

async function doRemix(bot, chatId) {
    const TOKEN = process.env.GITHUB_TOKEN;
    const OWNER = process.env.GITHUB_OWNER || 'JMStory-27';
    const REPO  = process.env.GITHUB_REPO  || 'Jumalia-Makruf';

    const statusMsg = await bot.sendMessage(chatId,
        `🔀 *REMIX WORKSPACE*\n${ui.divider()}\n⏳ _Scanning semua file project…_`,
        { parse_mode: 'Markdown' }
    ).catch(() => null);

    const edit = (txt) => {
        if (!statusMsg) return;
        bot.editMessageText(
            `🔀 *REMIX WORKSPACE*\n${ui.divider()}\n${txt}`,
            { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
        ).catch(() => {});
    };

    const tmpDir = path.join(os.tmpdir(), `remix-${Date.now()}`);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archiveName = `workspace-${timestamp}.tar.gz`;
    const archivePath = path.join(os.tmpdir(), archiveName);

    try {
        edit(`📂 _Scanning workspace dari root…_`);
        const files = collectAllFiles(WORKSPACE_ROOT);
        if (files.length === 0) { edit(`❌ Tidak ada file yang bisa di-bundle.`); return; }

        let totalBytes = 0;
        const folderCounts = {};
        for (const { rel, abs } of files) {
            try { totalBytes += fs.statSync(abs).size; } catch {}
            const topFolder = rel.split('/')[0];
            const key = rel.includes('/') ? topFolder + '/' : '(root)';
            folderCounts[key] = (folderCounts[key] || 0) + 1;
        }

        const folderSummary = Object.entries(folderCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `  • \`${k}\` → ${v} file`)
            .join('\n');

        edit(`📦 _Menyiapkan *${files.length}* file (${fmtSize(totalBytes)})…_`);

        fs.mkdirSync(tmpDir, { recursive: true });
        for (const { abs, rel } of files) {
            const dest = path.join(tmpDir, rel);
            const destDir = path.dirname(dest);
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            try { fs.copyFileSync(abs, dest); } catch {}
        }

        edit(`🗜️ _Kompres jadi .tar.gz…_`);
        execSync(
            `tar -czf ${JSON.stringify(archivePath)} -C ${JSON.stringify(tmpDir)} .`,
            { stdio: 'pipe' }
        );

        const archiveStat = fs.statSync(archivePath);

        // ── Strategi pengiriman berdasarkan ukuran ──
        if (archiveStat.size <= TELEGRAM_MAX_BYTES) {
            // Kecil: kirim langsung via Telegram
            if (statusMsg) bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
            await bot.sendDocument(chatId, archivePath, {
                caption:
                    `🔀 *WORKSPACE REMIX*\n` +
                    `${ui.divider()}\n` +
                    `📁 Total file    : *${files.length}* file\n` +
                    `📦 Ukuran source : *${fmtSize(totalBytes)}*\n` +
                    `🗜️ Arsip .tar.gz : *${fmtSize(archiveStat.size)}*\n` +
                    `${ui.divider()}\n` +
                    `*📂 Isi per folder:*\n${folderSummary}\n` +
                    `${ui.divider()}\n` +
                    `*🚀 CARA EKSTRAK & DEPLOY:*\n` +
                    `\`\`\`\n` +
                    `tar -xzf workspace.tar.gz\n` +
                    `\`\`\`\n` +
                    `Lalu isi \`artifacts/telegram-bot/.env\`:\n` +
                    `\`TELEGRAM_BOT_TOKEN=...\`\n` +
                    `\`TELEGRAM_OWNER_ID=...\`\n` +
                    `Lalu: \`cd artifacts/telegram-bot && npm install && node index.js\`\n` +
                    `${ui.divider()}\n` +
                    `💡 _Di Replit: upload, extract, set Secrets, run_`,
                parse_mode: 'Markdown',
            });

        } else if (TOKEN) {
            // Besar + ada token: upload ke GitHub, kirim link
            edit(`📦 _Arsip ${fmtSize(archiveStat.size)} terlalu besar untuk Telegram._\n☁️ _Upload ke GitHub Release…_`);
            const archiveBuffer = fs.readFileSync(archivePath);
            const downloadUrl = await uploadToGithub(TOKEN, OWNER, REPO, archiveName, archiveBuffer);

            if (statusMsg) bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
            await bot.sendMessage(chatId,
                `✅ *WORKSPACE REMIX — VIA GITHUB*\n` +
                `${ui.divider()}\n` +
                `📁 Total file    : *${files.length}* file\n` +
                `📦 Ukuran source : *${fmtSize(totalBytes)}*\n` +
                `🗜️ Arsip .tar.gz : *${fmtSize(archiveStat.size)}*\n` +
                `${ui.divider()}\n` +
                `*📂 Isi per folder:*\n${folderSummary}\n` +
                `${ui.divider()}\n` +
                `🔗 *Link download:*\n${downloadUrl}\n` +
                `${ui.divider()}\n` +
                `*🚀 CARA EKSTRAK:*\n` +
                `\`\`\`\n` +
                `tar -xzf workspace.tar.gz\n` +
                `\`\`\``,
                { parse_mode: 'Markdown', disable_web_page_preview: true }
            );

        } else {
            // Besar + tidak ada token: split jadi beberapa part
            edit(`📦 _Arsip ${fmtSize(archiveStat.size)} terlalu besar untuk Telegram._\n✂️ _Membagi jadi beberapa bagian…_`);
            if (statusMsg) bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
            const editFallback = (txt) => {};
            await sendSplitParts(bot, chatId, archivePath, archiveStat, totalBytes, files, folderSummary, editFallback);
        }

    } catch (e) {
        if (statusMsg) bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
        await bot.sendMessage(chatId,
            `❌ Remix gagal: ${String(e?.message || e).slice(0, 300)}`
        ).catch(() => {});
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        try { fs.unlinkSync(archivePath); } catch {}
    }
}

function register(bot) {
    bot.onText(/^\/remix(?:\s|$)/i, async (msg) => {
        await doRemix(bot, msg.chat.id);
    });
    console.log('✅ Remix command registered - /remix');
}

module.exports = register;
