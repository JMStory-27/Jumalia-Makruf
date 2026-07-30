'use strict';

const fs   = require('fs');
const path = require('path');
const { buildApk } = require('./localApkBuild');

const PUBLIC_DIR   = path.join(__dirname, '..', 'public');
const VERSION_FILE = path.join(__dirname, '..', 'data', 'buildfixmerah-version.json');

const GH_OWNER = process.env.GITHUB_OWNER || 'JMStory-27';
const GH_REPO  = process.env.GITHUB_REPO  || 'Jumalia-Makruf';

const OWNER_ID = process.env.OWNER_TELEGRAM_ID ? Number(process.env.OWNER_TELEGRAM_ID) : null;

function isOwner(msg) {
  return OWNER_ID && msg.from?.id === OWNER_ID;
}

function esc(s) {
  return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

function bar(pct) {
  const filled = Math.round(pct / 7);
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
      'User-Agent':           'BuildFixMerahBot',
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
      'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'BuildFixMerahBot',
    },
  });
  const releases = await listRes.json();
  let existingRelease = Array.isArray(releases) ? releases.find(r => r.tag_name === tagName) : null;

  let uploadUrl;
  if (existingRelease) {
    uploadUrl = existingRelease.upload_url;
    const assetsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/${existingRelease.id}/assets`, {
      headers: {
        Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'BuildFixMerahBot',
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
              'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'BuildFixMerahBot',
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

  const baseUrl = uploadUrl.replace(/\{[^}]*\}/g, '');
  const upRes = await fetch(`${baseUrl}?name=${encodeURIComponent(assetName)}`, {
    method: 'POST',
    headers: {
      Authorization:          `Bearer ${token}`,
      Accept:                 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':         'application/vnd.android.package-archive',
      'Content-Length':       String(apkBuf.length),
      'User-Agent':           'BuildFixMerahBot',
    },
    body: apkBuf,
  });
  if (!upRes.ok) {
    const t = await upRes.text();
    throw new Error(`Upload APK gagal: ${upRes.status} — ${t.slice(0, 200)}`);
  }
  return `https://github.com/${owner}/${repo}/releases/download/${tagName}/${assetName}`;
}

// ─── Session state per user ────────────────────────────────────────────────────
// step: 'url' | 'name' | 'icon' | 'building'
const sessions = new Map();

function sanitizeAppName(raw) {
  return raw.trim().replace(/[^a-zA-Z0-9\s\-_]/g, '').trim().slice(0, 40) || 'MyApp';
}

function makeAppId(name) {
  const safe = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return `com.lawrenz.${safe || 'webview'}`;
}

function sanitizeUrl(raw) {
  let url = raw.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;
  return url;
}

// ─── Main build function ───────────────────────────────────────────────────────
async function doBuild(bot, chatId, session) {
  const { webUrl, apkDisplayName, iconBuf } = session;

  const ver    = getAndBumpVersion();
  const VER    = ver.version;
  const VCODE  = String(ver.code);
  const safeName = sanitizeAppName(apkDisplayName);
  const appId  = makeAppId(safeName);
  const cn     = safeName;
  const APK_NAME = `${safeName.replace(/\s+/g, '-')}-v${VER}.apk`;
  const TAG_NAME = `v${VER}-${safeName.replace(/\s+/g, '-').toLowerCase()}`;

  const startTime = Date.now();

  const statusMsg = await bot.sendMessage(chatId,
    `📱 <b>Build APK dimulai!</b>\n\n` +
    `📛 <b>Nama:</b> ${esc(safeName)}\n` +
    `🌐 <b>URL:</b> <code>${esc(webUrl)}</code>\n\n` +
    `[░░░░░░░░░░░░░░] <b>0%</b>\n` +
    `🔧 Memulai proses build...\n\n` +
    `⏱ Waktu: 0 detik\n` +
    `<i>Proses 5–8 menit, sabar ya!</i>`,
    { parse_mode: 'HTML' }
  );

  const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(0);

  const edit = async (pct, step) => {
    try {
      await bot.editMessageText(
        `📱 <b>Build ${esc(safeName)} APK v${VER}...</b>\n\n` +
        `🌐 <b>URL:</b> <code>${esc(webUrl)}</code>\n\n` +
        `[${bar(pct)}] <b>${pct}%</b>\n` +
        `🔧 ${step}\n\n` +
        `⏱ Waktu: ${elapsed()} detik`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' }
      );
    } catch (_) {}
  };

  try {
    await edit(5, 'Memeriksa tools build...');

    const apkBuf = await buildApk(Buffer.from('<html></html>', 'utf8'), async (step) => {
      const pct = step.includes('Download') ? 15
        : step.includes('Mempersiapkan') ? 25
        : step.includes('resources') ? 45
        : step.includes('Link') ? 58
        : step.includes('DEX') ? 72
        : step.includes('Pack') ? 83
        : step.includes('Sign') ? 91 : 30;
      await edit(pct, step);
    }, {
      appName:     safeName,
      appId,
      cn,
      iconBuf:     iconBuf || null,
      urlToLoad:   webUrl,
      versionCode: VCODE,
      versionName: VER,
    });

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const sizeMB     = (apkBuf.length / 1024 / 1024).toFixed(2);

    await edit(95, 'Upload ke GitHub Releases...');

    const releaseUrl = await uploadRelease(
      apkBuf,
      TAG_NAME,
      APK_NAME,
      `${safeName} v${VER}`,
      `📱 ${safeName} v${VER}\n\n🌐 Loads: ${webUrl}\n\n✅ Auto-update: perubahan web langsung tersedia di APK!\n🚀 WebView APK — selalu load URL terbaru!`
    );

    // Save to public dir
    if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
    fs.writeFileSync(path.join(PUBLIC_DIR, APK_NAME), apkBuf);

    await edit(100, 'Selesai! Mengirim APK...');

    await bot.sendDocument(chatId,
      Buffer.from(apkBuf),
      {
        caption:
          `✅ <b>${esc(safeName)} v${VER} berhasil di-build!</b>\n\n` +
          `📦 <b>Ukuran:</b> ${sizeMB} MB\n` +
          `⏱ <b>Waktu build:</b> ${elapsedSec} detik\n\n` +
          `🌐 <b>Loads URL:</b>\n<code>${esc(webUrl)}</code>\n\n` +
          `📲 <b>Auto-update:</b> Setiap update web langsung aktif tanpa install ulang!\n\n` +
          `📥 <b>Download GitHub:</b>\n${releaseUrl}\n\n` +
          `<i>Install APK → buka → langsung tampil webnya! Selama web aktif, APK selalu berfungsi.</i>`,
        parse_mode: 'HTML',
      },
      { filename: APK_NAME, contentType: 'application/vnd.android.package-archive' }
    );

    await bot.editMessageText(
      `✅ <b>${esc(safeName)} v${VER} — Build Selesai!</b>\n\n` +
      `📦 ${sizeMB} MB · ⏱ ${elapsedSec} detik\n` +
      `🌐 Loads: <code>${esc(webUrl)}</code>\n` +
      `📥 APK dikirim di atas ⬆️`,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' }
    );

  } catch (err) {
    console.error('[jadiapk] Error:', err);
    await bot.editMessageText(
      `❌ <b>Build gagal!</b>\n\n<code>${String(err.message).slice(0, 300).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</code>`,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' }
    ).catch(() => {});
  } finally {
    sessions.delete(chatId);
  }
}

// ─── Download Telegram file to Buffer ─────────────────────────────────────────
async function downloadFileBuffer(bot, fileId) {
  const fileInfo = await bot.getFile(fileId);
  const fileUrl  = `https://api.telegram.org/file/bot${bot.token}/${fileInfo.file_path}`;
  const res      = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Download gambar gagal: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// ─── Register command ──────────────────────────────────────────────────────────
function registerFixMerahApkCommand(bot) {

  // Step 1: /buildfixmerah → tanya URL
  bot.onText(/^\/jadiapk(?:\s|$)/i, async (msg) => {
    const chatId = msg.chat.id;
    if (!isOwner(msg)) {
      return bot.sendMessage(chatId, '⛔ Perintah ini hanya untuk owner.');
    }
    // Reset session
    sessions.set(chatId, { step: 'url' });
    await bot.sendMessage(chatId,
      `📱 <b>Build APK — Langkah 1/3</b>\n\n` +
      `🌐 Kirim <b>link web</b> yang mau dijadikan APK:\n` +
      `<i>(contoh: https://namaweb.com)</i>`,
      { parse_mode: 'HTML' }
    );
  });

  // Handle semua pesan masuk berdasarkan session step
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const session = sessions.get(chatId);
    if (!session) return; // tidak ada session aktif
    if (!isOwner(msg)) return;

    // Ignore command messages (biar ga bentrok), kecuali /skip saat step icon
    if (msg.text && msg.text.startsWith('/')) {
      const isSkip = msg.text.trim().toLowerCase() === '/skip';
      const isIconStep = session.step === 'icon';
      if (!isSkip || !isIconStep) {
        sessions.delete(chatId);
        return;
      }
      // /skip saat step icon → lanjut ke handler icon di bawah
    }

    try {
      // ── Step: waiting for URL ────────────────────────────────────────────────
      if (session.step === 'url') {
        const rawUrl = msg.text?.trim();
        if (!rawUrl) {
          return bot.sendMessage(chatId,
            `⚠️ Kirim <b>link web</b> ya (bukan gambar/file).\n<i>Contoh: https://namaweb.com</i>`,
            { parse_mode: 'HTML' }
          );
        }

        // Basic URL validation
        let finalUrl;
        try {
          finalUrl = sanitizeUrl(rawUrl);
          new URL(finalUrl); // validate
        } catch {
          return bot.sendMessage(chatId,
            `❌ URL tidak valid! Pastikan formatnya benar.\n<i>Contoh: https://namaweb.com</i>`,
            { parse_mode: 'HTML' }
          );
        }

        session.webUrl = finalUrl;
        session.step   = 'name';
        sessions.set(chatId, session);

        await bot.sendMessage(chatId,
          `✅ URL diterima!\n\n` +
          `📱 <b>Build APK — Langkah 2/3</b>\n\n` +
          `📛 Sekarang kirim <b>nama APK</b>-nya:\n` +
          `<i>(contoh: FixMerah, MyApp, StreamKu)</i>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      // ── Step: waiting for APK name ───────────────────────────────────────────
      if (session.step === 'name') {
        const rawName = msg.text?.trim();
        if (!rawName) {
          return bot.sendMessage(chatId,
            `⚠️ Kirim <b>nama APK</b>-nya ya (teks, bukan gambar).\n<i>Contoh: FixMerah</i>`,
            { parse_mode: 'HTML' }
          );
        }

        const safeName = sanitizeAppName(rawName);
        if (!safeName) {
          return bot.sendMessage(chatId,
            `❌ Nama tidak valid. Gunakan huruf, angka, atau spasi.\n<i>Contoh: FixMerah App</i>`,
            { parse_mode: 'HTML' }
          );
        }

        session.apkDisplayName = safeName;
        session.step           = 'icon';
        sessions.set(chatId, session);

        await bot.sendMessage(chatId,
          `✅ Nama APK: <b>${esc(safeName)}</b>\n\n` +
          `📱 <b>Build APK — Langkah 3/3</b>\n\n` +
          `🖼 Sekarang kirim <b>ikon APK</b>-nya (foto/gambar):\n` +
          `<i>Disarankan ukuran minimal 512×512 px, format PNG/JPG\n` +
          `Atau ketik /skip jika mau pakai ikon default</i>`,
          { parse_mode: 'HTML' }
        );
        return;
      }

      // ── Step: waiting for icon ───────────────────────────────────────────────
      if (session.step === 'icon') {
        // Cek apakah user skip icon
        if (msg.text?.trim().toLowerCase() === '/skip') {
          session.iconBuf = null;
          session.step    = 'building';
          sessions.set(chatId, session);
          await bot.sendMessage(chatId,
            `✅ Ikon dilewati — pakai ikon default.\n\n🚀 <b>Memulai build APK...</b>`,
            { parse_mode: 'HTML' }
          );
          await doBuild(bot, chatId, session);
          return;
        }

        // Cek apakah ada foto/document gambar
        let fileId = null;
        if (msg.photo && msg.photo.length > 0) {
          // Ambil resolusi tertinggi
          fileId = msg.photo[msg.photo.length - 1].file_id;
        } else if (msg.document && msg.document.mime_type?.startsWith('image/')) {
          fileId = msg.document.file_id;
        }

        if (!fileId) {
          return bot.sendMessage(chatId,
            `⚠️ Kirim <b>gambar/foto</b> sebagai ikon APK.\n` +
            `Atau ketik /skip untuk pakai ikon default.`,
            { parse_mode: 'HTML' }
          );
        }

        // Download icon
        let iconBuf;
        try {
          iconBuf = await downloadFileBuffer(bot, fileId);
        } catch (e) {
          return bot.sendMessage(chatId,
            `❌ Gagal download ikon: ${e.message}\nCoba kirim ulang atau ketik /skip.`,
            { parse_mode: 'HTML' }
          );
        }

        session.iconBuf = iconBuf;
        session.step    = 'building';
        sessions.set(chatId, session);

        await bot.sendMessage(chatId,
          `✅ Ikon diterima! (${(iconBuf.length / 1024).toFixed(0)} KB)\n\n` +
          `🚀 <b>Memulai build APK...</b>\n` +
          `<i>URL: ${esc(session.webUrl)}\n` +
          `Nama: ${esc(session.apkDisplayName)}\n` +
          `Proses 5–8 menit, tunggu ya!</i>`,
          { parse_mode: 'HTML' }
        );

        await doBuild(bot, chatId, session);
        return;
      }

      // ── Step: building (ignore messages during build) ────────────────────────
      if (session.step === 'building') {
        await bot.sendMessage(chatId,
          `⏳ Build sedang berjalan, mohon tunggu...`
        );
        return;
      }

    } catch (err) {
      console.error('[buildfixmerah] session error:', err);
      sessions.delete(chatId);
      await bot.sendMessage(chatId,
        `❌ Terjadi error: ${err.message}\nCoba lagi dengan /jadiapk`
      );
    }
  });

  console.log('✅ /jadiapk command registered — multi-step: URL → nama → ikon → build APK');
}

module.exports = { registerFixMerahApkCommand };
