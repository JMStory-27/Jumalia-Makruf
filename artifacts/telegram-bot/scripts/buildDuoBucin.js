'use strict';

const fs   = require('fs');
const path = require('path');
const { buildApk, jarsReady } = require('../commands/localApkBuild');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const TEMPLATE   = path.join(PUBLIC_DIR, 'duo-bucin.html');
const ICON_PATH  = path.join(PUBLIC_DIR, 'duo-bucin-icon.png');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'JMStory-27';
const GITHUB_REPO  = process.env.GITHUB_REPO  || 'Jumalia-Makruf';

async function gh(method, urlPath, body) {
  const res = await fetch('https://api.github.com' + urlPath, {
    method,
    headers: {
      'Authorization':        `Bearer ${GITHUB_TOKEN}`,
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':         'application/json',
      'User-Agent':           'DuoBucinBuilder',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 300) }; }
  return { ok: res.ok, status: res.status, json };
}

async function pushFile(filePath, buf, msg) {
  const url  = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  const b64  = buf.toString('base64');
  const get  = await gh('GET', url);
  const body = { message: msg + ' [skip ci]', content: b64, branch: 'main' };
  if (get.ok && get.json?.sha) body.sha = get.json.sha;
  const put = await gh('PUT', url, body);
  if (!put.ok) throw new Error(`GitHub push gagal: ${put.status} ${put.json?.message || ''}`);
  const pageUrl = `https://${GITHUB_OWNER}.github.io/${GITHUB_REPO}/${filePath}`;
  const rawUrl  = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/${filePath}`;
  return { pageUrl, rawUrl };
}

function extractFirebaseConfig() {
  const raw = process.env.FIREBASE_CONFIG || '';
  // Try: var firebaseConfig = {...}
  const m1 = raw.match(/firebaseConfig\s*=\s*(\{[\s\S]*?\})/);
  if (m1) return m1[1];
  // Try: raw is JSON
  try { const obj = JSON.parse(raw); return JSON.stringify(obj, null, 2); } catch {}
  // Try: raw is JS object literal
  const m2 = raw.match(/(\{[^{}]*apiKey[^{}]*\})/s);
  if (m2) return m2[1];
  console.warn('⚠️  FIREBASE_CONFIG tidak bisa di-parse — gunakan placeholder');
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
  let html = fs.readFileSync(TEMPLATE, 'utf8');
  const cfg = extractFirebaseConfig();
  html = html.replace('__FIREBASE_CONFIG__', cfg);
  return Buffer.from(html, 'utf8');
}

(async () => {
  console.log('╔════════════════════════════════════════╗');
  console.log('║   💕 Duo Bucin Love — APK Builder      ║');
  console.log('╚════════════════════════════════════════╝\n');

  if (!fs.existsSync(TEMPLATE)) { console.error('❌ duo-bucin.html tidak ditemukan'); process.exit(1); }
  if (!fs.existsSync(ICON_PATH)) { console.error('❌ duo-bucin-icon.png tidak ditemukan'); process.exit(1); }
  if (!GITHUB_TOKEN) { console.error('❌ GITHUB_TOKEN tidak di-set'); process.exit(1); }

  const htmlBuf = buildHtml();
  const iconBuf = fs.readFileSync(ICON_PATH);
  const htmlKB  = (htmlBuf.length / 1024).toFixed(1);
  console.log(`📄 HTML size  : ${htmlKB} KB`);
  console.log(`🖼  Icon size  : ${(iconBuf.length / 1024).toFixed(1)} KB`);
  console.log(`🔧 JARs ready : ${jarsReady()}\n`);

  const t0 = Date.now();
  console.log('🔨 Building APK...');

  const apkBuf = await buildApk(htmlBuf, async (step) => {
    console.log(`  [${((Date.now()-t0)/1000).toFixed(1)}s] ${step}`);
  }, {
    appName: 'Duo Bucin Love',
    appId:   'com.duobucin.love',
    cn:      'Duo Bucin Love',
    iconBuf,
  });

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const apkMB   = (apkBuf.length / 1024 / 1024).toFixed(2);
  console.log(`\n✅ APK selesai — ${apkMB} MB dalam ${elapsed}s\n`);

  // Save locally
  const localApkPath = path.join(PUBLIC_DIR, 'DuoBucinLove.apk');
  fs.writeFileSync(localApkPath, apkBuf);
  console.log(`💾 APK saved locally: ${localApkPath}`);

  // Push to GitHub
  console.log('\n📤 Pushing ke GitHub Pages...');
  const htmlResult = await pushFile('web/duo-bucin/index.html',       htmlBuf, '💕 Duo Bucin Love web');
  const apkResult  = await pushFile('web/duo-bucin/DuoBucinLove.apk', apkBuf,  '💕 Duo Bucin Love APK');
  const swPath     = path.join(PUBLIC_DIR, 'sw-duobucin.js');
  if (fs.existsSync(swPath)) {
    await pushFile('web/duo-bucin/sw-duobucin.js', fs.readFileSync(swPath), '💕 Duo Bucin SW');
    console.log('  ✅ Service Worker pushed');
  }
  await pushFile('web/duo-bucin/duo-bucin-icon.png', iconBuf, '💕 Duo Bucin icon');

  console.log('\n╔════════════════════════════════════════╗');
  console.log('║           🎉 BUILD SUKSES!              ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log('🌐 Web App (GitHub Pages):');
  console.log(`   ${htmlResult.pageUrl}`);
  console.log('\n📱 Download APK:');
  console.log(`   ${apkResult.pageUrl}`);
  console.log('\n💕 Selesai!\n');
})().catch(e => {
  console.error('\n❌ BUILD FAILED:', e.message);
  console.error(e.stack?.slice(0, 1000));
  process.exit(1);
});
