/**
 * build_dual_apk.mjs
 * Builds APK 1 "Catur BY Lawrenz" and APK 2 "Chess Royale Owner"
 * from the latest catur.html, then pushes both to GitHub.
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

const { buildApk } = require('../commands/localApkBuild.js');

const OWNER       = process.env.GITHUB_OWNER || 'JMStory-27';
const REPO        = process.env.GITHUB_REPO  || 'Jumalia-Makruf';
const TOKEN       = process.env.GITHUB_TOKEN;

const HTML_PATH   = join(__dirname, '..', 'public', 'catur.html');
const ICON_PATH   = join(__dirname, '..', 'public', 'chess-icon-lawrenz.png');

// ─── GitHub helper ─────────────────────────────────────────────────────────────
async function ghApi(method, urlPath, body) {
  const res = await fetch('https://api.github.com' + urlPath, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'AlbumAbadiBot',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { _raw: text.slice(0, 300) }; }
  return { ok: res.ok, status: res.status, json };
}

async function pushToGithub(filePath, buf, msg) {
  const url = `/repos/${OWNER}/${REPO}/contents/${filePath}`;
  const b64 = buf.toString('base64');
  const get  = await ghApi('GET', url);
  const body = { message: msg, content: b64, branch: 'main' };
  if (get.ok && get.json.sha) body.sha = get.json.sha;
  const put = await ghApi('PUT', url, body);
  if (!put.ok) throw new Error(`Push GitHub gagal (${put.status}): ${put.json.message || ''}`);
  return `https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${filePath}`;
}

// ─── HTML patches ─────────────────────────────────────────────────────────────

/**
 * APK 1 patch: hide hint & undo ONLY in online mode and random match mode.
 * - Remove the existing standalone media query (which hides them everywhere).
 * - Inject smart JS: hide when gameMode==='online' OR (_currentOpp is set in bot mode).
 */
function patchApk1(html) {
  // Remove existing standalone-mode CSS that hides hint/undo everywhere
  html = html.replace(
    /\/\* ── APK \/ PWA standalone mode: hide hint & undo ── \*\/[\s\S]*?@media \(display-mode: standalone\) \{[\s\S]*?#btn-hint, #btn-undo \{ display: none !important; \}[\s\S]*?\}/,
    '/* APK: hint/undo shown except in online & random match — see script below */'
  );

  // Inject smart APK script before </body>
  const apk1Script = `
<script>
/* ── APK 1: Hide hint/undo in online + random match only ── */
(function(){
  if(window.location.protocol!=='file:')return;
  var _apkLastHide=null;
  function _apkUpdateButtons(){
    var online=(typeof gameMode!=='undefined'&&gameMode==='online');
    var randomMatch=(typeof gameMode!=='undefined'&&gameMode==='bot'&&
                     typeof _currentOpp!=='undefined'&&_currentOpp!=null&&
                     !(typeof isPracticeMode!=='undefined'&&isPracticeMode));
    var hide=online||randomMatch;
    if(hide===_apkLastHide)return;
    _apkLastHide=hide;
    var h=document.getElementById('btn-hint');
    var u=document.getElementById('btn-undo');
    if(h){h.style.cssText=hide?'display:none!important':'';};
    if(u){u.style.cssText=hide?'display:none!important':'';};
  }
  document.addEventListener('DOMContentLoaded',function(){setInterval(_apkUpdateButtons,250);});
})();
</script>`;

  return html.replace('</body>', apk1Script + '\n</body>');
}

/**
 * APK 2 patch: Owner edition.
 * - All borders/badges/themes unlocked (border=17 max).
 * - Level 9999, title Dewa Catur, ELO 9999.
 * - Special crown badge 👑 on owner name in game UI.
 * - Hint & undo always available.
 */
function patchApk2(html) {
  // Remove existing standalone-mode CSS that hides hint/undo
  html = html.replace(
    /\/\* ── APK \/ PWA standalone mode: hide hint & undo ── \*\/[\s\S]*?@media \(display-mode: standalone\) \{[\s\S]*?#btn-hint, #btn-undo \{ display: none !important; \}[\s\S]*?\}/,
    '/* Chess Royale Owner: hint/undo always available */'
  );

  // Pre-init script: runs before game JS reads localStorage
  const preInitScript = `
<script>
/* ── Chess Royale Owner: pre-set all owner data ── */
(function(){
  try{
    var pd={xp:9999999,elo:9999,games:99999,wins:88888,losses:111,draws:11111};
    localStorage.setItem('catur_player_data',JSON.stringify(pd));
    var profile=JSON.parse(localStorage.getItem('catur_profile')||'{}');
    profile.border=17;
    profile.rating=9999;
    if(!profile.name||profile.name==='Pemain')profile.name='Lawrenz';
    localStorage.setItem('catur_profile',JSON.stringify(profile));
  }catch(e){}
})();
</script>`;

  html = html.replace('<head>', '<head>' + preInitScript);

  // Post-init script: override getLevel/badge/border functions + inject crown badge
  const ownerScript = `
<script>
/* ── Chess Royale Owner: override level/badge/border + crown badge ── */
(function(){
  if(window.location.protocol!=='file:')return;

  /* Override level functions so UI shows 9999 / Dewa Catur */
  window.getLevel=function(){return 9999;};
  window.getLevelTitleIdx=function(){return 17;};
  window.getLvInTitle=function(){return 9;};
  window.getLevelBadge=function(){return '⚡ Dewa Catur';};
  window.getUserTitleIdx=function(){return 17;};
  window.getUserBorderIdx=function(){return 17;};

  /* Crown badge: inject 👑 OWNER badge next to player name in all game UIs */
  var _crownSelectors=[
    '#name-bot','#name-top',
    '.mm-me-name','.player-name',
    '.me-name','.lb-me-name',
  ];
  var _crownAdded=new WeakSet();
  function _addOwnerCrown(){
    _crownSelectors.forEach(function(sel){
      document.querySelectorAll(sel).forEach(function(el){
        if(_crownAdded.has(el))return;
        /* Only crown elements showing our own name */
        var profName=(typeof userProfile!=='undefined'&&userProfile.name)||'Lawrenz';
        if(el.textContent&&(el.textContent.includes(profName)||sel==='.mm-me-name'||sel==='.me-name')){
          if(!el.textContent.includes('👑')){
            el.textContent='👑 '+el.textContent.trim();
          }
          _crownAdded.add(el);
        }
      });
    });
    /* Inject owner crown badge overlay on game board player row */
    var badge=document.getElementById('badge');
    if(badge&&!badge.dataset.ownerCrowned){
      badge.dataset.ownerCrowned='1';
      badge.style.cssText='background:linear-gradient(135deg,#FFD700,#FF8C00);color:#000;font-weight:900;border-radius:8px;padding:2px 8px;font-size:11px';
      badge.textContent='👑 OWNER';
    }
    /* Level display: override all level number elements */
    document.querySelectorAll('[id*="level"],[class*="level-num"],[class*="lv-num"]').forEach(function(el){
      if(el.textContent&&/^\d+$/.test(el.textContent.trim())){
        el.textContent='9999';
        _crownAdded.add(el);
      }
    });
    /* ELO display: show 9999 */
    document.querySelectorAll('[id*="elo"],[class*="elo"]').forEach(function(el){
      if(el.textContent&&el.textContent.includes('⭐')){
        if(!el.textContent.includes('9999'))el.textContent='⭐ 9999';
      }
    });
  }

  document.addEventListener('DOMContentLoaded',function(){
    setInterval(_addOwnerCrown,500);
    /* Force re-render profile with border 17 after load */
    setTimeout(function(){
      if(typeof userProfile!=='undefined'){
        userProfile.border=17;
        userProfile.rating=9999;
        try{localStorage.setItem('catur_profile',JSON.stringify(userProfile));}catch(e){}
      }
      if(typeof getPlayerData==='function'){
        var d=getPlayerData();d.xp=9999999;d.elo=9999;
        if(typeof savePlayerData==='function')savePlayerData(d);
      }
      /* Re-apply border on profile avatar */
      if(typeof applyBorderToEl==='function'){
        var avatarEl=document.getElementById('prof-av-ring')||document.getElementById('avatar-ring')||document.querySelector('[data-border]');
        if(avatarEl)applyBorderToEl(avatarEl,17);
      }
    },800);
  });
})();
</script>`;

  return html.replace('</body>', ownerScript + '\n</body>');
}

// ─── Progress logger ───────────────────────────────────────────────────────────
function makeProgress(label) {
  return async (step) => {
    console.log(`  [${label}] ${step}`);
  };
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  if (!existsSync(HTML_PATH)) throw new Error('catur.html tidak ditemukan: ' + HTML_PATH);
  if (!existsSync(ICON_PATH)) throw new Error('Icon tidak ditemukan: ' + ICON_PATH);
  if (!TOKEN) throw new Error('GITHUB_TOKEN tidak di-set');

  const rawHtml  = readFileSync(HTML_PATH, 'utf8');
  const iconBuf  = readFileSync(ICON_PATH);

  console.log(`\n📄 HTML size: ${(rawHtml.length/1024).toFixed(0)} KB`);
  console.log(`🖼  Icon size: ${(iconBuf.length/1024).toFixed(0)} KB\n`);

  // ── Build APK 1 ──────────────────────────────────────────────────────────────
  console.log('═══════════════════════════════════════════════════');
  console.log('📱 Building APK 1: Catur BY Lawrenz');
  console.log('═══════════════════════════════════════════════════');

  const html1   = patchApk1(rawHtml);
  const html1Buf = Buffer.from(html1, 'utf8');

  const apk1Buf = await buildApk(html1Buf, makeProgress('APK1'), {
    appName: 'Catur BY Lawrenz',
    appId:   'com.lawrenz.caturbylawrenz',
    cn:      'Catur BY Lawrenz',
    iconBuf,
  });

  console.log(`\n✅ APK 1 built: ${(apk1Buf.length/1024/1024).toFixed(2)} MB`);

  // ── Build APK 2 ──────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════');
  console.log('📱 Building APK 2: Chess Royale Owner');
  console.log('═══════════════════════════════════════════════════');

  const html2    = patchApk2(rawHtml);
  const html2Buf = Buffer.from(html2, 'utf8');

  const apk2Buf = await buildApk(html2Buf, makeProgress('APK2'), {
    appName: 'Chess Royale Owner',
    appId:   'com.lawrenz.chessroyaleowner',
    cn:      'Chess Royale Owner',
    iconBuf,
  });

  console.log(`\n✅ APK 2 built: ${(apk2Buf.length/1024/1024).toFixed(2)} MB`);

  // ── Push both to GitHub ───────────────────────────────────────────────────────
  console.log('\n📤 Pushing APK 1 to GitHub…');
  const url1 = await pushToGithub(
    'web/chess-master/CaturBYLawrenz.apk',
    apk1Buf,
    '📱 Build APK: Catur BY Lawrenz [skip ci]'
  );
  console.log('✅ APK 1 URL:', url1);

  console.log('\n📤 Pushing APK 2 to GitHub…');
  const url2 = await pushToGithub(
    'web/chess-master/ChessRoyaleOwner.apk',
    apk2Buf,
    '📱 Build APK: Chess Royale Owner [skip ci]'
  );
  console.log('✅ APK 2 URL:', url2);

  console.log('\n');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║              ✅  KEDUA APK BERHASIL DIBUILD               ║');
  console.log('╠═══════════════════════════════════════════════════════════╣');
  console.log('║ APK 1 — Catur BY Lawrenz:                                 ║');
  console.log(`║   ${url1}`);
  console.log('║                                                           ║');
  console.log('║ APK 2 — Chess Royale Owner:                               ║');
  console.log(`║   ${url2}`);
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log('\n');

  return { url1, url2 };
}

main().catch(e => { console.error('❌ ERROR:', e.message); process.exit(1); });
