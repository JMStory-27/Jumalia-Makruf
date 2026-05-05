'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const ui = require('./ui.cjs');

// Root workspace — bundle dari sini, pertahankan struktur folder
const WORKSPACE_ROOT = path.resolve(__dirname, '../../');
const BOT_DIR = __dirname;

// Folder/path yang dikecualikan dari bundle
const EXCLUDE_DIRS = new Set([
    'node_modules',
    '.pnpm-store',
    'dist',
    '.git',
    '.cache',
    'attached_assets',
    '.local',
    '.upm',
    '.config',
]);

// File/extension yang dikecualikan
const EXCLUDE_PATTERNS = [
    /\.map$/,
    /\.sqlite(-journal|-wal|-shm)?$/,
    /^\.cache-/,
];

// Path relatif yang dikecualikan
const EXCLUDE_REL_PREFIXES = [
    // data/media sengaja TIDAK dikecualikan — biar video koleksi ikut ke dalam bundle remix
];

function shouldExclude(relPath) {
    const parts = relPath.split('/');
    for (const p of parts) {
        if (EXCLUDE_DIRS.has(p)) return true;
    }
    const fname = parts[parts.length - 1];
    for (const pat of EXCLUDE_PATTERNS) {
        if (pat.test(fname)) return true;
    }
    for (const prefix of EXCLUDE_REL_PREFIXES) {
        if (relPath === prefix || relPath.startsWith(prefix + '/')) return true;
    }
    return false;
}

function collectAllFiles(rootDir) {
    const result = [];
    const stack = [rootDir];
    while (stack.length > 0) {
        const dir = stack.pop();
        let entries;
        try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of entries) {
            const abs = path.join(dir, e.name);
            const rel = path.relative(rootDir, abs).replace(/\\/g, '/');
            if (shouldExclude(rel)) continue;
            if (e.isDirectory()) stack.push(abs);
            else if (e.isFile()) result.push({ abs, rel });
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

async function doRemix(bot, chatId, customName) {
    const ts = new Date().toISOString().slice(0, 10);
    const safeName = (customName || `workspace-${ts}`).replace(/[^a-zA-Z0-9\-_.]/g, '-').slice(0, 60);

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
    const archivePath = path.join(os.tmpdir(), `${safeName}-${Date.now()}.tar.gz`);

    try {
        edit(`📂 _Scanning workspace…_`);
        const files = collectAllFiles(WORKSPACE_ROOT);
        if (files.length === 0) { edit(`❌ Tidak ada file yang bisa di-bundle.`); return; }

        // Hitung statistik
        let totalBytes = 0;
        const folderCounts = {};
        for (const { rel, abs } of files) {
            try { totalBytes += fs.statSync(abs).size; } catch {}
            const topFolder = rel.split('/')[0];
            // Kalau tidak ada '/' artinya ini file root
            const key = rel.includes('/') ? topFolder + '/' : '(root)';
            folderCounts[key] = (folderCounts[key] || 0) + 1;
        }

        edit(`📦 _Membuat arsip dari *${files.length}* file (${fmtSize(totalBytes)})…_`);

        // Salin file ke tmpDir dengan struktur lengkap, lalu tar dari sana
        fs.mkdirSync(tmpDir, { recursive: true });
        for (const { abs, rel } of files) {
            const dest = path.join(tmpDir, rel);
            const destDir = path.dirname(dest);
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            try { fs.copyFileSync(abs, dest); } catch {}
        }

        // Buat tar.gz dari tmpDir
        edit(`🗜️ _Kompres jadi .tar.gz…_`);
        execSync(
            `tar -czf ${JSON.stringify(archivePath)} -C ${JSON.stringify(tmpDir)} .`,
            { stdio: 'pipe' }
        );

        const archiveStat = fs.statSync(archivePath);
        const folderSummary = Object.entries(folderCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `  • \`${k}\` → ${v} file`)
            .join('\n');

        if (statusMsg) bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});

        await bot.sendDocument(chatId, archivePath, {
            caption:
                `🔀 *WORKSPACE REMIX*\n` +
                `${ui.divider()}\n` +
                `📁 Total file    : *${files.length}* file\n` +
                `📦 Ukuran source : *${fmtSize(totalBytes)}*\n` +
                `🗜️ Arsip .tar.gz : *${fmtSize(archiveStat.size)}*\n` +
                `${ui.divider()}\n` +
                `*📂 Isi per folder:*\n` +
                `${folderSummary}\n` +
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

    } catch (e) {
        if (statusMsg) bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
        await bot.sendMessage(chatId,
            `❌ Remix gagal: ${String(e?.message || e).slice(0, 200)}`
        ).catch(() => {});
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        try { fs.unlinkSync(archivePath); } catch {}
    }
}

// Map chatId → true (waiting for filename answer)
const pendingRemixName = new Map();

function register(bot) {
    bot.onText(/^\/remix(?:\s|$)/i, async (msg) => {
        const chatId = msg.chat.id;
        pendingRemixName.set(chatId, true);
        await bot.sendMessage(chatId,
            `🔀 *REMIX WORKSPACE*\n` +
            `━━━━━━━━━━━━━━━━━━━━━━\n` +
            `📝 *Mau dinamain apa filenya?*\n\n` +
            `_Ketik nama file yang kamu mau\n` +
            `Contoh: "backup-v2" atau "project-abadi"_`,
            { parse_mode: 'Markdown' }
        );
    });

    bot.on('message', async (msg) => {
        const chatId = msg.chat.id;
        if (!pendingRemixName.has(chatId)) return;
        if (!msg.text || msg.text.startsWith('/')) return;
        pendingRemixName.delete(chatId);
        const customName = msg.text.trim();
        await doRemix(bot, chatId, customName);
    });

    console.log('✅ Remix command registered - /remix');
}

module.exports = register;
