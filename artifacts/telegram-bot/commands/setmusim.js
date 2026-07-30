'use strict';

const fs   = require('fs');
const path = require('path');
const { downloadViaMTProto } = require('../mtproto-download');

const WORKSPACE_ROOT = path.resolve(__dirname, '../../../');
const GH_API = 'https://api.github.com';

const SEASONS = [
  { id: 'SUMMER', label: 'Summer', emoji: '☀️' },
  { id: 'FALL',   label: 'Fall',   emoji: '🍂' },
  { id: 'WINTER', label: 'Winter', emoji: '❄️' },
  { id: 'SPRING', label: 'Spring', emoji: '🌸' },
];

// ── Persistent sessions (survive bot restart) ─────────────────────────────────
const SESSION_FILE = path.join(__dirname, '../data/setmusim-sessions.json');
const SESSION_TTL  = 30 * 60 * 1000; // 30 menit

function _loadSessions() {
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf8');
    const obj = JSON.parse(raw);
    const now = Date.now();
    // Buang entri yang sudah expired
    return new Map(
      Object.entries(obj).filter(([, v]) => (now - (v.ts || 0)) < SESSION_TTL)
    );
  } catch { return new Map(); }
}

function _saveSessions(map) {
  try {
    fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
    const obj = {};
    const now = Date.now();
    for (const [k, v] of map.entries()) {
      if ((now - (v.ts || 0)) < SESSION_TTL) obj[k] = v;
    }
    fs.writeFileSync(SESSION_FILE, JSON.stringify(obj));
  } catch (e) { console.error('[setmusim] save session error:', e.message); }
}

// chatId → { step: 'wait_video', season: 'SUMMER'|'FALL'|..., ts: timestamp }
const sessions = _loadSessions();

function sessSet(chatId, data) {
  sessions.set(String(chatId), { ...data, ts: Date.now() });
  _saveSessions(sessions);
}
function sessDelete(chatId) {
  sessions.delete(String(chatId));
  _saveSessions(sessions);
}
function sessGet(chatId) {
  const v = sessions.get(String(chatId));
  if (!v) return null;
  if ((Date.now() - (v.ts || 0)) >= SESSION_TTL) { sessDelete(chatId); return null; }
  return v;
}

/* ── GitHub helper ─────────────────────────────────────────────────────────── */
async function ghFetch(token, method, urlPath, body) {
  const r = await fetch(GH_API + urlPath, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'AlbumAbadiBot',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!r.ok) {
    const err = new Error(`GH ${method} ${urlPath} → ${r.status}: ${json.message || text.slice(0, 200)}`);
    err.status = r.status;
    throw err;
  }
  return json;
}

/* ── GitHub Releases upload (support file hingga 2GB) ─────────────────────── */

/** Ambil atau buat release dengan tag tertentu */
async function getOrCreateRelease(token, owner, repo, tag) {
  try {
    return await ghFetch(token, 'GET', `/repos/${owner}/${repo}/releases/tags/${tag}`);
  } catch (e) {
    if (e.status !== 404) throw e;
  }
  // Buat release baru
  return await ghFetch(token, 'POST', `/repos/${owner}/${repo}/releases`, {
    tag_name:   tag,
    name:       '🎬 Banner Videos Anisub',
    body:       'Video banner otomatis dari /setmusim. Jangan hapus release ini.',
    draft:      false,
    prerelease: false,
  });
}

/** Upload buffer sebagai asset ke GitHub Release */
async function uploadReleaseAsset(token, uploadUrl, assetName, buffer) {
  // uploadUrl contoh: https://uploads.github.com/repos/...{?name,label}
  const url = uploadUrl.replace(/\{[^}]+\}/, '') + `?name=${encodeURIComponent(assetName)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'video/mp4',
      'Content-Length': String(buffer.length),
      'User-Agent': 'AlbumAbadiBot',
    },
    body: buffer,
    signal: AbortSignal.timeout(300_000), // 5 menit
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { _raw: text }; }
  if (!res.ok) {
    throw new Error(`Upload asset gagal ${res.status}: ${json.message || text.slice(0, 200)}`);
  }
  return json; // { browser_download_url, ... }
}

/** Push video ke GitHub Releases dan update banner-urls.json di repo */
async function pushVideoToGitHub(token, owner, repo, seasonLower, buffer) {
  const RELEASE_TAG  = 'banner-videos';
  const assetName    = `season-${seasonLower}.mp4`;

  // 1. Ambil / buat release
  const release = await getOrCreateRelease(token, owner, repo, RELEASE_TAG);

  // 2. Hapus asset lama dengan nama yang sama (kalau ada)
  const existingAssets = await ghFetch(token, 'GET', `/repos/${owner}/${repo}/releases/${release.id}/assets`);
  const oldAsset = existingAssets.find(a => a.name === assetName);
  if (oldAsset) {
    await ghFetch(token, 'DELETE', `/repos/${owner}/${repo}/releases/assets/${oldAsset.id}`);
  }

  // 3. Upload asset baru
  const uploaded = await uploadReleaseAsset(token, release.upload_url, assetName, buffer);
  const downloadUrl = uploaded.browser_download_url;

  // 4. Update banner-urls.json di repo
  const urlFilePath = 'artifacts/telegram-bot/data/banner-urls.json';
  let currentUrls   = { summer: null, fall: null, winter: null, spring: null };
  let urlFileSha;
  try {
    const existing = await ghFetch(token, 'GET', `/repos/${owner}/${repo}/contents/${urlFilePath}`);
    urlFileSha = existing.sha;
    currentUrls = JSON.parse(Buffer.from(existing.content, 'base64').toString('utf8'));
  } catch (e) {
    if (e.status !== 404) throw e;
  }

  currentUrls[seasonLower]  = downloadUrl;
  currentUrls.updatedAt     = new Date().toISOString();
  currentUrls._note         = 'Auto-generated oleh /setmusim. Jangan edit manual. URL mengarah ke GitHub Releases.';

  const newContent = Buffer.from(JSON.stringify(currentUrls, null, 2) + '\n').toString('base64');
  await ghFetch(token, 'PUT', `/repos/${owner}/${repo}/contents/${urlFilePath}`, {
    message:  `🎬 setmusim: update banner-urls.json (${seasonLower}) [skip ci]`,
    content:  newContent,
    ...(urlFileSha ? { sha: urlFileSha } : {}),
  });

  // 5. Update juga banner-urls.json lokal supaya API server langsung reflect
  const localUrlPath = path.join(__dirname, '../data/banner-urls.json');
  try {
    fs.writeFileSync(localUrlPath, JSON.stringify(currentUrls, null, 2) + '\n', 'utf8');
  } catch (e) {
    console.error('[setmusim] update local banner-urls.json error:', e.message);
  }

  return { downloadUrl, releaseId: release.id };
}

/* ── Telegram file download ────────────────────────────────────────────────── */
async function downloadTelegramFile(bot, fileId) {
  const file    = await bot.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const res     = await fetch(fileUrl, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`Download gagal: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/* ── Screenshot via microlink ──────────────────────────────────────────────── */
async function takeScreenshot(url) {
  try {
    const apiUrl =
      `https://api.microlink.io?url=${encodeURIComponent(url)}` +
      `&screenshot=true&meta=false&device=mobile&waitForTimeout=9000`;
    const res  = await fetch(apiUrl, { signal: AbortSignal.timeout(60_000) });
    const data = await res.json();
    if (data.status === 'success' && data.data?.screenshot?.url) {
      const imgRes = await fetch(data.data.screenshot.url, { signal: AbortSignal.timeout(20_000) });
      if (imgRes.ok) return Buffer.from(await imgRes.arrayBuffer());
    }
    console.error('[setmusim] screenshot API response:', JSON.stringify(data).slice(0, 200));
  } catch (e) {
    console.error('[setmusim] screenshot error:', e.message);
  }
  return null;
}

function getReplitBaseUrl() {
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) return `https://${dev}`;
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) return `https://${domains.split(',')[0].trim()}`;
  return null;
}

function esc(s) { return String(s).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1'); }

/* ── Main registration ──────────────────────────────────────────────────────── */
function registerSetMusimCommand(bot, ownerId) {
  /* /setmusim — tampilkan keyboard pilihan musim */
  bot.onText(/^\/setmusim(?:\s|$)/i, async (msg) => {
    const chatId = msg.chat.id;
    const userId = String(msg.from?.id);

    if (ownerId && userId !== String(ownerId)) {
      return bot.sendMessage(chatId, '⛔ Command ini hanya untuk owner.');
    }

    // Reset session bersih — hapus state lama apapun sebelum mulai
    sessDelete(chatId);

    const sentMsg = await bot.sendMessage(
      chatId,
      `🎬 *Set Video Banner Musim*\n\nPilih musim mana yang mau diganti video bannernya:\n_Video akan tampil sebagai background banner di halaman Musim Anisub\\._`,
      {
        parse_mode: 'MarkdownV2',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '☀️ Summer', callback_data: 'setmusim_SUMMER' },
              { text: '🍂 Fall',   callback_data: 'setmusim_FALL' },
            ],
            [
              { text: '❄️ Winter', callback_data: 'setmusim_WINTER' },
              { text: '🌸 Spring', callback_data: 'setmusim_SPRING' },
            ],
            [{ text: '❌ Batal', callback_data: 'setmusim_CANCEL' }],
          ],
        },
      }
    );

    // Simpan message_id supaya callback query bisa edit message yang benar
    sessSet(chatId, { step: 'select_season', menuMsgId: sentMsg.message_id });
  });

  /* Callback dari pilihan musim */
  bot.on('callback_query', async (q) => {
    if (!q.data?.startsWith('setmusim_')) return;
    const chatId = q.message.chat.id;
    const data   = q.data.replace('setmusim_', '');

    // Selalu jawab callback query dulu supaya loading spinner hilang
    await bot.answerCallbackQuery(q.id).catch(() => {});

    if (data === 'CANCEL') {
      sessions.delete(chatId);
      // Edit message lama jadi "Dibatalkan" — ignore error kalau gagal
      bot.editMessageText('❌ Dibatalkan\\.', {
        chat_id: chatId, message_id: q.message.message_id,
        parse_mode: 'MarkdownV2',
      }).catch(() => {});
      return;
    }

    const season = SEASONS.find(s => s.id === data);
    if (!season) return;

    // Set session DULU, baru edit message
    sessSet(chatId, { step: 'wait_video', season: data, menuMsgId: q.message.message_id });

    const promptText =
      `${season.emoji} *Musim dipilih: ${season.label}*\n\n` +
      `Sekarang kirim video untuk banner musim *${esc(season.label)}*\\.\n\n` +
      `📋 *Ketentuan:*\n` +
      `\\- Format: MP4 / video apapun\n` +
      `\\- Ukuran: bebas \\(hingga 2GB via MTProto\\)\n` +
      `\\- Durasi: bebas\n` +
      `\\- Kirim sebagai *file* atau *video* biasa\n\n` +
      `_Video lama akan dihapus dan diganti yang baru\\._`;

    // Coba edit message lama dulu; kalau gagal (misal "message not modified" atau
    // user klik button berkali-kali) fallback ke kirim message baru supaya user
    // selalu dapat konfirmasi musim yang dipilih.
    try {
      await bot.editMessageText(promptText, {
        chat_id: chatId, message_id: q.message.message_id,
        parse_mode: 'MarkdownV2',
      });
    } catch (_editErr) {
      // editMessageText gagal (sudah di-edit sebelumnya dll) — kirim pesan baru
      await bot.sendMessage(chatId, promptText, { parse_mode: 'MarkdownV2' }).catch(() => {});
    }
  });

  /* Terima video dari user */
  bot.on('message', async (msg) => {
    const chatId  = msg.chat.id;
    const session = sessGet(chatId);
    if (!session || session.step !== 'wait_video') return;

    // Jangan intercept perintah lain (/setmusim, /start, dll) — biarkan handler-nya sendiri
    if (msg.text?.startsWith('/')) return;

    // Terima video atau dokumen video
    const videoObj = msg.video
      || (msg.document?.mime_type?.startsWith('video/') ? msg.document : null);

    if (!videoObj) {
      // User kirim bukan video — ingatkan tapi jangan hapus session
      return bot.sendMessage(chatId,
        `⚠️ Itu bukan video\\. Kirim dalam bentuk *video* atau *file video* ya\\.`,
        { parse_mode: 'MarkdownV2' }
      );
    }

    const season = SEASONS.find(s => s.id === session.season);
    sessDelete(chatId);

    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo  = process.env.GITHUB_REPO;

    if (!token || !owner || !repo) {
      return bot.sendMessage(chatId,
        '❌ *Config GitHub belum lengkap\\.* Pastikan `GITHUB_TOKEN`, `GITHUB_OWNER`, dan `GITHUB_REPO` sudah di\\-set\\.',
        { parse_mode: 'MarkdownV2' }
      );
    }

    const fileSizeMB  = ((videoObj.file_size || 0) / 1024 / 1024).toFixed(1);
    const fileSizeMBe = esc(fileSizeMB);

    // Bot API hanya bisa download ≤ 20MB; pakai MTProto (gramjs) untuk yang lebih besar
    const USE_MTPROTO = videoObj.file_size && videoObj.file_size > 20 * 1024 * 1024;

    const progressMsg = await bot.sendMessage(
      chatId,
      `📥 *Mengunduh video ${season.emoji} ${esc(season.label)}* \\(${fileSizeMBe} MB\\)${USE_MTPROTO ? ' via MTProto' : ''}\\.\\.\\.`,
      { parse_mode: 'MarkdownV2' }
    ).catch(async (e) => {
      console.error('[setmusim] progressMsg error:', e.message);
      return bot.sendMessage(chatId, `📥 Mengunduh video ${season.label} (${fileSizeMB} MB)...`);
    });

    try {
      /* 1. Download dari Telegram */
      let buffer;
      if (USE_MTPROTO) {
        // File > 20MB — pakai MTProto (gramjs) yang bisa handle sampai 2GB
        console.log(`[setmusim] Menggunakan MTProto untuk file ${fileSizeMB} MB`);
        buffer = await downloadViaMTProto(msg);
      } else {
        buffer = await downloadTelegramFile(bot, videoObj.file_id);
      }
      const actualMB = esc((buffer.length / 1024 / 1024).toFixed(2));

      await bot.editMessageText(
        `✅ *Download selesai* \\(${actualMB} MB\\)\\.\n` +
        `📤 Sedang push ke GitHub\\.\\.\\.`,
        { chat_id: chatId, message_id: progressMsg.message_id, parse_mode: 'MarkdownV2' }
      ).catch(() => {});

      /* 2. Push ke GitHub repo (permanen, tidak hilang saat remixgithub) */
      await pushVideoToGitHub(token, owner, repo, season.id.toLowerCase(), buffer);

      /* 3. Update file lokal langsung supaya preview langsung tampil tanpa tunggu deploy */
      const localDir  = path.join(WORKSPACE_ROOT, 'artifacts/anisub/public/banners');
      const localPath = path.join(localDir, `season-${season.id.toLowerCase()}.mp4`);
      try {
        fs.mkdirSync(localDir, { recursive: true });
        fs.writeFileSync(localPath, buffer);
      } catch (e) {
        console.error('[setmusim] write local file error:', e.message);
      }

      await bot.editMessageText(
        `✅ *Video banner ${season.emoji} ${esc(season.label)} berhasil disimpan\\!*\n\n` +
        `📁 File: \`season-${season.id.toLowerCase()}.mp4\`\n` +
        `💾 Size: ${actualMB} MB\n` +
        `🔗 Tersimpan permanen di GitHub \\(tidak hilang saat remixgithub\\)\\.\n\n` +
        `📸 *Mengambil screenshot bukti\\.\\.\\.* _\\(tunggu \\~10 detik\\)_`,
        { chat_id: chatId, message_id: progressMsg.message_id, parse_mode: 'MarkdownV2' }
      );

      /* 4. Screenshot halaman Musim Anisub sebagai bukti */
      const baseUrl = getReplitBaseUrl();
      let screenshotBuf = null;
      if (baseUrl) {
        // Arahkan ke halaman musim Anisub
        const musimUrl = `${baseUrl}/`;
        screenshotBuf = await takeScreenshot(musimUrl);
      }

      if (screenshotBuf) {
        await bot.sendPhoto(chatId, screenshotBuf, {
          caption:
            `✅ *Banner ${season.emoji} ${esc(season.label)} sudah terpasang\\!*\n` +
            `_Screenshot halaman Musim Anisub\\._`,
          parse_mode: 'MarkdownV2',
        });
        await bot.editMessageText(
          `✅ *Selesai\\!* Video banner ${season.emoji} ${esc(season.label)} aktif\\.`,
          { chat_id: chatId, message_id: progressMsg.message_id, parse_mode: 'MarkdownV2' }
        );
      } else {
        await bot.editMessageText(
          `✅ *Video banner ${season.emoji} ${esc(season.label)} tersimpan\\!*\n\n` +
          `📁 \`season-${season.id.toLowerCase()}.mp4\` \\(${actualMB} MB\\)\n` +
          `🔗 Permanen di GitHub — tidak hilang saat /remixgithub\\.\n\n` +
          `_\\(Screenshot tidak tersedia — cek manual di halaman Musim Anisub\\)_`,
          { chat_id: chatId, message_id: progressMsg.message_id, parse_mode: 'MarkdownV2' }
        );
      }

    } catch (e) {
      console.error('[setmusim] error:', e.message);
      await bot.editMessageText(
        `❌ *Gagal menyimpan video:*\n\`${(e.message || 'unknown error').slice(0, 280).replace(/[\\`]/g, '\\$&')}\``,
        { chat_id: chatId, message_id: progressMsg.message_id, parse_mode: 'MarkdownV2' }
      ).catch(() => bot.sendMessage(chatId, `❌ Error: ${e.message?.slice(0, 200)}`));
    }
  });
}

module.exports = { registerSetMusimCommand };
