'use strict';

const fs   = require('fs');
const path = require('path');
const { buildApk } = require('./localApkBuild');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ICON_PATH  = path.join(PUBLIC_DIR, 'lawnime-icon.png');

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

function bar(pct, w = 14) {
  const f = Math.round(pct / 100 * w);
  return '█'.repeat(f) + '░'.repeat(w - f);
}
function esc(s) {
  return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}
function getLawnimeUrl() {
  const domains = process.env.REPLIT_DOMAINS;
  if (domains) return `https://${domains.split(',')[0].trim()}/anisub/`;
  const dev = process.env.REPLIT_DEV_DOMAIN;
  if (dev) return `https://${dev}/anisub/`;
  return 'https://lawnime.replit.app/anisub/';
}
function genVersionTag() {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  return `v${yy}${mm}${dd}-${hh}`;
}

// ─── Delete release + tag by tag name ─────────────────────────────────────────
async function deleteRelease(tagName) {
  const { owner, repo } = getGhCfg();
  const listRes = await gh('GET', `/repos/${owner}/${repo}/releases`);
  if (!listRes.ok || !Array.isArray(listRes.json)) return;
  const rel = listRes.json.find(r => r.tag_name === tagName);
  if (rel) await gh('DELETE', `/repos/${owner}/${repo}/releases/${rel.id}`);
  // delete the git tag too
  await gh('DELETE', `/repos/${owner}/${repo}/git/refs/tags/${tagName}`);
}

// ─── Upload APK as GitHub release ─────────────────────────────────────────────
async function uploadRelease(apkBuf, tagName, assetName, releaseName, releaseBody) {
  const { owner, repo, token } = { ...getGhCfg() };

  // Remove old release with same tag first
  await deleteRelease(tagName).catch(() => {});

  const createRes = await gh('POST', `/repos/${owner}/${repo}/releases`, {
    tag_name:              tagName,
    name:                  releaseName,
    body:                  releaseBody,
    draft:                 false,
    prerelease:            false,
    generate_release_notes: false,
  });
  if (!createRes.ok) throw new Error(`Buat release gagal: ${createRes.status} — ${createRes.json?.message || ''}`);

  const baseUrl = createRes.json.upload_url.replace(/\{[^}]*\}/g, '');
  const upRes = await fetch(`${baseUrl}?name=${encodeURIComponent(assetName)}`, {
    method: 'POST',
    headers: {
      'Authorization':        `Bearer ${token}`,
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':         'application/vnd.android.package-archive',
      'Content-Length':       String(apkBuf.length),
      'User-Agent':           'AlbumAbadiBot',
    },
    body: apkBuf,
  });
  if (!upRes.ok) {
    const t = await upRes.text();
    throw new Error(`Upload asset gagal: ${upRes.status} — ${t.slice(0, 200)}`);
  }
  return `https://github.com/${owner}/${repo}/releases/download/${tagName}/${assetName}`;
}

// ─── Variants to build ─────────────────────────────────────────────────────────
function getVariants(lawnimeUrl) {
  return [
    {
      key:         'lawnime',
      appName:     'Lawnime ID',
      appId:       'com.lawnime.streaming',
      cn:          'Lawnime ID',
      urlToLoad:   lawnimeUrl,
      fileName:    'Lawnime-ID-v1.0.6.apk',
      tagName:     'v1.0.6-lawnime',
      emoji:       '🎌',
      versionCode: '6',
      versionName: '1.0.6',
    },
  ];
}

// ─── Main uplawnime runner ─────────────────────────────────────────────────────
async function runUplawnime(bot, chatId) {
  if (!fs.existsSync(ICON_PATH)) {
    return bot.sendMessage(chatId, '❌ Ikon lawnime\\-icon\\.png tidak ditemukan di server\\.', { parse_mode: 'MarkdownV2' });
  }

  const iconBuf    = fs.readFileSync(ICON_PATH);
  const lawnimeUrl = getLawnimeUrl();
  const versionTag = genVersionTag();
  const variants   = getVariants(lawnimeUrl);
  const startTime  = Date.now();
  const results    = [];

  const statusMsg = await bot.sendMessage(chatId,
    `🚀 *\\[uplawnime\\] Auto\\-rebuild semua APK Lawnime*\n\n` +
    `🌐 URL: \`${esc(lawnimeUrl)}\`\n` +
    `🏷 Versi: \`${esc(versionTag)}\`\n` +
    `📦 Total: ${variants.length} APK\n\n` +
    `\\[░░░░░░░░░░░░░░\\] *0%*\n` +
    `🔧 Memulai build\\.\\.\\.\n\n` +
    `_proses 3\\-6 menit, harap tunggu\\!_`,
    { parse_mode: 'MarkdownV2' }
  );

  const edit = async (pct, step, extra = '') => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    try {
      await bot.editMessageText(
        `🚀 *\\[uplawnime\\] Auto\\-rebuild APK Lawnime*\n\n` +
        `🌐 URL: \`${esc(lawnimeUrl)}\`\n` +
        `🏷 Versi: \`${esc(versionTag)}\`\n\n` +
        `\\[${esc(bar(pct))}\\] *${pct}%*\n` +
        `🔧 ${esc(step)}\n` +
        (extra ? `\n${extra}\n` : '') +
        `\n⏱ ${esc(elapsed)} detik`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
      );
    } catch (_) {}
  };

  try {
    await edit(5, 'Memeriksa build tools...');

    for (let i = 0; i < variants.length; i++) {
      const v    = variants[i];
      const base = Math.round((i / variants.length) * 85);

      await edit(base + 5, `${v.emoji} Build ${v.appName}...`);

      const apkBuf = await buildApk(Buffer.from('<html></html>', 'utf8'), async (step) => {
        const sub = step.includes('Download') ? 10
          : step.includes('Mempersiapkan') ? 20
          : step.includes('resources') ? 40
          : step.includes('Link') ? 55
          : step.includes('DEX') ? 68
          : step.includes('Pack') ? 78
          : step.includes('Sign') ? 88 : 50;
        const pct = base + Math.round(sub / variants.length);
        await edit(pct, `${v.emoji} ${step}`);
      }, {
        appName:     v.appName,
        appId:       v.appId,
        cn:          v.cn,
        iconBuf,
        urlToLoad:   v.urlToLoad,
        versionCode: v.versionCode,
        versionName: v.versionName,
      });

      const sizeMB = (apkBuf.length / 1024 / 1024).toFixed(2);

      // Save locally
      fs.writeFileSync(path.join(PUBLIC_DIR, v.fileName), apkBuf);

      await edit(base + Math.round(88 / variants.length), `${v.emoji} Kirim ${v.appName} ke Telegram...`);

      // Send to Telegram
      await bot.sendDocument(chatId, apkBuf,
        {
          caption:
            `${v.emoji} *${esc(v.appName)} — Update Otomatis*\n\n` +
            `✅ *APK terbaru berhasil di\\-rebuild\\!*\n\n` +
            `📦 Ukuran: *${esc(sizeMB)} MB*\n` +
            `🏷 Versi: \`${esc(versionTag)}\`\n` +
            `🌐 URL: \`${esc(v.urlToLoad)}\`\n` +
            `📱 Support: Android 5\\.0\\+\n\n` +
            `📲 *Cara update:*\n` +
            `1\\. Uninstall APK lama \\(atau install langsung diatasnya\\)\n` +
            `2\\. Install APK ini\n` +
            `3\\. Semua perubahan web otomatis masuk\\! 🎌`,
          parse_mode: 'MarkdownV2',
        },
        { filename: v.fileName, contentType: 'application/vnd.android.package-archive' }
      );

      results.push({ ...v, sizeMB, apkBuf });

      // Upload to GitHub Releases in background
      uploadRelease(
        apkBuf,
        v.tagName,
        v.fileName,
        `${v.emoji} ${v.appName} — ${versionTag}`,
        `## ${v.appName} — Update ${versionTag}\n\n` +
        `APK terbaru streaming anime subtitle Indonesia.\n\n` +
        `🌐 URL: ${v.urlToLoad}\n\n` +
        `**Cara Install:**\n` +
        `1. Download file APK\n` +
        `2. Buka di File Manager → tap Install\n` +
        `3. Jika ada peringatan → pilih Tetap Pasang\n` +
        `4. Buka app → streaming anime! 🎌\n\n` +
        `✅ Support Android 5.0+ (API 21+)\n` +
        `🔒 Signed RSA 2048 (V1 + V2)`
      )
        .then(url => {
          bot.sendMessage(chatId,
            `✅ *${esc(v.appName)} berhasil upload ke GitHub Releases\\!*\n\n` +
            `📥 *Link Download Permanen:*\n` +
            `\`${esc(url)}\`\n\n` +
            `🏷 Tag: \`${esc(v.tagName)}\` \\(selalu update ke versi terbaru\\)`,
            { parse_mode: 'MarkdownV2' }
          ).catch(() => {});
        })
        .catch(e => {
          bot.sendMessage(chatId,
            `⚠️ APK terkirim ke Telegram tapi gagal upload GitHub: ${e.message.slice(0, 200)}`
          ).catch(() => {});
        });
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const summary = results.map(r => `${r.emoji} ${r.appName}: ${r.sizeMB} MB`).join('\n');

    await bot.editMessageText(
      `✅ *\\[uplawnime\\] Semua APK selesai di\\-rebuild\\!*\n\n` +
      `📦 *Ringkasan:*\n${esc(summary)}\n\n` +
      `🏷 Versi: \`${esc(versionTag)}\`\n` +
      `🌐 URL: \`${esc(lawnimeUrl)}\`\n` +
      `⏱ Total: ${esc(elapsed)} detik\n\n` +
      `_APK sudah terkirim & upload ke GitHub Releases\\!_`,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
    );

  } catch (e) {
    console.error('[uplawnime]', e.message);
    try {
      await bot.editMessageText(
        `❌ *Build Gagal*\n\nError:\n\`${esc(e.message.slice(0, 400))}\``,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
      );
    } catch (_) {}
  }
}

function registerUplawnimeCommand(bot) {
  bot.onText(/^\/uplawnime(?:\s|$)/i, async (msg) => {
    await runUplawnime(bot, msg.chat.id);
  });
}

module.exports = { registerUplawnimeCommand, runUplawnime };
