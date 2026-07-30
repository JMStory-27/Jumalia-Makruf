'use strict';

const fs   = require('fs');
const path = require('path');
const { buildApk } = require('./localApkBuild');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const TEMPLATE   = path.join(PUBLIC_DIR, 'duo-bucin.html');
const ICON_PATH  = path.join(PUBLIC_DIR, 'duo-bucin-icon.png');

function getGhCfg() {
  return {
    token: process.env.GITHUB_TOKEN,
    owner: process.env.GITHUB_OWNER || 'JMStory-27',
    repo:  process.env.GITHUB_REPO  || 'Jumalia-Makruf',
  };
}

async function gh(method, urlPath, body) {
  const { token } = getGhCfg();
  const res = await fetch('https://api.github.com' + urlPath, {
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
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 200) }; }
  return { ok: res.ok, status: res.status, json };
}

async function pushToGithub(filePath, buf, msg) {
  const { owner, repo } = getGhCfg();
  const url  = `/repos/${owner}/${repo}/contents/${filePath}`;
  const b64  = buf.toString('base64');
  const get  = await gh('GET', url);
  const body = { message: msg + ' [skip ci]', content: b64, branch: 'main' };
  if (get.ok && get.json.sha) body.sha = get.json.sha;
  const put = await gh('PUT', url, body);
  if (!put.ok) throw new Error(`Push gagal: ${put.status} ${put.json.message || ''}`);
  return `https://${owner}.github.io/${repo}/${filePath}`;
}

function extractFirebaseConfig() {
  const raw = process.env.FIREBASE_CONFIG || '';
  const match = raw.match(/firebaseConfig\s*=\s*(\{[\s\S]*?\})/);
  if (match) return match[1];
  try {
    const obj = JSON.parse(raw);
    return JSON.stringify(obj, null, 2);
  } catch {}
  return `{
    apiKey: "GANTI_API_KEY",
    authDomain: "GANTI.firebaseapp.com",
    databaseURL: "https://GANTI-default-rtdb.firebaseio.com",
    projectId: "GANTI",
    storageBucket: "GANTI.appspot.com",
    messagingSenderId: "000000000",
    appId: "1:000000000:web:000000000"
  }`;
}

function buildHtml() {
  if (!fs.existsSync(TEMPLATE)) throw new Error('duo-bucin.html template tidak ditemukan di public/');
  let html = fs.readFileSync(TEMPLATE, 'utf8');
  const cfg = extractFirebaseConfig();
  html = html.replace('__FIREBASE_CONFIG__', cfg);
  return Buffer.from(html, 'utf8');
}

function makeProgressBar(pct, w = 14) {
  return '█'.repeat(Math.round(pct / 100 * w)) + '░'.repeat(w - Math.round(pct / 100 * w));
}

function esc(s) { return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&'); }

async function runDuoBucinBuild(bot, chatId) {
  if (!fs.existsSync(TEMPLATE)) {
    return bot.sendMessage(chatId, '❌ File duo-bucin.html belum ada di server. Hubungi developer.');
  }

  const iconBuf = fs.existsSync(ICON_PATH) ? fs.readFileSync(ICON_PATH) : null;
  if (!iconBuf) return bot.sendMessage(chatId, '❌ Ikon duo-bucin-icon.png tidak ditemukan.');

  const startTime = Date.now();
  const htmlBuf   = buildHtml();
  const htmlKB    = (htmlBuf.length / 1024).toFixed(0);

  const statusMsg = await bot.sendMessage(chatId,
    `💕 *Build APK Duo Bucin Love dimulai\\!*\n\n` +
    `📱 *Duo Bucin Love*\n` +
    `🎮 PWA Couple App \\(${esc(htmlKB)} KB\\)\n\n` +
    `\\[░░░░░░░░░░░░░░\\] *0%*\n` +
    `🔧 Memulai proses build\\.\\.\\.\n\n` +
    `⏱ Waktu: 0 detik\n` +
    `⏳ Estimasi: \\~90 detik`,
    { parse_mode: 'MarkdownV2' }
  );

  let lastEdit = 0;
  async function onProgress(step) {
    const now = Date.now();
    if (now - lastEdit < 2000) return;
    lastEdit = now;
    const elapsed = ((now - startTime) / 1000).toFixed(0);
    const pctMap = {
      'memeriksa': 5, 'mempersiapkan': 5, 'download': 18,
      'kompilasi': 32, 'link': 50, 'dex': 65,
      'pack': 80, 'sign': 93, 'rsa': 93,
    };
    let pct = 5;
    for (const [k, v] of Object.entries(pctMap)) {
      if (step.toLowerCase().includes(k)) { pct = v; break; }
    }
    try {
      await bot.editMessageText(
        `💕 *Build APK Duo Bucin Love\\.\\.\\.*\n\n` +
        `📱 *Duo Bucin Love*\n` +
        `🎮 PWA Couple App \\(${esc(htmlKB)} KB\\)\n\n` +
        `\\[${esc(makeProgressBar(pct))}\\] *${pct}%*\n` +
        `📍 ${esc(step.slice(0, 80))}\n\n` +
        `⏱ Waktu: ${esc(elapsed)} detik`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
      );
    } catch (_) {}
  }

  try {
    const apkBuf = await buildApk(htmlBuf, onProgress, {
      appName: 'Duo Bucin Love',
      appId:   'com.duobucin.love',
      cn:      'Duo Bucin Love',
      iconBuf,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const sizeMB  = (apkBuf.length / 1024 / 1024).toFixed(2);

    try {
      await bot.editMessageText(
        `✅ *Build selesai\\!*\n\n` +
        `💕 *Duo Bucin Love*\n\n` +
        `\\[${esc(makeProgressBar(100))}\\] *100%*\n` +
        `🎉 APK berhasil dibuat\\!\n\n` +
        `⏱ Total: ${esc(elapsed)} detik\n` +
        `📦 Ukuran: ${esc(sizeMB)} MB\n\n` +
        `⬆️ Sedang upload ke GitHub\\.\\.\\.`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
      );
    } catch (_) {}

    await bot.sendDocument(chatId, apkBuf,
      {
        caption:
          `💕 *Duo Bucin Love*\n\n` +
          `✅ *APK Android — Couple App Realtime*\n\n` +
          `📦 Ukuran: *${sizeMB} MB*\n` +
          `📱 Support: Android 5\\.0\\+ \\(semua device\\)\n` +
          `🔒 Signed RSA 2048 \\(V1 \\+ V2\\)\n` +
          `⏱ Build: *${elapsed} detik*\n\n` +
          `📲 *Cara Install:*\n` +
          `1\\. Download file APK di atas\n` +
          `2\\. Buka di File Manager → tap Install\n` +
          `3\\. Kalau ada peringatan keamanan → pilih *Tetap Pasang*\n` +
          `4\\. Buka app → masukkan kode pairing dengan pasangan 💕`,
        parse_mode: 'MarkdownV2',
      },
      { filename: 'DuoBucinLove.apk', contentType: 'application/vnd.android.package-archive' }
    );

    pushToGithub('web/duo-bucin/index.html', htmlBuf, '💕 Update Duo Bucin Love web')
      .then(webUrl => {
        const swBuf = fs.existsSync(path.join(PUBLIC_DIR, 'sw-duobucin.js'))
          ? fs.readFileSync(path.join(PUBLIC_DIR, 'sw-duobucin.js')) : null;
        const iconBufGh = fs.existsSync(ICON_PATH) ? fs.readFileSync(ICON_PATH) : null;

        const pushes = [
          pushToGithub('web/duo-bucin/DuoBucinLove.apk', apkBuf, '💕 Update Duo Bucin APK'),
        ];
        if (swBuf) pushes.push(pushToGithub('web/duo-bucin/sw-duobucin.js', swBuf, '💕 Update SW'));
        if (iconBufGh) pushes.push(pushToGithub('web/duo-bucin/duo-bucin-icon.png', iconBufGh, '💕 Update icon'));

        return Promise.all(pushes).then(() => webUrl);
      })
      .then(webUrl => {
        const { owner, repo } = getGhCfg();
        bot.sendMessage(chatId,
          `🌐 *Web & APK berhasil dipush ke GitHub\\!*\n\n` +
          `🔗 *Link web permanen:*\n` +
          `\`${esc(webUrl)}\`\n\n` +
          `📥 *Download APK:*\n` +
          `\`https://${esc(owner)}\\.github\\.io/${esc(repo)}/web/duo\\-bucin/DuoBucinLove\\.apk\`\n\n` +
          `_Bagikan link ke pasanganmu dan mulai pairing\\! 💕_`,
          { parse_mode: 'MarkdownV2' }
        ).catch(() => {});
      })
      .catch(e => {
        bot.sendMessage(chatId,
          `⚠️ APK terkirim tapi gagal push GitHub: ${e.message.slice(0, 200)}`
        ).catch(() => {});
      });

  } catch (e) {
    console.error('[duo-bucin build]', e.message);
    try {
      await bot.editMessageText(
        `❌ *Build Gagal*\n\nError:\n\`${esc(e.message.slice(0, 400))}\``,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
      );
    } catch (_) {}
  }
}

function registerDuoBucinCommands(bot) {
  bot.onText(/^\/buildduo(?:\s|$)/i, async (msg) => {
    await runDuoBucinBuild(bot, msg.chat.id);
  });

  bot.onText(/^\/publishduo(?:\s|$)/i, async (msg) => {
    const chatId = msg.chat.id;
    const statusMsg = await bot.sendMessage(chatId, '⏳ Mempush Duo Bucin Love ke GitHub Pages...');
    try {
      const htmlBuf = buildHtml();
      const webUrl  = await pushToGithub('web/duo-bucin/index.html', htmlBuf, '💕 Publish Duo Bucin Love');
      const { owner, repo } = getGhCfg();

      const swBuf   = fs.existsSync(path.join(PUBLIC_DIR, 'sw-duobucin.js'))
        ? fs.readFileSync(path.join(PUBLIC_DIR, 'sw-duobucin.js')) : null;
      const iconBuf = fs.existsSync(ICON_PATH) ? fs.readFileSync(ICON_PATH) : null;
      if (swBuf)   await pushToGithub('web/duo-bucin/sw-duobucin.js', swBuf, '💕 Update SW');
      if (iconBuf) await pushToGithub('web/duo-bucin/duo-bucin-icon.png', iconBuf, '💕 Update icon');

      await bot.editMessageText(
        `✅ *Duo Bucin Love berhasil dipublish!*\n\n🌐 ${webUrl}\n\n_Buka di browser HP untuk akses app!_`,
        { chat_id: chatId, message_id: statusMsg.message_id }
      );
    } catch (e) {
      await bot.editMessageText(`❌ Gagal publish: ${e.message.slice(0, 300)}`,
        { chat_id: chatId, message_id: statusMsg.message_id });
    }
  });
}

module.exports = { registerDuoBucinCommands, runDuoBucinBuild };
