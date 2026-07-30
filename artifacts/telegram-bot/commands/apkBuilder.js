'use strict';

const fs   = require('fs');
const path = require('path');
const { buildApk } = require('./localApkBuild');

const PUBLIC_DIR   = path.join(__dirname, '..', 'public');
const DATA_DIR     = path.join(__dirname, '..', 'data');
const CONFIGS_FILE = path.join(DATA_DIR, 'apk-configs.json');

// ─── Game catalogue ─────────────────────────────────────────────────────────────
const GAMES = {
  catur: {
    label:    '♟️ Catur',
    htmlFile: path.join(PUBLIC_DIR, 'catur.html'),
    ghDir:    'web/chess-master',
    appId:    'com.lawrenz.caturbylawrenz',
  },
  ular_tangga: {
    label:    '🐍 Ular Tangga',
    htmlFile: path.join(PUBLIC_DIR, 'ular-tangga.html'),
    ghDir:    'web/ular-tangga',
    appId:    'com.lawrenz.ulartanggalawrenz',
  },
  duo_bucin: {
    label:    '💕 Duo Bucin Love',
    htmlFile: path.join(PUBLIC_DIR, 'duo-bucin-built.html'),
    ghDir:    'web/duo-bucin',
    appId:    'com.duobucin.love',
  },
};

// ─── Step definitions (used for progress bar + ETA) ──────────────────────────
const BUILD_STEPS = [
  { pct: 5,  label: '🔧 Memeriksa tools build...' },
  { pct: 18, label: '⬇️ Download build tools (smali + android.jar)...' },
  { pct: 32, label: '📦 Kompilasi resources (ikon + strings)...' },
  { pct: 50, label: '🔗 Linking APK base...' },
  { pct: 65, label: '⚙️ Compile DEX bytecode (Smali → DEX)...' },
  { pct: 80, label: '📁 Pack APK (embed game + dex + ikon)...' },
  { pct: 93, label: '🔑 Sign APK dengan RSA 2048...' },
  { pct: 100, label: '✅ APK selesai!' },
];

// ─── Session state per chatId ─────────────────────────────────────────────────
const sessions = new Map();

// ─── Config store ─────────────────────────────────────────────────────────────
function loadConfigs() {
  try { return JSON.parse(fs.readFileSync(CONFIGS_FILE, 'utf8')); } catch { return {}; }
}
function saveConfig(gameKey, config) {
  const all = loadConfigs();
  all[gameKey] = { ...config, updatedAt: Date.now() };
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(CONFIGS_FILE, JSON.stringify(all, null, 2));
}

// ─── GitHub helpers ───────────────────────────────────────────────────────────
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
      'Authorization':        `Bearer ${token}`,
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':         'application/json',
      'User-Agent':           'AlbumAbadiBot',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 200) }; }
  return { ok: res.ok, status: res.status, json };
}

async function pushApkToGithub(filePath, apkBuf, appName) {
  const { owner, repo } = getGhCfg();
  const url  = `/repos/${owner}/${repo}/contents/${filePath}`;
  const b64  = apkBuf.toString('base64');
  const get  = await gh('GET', url);
  const body = { message: `📱 Update APK: ${appName} [skip ci]`, content: b64, branch: 'main' };
  if (get.ok && get.json.sha) body.sha = get.json.sha;
  const put  = await gh('PUT', url, body);
  if (!put.ok) throw new Error(`Push GitHub gagal: ${put.status} — ${put.json.message || ''}`);
  return `https://raw.githubusercontent.com/${owner}/${repo}/main/${filePath}`;
}

// ─── Download Telegram photo ──────────────────────────────────────────────────
async function downloadTgPhoto(bot, photo) {
  const file = await bot.getFile(photo[photo.length - 1].file_id);
  const url  = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error('Gagal download foto: ' + res.status);
  return Buffer.from(await res.arrayBuffer());
}

// ─── MarkdownV2 escape ─────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// ─── Progress bar renderer ────────────────────────────────────────────────────
function makeProgressBar(pct, width = 14) {
  const filled = Math.round((pct / 100) * width);
  const empty  = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function formatETA(seconds) {
  if (seconds < 60) return `~${Math.ceil(seconds)} detik lagi`;
  return `~${Math.ceil(seconds / 60)} menit lagi`;
}

function formatElapsed(seconds) {
  if (seconds < 60) return `${Math.floor(seconds)} detik`;
  return `${Math.floor(seconds / 60)} mnt ${Math.floor(seconds % 60)} dtk`;
}

// ─── Build progress renderer ──────────────────────────────────────────────────
// Finds which step index matches the smali/buildApk progress string
function matchStep(stepStr) {
  const s = stepStr.toLowerCase();
  if (s.includes('memeriksa') || s.includes('mempersiapkan'))   return 0;
  if (s.includes('download'))                                     return 1;
  if (s.includes('kompilasi') || s.includes('resources'))        return 2;
  if (s.includes('link'))                                         return 3;
  if (s.includes('dex') || s.includes('compile'))                return 4;
  if (s.includes('pack') || s.includes('embed'))                 return 5;
  if (s.includes('sign') || s.includes('rsa'))                   return 6;
  return -1;
}

// ─── Core build + send flow ───────────────────────────────────────────────────
async function runBuild(bot, chatId, gameKey, appName, iconBuf, htmlBuf) {
  const game = GAMES[gameKey];
  if (!game) throw new Error('Game tidak ditemukan: ' + gameKey);

  const gameHtmlBuf = htmlBuf || (() => {
    if (!fs.existsSync(game.htmlFile)) throw new Error(`File game tidak ada: ${game.htmlFile}`);
    return fs.readFileSync(game.htmlFile);
  })();

  const htmlKB   = (gameHtmlBuf.length / 1024).toFixed(0);
  const safeName = appName.replace(/\s+/g, '');
  const ghPath   = `${game.ghDir}/${safeName}.apk`;

  // ── Kirim status awal ─────────────────────────────────────────────────────
  const startTime = Date.now();
  const statusMsg = await bot.sendMessage(chatId,
    `⚙️ *Build APK dimulai\\!*\n\n` +
    `📱 *${esc(appName)}*\n` +
    `🎮 Game: ${esc(game.label)} \\(${esc(htmlKB)} KB\\)\n\n` +
    `\\[░░░░░░░░░░░░░░\\] *0%*\n` +
    `🔧 Memulai proses build\\.\\.\\.\n\n` +
    `⏱ Waktu: 0 detik\n` +
    `⏳ Estimasi selesai: \\~90 detik`,
    { parse_mode: 'MarkdownV2' }
  );

  // ── Progress updater ──────────────────────────────────────────────────────
  let lastStepIdx  = -1;
  let lastEditTime = 0;

  async function updateProgress(stepStr) {
    const now     = Date.now();
    const elapsed = (now - startTime) / 1000;

    const idx = matchStep(stepStr);
    if (idx < 0 && now - lastEditTime < 1500) return;
    if (idx === lastStepIdx && now - lastEditTime < 1500) return;
    lastStepIdx  = idx >= 0 ? idx : lastStepIdx;
    lastEditTime = now;

    const stepDef  = BUILD_STEPS[Math.max(0, lastStepIdx)];
    const pct      = stepDef ? stepDef.pct : 5;
    const bar      = makeProgressBar(pct);
    const stepNum  = Math.max(1, lastStepIdx + 1);
    const totalStp = BUILD_STEPS.length - 1; // exclude "done" step

    // ETA: estimate total ~90s, scale by pct done
    const totalEst = Math.max(elapsed / (pct / 100), 90);
    const eta      = Math.max(1, totalEst - elapsed);

    const stepLabel = stepStr.length < 80 ? stepStr : (stepDef?.label || stepStr.slice(0, 80));

    try {
      await bot.editMessageText(
        `⚙️ *Build APK berlangsung\\.\\.\\.*\n\n` +
        `📱 *${esc(appName)}*\n` +
        `🎮 Game: ${esc(game.label)} \\(${esc(htmlKB)} KB\\)\n\n` +
        `\\[${esc(bar)}\\] *${pct}%*\n` +
        `📍 Step ${stepNum}/${totalStp}: ${esc(stepLabel)}\n\n` +
        `⏱ Waktu berlalu: ${esc(formatElapsed(elapsed))}\n` +
        `⏳ Estimasi selesai: ${esc(formatETA(eta))}`,
        {
          chat_id:    chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'MarkdownV2',
        }
      );
    } catch (_) {}
  }

  try {
    // ── Build APK ───────────────────────────────────────────────────────────
    const apkBuf = await buildApk(gameHtmlBuf, updateProgress, {
      appName,
      appId:   game.appId,
      cn:      appName,
      iconBuf,
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const sizeMB  = (apkBuf.length / 1024 / 1024).toFixed(2);

    // ── Update progress ke 100% ─────────────────────────────────────────────
    try {
      await bot.editMessageText(
        `✅ *Build selesai\\!*\n\n` +
        `📱 *${esc(appName)}*\n` +
        `🎮 Game: ${esc(game.label)} \\(${esc(htmlKB)} KB\\)\n\n` +
        `\\[${esc(makeProgressBar(100))}\\] *100%*\n` +
        `🎉 APK berhasil dibuat\\!\n\n` +
        `⏱ Total waktu: ${esc(elapsed)} detik\n` +
        `📦 Ukuran APK: ${esc(sizeMB)} MB\n\n` +
        `⬆️ Sedang upload ke GitHub\\.\\.\\.`,
        {
          chat_id:    chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'MarkdownV2',
        }
      );
    } catch (_) {}

    // ── Kirim file APK langsung ke chat ─────────────────────────────────────
    await bot.sendDocument(chatId, apkBuf,
      {
        caption:
          `📱 *${esc(appName)}*\n\n` +
          `✅ *APK Android — 100% Offline*\n` +
          `🎮 Game di\\-embed di dalam APK \\(${esc(htmlKB)} KB\\)\n\n` +
          `📦 Ukuran: *${sizeMB} MB*\n` +
          `📱 Support: Android 5\\.0\\+\n` +
          `🔒 Signed RSA 2048\n` +
          `⏱ Build selesai dalam: *${elapsed} detik*\n\n` +
          `📲 *Cara Install:*\n` +
          `1\\. Tap file APK di atas\n` +
          `2\\. Tap *Install*\n` +
          `3\\. Kalau ada peringatan → aktifkan *Sumber tidak dikenal*\n` +
          `4\\. Buka app dan langsung main\\! 🎮`,
        parse_mode: 'MarkdownV2',
      },
      { filename: safeName + '.apk', contentType: 'application/vnd.android.package-archive' }
    );

    // ── Push ke GitHub (background) → kirim link download ───────────────────
    pushApkToGithub(ghPath, apkBuf, appName)
      .then(dlUrl => {
        bot.sendMessage(chatId,
          `🔗 *Link download permanen:*\n` +
          `\`${dlUrl}\`\n\n` +
          `_Link ini bisa dibagikan kapanpun\\!_`,
          { parse_mode: 'MarkdownV2' }
        ).catch(() => {});

        saveConfig(gameKey, {
          gameKey, appName, appId: game.appId,
          ghFilePath: ghPath,
          iconBase64: iconBuf.toString('base64'),
          downloadUrl: dlUrl,
        });
      })
      .catch(e => {
        bot.sendMessage(chatId,
          `⚠️ APK berhasil dibuat tapi gagal push ke GitHub\\.\n` +
          `Error: ${esc(e.message.slice(0, 200))}`,
          { parse_mode: 'MarkdownV2' }
        ).catch(() => {});
        saveConfig(gameKey, {
          gameKey, appName, appId: game.appId,
          ghFilePath: ghPath,
          iconBase64: iconBuf.toString('base64'),
          downloadUrl: null,
        });
      });

  } catch (e) {
    console.error('[apk build error]', e.message);
    try {
      await bot.editMessageText(
        `❌ *Build Gagal*\n\n` +
        `📱 *${esc(appName)}*\n\n` +
        `Error:\n\`${esc(e.message.slice(0, 400))}\``,
        {
          chat_id:    chatId,
          message_id: statusMsg.message_id,
          parse_mode: 'MarkdownV2',
        }
      );
    } catch (_) {}
  }
}

// ─── Shared flow: select game → enter name → send icon → build ───────────────
function startApkFlow(bot, chatId, commandName) {
  sessions.set(chatId, { state: 'apk_select_game', cmd: commandName });

  const buttons = Object.entries(GAMES).map(([key, g]) => {
    const exists = fs.existsSync(g.htmlFile);
    const size   = exists ? ` — ${(fs.statSync(g.htmlFile).size / 1024).toFixed(0)} KB` : ' — ❌ file tidak ada';
    return [{ text: g.label + size, callback_data: `apk:game:${key}` }];
  });

  return bot.sendMessage(chatId,
    `📱 *Buat APK Android*\n\n` +
    `Bot akan build APK langsung dari program yang ada di server\\.\n` +
    `Game ter\\-embed di dalam APK — bisa dimainkan *100% offline*\\!\n\n` +
    `🎮 *Pilih program:*`,
    {
      parse_mode:   'MarkdownV2',
      reply_markup: { inline_keyboard: buttons },
    }
  );
}

// ─── Register bot commands ─────────────────────────────────────────────────────
function registerApkCommands(bot) {

  // ── /apk : build APK baru ─────────────────────────────────────────────────
  bot.onText(/^\/apk(?:\s|$)/i, async (msg) => {
    await startApkFlow(bot, msg.chat.id, 'apk');
  });

  // ── /updateapk : build ulang APK (alur sama, baca program terbaru) ────────
  bot.onText(/^\/updateapk(?:\s|$)/i, async (msg) => {
    await startApkFlow(bot, msg.chat.id, 'updateapk');
  });

  // ── Callback query: game selected ─────────────────────────────────────────
  bot.on('callback_query', async (query) => {
    const { data, message } = query;
    if (!data?.startsWith('apk:game:')) return;
    const chatId  = message.chat.id;
    const gameKey = data.replace('apk:game:', '');
    const game    = GAMES[gameKey];
    if (!game) { await bot.answerCallbackQuery(query.id, { text: 'Game tidak ditemukan.' }); return; }
    await bot.answerCallbackQuery(query.id);

    if (!fs.existsSync(game.htmlFile)) {
      await bot.editMessageText(
        `❌ File program *${esc(game.label)}* tidak ditemukan di server\\.\n` +
        `Path: \`${esc(game.htmlFile)}\``,
        { chat_id: chatId, message_id: message.message_id, parse_mode: 'MarkdownV2' }
      ).catch(() => {});
      return;
    }

    const stat  = fs.statSync(game.htmlFile);
    const sizeKB = (stat.size / 1024).toFixed(0);
    const sizeMB = (stat.size / 1024 / 1024).toFixed(2);

    sessions.set(chatId, { state: 'apk_enter_name', gameKey });

    await bot.editMessageText(
      `✅ Program dipilih: *${esc(game.label)}*\n\n` +
      `📄 File: \`${esc(path.basename(game.htmlFile))}\`\n` +
      `📦 Ukuran program: *${esc(sizeKB)} KB* \\(${esc(sizeMB)} MB\\)\n` +
      `🕐 File terakhir diupdate: ${esc(new Date(stat.mtimeMs).toLocaleString('id-ID'))}\n\n` +
      `✏️ *Sekarang, ketik nama aplikasinya:*\n` +
      `_Contoh: Catur By Lawrenz, UlarTangga Seru_\n` +
      `_Maks 30 karakter_`,
      { chat_id: chatId, message_id: message.message_id, parse_mode: 'MarkdownV2' }
    ).catch(() => {});
  });

  // ── Text handler: terima nama app ─────────────────────────────────────────
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/') || msg.photo) return;
    const chatId = msg.chat.id;
    const sess   = sessions.get(chatId);
    if (!sess || sess.state !== 'apk_enter_name') return;

    const appName = msg.text.trim().slice(0, 30);
    if (!appName) { await bot.sendMessage(chatId, '⚠️ Nama tidak boleh kosong. Ketik nama aplikasinya:'); return; }

    sessions.set(chatId, { ...sess, state: 'apk_send_icon', appName });

    const game    = GAMES[sess.gameKey];
    const sizeKB  = fs.existsSync(game.htmlFile)
      ? (fs.statSync(game.htmlFile).size / 1024).toFixed(0) : '?';

    await bot.sendMessage(chatId,
      `✅ Nama: *${esc(appName)}*\n` +
      `🎮 Game: ${esc(game.label)} \\(${esc(sizeKB)} KB\\)\n\n` +
      `🖼 *Sekarang kirim foto ikon untuk aplikasinya\\!*\n\n` +
      `📋 *Syarat ikon:*\n` +
      `• Format JPG atau PNG\n` +
      `• Ukuran minimal 192×192 px\n` +
      `• Tampilan akan jadi launcher icon di layar HP\n\n` +
      `_Kirim foto sekarang\\!_`,
      { parse_mode: 'MarkdownV2' }
    );
  });

  // ── Photo handler: terima ikon → mulai build ──────────────────────────────
  bot.on('photo', async (msg) => {
    const chatId = msg.chat.id;
    const sess   = sessions.get(chatId);
    if (!sess || sess.state !== 'apk_send_icon') return;
    sessions.delete(chatId);

    const { gameKey, appName } = sess;
    const game = GAMES[gameKey];

    await bot.sendMessage(chatId,
      `✅ *Ikon diterima\\!*\n\n` +
      `🚀 *Memulai build APK\\.\\.\\.*\n` +
      `📱 *${esc(appName)}*\n` +
      `🎮 ${esc(game?.label || gameKey)}\n\n` +
      `_Proses ini berlangsung \\~60\\-90 detik\\._\n` +
      `_Progres akan update otomatis di bawah ini\\._`,
      { parse_mode: 'MarkdownV2' }
    );

    try {
      const iconBuf = await downloadTgPhoto(bot, msg.photo);
      await runBuild(bot, chatId, gameKey, appName, iconBuf);
    } catch (e) {
      console.error('[apk photo error]', e.message);
      await bot.sendMessage(chatId, `❌ Error saat proses: ${e.message.slice(0, 300)}`);
    }
  });
}

module.exports = { registerApkCommands, runBuild, GAMES };
