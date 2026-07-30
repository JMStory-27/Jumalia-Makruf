'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');
const ui = require('./ui.cjs');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../');

// Known secrets this project depends on, with a one-line purpose so a bot on the
// receiving end knows WHY each one is needed instead of just blindly asking for it.
const KNOWN_SECRETS = [
    ['GITHUB_TOKEN', 'push/release access for /remix, /remixgithub, /pushlawnime, /pushlawrenzai, /pushfixmerah'],
    ['TELEGRAM_BOT_TOKEN', 'required — without it the bot runs in web-only mode (no Telegram polling)'],
    ['OWNER_TELEGRAM_ID', 'owner-only command checks (e.g. admin dashboard, restricted commands)'],
    ['FIREBASE_CONFIG', 'Firebase-backed features (album storage etc.)'],
    ['GROQ_API_KEY', 'Groq-backed AI features (chat/lens)'],
    ['OPENROUTER_API_KEY', 'OpenRouter-backed AI features'],
    ['GEMINI_API_KEY', 'Gemini-backed AI features'],
    ['HF_TOKEN', 'Hugging Face-backed AI features'],
    ['MISTRAL_API_KEY', 'Mistral-backed AI features (Lawrenz Agent Mistral)'],
    ['SAMBANOVA_API_KEY', 'SambaNova-backed AI features (Lawrenz Agent Nova)'],
];

// Directories that are pure runtime junk/cache — never useful to a fresh bot instance,
// and just bloat the archive (old compress-video temp files, leftover screenshots, etc).
// NOTE: pnpm-lock.yaml is intentionally NOT here — it must ship with the remix
// so a fresh install resolves the SAME dependency versions instead of drifting
// to whatever is newest on npm at restore time.
const EXCLUDE_DIR_NAMES = new Set([
    'node_modules', '.pnpm-store', 'dist', '.git', '.cache', '.vite',
    '.turbo', 'attached_assets', '.local', '.upm', '.config',
    '__pycache__', 'coverage', '.nyc_output', '.idea', '.vscode',
    'bot_extracted',
    'comprest_tmp', 'tmp', 'temp', 'screenshots', '.screenshots',
    'ss_cache', 'qr_cache', '.playwright-cache',
    'test-results', 'playwright-report',
    // IMPORTANT: exclude artifact registration metadata so fresh installs don't
    // inherit stale path-style IDs. The receiving agent must call createArtifact()
    // to register them properly and avoid duplicates in the Replit preview panel.
    '.replit-artifact',
]);

const EXCLUDE_FILE_PATTERNS = [
    /\.map$/, /\.sqlite(-journal|-wal|-shm)?$/, /^\.cache-/,
    /\.log$/, /\.DS_Store$/, /^Thumbs\.db$/, /\.pyc$/,
    // leftover screenshots dropped next to code by ad-hoc debugging (not app assets)
    /^screenshot[-_].*\.(png|jpe?g)$/i, /^ss[-_]\d+\.(png|jpe?g)$/i,
    /^screen[ _-]?shot.*\.(png|jpe?g)$/i,
    // partial/incomplete downloads that sometimes land next to code
    /\.part$/, /\.crdownload$/, /\.tmp$/,
    /^remix-.*\.tar\.gz$/, /^workspace-.*\.tar\.gz$/,
];

function shouldExclude(relPath) {
    const parts = relPath.split('/');
    for (const p of parts) {
        if (EXCLUDE_DIR_NAMES.has(p)) return true;
    }
    const fname = parts[parts.length - 1];
    for (const pat of EXCLUDE_FILE_PATTERNS) {
        if (pat.test(fname)) return true;
    }
    return false;
}

// scanErrors is populated with any directory that could not be read (permission
// issues, races, etc). These used to be swallowed silently, which is exactly how
// important files (like api-server's proxy.ts) could vanish from a remix archive
// with zero trace. Callers MUST surface scanErrors to the user instead of hiding them.
function collectAllFiles(rootDir, scanErrors = []) {
    const result = [];
    const stack = [rootDir];
    while (stack.length > 0) {
        const dir = stack.pop();
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (e) {
            scanErrors.push(`readdir gagal: ${path.relative(rootDir, dir) || '.'} (${e.message})`);
            continue;
        }
        for (const e of entries) {
            const abs = path.join(dir, e.name);
            const rel = path.relative(rootDir, abs).replace(/\\/g, '/');
            if (shouldExclude(rel)) continue;
            if (e.isDirectory()) {
                stack.push(abs);
            } else if (e.isFile()) {
                result.push({ abs, rel });
            } else if (e.isSymbolicLink()) {
                // Symlinks are neither followed nor copied by design (fs.copyFileSync
                // would dereference them, and a broken symlink would throw) — but we
                // must NOT silently drop them without a trace like before.
                scanErrors.push(`symlink dilewati (tidak di-copy): ${rel}`);
            }
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

async function ghFetch(token, method, urlPath, body, isUpload = false, uploadBuffer = null, contentType = 'application/json') {
    const baseUrl = isUpload ? 'https://uploads.github.com' : 'https://api.github.com';
    const r = await fetch(baseUrl + urlPath, {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': contentType,
            'User-Agent': 'AlbumAbadiBot',
        },
        body: isUpload ? uploadBuffer : (body ? JSON.stringify(body) : undefined),
    });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _raw: text }; }
    if (!r.ok) {
        const err = new Error(`GH ${method} ${urlPath} → ${r.status}: ${json.message || text.slice(0, 200)}`);
        err.status = r.status;
        err.data = json;
        throw err;
    }
    return json;
}

async function createOrGetRelease(token, owner, repo, tagName) {
    try {
        const existing = await ghFetch(token, 'GET', `/repos/${owner}/${repo}/releases/tags/${tagName}`);
        return existing;
    } catch (e) {
        if (e.status !== 404) throw e;
    }
    return await ghFetch(token, 'POST', `/repos/${owner}/${repo}/releases`, {
        tag_name: tagName,
        name: `Workspace Remix — ${tagName}`,
        body: 'Auto-generated workspace archive oleh /remixgithub',
        draft: false,
        prerelease: false,
    });
}

async function uploadReleaseAsset(token, release, filename, buffer) {
    const uploadUrl = release.upload_url.replace('{?name,label}', '');
    const r = await fetch(`${uploadUrl}?name=${encodeURIComponent(filename)}`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/gzip',
            'User-Agent': 'AlbumAbadiBot',
        },
        body: buffer,
    });
    const text = await r.text();
    let json;
    try { json = JSON.parse(text); } catch { json = { _raw: text }; }
    if (!r.ok) throw new Error(`Upload asset gagal ${r.status}: ${json.message || text.slice(0, 200)}`);
    return json;
}

// Scans every artifacts/*/.replit-artifact/artifact.toml so the manifest always
// reflects the CURRENT state of the workspace instead of a hardcoded snapshot that
// goes stale the moment an artifact is added, renamed, or moved to a new port.
function readArtifactServices() {
    const artifactsDir = path.join(WORKSPACE_ROOT, 'artifacts');
    const services = [];
    let names;
    try { names = fs.readdirSync(artifactsDir, { withFileTypes: true }); } catch { return services; }
    for (const entry of names) {
        if (!entry.isDirectory()) continue;
        const tomlPath = path.join(artifactsDir, entry.name, '.replit-artifact', 'artifact.toml');
        if (!fs.existsSync(tomlPath)) continue;
        let raw;
        try { raw = fs.readFileSync(tomlPath, 'utf8'); } catch { continue; }
        const title = (raw.match(/^title\s*=\s*"([^"]*)"/m) || [])[1] || entry.name;
        const previewPath = (raw.match(/^previewPath\s*=\s*"([^"]*)"/m) || [])[1] || '/';
        const runCmd = (raw.match(/\[services\.development\][^\[]*run\s*=\s*"([^"]*)"/m) || [])[1] || null;
        const localPort = (raw.match(/localPort\s*=\s*(\d+)/m) || [])[1] || '?';
        services.push({ dir: entry.name, title, previewPath, runCmd, localPort });
    }
    return services.sort((a, b) => a.dir.localeCompare(b.dir));
}

// Writes a machine-readable-ish setup manifest INTO the archive itself, so whichever
// bot/AI unpacks it later reads exact current instructions instead of guessing or
// re-deriving them from scratch (which is what caused confusion before).
function buildManifest(owner, repo) {
    const services = readArtifactServices();
    const secretsList = KNOWN_SECRETS
        .map(([name, why]) => `- \`${name}\` — ${why}`)
        .join('\n');

    // Build artifact creation instructions from the scanned services.
    // NOTE: .replit-artifact/ dirs are intentionally NOT included in this archive
    // (they were excluded at bundle time). Do NOT try to find or reuse old artifact.toml
    // files — always call createArtifact() fresh to get a proper UUID-based ID and
    // a managed workflow. Reusing path-style IDs causes duplicates in the preview panel.
    const artifactCreateList = services
        .map(s => (
            `  await createArtifact({\n` +
            `    kind: "web",\n` +
            `    title: "${s.title}",\n` +
            `    slug: "${s.dir}",              // dir name under artifacts/\n` +
            `    previewPath: "${s.previewPath}",\n` +
            `  });\n  // → this starts managed workflow "artifacts/${s.dir}: web" automatically`
        ))
        .join('\n\n');

    const servicesList = services
        .map(s => `- **${s.title}** → preview \`${s.previewPath}\`, port ${s.localPort}`)
        .join('\n');

    return (
        `# Remix Setup Manifest\n\n` +
        `Auto-generated by /remixgithub on ${new Date().toISOString()}.\n` +
        `Read this file FIRST and follow the steps IN ORDER before doing anything else.\n\n` +

        `---\n\n` +

        `## ⚠️  STEP 1 — Request ALL secrets FIRST (BLOCKING — do not skip)\n\n` +
        `Before running pnpm install, before creating artifacts, before starting any workflow:\n` +
        `use the \`requestSecrets\` tool (or Replit environment-secrets skill) to ask the user\n` +
        `for EVERY secret listed below. Do not continue until the user has filled them all in.\n\n` +
        `Required secrets:\n` +
        `${secretsList}\n\n` +
        `How to request them:\n` +
        `\`\`\`js\n` +
        `// In the CodeExecution sandbox:\n` +
        `await requestSecrets({ keys: [${KNOWN_SECRETS.map(([n]) => `"${n}"`).join(', ')}] });\n` +
        `\`\`\`\n` +
        `Wait for the user to confirm all secrets are set, then proceed to Step 2.\n\n` +

        `---\n\n` +

        `## STEP 2 — Install dependencies\n\n` +
        `\`\`\`sh\npnpm install\n\`\`\`\n` +
        `Run at the workspace root. If pnpm warns about "ignored build scripts", add the\n` +
        `missing package name to \`onlyBuiltDependencies\` in \`pnpm-workspace.yaml\` and reinstall.\n` +
        `Do not run \`pnpm approve-builds\` interactively.\n\n` +

        `---\n\n` +

        `## STEP 3 — Register artifacts (IMPORTANT — read carefully to avoid duplicates)\n\n` +
        `⚠️  This archive does NOT contain \`.replit-artifact/\` directories. That is intentional.\n` +
        `Do NOT create artifact.toml files manually and do NOT look for old ones.\n` +
        `Always call \`createArtifact()\` via the CodeExecution sandbox to register each web app.\n` +
        `This generates a proper UUID-based ID + managed workflow automatically.\n` +
        `Reusing path-style IDs (\`artifacts/anisub\` etc.) causes duplicate entries in the\n` +
        `Replit preview panel (white icon = stale, blue icon = correct managed artifact).\n\n` +
        `\`\`\`js\n` +
        `// Run in CodeExecution sandbox (one createArtifact per web app):\n` +
        `${artifactCreateList || '// (no web artifacts found at bundle time)'}\n` +
        `\`\`\`\n\n` +
        `After createArtifact() succeeds, managed workflows are created automatically.\n` +
        `Do NOT add extra plain-shell workflows for these — that causes port conflicts.\n\n` +

        `---\n\n` +

        `## STEP 4 — Start remaining non-artifact workflows\n\n` +
        `The Telegram Bot is NOT a registered artifact (no createArtifact, no artifact.toml).\n` +
        `Start it with a plain workflow:\n\n` +
        `\`\`\`js\n` +
        `await configureWorkflow({\n` +
        `  name: "Telegram Bot",\n` +
        `  command: "cd artifacts/telegram-bot && PORT=3000 node index.js",\n` +
        `});\n` +
        `\`\`\`\n` +
        `Then call WorkflowsRestart for "Telegram Bot".\n` +
        `Confirm the bot is polling by checking logs for "Telegram bot polling dimulai..." —\n` +
        `this log appears asynchronously a few seconds after the workflow starts.\n\n` +

        `---\n\n` +

        `## STEP 5 — Restart managed artifact workflows\n\n` +
        `After createArtifact() and pnpm install, restart each managed workflow:\n\n` +
        `Managed web apps (preview paths):\n` +
        `${servicesList || '_(no artifacts found)_'}\n\n` +
        `If a managed workflow fails with "port already in use", there is a conflicting plain\n` +
        `shell workflow still running. Reconfigure it to \`echo 'disabled'\` then restart it,\n` +
        `then retry the managed workflow.\n\n` +

        `---\n\n` +

        `## STEP 6 — Verify\n\n` +
        `- Take a screenshot of every preview path to confirm the app renders without errors.\n` +
        `- Check each workflow log for startup errors.\n` +
        `- The Replit preview panel should show only BLUE (browser-icon) artifact entries.\n` +
        `  If you see WHITE (stack-icon) duplicates, those are stale path-style artifacts;\n` +
        `  they appear when artifact.toml files with old IDs are present — delete them and\n` +
        `  re-run createArtifact() for the affected app.\n\n` +

        `---\n\n` +

        `## Config values (not secrets)\n` +
        `- \`GITHUB_OWNER=${owner}\`\n` +
        `- \`GITHUB_REPO=${repo}\`\n\n` +

        `## Safe to ignore\n` +
        `- \`artifacts/telegram-bot/data/*\` — created automatically on first run.\n` +
        `- Any \`comprest_tmp\`, \`tmp\`, \`temp\`, or \`screenshots\` folder — excluded from archive.\n`
    );
}

function buildInstallPrompt(downloadUrl, owner, repo) {
    const secretKeys = KNOWN_SECRETS.map(([n]) => n).join(' ');
    return (
        `📋 *PROMPT RESTORE — Copy-paste ke Replit AI:*\n\n` +
        `\`\`\`\n` +
        `Download dan extract workspace dari link ini\n\n` +
        `${downloadUrl}\n\n` +
        `Buat secrets: ${secretKeys} dan request secara barengan serentak semua jangan minta 1 per 1 secretnya. ` +
        `Set configurations: GITHUB_OWNER=${owner} GITHUB_REPO=${repo}\n\n` +
        `Extract file tar.gz, install dependencies, lalu jalankan botnya. Mari mulai semuanya sekaligus.\n\n` +
        `pastikan web di dashboard alias web anisub dan lawrenz ai dan fix merah, lawrenz verse dll semuanya bisa di akses tanpa error took a screenshot sebagai bukti\n\n` +
        `pastikan semua telegram bot di telegram juga berfungsi dan semua Command bisa di pakai baca panduan di remixgithub atau file md lainnya\n` +
        `\`\`\``
    );
}

async function doRemixGithub(bot, chatId) {
    const TOKEN = process.env.GITHUB_TOKEN;
    const OWNER = process.env.GITHUB_OWNER || 'JMStory-27';
    const REPO = process.env.GITHUB_REPO || 'Jumalia-Makruf';

    // ── Pre-flight: semua secrets HARUS ada sebelum lanjut ───────────────────
    const missingSec = KNOWN_SECRETS.filter(([name]) => !process.env[name]);
    if (missingSec.length > 0) {
        const lines = missingSec.map(([n, why]) => `• \`${n}\` — ${why}`).join('\n');
        await bot.sendMessage(chatId,
            `🔐 *SECRETS BELUM LENGKAP — isi dulu sebelum /remixgithub*\n` +
            `${ui.divider()}\n` +
            `Secret berikut belum diset di Replit Secrets:\n\n` +
            `${lines}\n\n` +
            `${ui.divider()}\n` +
            `📌 *Cara set:*\n` +
            `1. Buka panel *Secrets* di Replit (ikon gembok di sidebar)\n` +
            `2. Add setiap secret di atas\n` +
            `3. Setelah semua terisi, ketik */remixgithub* lagi\n\n` +
            `_Bot tidak akan membuat archive sampai semua secret di atas terisi — archive yang tidak lengkap secrets-nya tidak bisa berjalan dengan benar di tempat baru._`,
            { parse_mode: 'Markdown' }
        ).catch(() => {});
        return;
    }

    // ── GITHUB_TOKEN wajib untuk upload ──────────────────────────────────────
    if (!TOKEN) {
        await bot.sendMessage(chatId,
            `❌ *GITHUB_TOKEN tidak ditemukan*\n\nSet \`GITHUB_TOKEN\` di Secrets Replit terlebih dahulu, lalu coba lagi.`,
            { parse_mode: 'Markdown' }
        ).catch(() => {});
        return;
    }

    const statusMsg = await bot.sendMessage(chatId,
        `🔀 *REMIX + GITHUB UPLOAD*\n${ui.divider()}\n⏳ _Scanning semua file project…_`,
        { parse_mode: 'Markdown' }
    ).catch(() => null);

    const edit = (txt) => {
        if (!statusMsg) return;
        bot.editMessageText(
            `🔀 *REMIX + GITHUB UPLOAD*\n${ui.divider()}\n${txt}`,
            { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
        ).catch(() => {});
    };

    const tmpDir = path.join(os.tmpdir(), `remixgh-${Date.now()}`);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const archiveName = `workspace-${timestamp}.tar.gz`;
    const archivePath = path.join(os.tmpdir(), archiveName);

    try {
        edit(`📂 _Scanning workspace dari root…_`);
        const scanErrors = [];
        const files = collectAllFiles(WORKSPACE_ROOT, scanErrors);
        if (files.length === 0) { edit(`❌ Tidak ada file yang bisa di-bundle.`); return; }

        let totalBytes = 0;
        const folderCounts = {};
        for (const { rel, abs } of files) {
            try { totalBytes += fs.statSync(abs).size; } catch {}
            const topFolder = rel.split('/')[0];
            const key = rel.includes('/') ? topFolder + '/' : '(root)';
            folderCounts[key] = (folderCounts[key] || 0) + 1;
        }

        edit(`📦 _Menyiapkan *${files.length}* file (${fmtSize(totalBytes)})…_`);

        fs.mkdirSync(tmpDir, { recursive: true });
        // Any copy failure here means a real file did NOT make it into the archive.
        // These must be tracked and reported — silently swallowing them is exactly
        // how important files (e.g. proxy.ts) went missing from remixes before.
        const copyFailures = [];
        for (const { abs, rel } of files) {
            const dest = path.join(tmpDir, rel);
            const destDir = path.dirname(dest);
            try {
                if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
                fs.copyFileSync(abs, dest);
            } catch (e) {
                copyFailures.push(`${rel} (${e.message})`);
            }
        }

        edit(`📝 _Menulis REMIX_SETUP.md…_`);
        try {
            fs.writeFileSync(path.join(tmpDir, 'REMIX_SETUP.md'), buildManifest(OWNER, REPO));
        } catch (e) {
            console.error('[remixgithub] gagal menulis manifest:', e.message);
        }

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

        edit(`☁️ _Mengupload ke GitHub Release (${fmtSize(archiveStat.size)})…_`);

        const tagName = `remix-${timestamp}`;
        const release = await createOrGetRelease(TOKEN, OWNER, REPO, tagName);

        edit(`📤 _Mengupload \`${archiveName}\`…_`);
        const archiveBuffer = fs.readFileSync(archivePath);
        const asset = await uploadReleaseAsset(TOKEN, release, archiveName, archiveBuffer);
        const downloadUrl = asset.browser_download_url;

        if (statusMsg) bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});

        // Surface any scan/copy failures loudly instead of hiding them — a remix
        // that silently dropped files is worse than one that visibly warns about it.
        const allProblems = [...scanErrors, ...copyFailures.map(f => `copy gagal: ${f}`)];
        const warningBlock = allProblems.length > 0
            ? `\n⚠️ *PERINGATAN — ${allProblems.length} masalah saat scan/copy:*\n` +
              allProblems.slice(0, 15).map(p => `  • ${p}`).join('\n') +
              (allProblems.length > 15 ? `\n  • _...dan ${allProblems.length - 15} lainnya_` : '') +
              `\n_File-file ini mungkin TIDAK ada di archive — cek manual sebelum dianggap lengkap._\n${ui.divider()}\n`
            : '';

        const archivedCount = files.length - copyFailures.length;
        await bot.sendMessage(chatId,
            `✅ *BERHASIL UPLOAD KE GITHUB!*\n` +
            `${ui.divider()}\n` +
            `📁 Total file    : *${archivedCount}* file${copyFailures.length > 0 ? ` _(dari ${files.length} discan, ${copyFailures.length} gagal di-copy — lihat peringatan di bawah)_` : ''}\n` +
            `📦 Ukuran source : *${fmtSize(totalBytes)}*\n` +
            `🗜️ Arsip .tar.gz : *${fmtSize(archiveStat.size)}*\n` +
            `${ui.divider()}\n` +
            `*📂 Isi per folder:*\n` +
            `${folderSummary}\n` +
            `${ui.divider()}\n` +
            warningBlock +
            `🔗 *Link download:*\n` +
            `${downloadUrl}\n` +
            `${ui.divider()}\n` +
            buildInstallPrompt(downloadUrl, OWNER, REPO),
            { parse_mode: 'Markdown', disable_web_page_preview: true }
        );

    } catch (e) {
        if (statusMsg) bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});
        await bot.sendMessage(chatId,
            `❌ RemixGitHub gagal: ${String(e?.message || e).slice(0, 300)}`
        ).catch(() => {});
    } finally {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
        try { fs.unlinkSync(archivePath); } catch {}
    }
}

function register(bot) {
    bot.onText(/^\/remixgithub(?:\s|$)/i, async (msg) => {
        await doRemixGithub(bot, msg.chat.id);
    });
    console.log('✅ RemixGitHub command registered - /remixgithub');
}

module.exports = register;
