'use strict';

const path = require('path');
const fs = require('fs');
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OWNER_ID = process.env.OWNER_TELEGRAM_ID ? String(process.env.OWNER_TELEGRAM_ID).trim() : null;
const PORT = parseInt(process.env.PORT || '3000', 10);

if (!TOKEN) {
    console.warn('⚠️  TELEGRAM_BOT_TOKEN tidak ditemukan — mode web-only (bot Telegram tidak aktif)');
}

// ─── Express Web Server ───────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve public static files (game pages, etc.)
const PUBLIC_DIR = path.join(__dirname, 'public');
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
app.use('/game', express.static(PUBLIC_DIR));

// Serve album static files (photos, videos, zip)
const ALBUMS_DIR = path.join(__dirname, 'web', 'albums');
if (!fs.existsSync(ALBUMS_DIR)) fs.mkdirSync(ALBUMS_DIR, { recursive: true });

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── Stats middleware (loaded before album routes) ────────────────────────────
const { registerStatsRoutes } = require('./commands/albumStats');
registerStatsRoutes(app);

// ─── Album Web Routes ─────────────────────────────────────────────────────────
const { registerAlbumRoutes } = require('./commands/albumv1');
registerAlbumRoutes(app);

// ─── Root health check ─────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    const index = path.join(DATA_DIR, 'albums.json');
    let count = 0;
    try { count = JSON.parse(fs.readFileSync(index, 'utf8')).length; } catch {}
    res.type('html').send(`
<!DOCTYPE html><html lang="id"><head>
<meta charset="UTF-8"><title>Album Abadi Bot</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font-family:system-ui,sans-serif;background:#fdfaf7;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{text-align:center;padding:40px;border-radius:20px;background:#fff;box-shadow:0 10px 40px rgba(232,149,166,.2);max-width:480px}
h1{font-size:28px;color:#e895a6;margin-bottom:8px}p{color:#7a6571;margin:6px 0}.pill{display:inline-block;background:#ffe2ea;color:#e895a6;padding:4px 14px;border-radius:999px;font-size:13px;margin-top:12px}</style>
</head><body><div class="box">
<div style="font-size:60px">🌸</div>
<h1>Album Abadi Bot</h1>
<p>Bot Telegram untuk membuat galeri kenangan abadi.</p>
<p>Total album: <strong>${count}</strong></p>
<div class="pill">✅ Bot sedang berjalan</div>
<p style="margin-top:16px;font-size:12px;color:#b0a0a8">
  <a href="/album" style="color:#85bedb">📂 Daftar Album</a> &nbsp;|&nbsp;
  <a href="/admin/stats" style="color:#85bedb">📊 Stats Admin</a>
</p>
</div></body></html>`);
});

// ─── Health check — dipakai self-ping always-on ───────────────────────────────
app.get('/health', (req, res) => {
    res.json({ ok: true, uptime: Math.round(process.uptime()), ts: Date.now() });
});

// ─── Animation Preview Page ────────────────────────────────────────────────────
app.get('/preview-animasi', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'preview-animasi.html'));
});

// ─── Album index page ──────────────────────────────────────────────────────────
app.get('/album', (req, res) => {
    const index = path.join(DATA_DIR, 'albums.json');
    let albums = [];
    try { albums = JSON.parse(fs.readFileSync(index, 'utf8')); } catch {}
    const rows = albums.map(a => {
        const url = a.githubUrl || `/album/${a.slug}/`;
        return `<li><a href="${url}" target="_blank">🌸 ${a.title || a.slug}</a> <small style="color:#7a6571">(${a.slug})</small></li>`;
    }).join('') || '<li style="color:#7a6571">Belum ada album.</li>';
    res.type('html').send(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>Daftar Album</title>
<style>body{font-family:system-ui;background:#fdfaf7;padding:40px;max-width:700px;margin:0 auto}
h1{color:#e895a6}ul{list-style:none;padding:0}li{padding:12px;border-bottom:1px solid #ffe2ea}a{color:#85bedb}</style>
</head><body><h1>🌸 Daftar Album Abadi</h1><ul>${rows}</ul>
<p><a href="/">← Kembali</a></p></body></html>`);
});

// ─── Rate limiter untuk /game/chat-reply ──────────────────────────────────────
const chatReplyRateMap = new Map(); // ip -> { count, resetAt }
const CHAT_REPLY_MAX = 10;          // max 10 request
const CHAT_REPLY_WINDOW = 60_000;   // per 60 detik per IP
function chatReplyRateLimit(req, res, next) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    let entry = chatReplyRateMap.get(ip);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + CHAT_REPLY_WINDOW };
        chatReplyRateMap.set(ip, entry);
    }
    entry.count++;
    if (entry.count > CHAT_REPLY_MAX) {
        return res.status(429).json({ reply: 'Terlalu banyak request. Coba lagi sebentar.' });
    }
    next();
}

// ─── AI Chat Reply (chess opponent) ───────────────────────────────────────────
app.post('/game/chat-reply', chatReplyRateLimit, async (req, res) => {
    try {
        const { message, opponentName } = req.body || {};
        if (!message) return res.json({ reply: 'hm okde 🗿' });
        const client = new OpenAI({
            baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
            apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
        });
        const completion = await client.chat.completions.create({
            model: 'gpt-5-nano',
            messages: [
                {
                    role: 'system',
                    content: `Kamu adalah pemain catur online Gen Z Indonesia yang lagi main catur online. Nama kamu ${opponentName || 'RandoPlayer'}. Gaya kamu: agak ngeselin, sok keren, kadang nge-gas, pakai bahasa gaul Gen Z Indonesia. Balas pesan lawan dengan SANGAT singkat (1-2 kalimat max), relate sama konteks catur kalau relevan. Pakai emoji tapi ga lebay. Gaya bahasa: "wkwk", "bestie", "ngab", "gas", "anjay", "gils", "fr fr", "yoi", "bro", "bokap lo juga gitu", "wleee", dll. Jangan terlalu formal, jangan terlalu panjang.`
                },
                { role: 'user', content: message }
            ],
            max_tokens: 80,
            temperature: 0.95,
        });
        const reply = completion.choices?.[0]?.message?.content?.trim() || 'wkwk 💀';
        res.json({ reply });
    } catch (e) {
        console.error('[chat-reply]', e.message);
        const fallbacks = ['wkwk bro 💀', 'okde bestie~', 'noted ngab 🗿', 'haha serius? 😂', 'yoi gaskeun 🔥'];
        res.json({ reply: fallbacks[Math.floor(Math.random() * fallbacks.length)] });
    }
});

// ─── Start Express, then init Telegram Bot AFTER port is open ─────────────────
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Web server berjalan di port ${PORT}`);

    if (!TOKEN) {
        console.warn('⚠️  Mode web-only aktif. Set TELEGRAM_BOT_TOKEN untuk mengaktifkan bot Telegram.');
        return;
    }

    // ─── Telegram Bot — always-on auto-restart ────────────────────────────────
    const bot = new TelegramBot(TOKEN, { polling: { autoStart: false, interval: 1000, params: { timeout: 10 } } });

    let botRetries = 0;
    let botRestarting = false;

    function startBotPolling() {
      if (botRestarting) return;
      bot.startPolling().then(() => {
        botRetries = 0;
        botRestarting = false;
        console.log('🤖 Telegram bot polling dimulai...');
      }).catch(e => {
        console.error('[bot] startPolling gagal:', e.message);
        scheduleRestart('start-error');
      });
    }

    function scheduleRestart(reason) {
      if (botRestarting) return;
      botRestarting = true;
      botRetries++;
      const delay = Math.min(5000 * botRetries, 120000); // max 2 menit
      console.warn(`🔄 Bot restart #${botRetries} (${reason}) dalam ${delay/1000}s...`);
      bot.stopPolling().catch(() => {}).finally(() => {
        setTimeout(() => {
          botRestarting = false;
          startBotPolling();
        }, delay);
      });
    }

    bot.on('polling_error', (err) => {
      const code = err?.response?.statusCode || 0;
      const msg  = String(err?.message || err);
      if (code === 409 || msg.includes('409')) {
        scheduleRestart('409-conflict');
      } else if (code === 429 || msg.includes('429')) {
        scheduleRestart('429-ratelimit');
      } else if (err?.code === 'EFATAL' || msg.includes('EFATAL') || msg.includes('ECONNRESET') || msg.includes('ETIMEDOUT')) {
        scheduleRestart('network-error');
      } else {
        console.error('[polling_error]', msg.slice(0, 200));
        scheduleRestart('polling-error');
      }
    });

    bot.on('error', (err) => {
      console.error('[bot error]', err.message);
      scheduleRestart('bot-error');
    });

    // Watchdog: restart hanya jika polling benar-benar error, bukan karena idle chat
    let lastPollOk = Date.now();
    bot.on('message', () => { lastPollOk = Date.now(); });
    bot.on('polling_error', () => { /* handled above */ });
    // Tandai polling masih hidup setiap kali ada event apapun dari Telegram
    const _origEmit = bot.emit.bind(bot);
    bot.emit = function(event, ...args) {
      if (event === 'message' || event === 'callback_query' || event === 'polling_error') {
        lastPollOk = Date.now();
      }
      return _origEmit(event, ...args);
    };
    // Hanya restart jika tidak ada sinyal sama sekali dari Telegram selama 10 menit
    setInterval(() => {
      if (!botRestarting && Date.now() - lastPollOk > 10 * 60_000) {
        console.warn('[WATCHDOG] Tidak ada sinyal Telegram 10 menit — restart polling...');
        lastPollOk = Date.now();
        scheduleRestart('watchdog');
      }
    }, 60_000);

    startBotPolling();

    // Load commands
    const registerAlbumCommand = require('./commands/albumv1');
    const registerRemix = require('./commands/remix');
    const { registerApkCommands } = require('./commands/apkBuilder');
    const registerLens = require('./commands/lens');
    const { registerCaturApkCommands } = require('./commands/caturApkBuild');
    const registerRebuildApk = require('./commands/rebuildApk');
    const registerComprest = require('./commands/comprest');
    const { registerDuoBucinCommands } = require('./commands/duoBucinBuild');
    const { registerLawnimeCommands } = require('./commands/lawnimeBuild');
    const { registerUplawnimeCommand } = require('./commands/uplawnime');
    const { registerPushLawnimeCommand } = require('./commands/pushlawnime');
    const { registerPushLawrenzAICommand } = require('./commands/pushlawrenzai');
    const { registerPushFixMerahCommand } = require('./commands/pushfixmerah');
    const { registerChatLawnimeCommand } = require('./commands/chatlawnime');
    const { register: registerStatusLawnime } = require('./commands/statuslawnime');
    const registerRemixGithub = require('./commands/remixgithub');
    const { registerFixMerahApkCommand } = require('./commands/fixmerahApkBuild');
    const { registerAniSubApkCommand }   = require('./commands/anisubApkBuild');
    const { registerCekCommand } = require('./commands/cek');
    const { registerLinkWACommand } = require('./commands/linkwa');
    const { registerUpdateAnimeCommand }    = require('./commands/updateanime');
    const { registerScrapeAniSubCommand }   = require('./commands/scrapeanisub');

    registerAlbumCommand(bot);
    registerRemix(bot);
    registerRemixGithub(bot);
    registerApkCommands(bot);
    registerLens(bot);
    registerCaturApkCommands(bot);
    registerRebuildApk(bot);
    registerComprest(bot);
    registerDuoBucinCommands(bot);
    registerLawnimeCommands(bot);
    registerUplawnimeCommand(bot);
    registerPushLawnimeCommand(bot);
    registerPushLawrenzAICommand(bot);
    registerPushFixMerahCommand(bot);
    registerChatLawnimeCommand(bot);
    registerStatusLawnime(bot);
    registerFixMerahApkCommand(bot);
    registerAniSubApkCommand(bot);
    registerCekCommand(bot);
    registerLinkWACommand(bot, OWNER_ID);
    registerUpdateAnimeCommand(bot, OWNER_ID);
    registerScrapeAniSubCommand(bot, OWNER_ID);
    const { registerSetMusimCommand } = require('./commands/setmusim');
    registerSetMusimCommand(bot, OWNER_ID);
    console.log('✅ /setmusim command registered — set video banner musim di halaman Anisub (owner-only)');
    const { registerAnalisaCommand } = require('./commands/analisa');
    registerAnalisaCommand(bot);
    console.log('✅ /analisa command registered — bandingkan 2 workspace tarball & laporan .txt');
    console.log('✅ /update command registered — auto-scrape AniSub lengkap dari Telegram (admin-only)');
    console.log('✅ /scrapeanisub command registered — scrape cache AniSub lengkap (resume/fresh/report)');
    // NOTE: /report & /stopreport (WA account ban reporter) intentionally removed —
    // it sends fraudulent "account stolen" reports to WhatsApp support to get a
    // number banned, which is abuse/harassment and violates platform policy.
    console.log('✅ /buildanisub command registered — URL → nama → ikon → cache ~1800 anime → APK');
    console.log('✅ Lawnime APK commands registered - /buildlawnime, /uplawnime, /pushlawnime');
    console.log('✅ /pushlawrenzai command registered — scan + confirm + push LawrenZ AI ke GitHub Pages');
    console.log('✅ /pushfixmerah command registered — scan + confirm + push Fix Merah ke GitHub Pages');
    console.log('✅ /chatlawnime command registered — push notif ke Lawnime web');

    // ─── /start command ───────────────────────────────────────────────────────────
    bot.onText(/^\/start(?:\s|$)/i, (msg) => {
        const name = msg.from?.first_name || 'Kamu';
        bot.sendMessage(msg.chat.id,
            `🌸 *Halo, ${name}!* Selamat datang di *Album Abadi Bot*!\n\n` +
            `📸 Bot ini untuk membuat galeri kenangan & game catur premium.\n\n` +
            `*Perintah tersedia:*\n` +
            `🔍 /lens — Salin teks dari gambar (Google Lens)\n` +
            `📹 /comprest — Compress & gabung 2-3 video jadi 1 (7 detik kirim)\n` +
            `🎌 /buildlawnime — Build APK Lawnime ID (streaming anime sub indo)\n` +
            `📦 /buildanisub — Build APK AniSub + cache lengkap semua anime\n` +
            `🚀 /uplawnime — Auto rebuild & upload semua APK Lawnime ke versi terbaru\n` +
            `🤖 /pushlawrenzai — Scan perubahan & push LawrenZ AI ke GitHub Pages\n` +
            `🔴 /pushfixmerah — Scan perubahan & push Fix Merah ke GitHub Pages\n` +
            `🌐 /jadiapk — Build APK WebView dari URL manapun\n` +
            `📱 /buildfixlawrenz — Build APK Fix By Lawrenz (WebView → GitHub Pages)\n` +
            `💕 /buildduo — Build APK Duo Bucin Love (couple app)\n` +
            `🌐 /publishduo — Publish Duo Bucin ke GitHub Pages\n` +
            `📱 /buildcatur — Build 2 APK chess sekaligus (user + owner)\n` +
            `🔄 /rebuildapk — Rebuild APK pilihan (biasa / owner / keduanya)\n` +
            `🌸 /album — Buat album baru\n` +
            `📋 /daftaralbum — Lihat semua albummu\n` +
            `🚀 /publishalbum — Publish ke GitHub Pages\n` +
            `♛ /catur — Buka Chess By Lawrenz\n` +
            `🚀 /publishcatur — Publish catur ke GitHub Pages\n` +
            `♻️ /updatecatur — Update catur ke GitHub Pages\n` +
            `📱 /updateapk — Build & kirim APK Chess By Lawrenz terbaru\n` +
            `🖼 /updateikon — Ganti ikon APK Chess By Lawrenz\n` +
            `🔀 /remix — Export seluruh workspace\n` +
            `_Ketik /comprest → kirim 2-3 video dalam 7 detik → bot compress & gabung! 📹_`,
            { parse_mode: 'Markdown' }
        );
    });

    // ─── /help command ────────────────────────────────────────────────────────────
    bot.onText(/^\/help(?:\s|$)/i, (msg) => {
        bot.sendMessage(msg.chat.id,
            `🌸 *Album Abadi Bot — Daftar Command*\n` +
            `━━━━━━━━━━━━━━━━━━━━\n\n` +

            `📌 *UMUM*\n` +
            `• /start — Pesan sambutan & intro bot\n` +
            `• /help — Tampilkan daftar command ini\n\n` +

            `📸 *BUAT ALBUM*\n` +
            `• /album — Mulai sesi pembuatan album baru\n` +
            `• /selesai — Selesaikan sesi & bangun album\n` +
            `• /batalalbum — Batalkan sesi album yang sedang aktif\n` +
            `• /resetalbum — Reset/mulai ulang album dari awal\n\n` +

            `📋 *KELOLA ALBUM*\n` +
            `• /listalbum — Lihat daftar semua albummu\n` +
            `• /hapusalbum — Hapus album dari server\n\n` +

            `🎵 *KELOLA LAGU*\n` +
            `• /addlagu — Tambah/ganti lagu background di album\n` +
            `• /bataladdlagu — Batalkan proses tambah lagu\n` +
            `• /hapuslagu — Hapus lagu dari album\n\n` +

            `💬 *KELOLA UCAPAN*\n` +
            `• /setucapan — Set ucapan pinned (dari owner) di album\n` +
            `• /batalucapan — Batalkan proses set ucapan\n` +
            `• /hapusucapan — Hapus ucapan pinned dari album\n\n` +

            `🚀 *GITHUB PAGES*\n` +
            `• /publishalbum — Publish album ke GitHub Pages (permanen)\n` +
            `• /batalpublish — Batalkan proses publish yang sedang berjalan\n` +
            `• /unpublishalbum — Hapus album dari GitHub Pages\n` +
            `• /listpublished — Lihat daftar album yang sudah dipublish ke GitHub\n\n` +

            `♟ *CATUR*\n` +
            `• /catur — Buka Chess By Lawrenz\n` +
            `• /publishcatur — Publish catur ke GitHub Pages\n` +
            `• /updatecatur — Update catur.html ke GitHub Pages\n` +
            `• /unpublishcatur — Hapus catur dari GitHub Pages\n\n` +
            `📱 *APK*\n` +
            `• /buildlawnime — Build APK Lawnime ID \\(streaming anime\\)\n` +
            `• /buildanisub — Build APK AniSub \\+ cache lengkap semua anime\n` +
            `• /jadiapk — Build APK WebView dari URL manapun\n` +
            `• /uplawnime — Auto rebuild & upload semua APK Lawnime terbaru\n` +
            `• /buildcatur — Build 2 APK chess sekaligus (user + owner)\n` +
            `• /rebuildapk — Rebuild APK pilihan: biasa / owner / keduanya\n` +
            `• /apk1 — Build hanya APK 1 (Catur BY Lawrenz)\n` +
            `• /apk2 — Build hanya APK 2 (Chess Royale Owner)\n` +
            `• /adminweb — Update & push caturadmin.html ke GitHub\n` +
            `• /updateapk — Build APK dari pilihan game (interaktif)\n` +
            `• /updateikon — Ganti ikon APK\n\n` +

            `🔍 *LENS (OCR)*\n` +
            `• /lens — Kirim foto → bot salin semua teksnya instan\n` +
            `• Atau kirim foto dengan caption /lens langsung\n` +
            `• Tandai bagian tertentu di foto → bot fokus ke sana\n\n` +

            `📹 *COMPRESS VIDEO*\n` +
            `• /comprest — Ketik command, lalu kirim 1-10 video dalam 7 detik\n` +
            `• Bot compress ukurannya (hemat 40-75%) + gabung jadi 1 video\n` +
            `• Kualitas tetap dijaga, hanya bitrate & resolusi disesuaikan\n` +
            `• Bot kirim balik lengkap dengan info ukuran & penghematan\n\n` +

            `🤖 *LAWRENZ AI & FIX MERAH*\n` +
            `• /pushlawrenzai — Scan perubahan, konfirmasi, lalu push LawrenZ AI ke GitHub Pages\n` +
            `  ↳ Otomatis build → upload → tunggu 2 menit → screenshot perbandingan\n` +
            `• /pushfixmerah — Scan perubahan, konfirmasi, lalu push Fix Merah ke GitHub Pages\n` +
            `  ↳ Otomatis build → upload → tunggu 2 menit → screenshot perbandingan\n\n` +

            `⚡ *ANISUB*\n` +
            `• /update — Auto\\-scrape penuh AniSub \\(anime baru, tamat, banner, sinopsis, genre, skor, studio, season, retry\\) tanpa buka web, laporan lengkap \\+ file \\.txt\n\n` +

            `🔀 *LAINNYA*\n` +
            `• /remix — Export seluruh workspace sebagai file .tar.gz\n\n` +

            `━━━━━━━━━━━━━━━━━━━━\n` +
            `📊 *Admin Stats:* buka /admin/stats di browser`,
            { parse_mode: 'Markdown' }
        );
    });

    // ─── /catur — Open Chess Game ─────────────────────────────────────────────────
    bot.onText(/^\/catur(?:\s|$)/i, (msg) => {
        const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS?.split(',')[0];
        const url = domain ? `https://${domain}/game/catur.html` : null;
        bot.sendMessage(msg.chat.id,
            `♛ *Game Master Chess Royale*\n\nGame catur premium by 👑 King Maharaja Lawrenz:\n• 🤖 AI Bot (3 level kesulitan)\n• 👥 2 Pemain giliran\n• 🌐 Mode Online via Firebase\n• ⚔️ Mode Horde\n• 💬 Chat & Stiker Eksklusif\n• 🎵 Musik & Suara Epik\n\n${url ? `🎮 [Mainkan Sekarang](${url})` : 'Akses via /game/catur.html'}`,
            { parse_mode: 'Markdown', disable_web_page_preview: false }
        );
    });

    // ─── /publishcatur — Publish chess game to GitHub Pages ───────────────────────
    bot.onText(/^\/publishcatur(?:\s|$)/i, async (msg) => {
        const chatId = msg.chat.id;
        const senderId = String(msg.from?.id ?? '');
        if (!OWNER_ID || senderId !== OWNER_ID) { bot.sendMessage(chatId, '⛔ Akses ditolak. Perintah ini hanya untuk owner.'); return; }
        const token = process.env.GITHUB_TOKEN;
        const owner = process.env.GITHUB_OWNER || 'JMStory-27';
        const repo = process.env.GITHUB_REPO || 'Jumalia-Makruf';

        if (!token) { bot.sendMessage(chatId, '❌ GITHUB_TOKEN tidak tersedia.'); return; }

        const statusMsg = await bot.sendMessage(chatId, '⏳ Mempublish Game Master Chess Royale ke GitHub Pages...');

        try {
            const htmlPath = path.join(__dirname, 'public', 'catur.html');
            if (!fs.existsSync(htmlPath)) { bot.sendMessage(chatId, '❌ File catur.html tidak ditemukan.'); return; }

            const htmlContent = fs.readFileSync(htmlPath);
            const b64 = htmlContent.toString('base64');
            const ghPath = 'web/chess-master/index.html';
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${ghPath}`;
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
                'User-Agent': 'AlbumAbadiBot'
            };

            let sha = null;
            try {
                const r = await fetch(apiUrl, { headers });
                if (r.ok) { const d = await r.json(); sha = d.sha; }
            } catch {}

            const body = { message: '♛ Publish Game Master Chess Royale', content: b64, branch: 'main' };
            if (sha) body.sha = sha;

            const res = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(body) });
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`GitHub API error ${res.status}: ${err.slice(0, 200)}`);
            }

            const pagesUrl = `https://${owner}.github.io/${repo}/web/chess-master/`;
            await bot.editMessageText(
                `✅ *Game Master Chess Royale berhasil dipublish!*\n\n♛ Game sekarang tersedia di:\n${pagesUrl}\n\n_By 👑 King Maharaja Lawrenz — Link permanen via GitHub Pages_`,
                { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
            );
        } catch (e) {
            console.error('[publishcatur]', e.message);
            bot.editMessageText(`❌ Gagal publish: ${e.message.slice(0, 200)}`,
                { chat_id: chatId, message_id: statusMsg.message_id });
        }
    });

    // ─── /updatecatur — Ambil catur.html terbaru dari file server & push ke GitHub ─
    bot.onText(/^\/updatecatur(?:\s|$)/i, async (msg) => {
        const chatId = msg.chat.id;
        const senderId = String(msg.from?.id ?? '');
        if (!OWNER_ID || senderId !== OWNER_ID) { bot.sendMessage(chatId, '⛔ Akses ditolak. Perintah ini hanya untuk owner.'); return; }
        const token = process.env.GITHUB_TOKEN;
        const owner = process.env.GITHUB_OWNER || 'JMStory-27';
        const repo = process.env.GITHUB_REPO || 'Jumalia-Makruf';

        if (!token) { bot.sendMessage(chatId, '❌ GITHUB_TOKEN tidak tersedia.'); return; }

        const statusMsg = await bot.sendMessage(chatId, '♟ Mengambil versi terbaru catur.html dan push ke GitHub...');

        try {
            const htmlPath = path.join(__dirname, 'public', 'catur.html');
            if (!fs.existsSync(htmlPath)) {
                await bot.editMessageText('❌ File catur.html tidak ditemukan di server.',
                    { chat_id: chatId, message_id: statusMsg.message_id });
                return;
            }

            const htmlContent = fs.readFileSync(htmlPath);
            const b64 = htmlContent.toString('base64');
            const ghPath = 'web/chess-master/index.html';
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${ghPath}`;
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
                'User-Agent': 'AlbumAbadiBot'
            };

            let sha = null;
            try {
                const r = await fetch(apiUrl, { headers });
                if (r.ok) { const d = await r.json(); sha = d.sha; }
            } catch {}

            if (!sha) {
                await bot.editMessageText(
                    '⚠️ Game Master Chess Royale belum pernah dipublish sebelumnya.\nGunakan /publishcatur dulu untuk publish pertama kali.',
                    { chat_id: chatId, message_id: statusMsg.message_id }
                );
                return;
            }

            const fileSizeKB = Math.round(htmlContent.length / 1024);

            const body = { message: '♻️ Update Game Master Chess Royale (via /updatecatur)', content: b64, sha, branch: 'main' };
            const res = await fetch(apiUrl, { method: 'PUT', headers, body: JSON.stringify(body) });
            if (!res.ok) {
                const err = await res.text();
                throw new Error(`GitHub API error ${res.status}: ${err.slice(0, 200)}`);
            }

            const pagesUrl = `https://${owner}.github.io/${repo}/web/chess-master/`;
            await bot.editMessageText(
                `✅ *Game Master Chess Royale berhasil diupdate!*\n\n` +
                `📁 File: catur.html (${fileSizeKB} KB)\n` +
                `♛ Link game:\n${pagesUrl}\n\n` +
                `_By 👑 King Maharaja Lawrenz — Update otomatis ✨_`,
                { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
            );
        } catch (e) {
            console.error('[updatecatur]', e.message);
            bot.editMessageText(`❌ Gagal update: ${e.message.slice(0, 200)}`,
                { chat_id: chatId, message_id: statusMsg.message_id });
        }
    });

    // ─── /unpublishcatur — Remove chess game from GitHub Pages ────────────────────
    bot.onText(/^\/unpublishcatur(?:\s|$)/i, async (msg) => {
        const chatId = msg.chat.id;
        const senderId = String(msg.from?.id ?? '');
        if (!OWNER_ID || senderId !== OWNER_ID) { bot.sendMessage(chatId, '⛔ Akses ditolak. Perintah ini hanya untuk owner.'); return; }
        const token = process.env.GITHUB_TOKEN;
        const owner = process.env.GITHUB_OWNER || 'JMStory-27';
        const repo = process.env.GITHUB_REPO || 'Jumalia-Makruf';

        if (!token) { bot.sendMessage(chatId, '❌ GITHUB_TOKEN tidak tersedia.'); return; }

        try {
            const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/web/chess-master/index.html`;
            const headers = {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json',
                'User-Agent': 'AlbumAbadiBot'
            };
            const r = await fetch(apiUrl, { headers });
            if (!r.ok) { bot.sendMessage(chatId, '⚠️ Game Master Chess Royale belum dipublish atau sudah dihapus.'); return; }
            const d = await r.json();
            const res = await fetch(apiUrl, {
                method: 'DELETE', headers,
                body: JSON.stringify({ message: '🗑 Remove Game Master Chess Royale', sha: d.sha, branch: 'main' })
            });
            if (!res.ok) throw new Error(`${res.status}`);
            bot.sendMessage(chatId, '✅ Game Master Chess Royale berhasil dihapus dari GitHub Pages.');
        } catch (e) {
            bot.sendMessage(chatId, `❌ Gagal menghapus: ${e.message}`);
        }
    });

    bot.on('error', (err) => {
        console.error('[BOT error]', err.message);
    });

    // ─── Graceful shutdown (SIGTERM dari Replit saat restart workflow) ─────────────
    const shutdown = (signal) => {
        console.log(`[BOT] Menerima ${signal} — menghentikan polling secara bersih...`);
        bot.stopPolling()
            .then(() => {
                console.log('[BOT] Polling berhenti. Proses keluar.');
                process.exit(0);
            })
            .catch((e) => {
                console.error('[BOT] Error saat stop polling:', e.message);
                process.exit(0);
            });
        // Paksa exit setelah 5 detik kalau stopPolling hang
        setTimeout(() => {
            console.warn('[BOT] Force exit setelah timeout 5 detik.');
            process.exit(0);
        }, 5000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

    console.log('✅ Album Abadi Bot siap!');

    // ── Keepalive: ping production API setiap 1 menit ─────────────────────────
    // Menjaga API server (autoscale) tetap hidup 24 jam penuh — IMAP tidak boleh mati.
    const PROD_API_PING = 'https://wg-anime-api-v2.onrender.com/otakudesu/ongoing?page=1';
    let keepaliveFails = 0;
    async function pingProductionApi() {
        try {
            const res = await fetch(PROD_API_PING, { signal: AbortSignal.timeout(10000) });
            if (res.ok) {
                keepaliveFails = 0;
                console.log('[KEEPALIVE] ✅ Production API aktif');
            } else {
                keepaliveFails++;
                console.warn(`[KEEPALIVE] ⚠️ API response ${res.status} (fail #${keepaliveFails})`);
            }
        } catch (e) {
            keepaliveFails++;
            console.warn(`[KEEPALIVE] ⚠️ Ping gagal #${keepaliveFails}:`, e.message);
        }
    }
    // Ping pertama 10 detik setelah start, lalu setiap 1 menit (bukan 5 menit)
    setTimeout(pingProductionApi, 10_000);
    setInterval(pingProductionApi, 60_000);
    console.log('📡 Keepalive aktif — production API di-ping setiap 1 menit (always-on)');

    // ── Self-ping: jaga bot sendiri tetap hidup 24/7 saat deployed ────────────
    // Replit deployment (Reserved VM) tidak perlu self-ping karena selalu on.
    // Tapi kalau pakai Free/Autoscale, self-ping mencegah cold start & idle shutdown.
    // Deteksi: kalau ada REPLIT_DEPLOYMENT atau BOT_PUBLIC_URL → ping diri sendiri.
    const BOT_PUBLIC_URL = process.env.BOT_PUBLIC_URL || process.env.REPLIT_DEV_DOMAIN
        ? `https://${process.env.REPLIT_DEV_DOMAIN}`
        : null;
    const SELF_PING_URL  = BOT_PUBLIC_URL ? `${BOT_PUBLIC_URL}/health` : `http://localhost:${PORT}/health`;
    let selfPingFails = 0;

    async function selfPing() {
        try {
            const res = await fetch(SELF_PING_URL, { signal: AbortSignal.timeout(8000) });
            if (res.ok) {
                if (selfPingFails > 0) console.log('[SELF-PING] ✅ Bot kembali hidup');
                selfPingFails = 0;
            } else {
                selfPingFails++;
                console.warn(`[SELF-PING] ⚠️ Response ${res.status} (fail #${selfPingFails})`);
            }
        } catch (e) {
            selfPingFails++;
            // Hanya log kalau lebih dari 3 kali gagal (hindari spam saat startup)
            if (selfPingFails > 3) console.warn(`[SELF-PING] ⚠️ Fail #${selfPingFails}: ${e.message}`);
        }
    }
    // Self-ping setiap 4 menit — lebih sering dari timeout idle (5 menit) Replit free
    setTimeout(selfPing, 30_000);
    setInterval(selfPing, 4 * 60_000);
    console.log(`🔁 Self-ping aktif — bot di-ping tiap 4 menit (${SELF_PING_URL})`);
    // ─────────────────────────────────────────────────────────────────────────
});

process.on('uncaughtException', (err) => {
    console.error('[uncaughtException]', err.message, err.stack?.slice(0, 500));
});

process.on('unhandledRejection', (reason) => {
    console.error('[unhandledRejection]', reason?.message || reason);
});
