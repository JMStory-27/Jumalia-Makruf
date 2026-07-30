'use strict';

const fs   = require('fs');
const path = require('path');
const { buildAniSubApk } = require('./anisubLocalBuild');

const CACHE_CONFIG_FILE = path.join(__dirname, '..', 'data', 'cache-urls.json');

/** Baca URL cache dari file yang di-generate scraper, atau null kalau belum ada */
function readCacheUrls() {
  try {
    if (fs.existsSync(CACHE_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CACHE_CONFIG_FILE, 'utf8'));
    }
  } catch {}
  return null;
}

const GH_OWNER = process.env.GITHUB_OWNER || 'JMStory-27';
const GH_REPO  = process.env.GITHUB_REPO  || 'Jumalia-Makruf';
const OWNER_ID = process.env.OWNER_TELEGRAM_ID ? Number(process.env.OWNER_TELEGRAM_ID) : null;
const VERSION_FILE = path.join(__dirname, '..', 'data', 'buildanisub-version.json');

function isOwner(msg) {
  return OWNER_ID && msg.from?.id === OWNER_ID;
}

function esc(s) {
  return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function bar(pct) {
  const filled = Math.round(Math.min(pct, 100) / 7);
  return '█'.repeat(filled) + '░'.repeat(14 - filled);
}

function getAndBumpVersion() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  let current = { version: '1.0.0', code: 1 };
  try {
    if (fs.existsSync(VERSION_FILE)) current = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
  } catch {}
  const parts = current.version.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  const next = { version: parts.join('.'), code: (current.code || 1) + 1 };
  fs.writeFileSync(VERSION_FILE, JSON.stringify(next, null, 2));
  return next;
}

async function ghReq(method, urlPath, body) {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch('https://api.github.com' + urlPath, {
    method,
    headers: {
      Authorization:          `Bearer ${token}`,
      Accept:                 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':         'application/json',
      'User-Agent':           'BuildAniSubBot',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 200) }; }
  if (!res.ok) {
    const err = new Error(`GH ${method} ${urlPath} → ${res.status}: ${json.message || text.slice(0, 120)}`);
    err.status = res.status;
    throw err;
  }
  return json;
}

async function uploadRelease(apkBuf, tagName, assetName, releaseName, releaseBody) {
  const token = process.env.GITHUB_TOKEN;
  const owner = GH_OWNER;
  const repo  = GH_REPO;

  const listRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    headers: {
      Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'BuildAniSubBot',
    },
  });
  const releases = await listRes.json();
  let existing = Array.isArray(releases) ? releases.find(r => r.tag_name === tagName) : null;

  let uploadUrl;
  if (existing) {
    uploadUrl = existing.upload_url;
    const assetsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/${existing.id}/assets`, {
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'BuildAniSubBot',
      },
    });
    const assets = await assetsRes.json();
    if (Array.isArray(assets)) {
      for (const asset of assets) {
        if (asset.name === assetName) {
          await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${asset.id}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'BuildAniSubBot',
            },
          });
        }
      }
    }
  } else {
    const created = await ghReq('POST', `/repos/${owner}/${repo}/releases`, {
      tag_name: tagName, name: releaseName, body: releaseBody, draft: false, prerelease: false,
    });
    uploadUrl = created.upload_url;
  }

  const cleanUrl = uploadUrl.replace(/{[^}]+}/, '');
  const uploadRes = await fetch(`${cleanUrl}?name=${encodeURIComponent(assetName)}&label=${encodeURIComponent(assetName)}`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/vnd.android.package-archive',
      Accept:         'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent':   'BuildAniSubBot',
    },
    body: apkBuf,
  });
  const uploadJson = await uploadRes.json();
  if (!uploadRes.ok) throw new Error(`Upload APK gagal: ${uploadJson.message || uploadRes.status}`);
  return uploadJson.browser_download_url;
}

async function downloadFileBuffer(bot, fileId) {
  const file = await bot.getFile(fileId);
  const url  = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
  const r    = await fetch(url);
  if (!r.ok) throw new Error(`Download file gagal: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

function sanitizeAppName(raw) {
  return raw.replace(/[^a-zA-Z0-9 _\-\.]/g, '').trim().slice(0, 30) || 'AniSub';
}

// step: 'url' | 'name' | 'icon' | 'building'
const sessions = new Map();

async function doBuild(bot, chatId, session) {
  const { webUrl, apkDisplayName, iconBuf } = session;
  const VER      = getAndBumpVersion();
  const safeName = sanitizeAppName(apkDisplayName);
  const appId    = 'id.lawnime.' + safeName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20);

  let statusMsg;
  try {
    statusMsg = await bot.sendMessage(chatId,
      `⏳ <b>Build AniSub APK dimulai</b>\n` +
      `🌐 URL: <code>${esc(webUrl)}</code>\n` +
      `📱 Nama: <b>${esc(safeName)}</b> v${VER.version}\n\n` +
      `${bar(0)} 0%\n<i>Memulai kompilasi APK...</i>`,
      { parse_mode: 'HTML' }
    );
  } catch {}

  const edit = async (pct, step) => {
    try {
      await bot.editMessageText(
        `⏳ <b>Build AniSub APK</b>\n` +
        `🌐 URL: <code>${esc(webUrl)}</code>\n` +
        `📱 Nama: <b>${esc(safeName)}</b> v${VER.version}\n\n` +
        `${bar(pct)} ${pct}%\n<i>🔧 ${esc(step)}</i>`,
        { chat_id: chatId, message_id: statusMsg?.message_id, parse_mode: 'HTML' }
      );
    } catch {}
  };

  try {
    await edit(5, 'Memulai kompilasi APK...');

    const apkBuf = await buildAniSubApk(
      null,
      async (step) => {
        const pct = step.includes('Download') ? 10
          : step.includes('Mempersiapkan') ? 15
          : step.includes('resources') ? 35
          : step.includes('Link') ? 55
          : step.includes('DEX') ? 72
          : step.includes('Pack') ? 85
          : step.includes('Sign') ? 93 : 20;
        await edit(pct, step);
      },
      {
        appId,
        appName:     safeName,
        versionCode: String(VER.code),
        versionName: VER.version,
        iconBuf:     iconBuf || null,
        urlToLoad:   webUrl,
      }
    );

    await edit(95, 'Upload ke GitHub Releases...');

    const tagName     = 'anisub-apk';
    const assetName   = `AniSub-${safeName}-v${VER.version}.apk`;
    const downloadUrl = await uploadRelease(
      apkBuf, tagName, assetName,
      `AniSub APK v${VER.version}`,
      `APK AniSub WebView — loads ${webUrl}\nDibuild otomatis oleh bot.`
    );

    await edit(99, 'Mengirim APK ke Telegram...');

    const apkSizeMB = (apkBuf.length / 1024 / 1024).toFixed(1);

    await bot.sendDocument(chatId, apkBuf, {
      filename:    assetName,
      contentType: 'application/vnd.android.package-archive',
    }, { parse_mode: 'HTML' });

    await bot.editMessageText(
      `✅ <b>AniSub APK berhasil dibuild!</b>\n\n` +
      `📦 Ukuran APK: <b>${apkSizeMB} MB</b>\n` +
      `🌐 Loads: <code>${esc(webUrl)}</code>\n\n` +
      `📥 <a href="${downloadUrl}">Download dari GitHub Releases</a>\n\n` +
      `<i>Install → buka → langsung masuk AniSub.\n` +
      `Poster, banner, sinopsis, trailer, karakter & VA semua ada di web app.\n` +
      `🔔 Izin notifikasi diminta otomatis.</i>`,
      { chat_id: chatId, message_id: statusMsg?.message_id, parse_mode: 'HTML', disable_web_page_preview: true }
    );

  } catch (err) {
    console.error('[buildanisub] Error:', err);
    const errMsg = esc(err.message.slice(0, 300));
    try {
      await bot.editMessageText(
        `❌ <b>Build AniSub APK gagal</b>\n\n<code>${errMsg}</code>\n\nCoba lagi dengan /buildanisub`,
        { chat_id: chatId, message_id: statusMsg?.message_id, parse_mode: 'HTML' }
      );
    } catch {
      await bot.sendMessage(chatId, `❌ Build gagal: ${err.message.slice(0, 200)}\nCoba lagi: /buildanisub`);
    }
  } finally {
    sessions.delete(chatId);
  }
}

function registerAniSubApkCommand(bot) {
  // ── Step 1: /buildanisub → minta URL ────────────────────────────────────────
  bot.onText(/^\/buildanisub(?:\s|$)/i, async (msg) => {
    const chatId = msg.chat.id;
    if (!isOwner(msg)) {
      return bot.sendMessage(chatId, '⛔ Command ini hanya untuk owner.');
    }

    sessions.set(chatId, { step: 'url' });

    // Info cache yang tersedia
    const cfg = readCacheUrls();
    const cacheInfo = cfg
      ? `✅ Cache tersedia: <b>${cfg.totalAnime} anime</b> (${cfg.updatedAt ? new Date(cfg.updatedAt).toLocaleDateString('id-ID') : '-'})`
      : `⚠️ Cache belum ada — APK akan download data saat pertama buka`;

    await bot.sendMessage(chatId,
      `🎌 <b>Build AniSub APK</b>\n\n` +
      `${cacheInfo}\n\n` +
      `APK yang dihasilkan:\n` +
      `• 📦 WebView wrapper — langsung buka URL AniSub\n` +
      `• 🖼️ Semua data (poster, banner, sinopsis, trailer, karakter, VA) ada di web app\n` +
      `• 🔔 Izin notifikasi otomatis diminta\n` +
      `• ⬅️ Tombol back berfungsi\n\n` +
      `⚠️ <b>Gunakan URL publik</b> (GitHub Pages, dll) — bukan URL Replit/localhost!\n\n` +
      `⏱️ <i>Build ~2-3 menit</i>\n\n` +
      `Kirim <b>URL AniSub</b> yang mau dijadikan APK:\n` +
      `<i>Contoh: <code>https://jmstory-27.github.io/Jumalia-Makruf/anisub/</code></i>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── Handle semua pesan berdasarkan session step ──────────────────────────────
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    try {
      const session = sessions.get(chatId);
      if (!session) return;

      const isCmd = msg.text?.startsWith('/');
      if (isCmd) {
        if (session.step !== 'icon' || msg.text !== '/skip') {
          sessions.delete(chatId);
          return;
        }
      }

      // ── Step: URL ──────────────────────────────────────────────────────────
      if (session.step === 'url') {
        if (!msg.text) return;
        let url = msg.text.trim();
        if (!/^https?:\/\//i.test(url)) {
          return bot.sendMessage(chatId, '❌ URL harus dimulai dengan https://\nCoba lagi:');
        }
        // Tolak hanya URL lokal yang benar-benar tidak bisa diakses dari HP
        const localPatterns = [
          /^https?:\/\/localhost/i, /^https?:\/\/127\.0\.0\.1/i,
          /^https?:\/\/192\.168\./i, /^https?:\/\/10\.\d+\.\d+\.\d+/i,
          /^https?:\/\/172\.(1[6-9]|2\d|3[01])\./i,
        ];
        if (localPatterns.some(p => p.test(url))) {
          return bot.sendMessage(chatId,
            `❌ <b>URL lokal tidak bisa dipakai untuk APK!</b>\n\n` +
            `URL <code>${esc(url)}</code> hanya bisa diakses di jaringan lokal, bukan dari HP lain.\n\n` +
            `Gunakan URL yang bisa dibuka dari mana saja (GitHub Pages, Replit preview, dll).\n\n` +
            `Kirim URL AniSub yang benar:`,
            { parse_mode: 'HTML' }
          );
        }
        if (!url.endsWith('/')) url += '/';

        session.webUrl = url;
        session.step   = 'name';
        sessions.set(chatId, session);

        await bot.sendMessage(chatId,
          `✅ URL: <code>${esc(url)}</code>\n\nMasukkan <b>nama aplikasi</b> (maks 30 karakter):`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      // ── Step: Name ─────────────────────────────────────────────────────────
      if (session.step === 'name') {
        if (!msg.text) return;
        const safeName = sanitizeAppName(msg.text);
        if (!safeName) return bot.sendMessage(chatId, '❌ Nama tidak valid. Coba lagi:');

        session.apkDisplayName = safeName;
        session.step           = 'icon';
        sessions.set(chatId, session);

        await bot.sendMessage(chatId,
          `✅ Nama: <b>${esc(safeName)}</b>\n\nKirim <b>ikon APK</b> (PNG/JPG) atau ketik /skip untuk ikon default:`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      // ── Step: Icon ─────────────────────────────────────────────────────────
      if (session.step === 'icon') {
        if (msg.text === '/skip') {
          session.iconBuf = null;
          session.step    = 'building';
          sessions.set(chatId, session);

          await bot.sendMessage(chatId,
            `✅ Ikon default akan digunakan.\n\n` +
            `🚀 <b>Memulai proses build...</b>\n` +
            `<i>Estimasi waktu: 2-3 menit. Mohon tunggu!</i>`,
            { parse_mode: 'HTML' }
          );
          await doBuild(bot, chatId, session);
          return;
        }

        const photo = msg.photo?.[msg.photo.length - 1];
        const doc   = msg.document;
        const fileId = photo?.file_id || (doc?.mime_type?.startsWith('image/') ? doc.file_id : null);

        if (!fileId) {
          return bot.sendMessage(chatId, '📎 Kirim foto/gambar atau ketik /skip untuk ikon default:');
        }

        let iconBuf;
        try {
          iconBuf = await downloadFileBuffer(bot, fileId);
        } catch (e) {
          return bot.sendMessage(chatId, `❌ Gagal download ikon: ${e.message}\nKirim ulang atau ketik /skip.`);
        }

        session.iconBuf = iconBuf;
        session.step    = 'building';
        sessions.set(chatId, session);

        await bot.sendMessage(chatId,
          `✅ Ikon diterima! (${(iconBuf.length / 1024).toFixed(0)} KB)\n\n` +
          `🚀 <b>Memulai proses build...</b>\n` +
          `<i>Estimasi waktu: 2-3 menit. Mohon tunggu!</i>`,
          { parse_mode: 'HTML' }
        );
        await doBuild(bot, chatId, session);
        return;
      }

      // ── Step: building ─────────────────────────────────────────────────────
      if (session.step === 'building') {
        await bot.sendMessage(chatId, '⏳ Build AniSub APK sedang berjalan, mohon tunggu...');
        return;
      }

    } catch (err) {
      console.error('[buildanisub] session error:', err);
      sessions.delete(chatId);
      await bot.sendMessage(chatId, `❌ Error: ${err.message.slice(0, 200)}\nCoba lagi: /buildanisub`);
    }
  });

  console.log('✅ /buildanisub command registered — URL → nama → ikon → download cache → build APK');
}

module.exports = { registerAniSubApkCommand };
