'use strict';

const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { buildApk, jarsReady } = require('./localApkBuild');

const PUBLIC_DIR  = path.join(__dirname, '..', 'public');
const ICON_PATH   = path.join(PUBLIC_DIR, 'lawnime-icon.png');
const WORKSPACE   = path.join(__dirname, '..', '..', '..');
const ANISUB_DIR  = path.join(WORKSPACE, 'artifacts', 'anisub');
const DIST_DIR    = path.join(ANISUB_DIR, 'dist', 'public');

const GH_OWNER  = process.env.GITHUB_OWNER || 'JMStory-27';
const GH_REPO   = process.env.GITHUB_REPO  || 'Jumalia-Makruf';
const GH_PAGES_BASE = `/Jumalia-Makruf/anime/`;
const GH_PAGES_URL  = `https://${GH_OWNER.toLowerCase()}.github.io/Jumalia-Makruf/`;
const GH_PAGES_ANIME_URL = `https://${GH_OWNER.toLowerCase()}.github.io/Jumalia-Makruf/anime/`;
const VERSION_FILE  = path.join(__dirname, '..', 'data', 'lawnime-version.json');

function getGhCfg() {
  return {
    token: process.env.GITHUB_TOKEN,
    owner: GH_OWNER,
    repo:  GH_REPO,
  };
}

async function ghReq(method, urlPath, body) {
  const { token } = getGhCfg();
  const res = await fetch('https://api.github.com' + urlPath, {
    method,
    headers: {
      'Authorization':        `Bearer ${token}`,
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':         'application/json',
      'User-Agent':           'LawnimeBot',
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
  const { owner, repo, token } = getGhCfg();

  const listRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'LawnimeBot' },
  });
  const releases = await listRes.json();
  let existingRelease = Array.isArray(releases) ? releases.find(r => r.tag_name === tagName) : null;

  let uploadUrl;
  if (existingRelease) {
    uploadUrl = existingRelease.upload_url;
    const assetsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/${existingRelease.id}/assets`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'LawnimeBot' },
    });
    const assets = await assetsRes.json();
    if (Array.isArray(assets)) {
      for (const asset of assets) {
        if (asset.name === assetName) {
          await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/assets/${asset.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'LawnimeBot' },
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
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Length': String(apkBuf.length),
      'User-Agent': 'LawnimeBot',
    },
    body: apkBuf,
  });
  if (!upRes.ok) {
    const t = await upRes.text();
    throw new Error(`Upload APK gagal: ${upRes.status} — ${t.slice(0, 200)}`);
  }
  return `https://github.com/${owner}/${repo}/releases/download/${tagName}/${assetName}`;
}

function* walkDir(dir, base = '') {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel  = base ? `${base}/${name}` : name;
    if (fs.statSync(full).isDirectory()) yield* walkDir(full, rel);
    else yield { full, rel };
  }
}

async function createBlob(token, owner, repo, buffer) {
  const data = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/blobs`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'LawnimeBot' },
    body: JSON.stringify({ content: buffer.toString('base64'), encoding: 'base64' }),
  });
  const j = await data.json();
  return j.sha;
}

// Root index.html — redirect dari https://jmstory-27.github.io/Jumalia-Makruf/ ke /anime/
const ROOT_REDIRECT_HTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=/Jumalia-Makruf/anime/">
<title>Lawnime ID</title>
<script>window.location.replace('/Jumalia-Makruf/anime/');</script>
</head><body><p>Redirecting to <a href="/Jumalia-Makruf/anime/">Lawnime ID</a>...</p></body></html>`;

// 404.html di root gh-pages — SPA routing: encode path ke ?redirect= lalu redirect ke /anime/
// Ini penting agar klik anime detail / episode di GitHub Pages tidak 404 kosong
const ROOT_404_HTML = `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Lawnime ID</title>
<script>
(function(){
  var l = window.location;
  var base = '/Jumalia-Makruf/anime';
  // Ambil path relatif dari base /anime (strip /Jumalia-Makruf/anime)
  var rel = l.pathname.replace(/^\\/Jumalia-Makruf\\/anime/, '') || '/';
  var qs  = l.search;
  var redirect = rel + qs;
  // Kalau sudah di root anime atau tidak ada path spesifik, langsung ke home
  if (!redirect || redirect === '/' || redirect === '/index.html') {
    l.replace(base + '/');
  } else {
    // Encode path dan kirim ke index.html sebagai ?redirect=
    l.replace(base + '/?redirect=' + encodeURIComponent(redirect));
  }
})();
</script>
</head><body></body></html>`;

// ─── Version management ────────────────────────────────────────────────────────
function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8'));
  } catch (_) {
    return { version: '1.0.7', code: 7 };
  }
}

function incrementVersion(current) {
  const parts = current.version.split('.').map(Number);
  // Increment patch: 1.0.7 → 1.0.8 → 1.0.9 → 1.0.10 etc.
  parts[2] += 1;
  const next = parts.join('.');
  return { version: next, code: current.code + 1 };
}

function saveVersion(v) {
  fs.mkdirSync(path.dirname(VERSION_FILE), { recursive: true });
  fs.writeFileSync(VERSION_FILE, JSON.stringify(v, null, 2));
}

function getAndBumpVersion() {
  const current = readVersion();
  const next = incrementVersion(current);
  saveVersion(next);
  return next;
}

async function getExistingLawnimeShas(token, owner, repo) {
  try {
    const ref = await ghReq('GET', `/repos/${owner}/${repo}/git/refs/heads/main`);
    const commit = await ghReq('GET', `/repos/${owner}/${repo}/git/commits/${ref.object.sha}`);
    const tree = await ghReq('GET', `/repos/${owner}/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
    const map = {};
    for (const item of (tree.tree || [])) {
      if (item.type === 'blob') map[item.path] = item.sha;
    }
    return { ref, map };
  } catch (e) {
    return { ref: null, map: {} };
  }
}

async function deployToGithubPages(onProgress) {
  const log = (m) => { if (onProgress) onProgress(m); };
  const { token, owner, repo } = getGhCfg();
  const BRANCH = 'gh-pages';
  if (!token) throw new Error('GITHUB_TOKEN tidak tersedia.');

  log('📦 Mengumpulkan file dist/public...');
  if (!fs.existsSync(DIST_DIR)) throw new Error('Dist folder tidak ditemukan. Jalankan build terlebih dahulu.');

  // Kumpulkan semua file dari dist/gh-pages → masuk ke subfolder anime/
  const files = [];
  for (const { full, rel } of walkDir(DIST_DIR)) {
    files.push({ remotePath: `anime/${rel}`, buffer: fs.readFileSync(full) });
  }
  files.push({ remotePath: '.nojekyll',  buffer: Buffer.from('') });
  files.push({ remotePath: 'index.html', buffer: Buffer.from(ROOT_REDIRECT_HTML) });
  files.push({ remotePath: '404.html',   buffer: Buffer.from(ROOT_404_HTML) });

  log(`📊 ${files.length} file — membuat blobs di GitHub...`);

  // Step 1: Buat blob untuk setiap file (paralel batch 5)
  const BLOB_CHUNK = 5;
  const treeItems = [];
  for (let i = 0; i < files.length; i += BLOB_CHUNK) {
    const batch = files.slice(i, i + BLOB_CHUNK);
    const blobs = await Promise.all(batch.map(async ({ remotePath, buffer }) => {
      const blobSha = await createBlob(token, owner, repo, buffer);
      return { path: remotePath, mode: '100644', type: 'blob', sha: blobSha };
    }));
    treeItems.push(...blobs);
    log(`   blobs: ${Math.min(i + BLOB_CHUNK, files.length)}/${files.length}...`);
  }

  // Step 2: Dapatkan ref gh-pages (buat jika belum ada)
  log('🌿 Mendapatkan ref branch gh-pages...');
  let baseTreeSha = null;
  let parentCommitSha = null;

  try {
    const ref = await ghReq('GET', `/repos/${owner}/${repo}/git/refs/heads/${BRANCH}`);
    parentCommitSha = ref.object.sha;
    const parentCommit = await ghReq('GET', `/repos/${owner}/${repo}/git/commits/${parentCommitSha}`);
    baseTreeSha = parentCommit.tree.sha;
  } catch (e) {
    if (e.status !== 404) throw e;
    // Branch belum ada — buat dari main atau orphan
    try {
      const mainRef = await ghReq('GET', `/repos/${owner}/${repo}/git/refs/heads/main`);
      parentCommitSha = mainRef.object.sha;
      const mainCommit = await ghReq('GET', `/repos/${owner}/${repo}/git/commits/${parentCommitSha}`);
      baseTreeSha = mainCommit.tree.sha;
    } catch (_) {
      baseTreeSha = null;
      parentCommitSha = null;
    }
  }

  // Step 3: Buat tree baru (berisi semua file sekaligus — atomic!)
  log('🌳 Membuat Git tree baru...');
  const treePayload = { tree: treeItems };
  if (baseTreeSha) treePayload.base_tree = baseTreeSha;
  const newTree = await ghReq('POST', `/repos/${owner}/${repo}/git/trees`, treePayload);

  // Step 4: Buat commit
  log('💾 Membuat commit...');
  const now = new Date().toISOString();
  const commitPayload = {
    message: `deploy: update Lawnime ID — ${now}`,
    tree: newTree.sha,
    author: { name: 'LawnimeBot', email: 'bot@lawnime.id', date: now },
  };
  if (parentCommitSha) commitPayload.parents = [parentCommitSha];
  else commitPayload.parents = [];
  const newCommit = await ghReq('POST', `/repos/${owner}/${repo}/git/commits`, commitPayload);

  // Step 5: Update ref gh-pages (force push)
  log('🚀 Update branch gh-pages...');
  try {
    await ghReq('PATCH', `/repos/${owner}/${repo}/git/refs/heads/${BRANCH}`, {
      sha: newCommit.sha,
      force: true,
    });
  } catch (e) {
    if (e.status === 422) {
      // Ref belum ada, buat baru
      await ghReq('POST', `/repos/${owner}/${repo}/git/refs`, {
        ref: `refs/heads/${BRANCH}`,
        sha: newCommit.sha,
      });
    } else throw e;
  }

  // Pastikan GitHub Pages dikonfigurasi pakai gh-pages branch
  try {
    await ghReq('POST', `/repos/${owner}/${repo}/pages`, {
      source: { branch: BRANCH, path: '/' },
      build_type: 'legacy',
    });
  } catch (_) {
    try {
      await ghReq('PUT', `/repos/${owner}/${repo}/pages`, {
        source: { branch: BRANCH, path: '/' },
      });
    } catch (_2) {}
  }

  return { filesTotal: files.length, filesChanged: files.length, commitSha: newCommit.sha.slice(0, 7) };
}

function extractFirebaseDbUrl() {
  const cfg = process.env.FIREBASE_CONFIG || '';
  const m = cfg.match(/databaseURL['":\s]+["']([^"']+)['"]/);
  return m ? m[1] : '';
}

async function buildAnisub(onProgress) {
  const log = (m) => { if (onProgress) onProgress(m); };
  log('🔨 Build web Lawnime untuk GitHub Pages...');

  const firebaseDbUrl = extractFirebaseDbUrl();

  // GitHub Pages adalah static site — harus pakai upstream API langsung (selalu online, CORS: *)
  // JANGAN pakai Replit dev domain (*.pike.replit.dev) karena:
  //   1. Berubah setiap Replit restart → URL baked jadi stale
  //   2. Hanya aktif saat Replit nyala → GitHub Pages mati kalau Replit tidur
  const GITHUB_PAGES_API_URL = 'https://wg-anime-api-v2.onrender.com';

  const env = {
    ...process.env,
    NODE_ENV: 'production',
    PORT: '3000',
    BASE_PATH: GH_PAGES_BASE,
    VITE_FIREBASE_DATABASE_URL: firebaseDbUrl,
    VITE_API_BASE_URL: GITHUB_PAGES_API_URL,
  };

  let result;
  try {
    result = execSync('pnpm --filter @workspace/anisub run build:gh', {
      env,
      cwd: WORKSPACE,
      stdio: 'pipe',
      timeout: 5 * 60 * 1000,
    });
  } catch (e) {
    const stderr = e.stderr?.toString?.() || '';
    const stdout = e.stdout?.toString?.() || '';
    const detail = (stderr || stdout).slice(0, 800);
    throw new Error(`Build gagal:\n${detail}`);
  }

  // Verify dist output exists and has content
  if (!fs.existsSync(DIST_DIR)) {
    throw new Error(`Build selesai tapi output tidak ditemukan (${DIST_DIR}).`);
  }
  const distFiles = [];
  for (const f of walkDir(DIST_DIR)) distFiles.push(f.rel);
  if (distFiles.length === 0) {
    throw new Error('Build selesai tapi dist folder kosong!');
  }

  log(`✅ Build selesai! ${distFiles.length} file dihasilkan.`);
  return distFiles;
}

function bar(pct, w = 14) {
  const f = Math.round(pct / 100 * w);
  return '█'.repeat(f) + '░'.repeat(w - f);
}

function esc(s) {
  return String(s).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

async function runLawnimeBuild(bot, chatId) {
  if (!fs.existsSync(ICON_PATH)) {
    return bot.sendMessage(chatId, '❌ Ikon lawnime-icon.png tidak ditemukan di server.');
  }

  // Auto-increment version BEFORE building
  const ver = getAndBumpVersion();
  const VER    = ver.version;      // e.g. "1.0.8"
  const VCODE  = String(ver.code); // e.g. "8"
  const APK_NAME = `Lawnime-ID-v${VER}.apk`;

  const iconBuf   = fs.readFileSync(ICON_PATH);
  const startTime = Date.now();

  const statusMsg = await bot.sendMessage(chatId,
    `🎌 *Build Lawnime ID v${esc(VER)} dimulai\\!*\n\n` +
    `📱 *Lawnime ID — Streaming Anime Sub Indo*\n` +
    `🌐 Target: ${esc(GH_PAGES_URL)}\n\n` +
    `\\[░░░░░░░░░░░░░░\\] *0%*\n` +
    `🔧 Memulai proses build\\.\\.\\.\n\n` +
    `⏱ Waktu: 0 detik\n` +
    `_proses 5\\-8 menit, sabar ya\\!_`,
    { parse_mode: 'MarkdownV2' }
  );

  const elapsed = () => ((Date.now() - startTime) / 1000).toFixed(0);

  const edit = async (pct, step) => {
    try {
      await bot.editMessageText(
        `🎌 *Build APK Lawnime ID v${esc(VER)}\\.\\.\\.*\n\n` +
        `📱 *Lawnime ID — GitHub Pages \\(24/7\\)*\n\n` +
        `\\[${esc(bar(pct))}\\] *${pct}%*\n` +
        `🔧 ${esc(step)}\n\n` +
        `⏱ Waktu: ${esc(elapsed())} detik`,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
      );
    } catch (_) {}
  };

  try {
    await edit(5, 'Memeriksa tools build...');

    // Step 1: Build anisub web app
    await edit(10, `Build web app v${VER} untuk GitHub Pages...`);
    await buildAnisub((step) => edit(15, step));
    await edit(35, 'Web build selesai!');

    // Step 2: Deploy to GitHub Pages
    await edit(38, 'Upload ke GitHub Pages...');
    const deployResult = await deployToGithubPages((step) => edit(40, step));
    await edit(55, `GitHub Pages berhasil di-deploy! (${deployResult?.filesChanged || '?'} file baru)`);

    // Wait a moment for pages to propagate
    await new Promise(r => setTimeout(r, 2000));

    // Step 3: Build APK pointing to new root URL
    await edit(58, `Build APK Android v${VER}...`);
    const htmlBuf = Buffer.from('<html></html>', 'utf8');
    const apkBuf = await buildApk(htmlBuf, async (step) => {
      const pct = step.includes('Download') ? 62
        : step.includes('Mempersiapkan') ? 65
        : step.includes('resources') ? 72
        : step.includes('Link') ? 78
        : step.includes('DEX') ? 84
        : step.includes('Pack') ? 89
        : step.includes('Sign') ? 94 : 70;
      await edit(pct, step);
    }, {
      appName:     'Lawnime ID',
      appId:       'com.lawnime.streaming',
      cn:          'Lawnime ID',
      iconBuf,
      urlToLoad:   GH_PAGES_ANIME_URL,
      versionCode: VCODE,
      versionName: VER,
    });

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const sizeMB     = (apkBuf.length / 1024 / 1024).toFixed(2);

    await edit(97, 'Upload ke Telegram...');

    // Simpan APK lokal (versioned + generic)
    fs.writeFileSync(path.join(PUBLIC_DIR, APK_NAME), apkBuf);
    fs.writeFileSync(path.join(PUBLIC_DIR, 'LawnimeID.apk'), apkBuf);

    await bot.editMessageText(
      `🎌 *Build APK Selesai\\!*\n\n` +
      `📱 *Lawnime ID v${esc(VER)}*\n` +
      `🌐 URL: \`${esc(GH_PAGES_URL)}\`\n\n` +
      `\\[${esc(bar(100))}\\] *100%*\n` +
      `⏱ Total: ${esc(elapsedSec)} detik\n` +
      `📦 Ukuran: ${esc(sizeMB)} MB\n\n` +
      `⬆️ Mengirim ke Telegram\\.\\.\\.`,
      { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
    );

    await bot.sendDocument(chatId, apkBuf,
      {
        caption:
          `🎌 *Lawnime ID v${esc(VER)}*\n\n` +
          `✅ *APK Android — Streaming Anime Sub Indo*\n\n` +
          `📦 Ukuran: *${esc(sizeMB)} MB*\n` +
          `📱 Support: Android 5\\.0\\+ \\(semua device\\)\n` +
          `🔒 Signed RSA 2048 \\(V1 \\+ V2\\)\n` +
          `⏱ Build: *${esc(elapsedSec)} detik*\n` +
          `🌐 URL: \`${esc(GH_PAGES_URL)}\`\n\n` +
          `📲 *Cara Install:*\n` +
          `1\\. Uninstall versi lama terlebih dahulu\n` +
          `2\\. Download file APK di atas\n` +
          `3\\. Buka di File Manager, tap Install\n` +
          `4\\. Kalau ada peringatan keamanan, pilih *Tetap Pasang*\n` +
          `5\\. Buka app, nikmati streaming anime sub indo\\!`,
        parse_mode: 'MarkdownV2',
      },
      { filename: APK_NAME, contentType: 'application/vnd.android.package-archive' }
    );

    // Upload APK ke GitHub Releases (fire and forget)
    uploadRelease(
      apkBuf,
      `v${VER}-lawnime`,
      APK_NAME,
      `🎌 Lawnime ID v${VER} — GitHub Pages (Online 24/7)`,
      `## Lawnime ID v${VER} — Streaming Anime Sub Indo\n\n📱 APK Android untuk streaming anime subtitle Indonesia.\n\n🌐 **Hosted at:** ${GH_PAGES_URL}\n\n**Cara Install:**\n1. Uninstall versi lama terlebih dahulu\n2. Download file APK\n3. Buka di File Manager → tap Install\n4. Jika ada peringatan keamanan → pilih Tetap Pasang\n5. Buka app → nikmati streaming anime!\n\n✅ Support Android 5.0+ (API 21+)\n🔒 Signed RSA 2048 (V1 + V2)`
    )
      .then(downloadUrl => {
        bot.sendMessage(chatId,
          `✅ *APK Lawnime ID v${esc(VER)} berhasil diupload ke GitHub Releases\\!*\n\n` +
          `📥 *Link Download Permanen:*\n` +
          `\`${esc(downloadUrl)}\`\n\n` +
          `🌐 *Web App \\(GitHub Pages\\):*\n` +
          `\`${esc(GH_PAGES_URL)}\`\n\n` +
          `🎌 _Online 24/7 tanpa butuh Replit\\!_`,
          { parse_mode: 'MarkdownV2' }
        ).catch(() => {});
      })
      .catch(e => {
        bot.sendMessage(chatId,
          `⚠️ APK terkirim ke Telegram tapi gagal upload GitHub Releases: ${e.message.slice(0, 200)}`
        ).catch(() => {});
      });

  } catch (e) {
    console.error('[lawnime build]', e.message);
    try {
      await bot.editMessageText(
        `❌ *Build Gagal*\n\nError:\n\`${esc(e.message.slice(0, 400))}\``,
        { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'MarkdownV2' }
      );
    } catch (_) {}
  }
}

function registerLawnimeCommands(bot) {
  bot.onText(/^\/buildlawnime(?:\s|$)/i, async (msg) => {
    await runLawnimeBuild(bot, msg.chat.id);
  });
}

module.exports = { registerLawnimeCommands, runLawnimeBuild, buildAnisub, deployToGithubPages, GH_PAGES_URL, GH_PAGES_ANIME_URL, GH_PAGES_BASE };
