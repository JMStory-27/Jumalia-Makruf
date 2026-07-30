'use strict';

const fs   = require('fs');
const path = require('path');
const { buildApk } = require('./localApkBuild');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const ICON_PATH  = path.join(PUBLIC_DIR, 'chess-icon.png');
const HTML_PATH  = path.join(PUBLIC_DIR, 'catur.html');

// ─── GitHub helpers ──────────────────────────────────────────────────────────
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

async function pushToGithub(filePath, contentBuf, commitMsg) {
  const { owner, repo } = getGhCfg();
  const url  = `/repos/${owner}/${repo}/contents/${filePath}`;
  const b64  = contentBuf.toString('base64');
  const get  = await gh('GET', url);
  const body = { message: commitMsg + ' [skip ci]', content: b64, branch: 'main' };
  if (get.ok && get.json?.sha) body.sha = get.json.sha;
  const put  = await gh('PUT', url, body);
  if (!put.ok) throw new Error(`Push GitHub gagal: ${put.status} - ${put.json?.message || ''}`);
  return `https://raw.githubusercontent.com/${owner}/${repo}/main/${filePath}`;
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function bar(pct, w = 14) {
  const f = Math.round(pct / 100 * w);
  return '█'.repeat(f) + '░'.repeat(w - f);
}

// ─── APK 1 Patch: Hide hint/undo in online/random modes only ─────────────────
const PATCH_APK1 = `
<script id="apk1-nocheat">
(function(){
  function applyHide(){
    var hide = window.gameMode === 'online' ||
               (window.gameMode === 'bot' && window._currentOpp != null);
    var hint = document.getElementById('btn-hint');
    var undo = document.getElementById('btn-undo');
    if(hint){ if(hide) hint.style.setProperty('display','none','important');
              else hint.style.removeProperty('display'); }
    if(undo){ if(hide) undo.style.setProperty('display','none','important');
              else undo.style.removeProperty('display'); }
  }
  document.addEventListener('DOMContentLoaded', applyHide);
  window.addEventListener('load', applyHide);
  setInterval(applyHide, 200);
})();
</script>`;

// ─── APK 2 Patch: Full Owner + Admin Panel with Firebase ─────────────────────
const PATCH_APK2 = `
<script id="apk2-pre">
/* PRE-LOAD: Set localStorage before game reads it */
(function(){
  try {
    var prof = JSON.parse(localStorage.getItem('catur_profile')||'{}');
    prof.rating = 9999; prof.border = 17;
    if(!prof.name) prof.name = 'Lawrenz';
    localStorage.setItem('catur_profile', JSON.stringify(prof));
    var pd = JSON.parse(localStorage.getItem('catur_player_data')||'{}');
    pd.elo=9999; pd.xp=9999999; pd.losses=0;
    if(!pd.wins) pd.wins=1000000;
    if(!pd.games) pd.games=1000000;
    localStorage.setItem('catur_player_data', JSON.stringify(pd));
    localStorage.setItem('catur_user_profile', JSON.stringify({rating:9999}));
    localStorage.setItem('ownerMode','1');
    localStorage.setItem('adminMode','1');
    localStorage.setItem('allUnlocked','1');
  } catch(e){}
})();

/* Define ownerShowPanel globally so onclick="ownerShowPanel()" on the menu button works */
window.ownerShowPanel = function(){
  var p = document.getElementById('owner-admin-panel');
  if(p){ p.style.display = p.style.display==='none'?'flex':'none'; _ownerRefresh(); return; }
  _ownerCreatePanel();
};

function _ownerGetStats(){
  var pd={},prof={};
  try{pd=JSON.parse(localStorage.getItem('catur_player_data')||'{}');}catch(e){}
  try{prof=JSON.parse(localStorage.getItem('catur_profile')||'{}');}catch(e){}
  var xp=pd.xp||0,lv=180,wins=pd.wins||0,losses=pd.losses||0,games=pd.games||0;
  if(typeof window.getLevel==='function') lv=window.getLevel(xp);
  var wr=games>0?((wins/games)*100).toFixed(1):'100';
  return {lv,xp,elo:pd.elo||9999,wins,losses,games,wr,name:prof.name||'Lawrenz',rating:prof.rating||9999};
}

function _ownerSetPd(patch){
  var pd={};try{pd=JSON.parse(localStorage.getItem('catur_player_data')||'{}');}catch(e){}
  Object.assign(pd,patch);
  localStorage.setItem('catur_player_data',JSON.stringify(pd));
  var prof={};try{prof=JSON.parse(localStorage.getItem('catur_profile')||'{}');}catch(e){}
  if(patch.elo) prof.rating=patch.elo;
  if(patch.elo||patch.border!==undefined) localStorage.setItem('catur_profile',JSON.stringify(prof));
}

function _ownerRefresh(){
  var s=_ownerGetStats();
  var el=document.getElementById('_ow_stats');
  if(!el) return;
  el.innerHTML=
    '<div style="color:#aaa;font-size:11px;margin-bottom:8px">STATISTIK OWNER \u2014 REALTIME</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:13px">'+
    '<div>\uD83D\uDCCA Level <b style="color:#ffd700">'+s.lv+'/180</b></div>'+
    '<div>\u2B50 ELO <b style="color:#ffd700">'+s.elo+'</b></div>'+
    '<div>\uD83D\uDCA5 XP <b style="color:#ffd700">'+(s.xp).toLocaleString()+'</b></div>'+
    '<div>\uD83C\uDFC6 Rating <b style="color:#ffd700">'+s.rating+'</b></div>'+
    '<div>\u2705 Menang <b style="color:#4ade80">'+s.wins.toLocaleString()+'</b></div>'+
    '<div>\u274C Kalah <b style="color:#f87171">'+s.losses+'</b></div>'+
    '<div>\uD83C\uDFAE Games <b style="color:#fff">'+s.games.toLocaleString()+'</b></div>'+
    '<div>\uD83D\uDCB0 WR <b style="color:#ffd700">'+s.wr+'%</b></div>'+
    '</div>';
}

function _ownerBtn(html, col, fn){
  var b=document.createElement('button');
  b.innerHTML=html;
  b.style.cssText='background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.35);'+
    'color:'+(col||'#ffd700')+';border-radius:10px;padding:10px 12px;cursor:pointer;font-weight:700;'+
    'font-size:12px;width:100%;text-align:left;font-family:system-ui;margin-bottom:5px;'+
    'transition:background .15s;';
  b.onmousedown=function(){this.style.background='rgba(255,215,0,0.22)';};
  b.ontouchstart=function(){this.style.background='rgba(255,215,0,0.22)';};
  b.onclick=fn; return b;
}

function _ownerFbRooms(cb){
  var waitDb=0,ivl=setInterval(function(){
    if(window.db){clearInterval(ivl);window.db.ref('chess_rooms').once('value',cb);return;}
    if(++waitDb>20){clearInterval(ivl);cb(null);}
  },300);
}

function _ownerCreatePanel(){
  var panel=document.createElement('div');
  panel.id='owner-admin-panel';
  panel.style.cssText=[
    'position:fixed','top:0','left:0','right:0','bottom:0','z-index:999999',
    'background:rgba(8,6,22,0.97)','overflow-y:auto',
    'flex-direction:column','gap:12px','padding:16px',
    'display:flex','font-family:system-ui,sans-serif'
  ].join(';');

  /* Header */
  var hdr=document.createElement('div');
  hdr.style.cssText='display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;border-bottom:1px solid rgba(255,215,0,0.3)';
  hdr.innerHTML='<span style="color:#ffd700;font-weight:900;font-size:18px">\uD83D\uDC51 PANEL KHUSUS OWNER</span>';
  var cls=document.createElement('button');
  cls.innerHTML='\u2715 Tutup';
  cls.style.cssText='background:rgba(255,100,100,0.2);border:1px solid rgba(255,100,100,0.5);color:#f87171;border-radius:8px;padding:8px 14px;font-weight:700;cursor:pointer;font-size:13px';
  cls.onclick=function(){panel.style.display='none';};
  hdr.appendChild(cls);
  panel.appendChild(hdr);

  /* Stats box */
  var sbox=document.createElement('div');
  sbox.id='_ow_stats';
  sbox.style.cssText='background:rgba(255,215,0,0.07);border:1px solid rgba(255,215,0,0.25);border-radius:12px;padding:14px';
  panel.appendChild(sbox);

  /* Sections */
  function section(title){
    var h=document.createElement('div');
    h.style.cssText='color:rgba(255,215,0,0.6);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;margin:8px 0 6px';
    h.textContent=title;
    panel.appendChild(h);
  }

  /* === SECTION: STATS === */
  section('\u2014 Stats & Profil \u2014');

  panel.appendChild(_ownerBtn('\uD83D\uDCCA Refresh Stats', '#94a3b8', _ownerRefresh));

  panel.appendChild(_ownerBtn('\uD83C\uDF81 Gift EXP ke Akun Sendiri', '#ffd700', function(){
    var e=prompt('Berapa EXP mau ditambah?','100000');
    if(!e||isNaN(e)) return;
    var pd={};try{pd=JSON.parse(localStorage.getItem('catur_player_data')||'{}');}catch(ex){}
    pd.xp=(pd.xp||0)+parseInt(e);
    localStorage.setItem('catur_player_data',JSON.stringify(pd));
    alert('\u2705 XP +'+parseInt(e)+'\nTotal: '+pd.xp.toLocaleString());
    _ownerRefresh();
  }));

  panel.appendChild(_ownerBtn('\uD83D\uDCB0 Set ELO/Rating Manual', '#ffd700', function(){
    var v=prompt('Rating baru:','9999');
    if(!v||isNaN(v)) return;
    _ownerSetPd({elo:parseInt(v)});
    var prof={};try{prof=JSON.parse(localStorage.getItem('catur_profile')||'{}');}catch(e){}
    prof.rating=parseInt(v);
    localStorage.setItem('catur_profile',JSON.stringify(prof));
    if(window.userProfile) window.userProfile.rating=parseInt(v);
    alert('Rating diset ke '+v);
    _ownerRefresh();
  }));

  panel.appendChild(_ownerBtn('\u26A1 MAX STATS (Level 180 | ELO 9999 | Kalah 0)', '#ff8c00', function(){
    _ownerSetPd({elo:9999,xp:9999999,games:1000000,wins:1000000,losses:0,draws:0});
    var prof={};try{prof=JSON.parse(localStorage.getItem('catur_profile')||'{}');}catch(e){}
    prof.rating=9999;prof.border=17;
    localStorage.setItem('catur_profile',JSON.stringify(prof));
    if(window.userProfile){window.userProfile.rating=9999;window.userProfile.border=17;}
    alert('\u2705 Stats dimaximalkan!\nLevel 180, ELO 9999, Win 1.000.000, Kalah 0');
    _ownerRefresh();
  }));

  panel.appendChild(_ownerBtn('\uD83D\uDEAB Reset Kekalahan ke 0', '#4ade80', function(){
    _ownerSetPd({losses:0});
    alert('\u2705 Kekalahan direset ke 0!');
    _ownerRefresh();
  }));

  panel.appendChild(_ownerBtn('\uD83D\uDCDD Ganti Nama Profil', '#ffd700', function(){
    var prof={};try{prof=JSON.parse(localStorage.getItem('catur_profile')||'{}');}catch(e){}
    var v=prompt('Nama baru:',prof.name||'Lawrenz');
    if(!v) return;
    prof.name=v;
    localStorage.setItem('catur_profile',JSON.stringify(prof));
    if(window.userProfile) window.userProfile.name=v;
    alert('\u2705 Nama diganti ke: '+v);
    _ownerRefresh();
  }));

  panel.appendChild(_ownerBtn('\uD83D\uDD13 Force Unlock Semua Tema/Border/Badge', '#a78bfa', function(){
    localStorage.setItem('allUnlocked','1');localStorage.setItem('ownerMode','1');
    var prof={};try{prof=JSON.parse(localStorage.getItem('catur_profile')||'{}');}catch(e){}
    prof.border=17;localStorage.setItem('catur_profile',JSON.stringify(prof));
    ['isThemeUnlocked','isBorderUnlocked','isBadgeUnlocked'].forEach(function(fn){
      if(typeof window[fn]==='function') window[fn]=function(){return true;};
    });
    alert('\u2705 Semua unlock!');
  }));

  /* === SECTION: NAVIGASI === */
  section('\u2014 Navigasi Cepat \u2014');

  panel.appendChild(_ownerBtn('\uD83C\uDF10 Mode Mabar (Online)', '#38bdf8', function(){
    panel.style.display='none';
    if(typeof window.showOnlineChoice==='function') window.showOnlineChoice();
  }));
  panel.appendChild(_ownerBtn('\uD83C\uDFAE Cari Lawan Random', '#f472b6', function(){
    panel.style.display='none';
    if(typeof window.showMatchmaking==='function') window.showMatchmaking();
  }));
  panel.appendChild(_ownerBtn('\uD83E\uDDE0 Main vs Bot', '#ffd700', function(){
    panel.style.display='none';
    if(typeof window.showLevel==='function') window.showLevel();
  }));

  /* === SECTION: HISTORY === */
  section('\u2014 History & Data \u2014');

  panel.appendChild(_ownerBtn('\uD83D\uDCCB Lihat 10 Game Terakhir', '#94a3b8', function(){
    try{
      var h=JSON.parse(localStorage.getItem('catur_game_hist')||'[]');
      if(!h.length){alert('Belum ada history.');return;}
      var txt=h.slice(0,10).map(function(g,i){
        return (i+1)+'. '+new Date(g.date).toLocaleDateString('id')+
          ' | '+(g.mode||'?')+' | '+(g.result||'?')+
          (g.eloChange?(' | ELO '+(g.eloChange>0?'+':'')+g.eloChange):'');
      }).join('\n');
      alert('10 Game Terakhir:\n\n'+txt);
    }catch(e){alert('Error: '+e.message);}
  }));

  panel.appendChild(_ownerBtn('\uD83D\uDDD1 Hapus History Game', '#f87171', function(){
    if(!confirm('Hapus semua history game?')) return;
    localStorage.removeItem('catur_game_hist');
    alert('\u2705 History dihapus!');
  }));

  panel.appendChild(_ownerBtn('\uD83D\uDCC4 Export Stats (Copy JSON)', '#94a3b8', function(){
    var data={profile:localStorage.getItem('catur_profile'),player:localStorage.getItem('catur_player_data'),hist:localStorage.getItem('catur_game_hist')};
    var txt=JSON.stringify(data,null,2);
    if(navigator.clipboard){navigator.clipboard.writeText(txt).then(function(){alert('\u2705 Disalin ke clipboard!');});}
    else{prompt('Copy ini:',txt);}
  }));

  /* === SECTION: FIREBASE / USER ONLINE === */
  section('\u2014 User Online & Room (Firebase) \u2014');

  /* User online count */
  panel.appendChild(_ownerBtn('\uD83D\uDFE2 Cek Jumlah User & Room Online', '#4ade80', function(){
    var btn=this;btn.textContent='Loading...';
    _ownerFbRooms(function(snap){
      btn.textContent='\uD83D\uDFE2 Cek Jumlah User & Room Online';
      if(!snap){alert('Firebase tidak tersedia.');return;}
      var rooms=snap.val()||{};
      var codes=Object.keys(rooms);
      var active=codes.filter(function(c){return rooms[c]&&!rooms[c].gameOver;});
      var players=0;
      active.forEach(function(c){
        var r=rooms[c];
        if(r.players){if(r.players.w)players++;if(r.players.b)players++;}
      });
      alert('\uD83C\uDFAE Statistik Online:\n\nTotal room: '+codes.length+'\nRoom aktif: '+active.length+'\nEstimasi pemain: '+players);
    });
  }));

  /* List rooms */
  var roomListEl=document.createElement('div');
  roomListEl.id='_ow_rooms';
  roomListEl.style.cssText='background:rgba(0,0,0,0.3);border:1px solid rgba(255,215,0,0.15);border-radius:10px;padding:10px;min-height:40px;font-size:12px;display:none;max-height:200px;overflow-y:auto';
  panel.appendChild(roomListEl);

  panel.appendChild(_ownerBtn('\uD83D\uDCCB Lihat Daftar Room & Pemain', '#38bdf8', function(){
    var rl=document.getElementById('_ow_rooms');
    rl.style.display='block';rl.textContent='Memuat...';
    _ownerFbRooms(function(snap){
      if(!snap){rl.textContent='Firebase tidak tersedia.';return;}
      var rooms=snap.val()||{};
      var codes=Object.keys(rooms);
      if(!codes.length){rl.textContent='Tidak ada room aktif.';return;}
      var html='<b style="color:#ffd700">Room Aktif ('+codes.length+'):</b><br>';
      codes.slice(0,20).forEach(function(c){
        var r=rooms[c];
        var pw=r.players&&r.players.w?r.players.w:'kosong';
        var pb=r.players&&r.players.b?r.players.b:'kosong';
        var ago=r.created?Math.round((Date.now()-r.created)/60000)+' mnt lalu':'?';
        html+='<div style="padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.08)">'+
          '\uD83C\uDFAE <b>'+c+'</b> ('+ago+')<br>'+
          '\u2655 Putih: '+pw+' | \u265A Hitam: '+pb+
          ' <span onclick="window._ownerWatchRoom(\''+c+'\')" style="color:#38bdf8;cursor:pointer;text-decoration:underline"> [Tonton]</span>'+
          '</div>';
      });
      rl.innerHTML=html;
    });
  }));

  /* Watch room live */
  window._ownerWatchRoom=function(code){
    if(window._ownerRoomListener&&window._ownerRoomRef){
      window._ownerRoomRef.off('value',window._ownerRoomListener);
    }
    if(!window.db){alert('Firebase tidak tersedia.');return;}
    var info=document.getElementById('_ow_live');
    if(!info){
      info=document.createElement('div');
      info.id='_ow_live';
      info.style.cssText='background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.35);border-radius:10px;padding:10px;font-size:12px;margin-top:5px';
      document.getElementById('_ow_rooms').after(info);
    }
    info.innerHTML='\uD83D\uDD34 Menonton room <b>'+code+'</b> secara live...<br><br>';
    window._ownerRoomRef=window.db.ref('chess_rooms/'+code);
    window._ownerRoomListener=window._ownerRoomRef.on('value',function(snap){
      var r=snap.val();
      if(!r){info.innerHTML='Room <b>'+code+'</b> sudah tidak ada.';return;}
      var pw=r.players&&r.players.w?r.players.w:'kosong';
      var pb=r.players&&r.players.b?r.players.b:'kosong';
      var turn=r.state?r.state.t:'?';
      info.innerHTML='\uD83D\uDD34 LIVE: Room <b style="color:#38bdf8">'+code+'</b><br>'+
        '\u2655 Putih: <b>'+pw+'</b> | \u265A Hitam: <b>'+pb+'</b><br>'+
        'Giliran: <b style="color:#ffd700">'+(turn==='w'?'Putih':turn==='b'?'Hitam':'?')+'</b><br>'+
        'Game over: '+(r.state&&r.state.gameOver?'\u2705 Ya':'\u274C Belum')+
        ' <span onclick="window._ownerStopWatch()" style="color:#f87171;cursor:pointer"> [Stop]</span>';
    });
  };

  window._ownerStopWatch=function(){
    if(window._ownerRoomListener&&window._ownerRoomRef){
      window._ownerRoomRef.off('value',window._ownerRoomListener);
      window._ownerRoomListener=null;
    }
    var el=document.getElementById('_ow_live');
    if(el) el.innerHTML='Nonton dihentikan.';
  };

  /* Gift EXP via Firebase */
  panel.appendChild(_ownerBtn('\uD83C\uDF81 Kirim Pesan/Gift ke Room Aktif', '#ffd700', function(){
    var code=prompt('Masukkan kode room:');
    if(!code) return;
    if(!window.db){alert('Firebase tidak tersedia.');return;}
    var msg=prompt('Pesan untuk pemain di room ini:','Selamat bermain! - Admin');
    if(!msg) return;
    window.db.ref('chess_rooms/'+code+'/admin_msg').set({msg,time:Date.now(),from:'OWNER'})
      .then(function(){alert('\u2705 Pesan terkirim ke room '+code);})
      .catch(function(e){alert('Gagal: '+e.message);});
  }));

  /* === SECTION: ADMIN TOOLS === */
  section('\u2014 Admin Tools \u2014');

  panel.appendChild(_ownerBtn('\uD83D\uDEAB Hapus Room Usang (>1 jam)', '#f87171', function(){
    if(!window.db){alert('Firebase tidak tersedia.');return;}
    if(!confirm('Hapus semua room yang dibuat lebih dari 1 jam lalu?')) return;
    _ownerFbRooms(function(snap){
      if(!snap){alert('Firebase tidak tersedia.');return;}
      var rooms=snap.val()||{};var count=0;
      var limit=Date.now()-3600000;
      Object.keys(rooms).forEach(function(c){
        if(rooms[c].created&&rooms[c].created<limit){
          window.db.ref('chess_rooms/'+c).remove();count++;
        }
      });
      alert('\u2705 '+count+' room usang dihapus!');
    });
  }));

  panel.appendChild(_ownerBtn('\uD83D\uDD0D Lihat Semua Key localStorage', '#94a3b8', function(){
    var keys=[];
    for(var i=0;i<localStorage.length;i++) keys.push(localStorage.key(i));
    var txt=keys.filter(function(k){return k.includes('catur')||k.includes('chess')||k.includes('owner');})
      .map(function(k){return k+': '+(localStorage.getItem(k)||'').slice(0,50);}).join('\n');
    alert('Data lokal:\n\n'+txt);
  }));

  panel.appendChild(_ownerBtn('\u267B Reset SEMUA Data Lokal', '#f87171', function(){
    if(!confirm('HAPUS semua data lokal game? Stats, history, profil semua hilang!')) return;
    if(!confirm('Yakin? Ini tidak bisa dibatalkan!')) return;
    ['catur_profile','catur_player_data','catur_game_hist','catur_user_profile','catur_cfg3'].forEach(function(k){localStorage.removeItem(k);});
    alert('\u2705 Data direset. Silakan refresh.');
  }));

  panel.appendChild(_ownerBtn('\uD83C\uDFC6 Simulasi Menang 100 Game', '#4ade80', function(){
    var pd={};try{pd=JSON.parse(localStorage.getItem('catur_player_data')||'{}');}catch(e){}
    pd.wins=(pd.wins||0)+100;pd.games=(pd.games||0)+100;pd.xp=(pd.xp||0)+50000;
    localStorage.setItem('catur_player_data',JSON.stringify(pd));
    alert('\u2705 +100 menang, +50.000 XP ditambahkan!');_ownerRefresh();
  }));

  /* Footer */
  var foot=document.createElement('div');
  foot.style.cssText='color:rgba(255,215,0,0.4);font-size:10px;text-align:center;padding:8px 0;border-top:1px solid rgba(255,215,0,0.15)';
  foot.textContent='\uD83D\uDC51 Chess Royale Owner — Admin Panel Eksklusif';
  panel.appendChild(foot);

  document.body.appendChild(panel);
  _ownerRefresh();
}
</script>

<script id="apk2-post">
/* POST-LOAD: Override game functions + inject owner badge */
window.addEventListener('load', function(){
  try {
    /* Override userProfile */
    if(window.userProfile){ window.userProfile.rating=9999; window.userProfile.border=17; }
    /* Override level/unlock functions */
    if(typeof window.getLevel==='function') window.getLevel=function(){return 180;};
    ['isThemeUnlocked','isBorderUnlocked','isBadgeUnlocked'].forEach(function(fn){
      if(typeof window[fn]==='function') window[fn]=function(){return true;};
    });
    /* Hint & Undo always visible for owner */
    function keepVisible(){
      var h=document.getElementById('btn-hint'),u=document.getElementById('btn-undo');
      if(h){h.style.removeProperty('display');h.style.setProperty('visibility','visible','important');}
      if(u){u.style.removeProperty('display');u.style.setProperty('visibility','visible','important');}
    }
    keepVisible(); setInterval(keepVisible,300);
    /* Owner badge on name elements */
    function addBadge(){
      var name=(window.userProfile&&window.userProfile.name)||'Lawrenz';
      ['mm-me-name','prof-name-display'].forEach(function(id){
        var el=document.getElementById(id);
        if(el&&!el.dataset.ob){el.dataset.ob='1';var sp=document.createElement('span');
          sp.style.cssText='color:#ffd700;font-weight:900;font-size:0.85em;text-shadow:0 0 8px gold';
          sp.textContent=' \uD83D\uDC51';el.appendChild(sp);}
      });
    }
    addBadge(); setInterval(addBadge,2000);
  } catch(e){ console.warn('[Owner]',e.message); }
});
</script>`;

// ─── HTML-level patches for APK2 (direct string replacement) ─────────────────
function patchApk2Html(htmlStr) {
  return htmlStr
    // Rename "Main Online" button label and screen title
    .replace(/>Main Online<\/span>/g,  '>Mode Mabar</span>')
    .replace(/>Main Online<\/div>/g,   '>Mode Mabar</div>')
    // Replace Tutorial Catur button → KHUSUS OWNER
    // Change icon, label, and onclick handler
    .replace(
      '<button class="btn-main" onclick="showTutorial()">',
      '<button class="btn-main" onclick="ownerShowPanel()" style="background:linear-gradient(135deg,rgba(212,175,55,0.2),rgba(212,175,55,0.08));border-color:rgba(212,175,55,0.7)">'
    )
    .replace(
      '<span class="btn-icon">📚</span>\n        <span class="btn-label">Tutorial Catur</span>',
      '<span class="btn-icon">👑</span>\n        <span class="btn-label">⚙️ KHUSUS OWNER</span>'
    );
}

// ─── Single APK build ─────────────────────────────────────────────────────────
async function doBuild(bot, chatId, opts) {
  const { appName, appId, ghPath, patchScript, iconBuf, htmlBuf, label, htmlPatchFn } = opts;
  const startTime = Date.now();

  let statusMsg = null;
  try {
    statusMsg = await bot.sendMessage(chatId,
      `Build dimulai: ${appName}\n[${bar(0)}] 0%\nMemulai...`
    );
  } catch (e) { console.error('[caturApk] gagal kirim statusMsg:', e.message); }

  let lastEdit = 0;
  async function onProgress(step) {
    if (!statusMsg) return;
    const now = Date.now();
    if (now - lastEdit < 2500) return;
    lastEdit = now;
    const elapsed = Math.floor((now - startTime) / 1000);
    const pctMap = { mempersiapkan:5, download:18, kompilasi:32, link:50, dex:65, pack:80, sign:93 };
    let pct = 5;
    const sl = step.toLowerCase();
    Object.keys(pctMap).forEach(k => { if (sl.includes(k)) pct = pctMap[k]; });
    try {
      await bot.editMessageText(
        `Build ${appName}\n[${bar(pct)}] ${pct}%\n${step.slice(0, 80)}\n${elapsed}s`,
        { chat_id: chatId, message_id: statusMsg.message_id }
      );
    } catch (er) { console.error('[caturApk] onProgress:', er.message); }
  }

  try {
    let htmlStr = htmlBuf.toString('utf8');
    // Inject patch script before </head>
    htmlStr = htmlStr.includes('</head>')
      ? htmlStr.replace('</head>', patchScript + '\n</head>')
      : patchScript + '\n' + htmlStr;
    // Apply HTML-level patches (text replacements)
    if (htmlPatchFn) htmlStr = htmlPatchFn(htmlStr);
    const patchedHtml = Buffer.from(htmlStr, 'utf8');

    const apkBuf = await buildApk(patchedHtml, onProgress, { appName, appId, cn: appName, iconBuf });
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const sizeMB  = (apkBuf.length / 1024 / 1024).toFixed(2);

    if (statusMsg) {
      try {
        await bot.editMessageText(
          `Build selesai: ${appName}\n[${bar(100)}] 100%\n${elapsed}s — ${sizeMB} MB\nMengirim...`,
          { chat_id: chatId, message_id: statusMsg.message_id }
        );
      } catch (er) {}
    }

    const caption =
      `📱 ${appName}\n\n${label}\n\n` +
      `📦 ${sizeMB} MB | Android 5.0+ | Signed RSA 2048\n` +
      `⏱ Build: ${elapsed}s\n\n` +
      `📲 Cara Install: tap APK → Install → aktifkan sumber tidak dikenal jika diminta`;

    await bot.sendDocument(chatId, apkBuf,
      { caption },
      { filename: appName.replace(/\s+/g,'') + '.apk', contentType: 'application/vnd.android.package-archive' }
    );

    // Push to GitHub in background
    pushToGithub(ghPath, apkBuf, `Update APK: ${appName}`)
      .then(dlUrl => {
        bot.sendMessage(chatId, `Link download ${appName}:\n${dlUrl}`).catch(() => {});
      })
      .catch(e => {
        bot.sendMessage(chatId, `APK terkirim ke chat, gagal push GitHub: ${e.message.slice(0, 200)}`).catch(() => {});
      });

    return true;
  } catch (e) {
    console.error(`[caturApk ${appName}] ERROR:`, e.message, e.stack?.slice(0, 600));
    const errText = `Build Gagal: ${appName}\n\n${e.message.slice(0, 400)}`;
    if (statusMsg) {
      try { await bot.editMessageText(errText, { chat_id: chatId, message_id: statusMsg.message_id }); }
      catch (_) { await bot.sendMessage(chatId, errText).catch(() => {}); }
    } else { await bot.sendMessage(chatId, errText).catch(() => {}); }
    return false;
  }
}

// ─── Build caturadmin.html ────────────────────────────────────────────────────
async function buildAdminHtml() {
  const htmlBuf  = fs.readFileSync(HTML_PATH);
  let htmlStr    = htmlBuf.toString('utf8');

  // Inject PATCH_APK2 before </head>
  htmlStr = htmlStr.includes('</head>')
    ? htmlStr.replace('</head>', PATCH_APK2 + '\n</head>')
    : PATCH_APK2 + '\n' + htmlStr;

  // Apply HTML-level patches (Mode Mabar + KHUSUS OWNER button)
  htmlStr = patchApk2Html(htmlStr);

  // Write to public/caturadmin.html
  const outPath = path.join(PUBLIC_DIR, 'caturadmin.html');
  fs.writeFileSync(outPath, htmlStr, 'utf8');
  return { buf: Buffer.from(htmlStr, 'utf8'), path: outPath };
}

// ─── Build both APKs ──────────────────────────────────────────────────────────
async function buildBothCaturApks(bot, chatId) {
  if (!fs.existsSync(HTML_PATH)) { await bot.sendMessage(chatId, 'File catur.html tidak ditemukan.'); return; }
  if (!fs.existsSync(ICON_PATH)) { await bot.sendMessage(chatId, 'File ikon chess tidak ditemukan.'); return; }

  const htmlBuf = fs.readFileSync(HTML_PATH);
  const iconBuf = fs.readFileSync(ICON_PATH);
  const htmlKB  = (htmlBuf.length / 1024).toFixed(0);

  await bot.sendMessage(chatId,
    `Build 2 APK Chess + caturadmin.html\n\n` +
    `Game: catur.html (${htmlKB} KB)\nIkon: chess-icon.png\n\n` +
    `1. Catur BY Lawrenz — user biasa\n` +
    `2. Chess Royale Owner — owner mode full\n\n` +
    `~60-90 detik per APK. Mohon tunggu!`
  );

  // APK 1
  await bot.sendMessage(chatId, '1️⃣ Build APK 1: Catur BY Lawrenz...');
  const ok1 = await doBuild(bot, chatId, {
    appName: 'Catur BY Lawrenz', appId: 'com.lawrenz.caturbylawrenz',
    ghPath: 'web/chess-master/CaturBYLawrenz.apk',
    patchScript: PATCH_APK1, iconBuf, htmlBuf,
    label: '✅ User biasa — Hint/Undo tersembunyi saat mode Online & Random',
  });

  if (ok1) await bot.sendMessage(chatId, '✅ APK 1 selesai! Lanjut APK 2...');

  // APK 2
  await bot.sendMessage(chatId, '2️⃣ Build APK 2: Chess Royale Owner...');
  const ok2 = await doBuild(bot, chatId, {
    appName: 'Chess Royale Owner', appId: 'com.lawrenz.chessroyaleowner',
    ghPath: 'web/chess-master/ChessRoyaleOwner.apk',
    patchScript: PATCH_APK2, htmlPatchFn: patchApk2Html, iconBuf, htmlBuf,
    label: '👑 Owner eksklusif — Level 9999 | Badge OWNER | Panel KHUSUS OWNER | Firebase admin',
  });

  // Build + push caturadmin.html
  try {
    await bot.sendMessage(chatId, '🌐 Build caturadmin.html...');
    const { buf } = await buildAdminHtml();
    const adminUrl = await pushToGithub('web/chess-master/caturadmin.html', buf, 'Add caturadmin.html');
    await bot.sendMessage(chatId,
      `✅ caturadmin.html selesai!\n\nLink web admin:\n${adminUrl}\n\nBuka di browser untuk akses panel owner lengkap!`
    );
  } catch (e) {
    await bot.sendMessage(chatId, `caturadmin.html gagal: ${e.message.slice(0, 300)}`);
  }

  if (ok1 && ok2) {
    await bot.sendMessage(chatId,
      `🎉 Semua berhasil!\n\n` +
      `APK 1: Catur BY Lawrenz — untuk user\n` +
      `APK 2: Chess Royale Owner — owner mode, tombol KHUSUS OWNER di menu (ganti Tutorial Catur), panel admin full dengan Firebase\n` +
      `Web Admin: caturadmin.html di GitHub\n\nSemua link download sudah dikirim terpisah!`
    );
  }
}

// ─── Register commands ─────────────────────────────────────────────────────────
function registerCaturApkCommands(bot) {
  bot.onText(/^\/buildcatur(?:\s|$)/i, async (msg) => {
    await buildBothCaturApks(bot, msg.chat.id);
  });

  bot.onText(/^\/apk1(?:\s|$)/i, async (msg) => {
    if (!fs.existsSync(HTML_PATH)||!fs.existsSync(ICON_PATH)) { await bot.sendMessage(msg.chat.id,'File tidak ditemukan.'); return; }
    await bot.sendMessage(msg.chat.id, 'Build APK 1: Catur BY Lawrenz...');
    await doBuild(bot, msg.chat.id, {
      appName:'Catur BY Lawrenz', appId:'com.lawrenz.caturbylawrenz',
      ghPath:'web/chess-master/CaturBYLawrenz.apk', patchScript:PATCH_APK1,
      iconBuf:fs.readFileSync(ICON_PATH), htmlBuf:fs.readFileSync(HTML_PATH),
      label:'User biasa — Hint/Undo tersembunyi saat Online & Random',
    });
  });

  bot.onText(/^\/apk2(?:\s|$)/i, async (msg) => {
    if (!fs.existsSync(HTML_PATH)||!fs.existsSync(ICON_PATH)) { await bot.sendMessage(msg.chat.id,'File tidak ditemukan.'); return; }
    await bot.sendMessage(msg.chat.id, 'Build APK 2: Chess Royale Owner...');
    await doBuild(bot, msg.chat.id, {
      appName:'Chess Royale Owner', appId:'com.lawrenz.chessroyaleowner',
      ghPath:'web/chess-master/ChessRoyaleOwner.apk',
      patchScript:PATCH_APK2, htmlPatchFn:patchApk2Html,
      iconBuf:fs.readFileSync(ICON_PATH), htmlBuf:fs.readFileSync(HTML_PATH),
      label:'Owner eksklusif — Level 9999, semua unlock, panel admin',
    });
  });

  bot.onText(/^\/adminweb(?:\s|$)/i, async (msg) => {
    try {
      await bot.sendMessage(msg.chat.id, 'Build caturadmin.html...');
      const { buf } = await buildAdminHtml();
      const url = await pushToGithub('web/chess-master/caturadmin.html', buf, 'Update caturadmin.html');
      await bot.sendMessage(msg.chat.id, `✅ caturadmin.html selesai!\n\nLink:\n${url}`);
    } catch (e) {
      await bot.sendMessage(msg.chat.id, `Gagal: ${e.message.slice(0,300)}`);
    }
  });

  console.log('✅ Catur APK commands registered - /buildcatur /apk1 /apk2 /adminweb');
}

module.exports = { registerCaturApkCommands, buildBothCaturApks, doBuild, buildAdminHtml, PATCH_APK1, PATCH_APK2, patchApk2Html };
