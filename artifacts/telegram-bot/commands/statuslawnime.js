'use strict';

const https = require('https');
const http = require('http');
const ui = require('./ui.cjs');

// ── Parse FIREBASE_CONFIG (bisa berupa JSON atau HTML snippet dari Firebase console) ──
function parseFirebaseConfig() {
    const raw = process.env.FIREBASE_CONFIG || '';
    if (!raw) return {};
    try { return JSON.parse(raw); } catch {}
    // Format HTML snippet: apiKey: "...", authDomain: "...", dll
    const fields = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId', 'measurementId'];
    const config = {};
    for (const f of fields) {
        const m = raw.match(new RegExp(f + ':\\s*["\']([^"\']+)["\']'));
        if (m) config[f] = m[1];
    }
    return config;
}

// ── HTTP GET helper dengan timeout ──
function httpGet(url, timeoutMs = 7000) {
    return new Promise((resolve, reject) => {
        const lib = url.startsWith('https') ? https : http;
        const req = lib.get(url, {
            headers: { 'User-Agent': 'LawnimeBot/1.0', 'Accept': 'application/json' },
        }, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => resolve({ status: res.statusCode, body: data, ok: res.statusCode < 400 }));
        });
        req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('timeout')); });
        req.on('error', reject);
    });
}

// ── Ping URL dan ukur response time ──
async function pingUrl(url) {
    const t0 = Date.now();
    try {
        const r = await httpGet(url, 8000);
        return { up: r.ok, ms: Date.now() - t0, status: r.status };
    } catch (e) {
        return { up: false, ms: Date.now() - t0, error: e.message };
    }
}

// ── Query Firebase Realtime DB ──
async function getFirebaseUserCount(databaseURL, apiKey) {
    if (!databaseURL) return null;
    try {
        // shallow=true → hanya ambil keys (user IDs), hemat bandwidth
        const url = `${databaseURL}/users.json?shallow=true&auth=${apiKey}`;
        const r = await httpGet(url, 6000);
        if (!r.ok) return null;
        const data = JSON.parse(r.body);
        if (!data || typeof data !== 'object') return 0;
        return Object.keys(data).length;
    } catch { return null; }
}

// ── Query GitHub last commit on gh-pages branch ──
async function getGithubDeploy(token) {
    try {
        const url = 'https://api.github.com/repos/JMStory-27/Jumalia-Makruf/branches/gh-pages';
        const r = await httpGet(url, 6000);
        if (!r.ok) return null;
        const data = JSON.parse(r.body);
        const commit = data?.commit;
        return {
            sha: (commit?.sha || '').slice(0, 7),
            message: commit?.commit?.message?.split('\n')[0]?.slice(0, 60) || '-',
            date: commit?.commit?.committer?.date || commit?.commit?.author?.date,
            author: commit?.commit?.author?.name || '-',
        };
    } catch { return null; }
}

// ── Hitung waktu relatif ──
function timeAgo(isoDate) {
    if (!isoDate) return '-';
    const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
    if (diff < 60) return `${diff}d lalu`;
    if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
    return `${Math.floor(diff / 86400)} hari lalu`;
}

// ── Main handler ──
async function doStatusLawnime(bot, chatId) {
    const statusMsg = await bot.sendMessage(chatId,
        `🎌 *STATUS LAWNIME ID*\n${ui.divider()}\n⏳ _Mengecek semua layanan…_`,
        { parse_mode: 'Markdown' }
    ).catch(() => null);

    const edit = (txt) => {
        if (!statusMsg) return;
        bot.editMessageText(
            `🎌 *STATUS LAWNIME ID*\n${ui.divider()}\n${txt}`,
            { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'Markdown' }
        ).catch(() => {});
    };

    edit(`⏳ _Memuat… (1/4) Ping web…_`);

    const cfg = parseFirebaseConfig();
    const LAWNIME_URL = 'https://jmstory-27.github.io/Jumalia-Makruf/anime/';
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

    // Jalankan semua check paralel
    const [webPing, userCount, deployInfo] = await Promise.all([
        pingUrl(LAWNIME_URL),
        getFirebaseUserCount(cfg.databaseURL, cfg.apiKey),
        getGithubDeploy(GITHUB_TOKEN),
    ]);

    const webStatus = webPing.up
        ? `✅ Online • ${webPing.ms}ms`
        : `❌ Down (${webPing.error || `HTTP ${webPing.status}`})`;

    const userStat = userCount === null
        ? `⚠️ _Tidak bisa akses (cek rules Firebase)_`
        : `👥 *${userCount}* user terdaftar`;

    const deployLine = deployInfo
        ? `🔖 \`${deployInfo.sha}\` — ${deployInfo.message}\n` +
          `   ↳ ${timeAgo(deployInfo.date)} oleh _${deployInfo.author}_`
        : `⚠️ _Gagal ambil info deploy_`;

    if (statusMsg) bot.deleteMessage(chatId, statusMsg.message_id).catch(() => {});

    const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false });

    await bot.sendMessage(chatId,
        `🎌 *STATUS LAWNIME ID*\n` +
        `${ui.divider()}\n` +
        `🌐 *WEB APP*\n` +
        `  ${webStatus}\n` +
        `  📎 [Buka Lawnime](${LAWNIME_URL})\n` +
        `${ui.divider()}\n` +
        `🔥 *FIREBASE (Lawnime ID)*\n` +
        `  🌏 Region: \`asia-southeast1\`\n` +
        `  ${userStat}\n` +
        `${ui.divider()}\n` +
        `🚀 *LAST DEPLOY (gh-pages)*\n` +
        `${deployLine}\n` +
        `${ui.divider()}\n` +
        `⏱️ Dicek pada: _${now} WIB_`,
        {
            parse_mode: 'Markdown',
            disable_web_page_preview: true,
        }
    ).catch(() => {});
}

function register(bot) {
    bot.onText(/^\/statuslawnime(?:\s|$)/i, async (msg) => {
        await doStatusLawnime(bot, msg.chat.id);
    });
    console.log('✅ /statuslawnime command registered');
}

module.exports = { register, parseFirebaseConfig };
