'use strict';

const fs   = require('fs');
const path = require('path');

const { buildApk, jarsReady } = require('../commands/localApkBuild');
const { PATCH_APK1, PATCH_APK2, patchApk2Html, buildAdminHtml } = require('../commands/caturApkBuild');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const HTML_PATH  = path.join(PUBLIC_DIR, 'catur.html');
const ICON_PATH  = path.join(PUBLIC_DIR, 'chess-icon.png');

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = 'JMStory-27';
const GITHUB_REPO  = 'Jumalia-Makruf';

async function gh(method, urlPath, body) {
  const res = await fetch('https://api.github.com' + urlPath, {
    method,
    headers: {
      'Authorization':        `Bearer ${GITHUB_TOKEN}`,
      'Accept':               'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type':         'application/json',
      'User-Agent':           'AlbumAbadiBot',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 300) }; }
  return { ok: res.ok, status: res.status, json };
}

async function pushFile(filePath, contentBuf, msg) {
  const url  = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  const b64  = contentBuf.toString('base64');
  const get  = await gh('GET', url);
  const body = { message: msg + ' [skip ci]', content: b64, branch: 'main' };
  if (get.ok && get.json?.sha) body.sha = get.json.sha;
  const put = await gh('PUT', url, body);
  if (!put.ok) throw new Error(`GitHub push gagal: ${put.status} ${put.json?.message||''}`);
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/${filePath}`;
}

function applyPatch(htmlBuf, patchScript, htmlPatchFn) {
  let str = htmlBuf.toString('utf8');
  str = str.includes('</head>') ? str.replace('</head>', patchScript + '\n</head>') : patchScript + '\n' + str;
  if (htmlPatchFn) str = htmlPatchFn(str);
  return Buffer.from(str, 'utf8');
}

async function buildOne(label, appName, appId, patchScript, htmlBuf, iconBuf, htmlPatchFn) {
  const t0 = Date.now();
  console.log(`\n━━━ BUILD: ${appName} ━━━`);
  const patched = applyPatch(htmlBuf, patchScript, htmlPatchFn);
  console.log(`  HTML size: ${(patched.length/1024).toFixed(0)} KB`);
  const apkBuf = await buildApk(patched, async (step) => {
    console.log(`  [${((Date.now()-t0)/1000).toFixed(1)}s] ${step}`);
  }, { appName, appId, cn: appName, iconBuf });
  console.log(`  ✅ BUILD OK — ${(apkBuf.length/1024/1024).toFixed(2)} MB in ${((Date.now()-t0)/1000).toFixed(1)}s`);
  return apkBuf;
}

(async () => {
  console.log('=== Chess APK Builder ===\n');
  if (!fs.existsSync(HTML_PATH)) { console.error('ERROR: catur.html tidak ditemukan'); process.exit(1); }
  if (!fs.existsSync(ICON_PATH)) { console.error('ERROR: chess-icon.png tidak ditemukan'); process.exit(1); }
  if (!GITHUB_TOKEN)             { console.error('ERROR: GITHUB_TOKEN tidak di-set'); process.exit(1); }

  const htmlBuf = fs.readFileSync(HTML_PATH);
  const iconBuf = fs.readFileSync(ICON_PATH);
  console.log(`HTML: ${(htmlBuf.length/1024).toFixed(0)} KB | Icon: ${(iconBuf.length/1024).toFixed(0)} KB | JARs: ${jarsReady()}`);

  // Build APK 1
  const apk1 = await buildOne('APK1', 'Catur BY Lawrenz',    'com.lawrenz.caturbylawrenz',    PATCH_APK1, htmlBuf, iconBuf, null);

  // Build APK 2
  const apk2 = await buildOne('APK2', 'Chess Royale Owner', 'com.lawrenz.chessroyaleowner', PATCH_APK2, htmlBuf, iconBuf, patchApk2Html);

  // Build caturadmin.html
  console.log('\n━━━ BUILD: caturadmin.html ━━━');
  const { buf: adminBuf } = await buildAdminHtml();
  console.log(`  ✅ caturadmin.html built — ${(adminBuf.length/1024).toFixed(0)} KB`);

  // Push sequentially
  console.log('\n━━━ PUSH TO GITHUB ━━━');
  console.log('  Pushing APK 1...');
  const url1 = await pushFile('web/chess-master/CaturBYLawrenz.apk',   apk1, 'Update Catur BY Lawrenz');
  console.log('  Pushing APK 2...');
  const url2 = await pushFile('web/chess-master/ChessRoyaleOwner.apk', apk2, 'Update Chess Royale Owner');
  console.log('  Pushing caturadmin.html...');
  const url3 = await pushFile('web/chess-master/caturadmin.html', adminBuf, 'Add caturadmin.html owner panel');

  console.log('\n✅ SEMUA SELESAI!\n');
  console.log('APK 1 — Catur BY Lawrenz:');
  console.log(url1);
  console.log('\nAPK 2 — Chess Royale Owner:');
  console.log(url2);
  console.log('\nWeb Admin — caturadmin.html:');
  console.log(url3);
})().catch(e => {
  console.error('\n❌ BUILD FAILED:', e.message);
  console.error(e.stack?.slice(0, 1000));
  process.exit(1);
});
