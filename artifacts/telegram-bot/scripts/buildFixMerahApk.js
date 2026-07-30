'use strict';
/**
 * Standalone APK build script — FixMerah Lawrenz
 * Run: node scripts/buildFixMerahApk.js
 */

const fs   = require('fs');
const path = require('path');

const { buildApk } = require('../commands/localApkBuild');

const PUBLIC_DIR     = path.join(__dirname, '..', 'public');
const ICON_PATH      = path.join(PUBLIC_DIR, 'fixmerah-lawrenz-icon.png');
const VERSION_FILE   = path.join(__dirname, '..', 'data', 'fixmerah-apk-version.json');
const GH_OWNER       = process.env.GITHUB_OWNER || 'JMStory-27';
const GH_REPO        = process.env.GITHUB_REPO  || 'Jumalia-Makruf';
const FIX_MERAH_URL  = 'https://project--sennaco157.replit.app/fixmerah/';

if (!process.env.GITHUB_TOKEN) {
  console.error('❌ GITHUB_TOKEN tidak di-set!');
  process.exit(1);
}

// ── Version bump ───────────────────────────────────────────────────────────
function getAndBumpVersion() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  let cur = { version: '1.0.0', code: 1 };
  try { if (fs.existsSync(VERSION_FILE)) cur = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf8')); } catch {}
  const parts = cur.version.split('.').map(Number);
  parts[2] = (parts[2] || 0) + 1;
  const next = { version: parts.join('.'), code: (cur.code || 1) + 1 };
  fs.writeFileSync(VERSION_FILE, JSON.stringify(next, null, 2));
  return next;
}

// ── GitHub upload ──────────────────────────────────────────────────────────
async function uploadRelease(apkBuf, tagName, assetName, relName, relBody) {
  const token = process.env.GITHUB_TOKEN;
  const hdr   = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'FixMerahBuildScript',
  };

  // List releases
  const listRes  = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases`, { headers: hdr });
  const releases = await listRes.json();
  let uploadUrl;

  const existing = Array.isArray(releases) ? releases.find(r => r.tag_name === tagName) : null;
  if (existing) {
    uploadUrl = existing.upload_url;
    // Delete old asset with same name
    const assetsRes = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/${existing.id}/assets`, { headers: hdr });
    const assets = await assetsRes.json();
    if (Array.isArray(assets)) {
      for (const a of assets) {
        if (a.name === assetName) {
          await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/assets/${a.id}`, { method: 'DELETE', headers: hdr });
        }
      }
    }
  } else {
    const created = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases`, {
      method: 'POST',
      headers: { ...hdr, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: tagName, name: relName, body: relBody, draft: false, prerelease: false }),
    });
    const j = await created.json();
    if (!created.ok) throw new Error(`Create release: ${j.message}`);
    uploadUrl = j.upload_url;
  }

  const baseUrl = uploadUrl.replace(/\{[^}]*\}/g, '');
  const upRes   = await fetch(`${baseUrl}?name=${encodeURIComponent(assetName)}`, {
    method: 'POST',
    headers: { ...hdr, 'Content-Type': 'application/vnd.android.package-archive', 'Content-Length': String(apkBuf.length) },
    body: apkBuf,
  });
  if (!upRes.ok) {
    const t = await upRes.text();
    throw new Error(`Upload APK: ${upRes.status} — ${t.slice(0, 200)}`);
  }
  return `https://github.com/${GH_OWNER}/${GH_REPO}/releases/download/${tagName}/${assetName}`;
}

// ── Main ───────────────────────────────────────────────────────────────────
(async () => {
  // Ensure icon exists
  if (!fs.existsSync(ICON_PATH)) {
    console.log('Generating icon...');
    require('./generateFixMerahIcon');
  }

  const ver      = getAndBumpVersion();
  const VER      = ver.version;
  const VCODE    = String(ver.code);
  const APK_NAME = `FixMerahLawrenz-v${VER}.apk`;
  const TAG_NAME = `v${VER}-fixmerah-lawrenz`;
  const iconBuf  = fs.readFileSync(ICON_PATH);

  console.log(`\n📱 Building FixMerah Lawrenz APK v${VER}...`);
  console.log(`🌐 URL: ${FIX_MERAH_URL}`);
  console.log(`📦 Output: ${APK_NAME}\n`);

  const start = Date.now();

  const apkBuf = await buildApk(
    Buffer.from('<html></html>', 'utf8'),
    async (step) => { console.log(`  ⚙️  ${step}`); },
    {
      appName:     'FixMerah Lawrenz',
      appId:       'com.lawrenz.fixmerahnew',
      cn:          'FixMerah Lawrenz',
      iconBuf,
      urlToLoad:   FIX_MERAH_URL,
      versionCode: VCODE,
      versionName: VER,
    }
  );

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  const sizeMB  = (apkBuf.length / 1024 / 1024).toFixed(2);

  console.log(`\n✅ APK built! ${sizeMB} MB in ${elapsed}s`);
  console.log('📤 Uploading to GitHub Releases...');

  const releaseUrl = await uploadRelease(
    apkBuf, TAG_NAME, APK_NAME,
    `FixMerah Lawrenz v${VER}`,
    `📱 FixMerah Lawrenz v${VER}\n\n🔴 APK wrapper WhatsApp Appeal Tool\n🌐 Loads: ${FIX_MERAH_URL}\n\n✅ Auto-update: web update langsung aktif tanpa install ulang!`,
  );

  // Save locally too
  fs.writeFileSync(path.join(PUBLIC_DIR, APK_NAME), apkBuf);
  fs.writeFileSync(path.join(PUBLIC_DIR, 'FixMerahLawrenz.apk'), apkBuf);

  console.log(`\n🎉 SELESAI!`);
  console.log(`📥 Download: ${releaseUrl}`);
  console.log(`📂 Lokal: ${path.join(PUBLIC_DIR, APK_NAME)}`);
})().catch(err => {
  console.error('\n❌ Build gagal:', err.message);
  process.exit(1);
});
