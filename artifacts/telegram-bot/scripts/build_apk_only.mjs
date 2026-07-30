#!/usr/bin/env node
/**
 * Standalone APK build + GitHub Release upload script.
 * Usage: node artifacts/telegram-bot/scripts/build_apk_only.mjs
 */
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const { buildApk, jarsReady } = require('../commands/localApkBuild.js');

const PUBLIC_DIR  = join(__dirname, '..', 'public');
const ICON_PATH   = join(PUBLIC_DIR, 'lawnime-icon.png');
const VERSION_FILE = join(__dirname, '..', 'data', 'lawnime-version.json');
const GH_OWNER   = 'JMStory-27';
const GH_REPO    = 'Jumalia-Makruf';
const GH_PAGES_ANIME_URL = `https://jmstory-27.github.io/Jumalia-Makruf/anime/`;
const GH_PAGES_URL       = `https://jmstory-27.github.io/Jumalia-Makruf/`;

function readVersion() {
  try { return JSON.parse(readFileSync(VERSION_FILE, 'utf8')); } catch { return { version: '1.0.7', code: 7 }; }
}
function incrementVersion(v) {
  const p = v.version.split('.').map(Number); p[2] += 1;
  return { version: p.join('.'), code: v.code + 1 };
}
function saveVersion(v) {
  mkdirSync(dirname(VERSION_FILE), { recursive: true });
  writeFileSync(VERSION_FILE, JSON.stringify(v, null, 2));
}

async function ghReq(method, urlPath, body) {
  const token = process.env.GITHUB_TOKEN;
  const res = await fetch('https://api.github.com' + urlPath, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'LawnimeBot',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 200) }; }
  if (!res.ok) throw new Error(`GH ${method} ${urlPath} → ${res.status}: ${json.message || text.slice(0, 120)}`);
  return json;
}

async function uploadRelease(apkBuf, tagName, assetName, releaseName, releaseBody) {
  const token = process.env.GITHUB_TOKEN;
  const listRes = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'LawnimeBot' },
  });
  const releases = await listRes.json();
  let existing = Array.isArray(releases) ? releases.find(r => r.tag_name === tagName) : null;

  let uploadUrl;
  if (existing) {
    uploadUrl = existing.upload_url;
    const assetsRes = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/${existing.id}/assets`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'LawnimeBot' },
    });
    const assets = await assetsRes.json();
    if (Array.isArray(assets)) {
      for (const asset of assets) {
        if (asset.name === assetName) {
          await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/assets/${asset.id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'LawnimeBot' },
          });
        }
      }
    }
  } else {
    const created = await ghReq('POST', `/repos/${GH_OWNER}/${GH_REPO}/releases`, {
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
  if (!upRes.ok) { const t = await upRes.text(); throw new Error(`Upload APK gagal: ${upRes.status} — ${t.slice(0, 200)}`); }
  return `https://github.com/${GH_OWNER}/${GH_REPO}/releases/download/${tagName}/${assetName}`;
}

async function main() {
  console.log('🎌 Build APK Lawnime ID...');

  const current = readVersion();
  const next = incrementVersion(current);
  saveVersion(next);
  const VER = next.version;
  const VCODE = String(next.code);
  const APK_NAME = `Lawnime-ID-v${VER}.apk`;
  const TAG = `v${VER}-lawnime`;

  console.log(`📦 Versi: ${VER} (code ${VCODE})`);

  const iconBuf = readFileSync(ICON_PATH);

  console.log('⚙️  Building APK...');
  const apkBuf = await buildApk(Buffer.from('<html></html>', 'utf8'), async (step) => {
    process.stdout.write(`  → ${step}\n`);
  }, {
    appName:     'Lawnime ID',
    appId:       'com.lawnime.streaming',
    cn:          'Lawnime ID',
    iconBuf,
    urlToLoad:   GH_PAGES_ANIME_URL,
    versionCode: VCODE,
    versionName: VER,
  });

  const sizeMB = (apkBuf.length / 1024 / 1024).toFixed(2);
  console.log(`✅ APK selesai! Ukuran: ${sizeMB} MB`);

  writeFileSync(join(PUBLIC_DIR, APK_NAME), apkBuf);
  writeFileSync(join(PUBLIC_DIR, 'LawnimeID.apk'), apkBuf);
  console.log(`💾 APK disimpan: public/${APK_NAME}`);

  console.log('⬆️  Upload ke GitHub Releases...');
  const downloadUrl = await uploadRelease(
    apkBuf,
    TAG,
    APK_NAME,
    `🎌 Lawnime ID v${VER} — GitHub Pages (Online 24/7)`,
    `## Lawnime ID v${VER}\n\n📱 APK Android streaming anime sub indo.\n\n🌐 **URL:** ${GH_PAGES_URL}\n\n✅ Support Android 5.0+ (API 21+)\n🔒 Signed RSA 2048 (V1+V2)\n\n**Permissions:** Camera, Mic, Notifications, Location`
  );

  console.log('\n🎉 SELESAI!');
  console.log(`📥 Download APK: ${downloadUrl}`);
  console.log(`🌐 Web App: ${GH_PAGES_URL}`);
}

main().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
