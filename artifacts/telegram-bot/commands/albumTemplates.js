const ROMANTIC_QUOTES = [
    { t: '"Dan di antara tanda-tanda kekuasaan-Nya, Dia menciptakan untukmu pasangan dari jenismu sendiri, agar kamu cenderung dan tenteram kepadanya."', s: '— QS. Ar-Rum: 21' },
    { t: '"Barakallahu laka wa baraka ‘alaika, wa jama‘a bainakuma fi khair."', s: '— Doa pernikahan' },
    { t: '"Engkau adalah jawaban dari setiap doa yang aku panjatkan dalam diam."', s: '— Untukmu, separuh jiwaku' },
    { t: '"Pernikahan bukan tujuan, tapi awal perjalanan menuju surga-Nya bersama orang yang dicintai-Nya."', s: '' },
    { t: '"Aku memilihmu, akan terus memilihmu, dalam senyap, dalam kebahagiaan, dalam ribuan kehidupan."', s: '' },
    { t: '"Cinta sejati bukan tentang menemukan seseorang yang sempurna, tapi melihat seseorang dengan sempurna."', s: '— Sam Keen' },
];

function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    if (isNaN(dt)) return d;
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${dt.getDate()} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
}

const TEMPLATE_LIST = [
    { id: 'edelweiss', emoji: '🌸', name: 'Edelweiss Romance', desc: 'Putih cerah, pink-biru, kelopak abadi' },
    { id: 'galaxy',    emoji: '🌌', name: 'Midnight Galaxy',   desc: 'Gelap berbintang, konstelasi cinta' },
    { id: 'garden',    emoji: '🌿', name: 'Garden Bloom',      desc: 'Pastel hijau-peach, kupu-kupu' },
    { id: 'sakura',    emoji: '🌸', name: 'Sakura Dreams',     desc: 'Aesthetic Jepang, watercolor' },
    { id: 'royal',     emoji: '👑', name: 'Royal Gold',        desc: 'Mewah krem-emas, art deco' },
];

const COMMON_JS = `
function buildGrid(items, gridId, openLb) {
  const grid = document.getElementById(gridId);
  items.forEach((it, i) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.style.setProperty('--d', (i * 0.04) + 's');
    card.onclick = () => openLb(i);
    if (it.t === 'video') {
      card.innerHTML = '<span class="badge">▶</span><video src="files/' + encodeURIComponent(it.f) + '" muted playsinline preload="metadata"></video>';
    } else {
      card.innerHTML = '<img loading="lazy" src="files/' + encodeURIComponent(it.f) + '" alt="">';
    }
    grid.appendChild(card);
  });
  const io = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '80px' });
  document.querySelectorAll('.card').forEach(c => io.observe(c));
}
function setupLightbox(items, lbInner, lbDl, counter, lb, toast) {
  let cur = 0;
  function render() {
    const it = items[cur];
    if (it.t === 'video') {
      lbInner.innerHTML = '<video src="files/' + encodeURIComponent(it.f) + '" controls autoplay></video>';
    } else {
      lbInner.innerHTML = '<img src="files/' + encodeURIComponent(it.f) + '" alt="">';
    }
    lbDl.href = 'files/' + encodeURIComponent(it.f);
    lbDl.download = it.f;
    counter.textContent = (cur + 1) + ' / ' + items.length;
  }
  window.openLb = (i) => { cur = i; lb.classList.add('open'); document.body.style.overflow = 'hidden'; render(); };
  window.closeLb = () => { lb.classList.remove('open'); document.body.style.overflow = ''; lbInner.innerHTML = ''; };
  window.navLb = (d) => { cur = (cur + d + items.length) % items.length; render(); };
  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('open')) return;
    if (e.key === 'Escape') closeLb();
    if (e.key === 'ArrowLeft') navLb(-1);
    if (e.key === 'ArrowRight') navLb(1);
  });
  lb.addEventListener('click', (e) => { if (e.target === lb) closeLb(); });
}
function setupCopyLink(toast) {
  window.copyLink = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      toast.classList.add('show');
      setTimeout(() => toast.classList.remove('show'), 2000);
    });
  };
}
function setupQuotes(quotes) {
  const box = document.getElementById('quoteBox');
  if (!box) return;
  quotes.forEach((q, i) => {
    const d = document.createElement('div');
    d.className = 'quote' + (i === 0 ? ' active' : '');
    d.innerHTML = '<div class="text">' + q.t + '</div>' + (q.s ? '<div class="src">' + q.s + '</div>' : '');
    box.appendChild(d);
  });
  let idx = 0;
  setInterval(() => {
    document.querySelectorAll('.quote')[idx].classList.remove('active');
    idx = (idx + 1) % quotes.length;
    document.querySelectorAll('.quote')[idx].classList.add('active');
  }, 6500);
}
`;

function commonHead(title, slug) {
    return `<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><base href="/album/${slug}/"><title>${title} • Album Abadi</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`;
}

function commonItemsScript(items) {
    return JSON.stringify(items.map(it => ({ f: it.file, t: it.type === 'video' ? 'video' : 'image' })));
}

// ============================================================
// TEMPLATE 1: EDELWEISS ROMANCE (white + pink + blue + petals)
// ============================================================
function renderEdelweiss(meta) {
    const title = escapeHtml(meta.title);
    const dateStr = fmtDate(meta.date);
    const itemsJson = commonItemsScript(meta.items);
    return `<!DOCTYPE html><html lang="id"><head>${commonHead(title, meta.slug)}
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Great+Vibes&family=Inter:wght@300;400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--pink:#f5b8c5;--pink-soft:#ffe2ea;--pink-deep:#e895a6;--blue:#bcdcf0;--blue-soft:#e6f3fb;--blue-deep:#85bedb;--ink:#3d2a35;--ink-soft:#7a6571}
html,body{background:#fdfaf7;color:var(--ink);font-family:'Inter',sans-serif;min-height:100%;overflow-x:hidden}
a{color:inherit;text-decoration:none}
.bg{position:fixed;inset:0;background:radial-gradient(1100px 800px at 85% -5%,var(--pink-soft) 0%,transparent 55%),radial-gradient(900px 700px at -5% 105%,var(--blue-soft) 0%,transparent 55%),linear-gradient(180deg,#fdfaf7 0%,#fffdfb 100%);z-index:-3}
.petals{position:fixed;inset:0;overflow:hidden;z-index:-1;pointer-events:none}
.petal{position:absolute;top:-40px;width:22px;height:22px;opacity:.7;animation:fall linear infinite;filter:drop-shadow(0 2px 6px rgba(232,149,166,.35))}
@keyframes fall{0%{transform:translate3d(0,-10vh,0) rotate(0)}100%{transform:translate3d(var(--dx,40px),110vh,0) rotate(720deg)}}
header{padding:80px 24px 40px;text-align:center;animation:fadeDown 1.2s ease}
@keyframes fadeDown{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}
.ornament{font-family:'Great Vibes',cursive;color:var(--pink-deep);font-size:32px}
h1{font-family:'Cormorant Garamond',serif;font-weight:600;font-size:clamp(42px,8vw,84px);line-height:1.05;margin:14px 0 10px;background:linear-gradient(135deg,var(--pink-deep) 0%,var(--blue-deep) 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{font-family:'Cormorant Garamond',serif;font-style:italic;color:var(--ink-soft);font-size:19px}
.date-badge{display:inline-block;margin-top:18px;padding:8px 24px;border-radius:999px;background:linear-gradient(135deg,var(--pink-soft),var(--blue-soft));color:var(--ink);font-family:'Cormorant Garamond',serif;font-size:16px;letter-spacing:1.5px;border:1px solid rgba(232,149,166,.2)}
.divider{display:flex;align-items:center;justify-content:center;gap:14px;margin:24px auto 0;max-width:520px}
.divider .line{flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--pink) 30%,var(--blue) 70%,transparent)}
.divider .flower{font-size:22px;color:var(--pink-deep);animation:spin 18s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.meta{margin-top:14px;color:var(--ink-soft);font-size:14px}
.actions{margin-top:28px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;padding:13px 26px;border-radius:999px;border:1px solid #00000010;background:#fff;color:var(--ink);font-weight:500;cursor:pointer;transition:all .25s;font-size:14px;box-shadow:0 4px 16px -8px rgba(232,149,166,.4)}
.btn:hover{transform:translateY(-2px);box-shadow:0 10px 28px -8px rgba(232,149,166,.6)}
.btn.primary{background:linear-gradient(135deg,var(--pink) 0%,var(--blue) 100%);color:#fff;border-color:transparent;box-shadow:0 6px 20px -6px rgba(232,149,166,.6)}
main{max-width:1300px;margin:30px auto 60px;padding:0 12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:6px}
@media(max-width:560px){.grid{grid-template-columns:repeat(3,1fr);gap:4px}}
@media(max-width:380px){.grid{grid-template-columns:repeat(2,1fr)}}
.card{position:relative;border-radius:8px;overflow:hidden;background:#f3eef0;cursor:pointer;aspect-ratio:1/1;opacity:0;transform:scale(.95) translateY(20px);transition:opacity .6s ease var(--d,0s),transform .6s ease var(--d,0s),box-shadow .25s}
.card.in{opacity:1;transform:scale(1) translateY(0)}
.card:hover{box-shadow:0 12px 28px -8px rgba(133,190,219,.5);z-index:2}
.card img,.card video{width:100%;height:100%;object-fit:cover;display:block;transition:transform .5s ease}
.card:hover img,.card:hover video{transform:scale(1.08)}
.badge{position:absolute;top:8px;left:8px;background:linear-gradient(135deg,var(--pink),var(--blue));color:#fff;font-size:11px;padding:3px 8px;border-radius:999px;font-weight:600}
.lb{position:fixed;inset:0;background:rgba(40,28,38,.92);backdrop-filter:blur(14px);display:none;align-items:center;justify-content:center;z-index:50;padding:20px}
.lb.open{display:flex;animation:fade .3s}
@keyframes fade{from{opacity:0}to{opacity:1}}
.lb-inner{max-width:95vw;max-height:88vh;display:flex;align-items:center;justify-content:center}
.lb img,.lb video{max-width:95vw;max-height:88vh;border-radius:12px;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.lb-close,.lb-prev,.lb-next,.lb-dl{position:absolute;background:rgba(255,255,255,.95);color:var(--ink);border:none;width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:20px;transition:all .2s;z-index:2;box-shadow:0 6px 20px rgba(0,0,0,.3)}
.lb-close:hover,.lb-dl:hover{background:linear-gradient(135deg,var(--pink),var(--blue));color:#fff;transform:scale(1.1)}
.lb-prev:hover,.lb-next:hover{background:linear-gradient(135deg,var(--pink),var(--blue));color:#fff}
.lb-close{top:20px;right:20px}.lb-dl{top:20px;right:80px}.lb-prev{left:20px;top:50%;transform:translateY(-50%)}.lb-next{right:20px;top:50%;transform:translateY(-50%)}.lb-prev:hover,.lb-next:hover{transform:translateY(-50%) scale(1.1)}
.counter{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);font-family:'Cormorant Garamond',serif;color:#fff;font-size:14px;background:rgba(255,255,255,.18);padding:8px 18px;border-radius:999px;backdrop-filter:blur(6px)}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#fff;color:var(--ink);padding:12px 22px;border-radius:999px;font-size:13px;opacity:0;transition:opacity .3s;z-index:60;pointer-events:none;box-shadow:0 10px 30px rgba(232,149,166,.4)}
.toast.show{opacity:1}
.quote-section{max-width:780px;margin:60px auto 30px;padding:0 30px;text-align:center;position:relative}
.quote-section::before,.quote-section::after{content:'';position:absolute;left:50%;width:160px;height:1px;background:linear-gradient(90deg,transparent,var(--pink),transparent);transform:translateX(-50%)}
.quote-section::before{top:-20px}.quote-section::after{bottom:-20px;background:linear-gradient(90deg,transparent,var(--blue),transparent)}
.quote-label{font-family:'Great Vibes',cursive;color:var(--pink-deep);font-size:34px;margin-bottom:22px}
.quote-box{position:relative;min-height:180px;display:flex;align-items:center;justify-content:center}
.quote{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity 1.2s ease;padding:0 20px}
.quote.active{opacity:1}
.quote .text{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:clamp(18px,2.4vw,22px);line-height:1.7;color:var(--ink);max-width:680px}
.quote .src{margin-top:14px;font-family:'Cormorant Garamond',serif;color:var(--blue-deep);font-size:13px;letter-spacing:2px;text-transform:uppercase}
.prayer{max-width:820px;margin:60px auto 20px;padding:48px 32px;text-align:center;border-radius:24px;background:linear-gradient(135deg,#fff 0%,var(--pink-soft) 50%,var(--blue-soft) 100%);position:relative;overflow:hidden;box-shadow:0 20px 60px -20px rgba(232,149,166,.3)}
.prayer::before{content:'✿';position:absolute;top:18px;left:50%;transform:translateX(-50%);font-size:28px;color:var(--pink-deep);animation:spin 22s linear infinite}
.prayer h2{font-family:'Great Vibes',cursive;color:var(--pink-deep);font-size:48px;margin:20px 0 22px;font-weight:400}
.prayer p{font-family:'Cormorant Garamond',serif;font-size:18px;line-height:1.95;color:var(--ink);font-style:italic}
.prayer .amin{margin-top:22px;font-family:'Great Vibes',cursive;background:linear-gradient(135deg,var(--pink-deep),var(--blue-deep));-webkit-background-clip:text;background-clip:text;color:transparent;font-size:38px}
footer{text-align:center;padding:50px 20px 60px;color:var(--ink-soft);font-family:'Cormorant Garamond',serif;font-style:italic;font-size:15px;line-height:1.7}
footer .heart{color:var(--pink-deep);animation:beat 1.6s ease-in-out infinite;display:inline-block}
@keyframes beat{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}
</style></head><body>
<div class="bg"></div><div class="petals" id="petals"></div>
<header>
  <div class="ornament">~ Forever &amp; Always ~</div>
  <h1>${title}</h1>
  <div class="sub">Sebuah kenangan abadi, dirajut dalam kelopak edelweiss</div>
  ${dateStr ? `<div class="date-badge">📅 ${dateStr}</div>` : ''}
  <div class="divider"><div class="line"></div><div class="flower">✿</div><div class="line"></div></div>
  <div class="meta">${meta.items.length} kenangan</div>
  <div class="actions"><a class="btn primary" href="album.zip">⬇ Unduh Semua (.zip)</a><button class="btn" onclick="copyLink()">🔗 Salin Tautan</button></div>
</header>
<section class="quote-section"><div class="quote-label">~ Doa &amp; Kata Cinta ~</div><div class="quote-box" id="quoteBox"></div></section>
<main><div class="grid" id="grid"></div></main>
<section class="prayer"><h2>Doa untuk Sang Kekasih</h2><p>Ya Rabb, Engkau yang menyatukan hati kami dalam ikatan suci ini —<br>jadikanlah ia separuh jiwa yang menenangkan, pelindung yang menguatkan,<br>dan teman seperjalanan menuju surga-Mu.<br><br>Limpahkanlah kami sakinah, mawaddah, wa rahmah.</p><div class="amin">~ Aamiin Yaa Rabbal 'Aalamiin ~</div></section>
<div class="lb" id="lb"><button class="lb-close" onclick="closeLb()">✕</button><a class="lb-dl" id="lbDl" href="#" download>⬇</a><button class="lb-prev" onclick="navLb(-1)">‹</button><button class="lb-next" onclick="navLb(1)">›</button><div class="lb-inner" id="lbInner"></div><div class="counter" id="counter"></div></div>
<footer>"Cintamu adalah doa yang tak pernah putus."<br>Dibuat dengan <span class="heart">❤</span> untuk <em>${title}</em><br><span style="font-size:12px;opacity:.7">Album Abadi · Edelweiss Edition</span></footer>
<div class="toast" id="toast">Tautan disalin ✓</div>
<script>
const items=${itemsJson};const quotes=${JSON.stringify(ROMANTIC_QUOTES)};
${COMMON_JS}
buildGrid(items,'grid',openLb);
setupLightbox(items,document.getElementById('lbInner'),document.getElementById('lbDl'),document.getElementById('counter'),document.getElementById('lb'),document.getElementById('toast'));
setupCopyLink(document.getElementById('toast'));
setupQuotes(quotes);
const petalSvgs=['<svg viewBox="0 0 24 24"><path fill="#ffd1dc" d="M12 2c2 4 6 6 6 10s-3 6-6 10c-3-4-6-6-6-10s4-6 6-10z"/></svg>','<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="#ffd76b"/><g fill="#ffffff"><ellipse cx="12" cy="5" rx="2.5" ry="4"/><ellipse cx="12" cy="19" rx="2.5" ry="4"/><ellipse cx="5" cy="12" rx="4" ry="2.5"/><ellipse cx="19" cy="12" rx="4" ry="2.5"/></g></svg>','<svg viewBox="0 0 24 24"><path fill="#cce8f5" d="M12 3c1.5 3 4 4 4 7a4 4 0 1 1-8 0c0-3 2.5-4 4-7z"/></svg>'];
const wrap=document.getElementById('petals');
for(let i=0;i<24;i++){const p=document.createElement('div');p.className='petal';p.innerHTML=petalSvgs[i%3];const dur=8+Math.random()*12;p.style.left=Math.random()*100+'vw';p.style.animationDuration=dur+'s';p.style.animationDelay=-(Math.random()*dur)+'s';p.style.setProperty('--dx',((Math.random()-.5)*200)+'px');const sz=12+Math.random()*22;p.style.width=sz+'px';p.style.height=sz+'px';wrap.appendChild(p);}
</script></body></html>`;
}

// ============================================================
// TEMPLATE 2: MIDNIGHT GALAXY (dark, stars, constellation)
// ============================================================
function renderGalaxy(meta) {
    const title = escapeHtml(meta.title);
    const dateStr = fmtDate(meta.date);
    const itemsJson = commonItemsScript(meta.items);
    return `<!DOCTYPE html><html lang="id"><head>${commonHead(title, meta.slug)}
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600&family=Cormorant+Garamond:ital,wght@0,400;1,400&family=Inter:wght@300;400&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0a0e27;--bg2:#1a1340;--gold:#ffd76b;--cyan:#7ee5ff;--purple:#b88cff;--pink:#ff9ec7;--ink:#e8ebff;--ink-soft:#a8a8d4}
html,body{background:var(--bg);color:var(--ink);font-family:'Inter',sans-serif;min-height:100%;overflow-x:hidden}
a{color:inherit;text-decoration:none}
.bg{position:fixed;inset:0;background:radial-gradient(1400px 1000px at 70% 0%,#3a1a5e 0%,transparent 60%),radial-gradient(1200px 900px at 0% 100%,#1a3858 0%,transparent 55%),linear-gradient(180deg,#070a1f 0%,#1a1340 100%);z-index:-3}
canvas#stars{position:fixed;inset:0;z-index:-2;pointer-events:none}
.shoot{position:fixed;width:120px;height:1px;background:linear-gradient(90deg,transparent,#fff,transparent);top:20%;animation:shoot 6s linear infinite;z-index:-1;opacity:0}
@keyframes shoot{0%{transform:translateX(-200px) rotate(20deg);opacity:0}10%{opacity:1}60%{opacity:1}100%{transform:translateX(120vw) rotate(20deg);opacity:0}}
header{padding:90px 24px 50px;text-align:center;position:relative}
.ornament{font-family:'Cormorant Garamond',serif;font-style:italic;color:var(--gold);font-size:22px;letter-spacing:6px;text-transform:uppercase;animation:glow 3s ease-in-out infinite}
@keyframes glow{0%,100%{text-shadow:0 0 20px rgba(255,215,107,.4)}50%{text-shadow:0 0 40px rgba(255,215,107,.8)}}
h1{font-family:'Cinzel',serif;font-weight:600;font-size:clamp(42px,8vw,90px);line-height:1.05;margin:18px 0 14px;letter-spacing:2px;background:linear-gradient(180deg,#fff 0%,var(--gold) 50%,var(--purple) 100%);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 60px rgba(184,140,255,.3);animation:glow2 4s ease-in-out infinite}
@keyframes glow2{0%,100%{filter:brightness(1)}50%{filter:brightness(1.15)}}
.sub{font-family:'Cormorant Garamond',serif;font-style:italic;color:var(--ink-soft);font-size:19px;letter-spacing:1px}
.date-badge{display:inline-block;margin-top:20px;padding:10px 28px;border-radius:999px;background:rgba(255,215,107,.08);color:var(--gold);font-family:'Cinzel',serif;font-size:14px;letter-spacing:3px;border:1px solid rgba(255,215,107,.3);text-transform:uppercase;backdrop-filter:blur(10px)}
.divider{display:flex;align-items:center;justify-content:center;gap:14px;margin:26px auto 0;max-width:520px}
.divider .line{flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--gold),transparent)}
.divider .star{font-size:22px;color:var(--gold);animation:twinkle 2s infinite}
@keyframes twinkle{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(1.2)}}
.meta{margin-top:14px;color:var(--ink-soft);font-size:14px;letter-spacing:2px}
.actions{margin-top:28px;display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;border-radius:6px;border:1px solid rgba(255,215,107,.3);background:rgba(255,255,255,.04);color:var(--ink);font-family:'Cinzel',serif;font-size:13px;letter-spacing:2px;cursor:pointer;transition:all .3s;backdrop-filter:blur(10px);text-transform:uppercase}
.btn:hover{background:rgba(255,215,107,.15);border-color:var(--gold);box-shadow:0 0 30px rgba(255,215,107,.4);transform:translateY(-2px)}
.btn.primary{background:linear-gradient(135deg,var(--gold),var(--purple));color:#0a0e27;border:none;font-weight:600}
.btn.primary:hover{box-shadow:0 0 40px rgba(255,215,107,.6)}
main{max-width:1300px;margin:40px auto 60px;padding:0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px}
@media(max-width:560px){.grid{grid-template-columns:repeat(2,1fr);gap:10px}}
.card{position:relative;border-radius:12px;overflow:hidden;background:#0a0e27;cursor:pointer;aspect-ratio:1/1.15;opacity:0;transform:translateY(40px) rotateX(15deg);transition:opacity .8s ease var(--d,0s),transform .8s cubic-bezier(.2,.8,.3,1.2) var(--d,0s),box-shadow .3s;border:1px solid rgba(184,140,255,.2);perspective:800px}
.card.in{opacity:1;transform:translateY(0) rotateX(0)}
.card:hover{box-shadow:0 0 40px rgba(184,140,255,.5),0 0 80px rgba(126,229,255,.2);border-color:var(--cyan);transform:translateY(-6px) scale(1.03);z-index:2}
.card img,.card video{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s,filter .6s;filter:brightness(.92) saturate(1.1)}
.card:hover img,.card:hover video{transform:scale(1.1);filter:brightness(1.05) saturate(1.2)}
.card::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,transparent 60%,rgba(10,14,39,.6) 100%);opacity:0;transition:opacity .3s;pointer-events:none}
.card:hover::after{opacity:1}
.badge{position:absolute;top:10px;left:10px;background:linear-gradient(135deg,var(--gold),var(--pink));color:#0a0e27;font-size:11px;padding:4px 10px;border-radius:4px;font-weight:700;letter-spacing:1px;z-index:1}
.lb{position:fixed;inset:0;background:rgba(7,10,31,.96);backdrop-filter:blur(20px);display:none;align-items:center;justify-content:center;z-index:50;padding:20px}
.lb.open{display:flex;animation:fade .4s}
@keyframes fade{from{opacity:0}to{opacity:1}}
.lb-inner{max-width:95vw;max-height:88vh;display:flex;align-items:center;justify-content:center}
.lb img,.lb video{max-width:95vw;max-height:88vh;border-radius:8px;box-shadow:0 0 100px rgba(184,140,255,.4)}
.lb-close,.lb-prev,.lb-next,.lb-dl{position:absolute;background:rgba(255,255,255,.08);color:var(--gold);border:1px solid rgba(255,215,107,.3);width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:22px;transition:all .25s;z-index:2;backdrop-filter:blur(10px)}
.lb-close:hover,.lb-dl:hover{background:var(--gold);color:#0a0e27;box-shadow:0 0 30px rgba(255,215,107,.6)}
.lb-prev:hover,.lb-next:hover{background:var(--gold);color:#0a0e27}
.lb-close{top:24px;right:24px}.lb-dl{top:24px;right:88px}.lb-prev{left:24px;top:50%;transform:translateY(-50%)}.lb-next{right:24px;top:50%;transform:translateY(-50%)}.lb-prev:hover,.lb-next:hover{transform:translateY(-50%) scale(1.1)}
.counter{position:absolute;bottom:30px;left:50%;transform:translateX(-50%);font-family:'Cinzel',serif;color:var(--gold);font-size:13px;background:rgba(0,0,0,.4);padding:8px 18px;border-radius:4px;letter-spacing:3px;border:1px solid rgba(255,215,107,.3)}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.85);color:var(--gold);padding:12px 24px;border-radius:6px;font-size:13px;letter-spacing:2px;opacity:0;transition:opacity .3s;z-index:60;border:1px solid var(--gold)}
.toast.show{opacity:1}
.quote-section{max-width:780px;margin:80px auto 40px;padding:0 30px;text-align:center}
.quote-label{font-family:'Cinzel',serif;color:var(--gold);font-size:20px;letter-spacing:8px;margin-bottom:30px;text-transform:uppercase}
.quote-box{position:relative;min-height:200px;display:flex;align-items:center;justify-content:center}
.quote{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity 1.4s ease}
.quote.active{opacity:1}
.quote .text{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:clamp(20px,2.6vw,26px);line-height:1.7;color:var(--ink);max-width:680px;text-shadow:0 0 30px rgba(255,215,107,.2)}
.quote .src{margin-top:18px;font-family:'Cinzel',serif;color:var(--gold);font-size:12px;letter-spacing:4px;text-transform:uppercase}
.prayer{max-width:820px;margin:80px auto 30px;padding:50px 36px;text-align:center;border-radius:16px;background:linear-gradient(135deg,rgba(255,215,107,.05),rgba(184,140,255,.08));border:1px solid rgba(255,215,107,.25);position:relative;overflow:hidden;backdrop-filter:blur(20px)}
.prayer::before{content:'✦';position:absolute;top:18px;left:50%;transform:translateX(-50%);font-size:30px;color:var(--gold);animation:twinkle 2s infinite}
.prayer h2{font-family:'Cinzel',serif;color:var(--gold);font-size:32px;letter-spacing:4px;margin:24px 0 22px;text-transform:uppercase;font-weight:600}
.prayer p{font-family:'Cormorant Garamond',serif;font-size:18px;line-height:1.95;color:var(--ink);font-style:italic}
.prayer .amin{margin-top:24px;font-family:'Cinzel',serif;color:var(--purple);font-size:18px;letter-spacing:6px;text-transform:uppercase}
footer{text-align:center;padding:60px 20px 70px;color:var(--ink-soft);font-family:'Cormorant Garamond',serif;font-style:italic;font-size:15px}
footer .heart{color:var(--pink);animation:beat 1.6s infinite;display:inline-block}
@keyframes beat{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}
</style></head><body>
<div class="bg"></div><canvas id="stars"></canvas><div class="shoot"></div><div class="shoot" style="top:55%;animation-delay:-3s"></div>
<header>
  <div class="ornament">~ Eternal Constellation ~</div>
  <h1>${title}</h1>
  <div class="sub">Cintamu adalah bintang yang tak pernah padam</div>
  ${dateStr ? `<div class="date-badge">★ ${dateStr} ★</div>` : ''}
  <div class="divider"><div class="line"></div><div class="star">✦</div><div class="line"></div></div>
  <div class="meta">${meta.items.length} kenangan abadi</div>
  <div class="actions"><a class="btn primary" href="album.zip">⬇ Unduh Semua</a><button class="btn" onclick="copyLink()">🔗 Salin Tautan</button></div>
</header>
<main><div class="grid" id="grid"></div></main>
<section class="quote-section"><div class="quote-label">Whispers of the Stars</div><div class="quote-box" id="quoteBox"></div></section>
<section class="prayer"><h2>Doa di Bawah Langit</h2><p>Ya Rabb, di antara miliaran bintang yang Engkau ciptakan,<br>Engkau pertemukan dua jiwa kami dalam orbit yang sama.<br><br>Jadikan cinta kami sebagai konstelasi yang tak akan pudar,<br>menerangi jalan kami menuju surga-Mu.</p><div class="amin">★ Aamiin ★</div></section>
<div class="lb" id="lb"><button class="lb-close" onclick="closeLb()">✕</button><a class="lb-dl" id="lbDl" href="#" download>⬇</a><button class="lb-prev" onclick="navLb(-1)">‹</button><button class="lb-next" onclick="navLb(1)">›</button><div class="lb-inner" id="lbInner"></div><div class="counter" id="counter"></div></div>
<footer>"Two souls, one constellation, forever shining."<br>Dibuat dengan <span class="heart">❤</span> untuk <em>${title}</em><br><span style="font-size:12px;opacity:.6;letter-spacing:3px">★ MIDNIGHT GALAXY EDITION ★</span></footer>
<div class="toast" id="toast">Tautan disalin ✓</div>
<script>
const items=${itemsJson};const quotes=${JSON.stringify(ROMANTIC_QUOTES)};
${COMMON_JS}
buildGrid(items,'grid',openLb);
setupLightbox(items,document.getElementById('lbInner'),document.getElementById('lbDl'),document.getElementById('counter'),document.getElementById('lb'),document.getElementById('toast'));
setupCopyLink(document.getElementById('toast'));
setupQuotes(quotes);
// Star canvas
const c=document.getElementById('stars');const ctx=c.getContext('2d');
let stars=[];
function resize(){c.width=innerWidth;c.height=innerHeight;stars=[];for(let i=0;i<180;i++)stars.push({x:Math.random()*c.width,y:Math.random()*c.height,r:Math.random()*1.4+.2,o:Math.random()*.6+.3,s:Math.random()*.02+.005,p:Math.random()*Math.PI*2});}
resize();addEventListener('resize',resize);
function tick(){ctx.clearRect(0,0,c.width,c.height);for(const s of stars){s.p+=s.s;const tw=Math.sin(s.p)*.4+.6;ctx.fillStyle='rgba(255,255,255,'+(s.o*tw)+')';ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,Math.PI*2);ctx.fill();if(s.r>1){ctx.fillStyle='rgba(184,140,255,'+(s.o*tw*.4)+')';ctx.beginPath();ctx.arc(s.x,s.y,s.r*3,0,Math.PI*2);ctx.fill();}}requestAnimationFrame(tick);}
tick();
</script></body></html>`;
}

// ============================================================
// TEMPLATE 3: GARDEN BLOOM (pastel green + butterflies)
// ============================================================
function renderGarden(meta) {
    const title = escapeHtml(meta.title);
    const dateStr = fmtDate(meta.date);
    const itemsJson = commonItemsScript(meta.items);
    return `<!DOCTYPE html><html lang="id"><head>${commonHead(title, meta.slug)}
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;600&family=Quicksand:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;1,400&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--green:#a8d5b9;--green-soft:#e3f1e8;--green-deep:#5fa97a;--peach:#ffd4b8;--peach-deep:#ff9d6c;--cream:#fff8f0;--ink:#3d4a3f;--ink-soft:#7a8a7d}
html,body{background:var(--cream);color:var(--ink);font-family:'Quicksand',sans-serif;min-height:100%;overflow-x:hidden}
a{color:inherit;text-decoration:none}
.bg{position:fixed;inset:0;background:radial-gradient(1200px 900px at 0% 0%,var(--green-soft) 0%,transparent 50%),radial-gradient(1100px 800px at 100% 100%,#fde6d8 0%,transparent 55%),linear-gradient(180deg,var(--cream) 0%,#fffcf6 100%);z-index:-3}
.flowers{position:fixed;inset:0;overflow:hidden;z-index:-1;pointer-events:none}
.flower{position:absolute;font-size:24px;animation:floatF linear infinite;opacity:.7}
@keyframes floatF{0%{transform:translate3d(0,-10vh,0) rotate(0)}100%{transform:translate3d(var(--dx,30px),110vh,0) rotate(360deg)}}
.butterfly{position:fixed;width:40px;height:40px;z-index:-1;animation:flyB 25s linear infinite}
@keyframes flyB{0%{transform:translate(-50px,80vh) rotate(-10deg)}25%{transform:translate(30vw,30vh) rotate(15deg)}50%{transform:translate(60vw,60vh) rotate(-5deg)}75%{transform:translate(85vw,20vh) rotate(20deg)}100%{transform:translate(110vw,50vh) rotate(0)}}
.butterfly svg{width:100%;height:100%;animation:flap .3s infinite alternate}
@keyframes flap{from{transform:scaleY(.7)}to{transform:scaleY(1.1)}}
header{padding:80px 24px 40px;text-align:center;animation:fadeUp 1.2s ease}
@keyframes fadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
.ornament{font-family:'Caveat',cursive;color:var(--green-deep);font-size:36px}
h1{font-family:'Playfair Display',serif;font-weight:400;font-style:italic;font-size:clamp(42px,8vw,86px);line-height:1.1;margin:8px 0 12px;color:var(--ink);position:relative;display:inline-block}
h1::before,h1::after{content:'❀';position:absolute;color:var(--peach-deep);font-size:.4em;animation:spin 12s linear infinite}
h1::before{left:-50px;top:50%;transform:translateY(-50%)}h1::after{right:-50px;top:50%;transform:translateY(-50%)}
@keyframes spin{to{transform:translateY(-50%) rotate(360deg)}}
.sub{font-family:'Caveat',cursive;color:var(--ink-soft);font-size:24px;margin-top:8px}
.date-badge{display:inline-block;margin-top:18px;padding:10px 28px;border-radius:999px;background:#fff;color:var(--green-deep);font-family:'Quicksand',sans-serif;font-weight:500;font-size:15px;border:2px dashed var(--green);box-shadow:0 6px 20px -8px rgba(95,169,122,.3)}
.divider{display:flex;align-items:center;justify-content:center;gap:14px;margin:26px auto 0;max-width:520px}
.divider .line{flex:1;height:2px;background:linear-gradient(90deg,transparent,var(--green) 30%,var(--peach) 70%,transparent);border-radius:1px}
.divider .flower{font-size:24px;color:var(--peach-deep)}
.meta{margin-top:14px;color:var(--ink-soft);font-size:14px;font-weight:500}
.actions{margin-top:28px;display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;padding:14px 28px;border-radius:999px;border:none;background:#fff;color:var(--ink);font-weight:500;cursor:pointer;transition:all .3s;font-size:14px;box-shadow:0 6px 20px -8px rgba(95,169,122,.3)}
.btn:hover{transform:translateY(-3px);box-shadow:0 12px 28px -8px rgba(95,169,122,.5)}
.btn.primary{background:linear-gradient(135deg,var(--green-deep),var(--peach-deep));color:#fff;box-shadow:0 8px 24px -6px rgba(95,169,122,.5)}
main{max-width:1300px;margin:40px auto 60px;padding:0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:18px}
@media(max-width:560px){.grid{grid-template-columns:repeat(2,1fr);gap:12px}}
.card{position:relative;border-radius:24px;overflow:hidden;background:#fff;cursor:pointer;aspect-ratio:1/1.1;opacity:0;transform:translateY(40px) scale(.9);transition:opacity .7s ease var(--d,0s),transform .7s cubic-bezier(.2,.8,.3,1.3) var(--d,0s),box-shadow .3s;padding:8px;box-shadow:0 6px 20px -8px rgba(95,169,122,.2)}
.card.in{opacity:1;transform:translateY(0) scale(1)}
.card:hover{box-shadow:0 16px 40px -8px rgba(255,157,108,.4);transform:translateY(-6px) rotate(-1deg);z-index:2}
.card img,.card video{width:100%;height:100%;object-fit:cover;display:block;border-radius:18px;transition:transform .5s}
.card:hover img,.card:hover video{transform:scale(1.05)}
.badge{position:absolute;top:14px;left:14px;background:linear-gradient(135deg,var(--green-deep),var(--peach-deep));color:#fff;font-size:11px;padding:4px 10px;border-radius:999px;font-weight:600;z-index:1}
.lb{position:fixed;inset:0;background:rgba(40,55,42,.92);backdrop-filter:blur(14px);display:none;align-items:center;justify-content:center;z-index:50;padding:20px}
.lb.open{display:flex;animation:fade .3s}
@keyframes fade{from{opacity:0}to{opacity:1}}
.lb-inner{max-width:95vw;max-height:88vh;display:flex;align-items:center;justify-content:center}
.lb img,.lb video{max-width:95vw;max-height:88vh;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.lb-close,.lb-prev,.lb-next,.lb-dl{position:absolute;background:#fff;color:var(--ink);border:none;width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:22px;transition:all .2s;z-index:2;box-shadow:0 6px 20px rgba(0,0,0,.25)}
.lb-close:hover,.lb-dl:hover,.lb-prev:hover,.lb-next:hover{background:var(--peach-deep);color:#fff;transform:scale(1.1)}
.lb-prev:hover,.lb-next:hover{transform:translateY(-50%) scale(1.1)}
.lb-close{top:24px;right:24px}.lb-dl{top:24px;right:88px}.lb-prev{left:24px;top:50%;transform:translateY(-50%)}.lb-next{right:24px;top:50%;transform:translateY(-50%)}
.counter{position:absolute;bottom:30px;left:50%;transform:translateX(-50%);font-family:'Caveat',cursive;color:#fff;font-size:18px;background:rgba(255,255,255,.18);padding:8px 22px;border-radius:999px;backdrop-filter:blur(6px)}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#fff;color:var(--ink);padding:12px 24px;border-radius:999px;font-size:13px;opacity:0;transition:opacity .3s;z-index:60;box-shadow:0 10px 30px rgba(95,169,122,.3)}
.toast.show{opacity:1}
.quote-section{max-width:780px;margin:70px auto 30px;padding:0 30px;text-align:center;position:relative}
.quote-label{font-family:'Caveat',cursive;color:var(--green-deep);font-size:38px;margin-bottom:24px}
.quote-box{position:relative;min-height:180px;display:flex;align-items:center;justify-content:center}
.quote{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity 1.2s}
.quote.active{opacity:1}
.quote .text{font-family:'Playfair Display',serif;font-style:italic;font-size:clamp(19px,2.5vw,24px);line-height:1.7;color:var(--ink);max-width:680px}
.quote .src{margin-top:14px;font-family:'Caveat',cursive;color:var(--peach-deep);font-size:18px}
.prayer{max-width:820px;margin:70px auto 30px;padding:50px 36px;text-align:center;border-radius:32px;background:linear-gradient(135deg,#fff,var(--green-soft));position:relative;overflow:hidden;box-shadow:0 20px 60px -20px rgba(95,169,122,.3);border:2px dashed rgba(95,169,122,.2)}
.prayer::before,.prayer::after{content:'❀';position:absolute;font-size:32px;color:var(--peach-deep);animation:spin 14s linear infinite}
.prayer::before{top:14px;left:24px}.prayer::after{top:14px;right:24px;animation-direction:reverse}
.prayer h2{font-family:'Caveat',cursive;color:var(--green-deep);font-size:46px;margin:8px 0 22px;font-weight:600}
.prayer p{font-family:'Playfair Display',serif;font-size:18px;line-height:1.95;color:var(--ink);font-style:italic}
.prayer .amin{margin-top:22px;font-family:'Caveat',cursive;color:var(--peach-deep);font-size:36px;font-weight:600}
footer{text-align:center;padding:50px 20px 60px;color:var(--ink-soft);font-family:'Caveat',cursive;font-size:22px}
footer .heart{color:var(--peach-deep);animation:beat 1.6s infinite;display:inline-block}
@keyframes beat{0%,100%{transform:scale(1)}50%{transform:scale(1.25)}}
</style></head><body>
<div class="bg"></div><div class="flowers" id="flowers"></div>
<div class="butterfly" style="animation-delay:-2s"><svg viewBox="0 0 40 40"><g fill="#ff9d6c" stroke="#3d4a3f" stroke-width=".5"><ellipse cx="13" cy="14" rx="10" ry="7"/><ellipse cx="27" cy="14" rx="10" ry="7"/><ellipse cx="13" cy="26" rx="9" ry="6"/><ellipse cx="27" cy="26" rx="9" ry="6"/></g><line x1="20" y1="6" x2="20" y2="34" stroke="#3d4a3f" stroke-width="1.5"/></svg></div>
<div class="butterfly" style="animation-delay:-12s;animation-duration:30s"><svg viewBox="0 0 40 40"><g fill="#a8d5b9" stroke="#3d4a3f" stroke-width=".5"><ellipse cx="13" cy="14" rx="10" ry="7"/><ellipse cx="27" cy="14" rx="10" ry="7"/><ellipse cx="13" cy="26" rx="9" ry="6"/><ellipse cx="27" cy="26" rx="9" ry="6"/></g><line x1="20" y1="6" x2="20" y2="34" stroke="#3d4a3f" stroke-width="1.5"/></svg></div>
<header>
  <div class="ornament">~ in our garden of love ~</div>
  <h1>${title}</h1>
  <div class="sub">cinta yang mekar di taman hati</div>
  ${dateStr ? `<div class="date-badge">🌿 ${dateStr}</div>` : ''}
  <div class="divider"><div class="line"></div><div class="flower">❀</div><div class="line"></div></div>
  <div class="meta">${meta.items.length} kenangan mekar</div>
  <div class="actions"><a class="btn primary" href="album.zip">⬇ Unduh Semua</a><button class="btn" onclick="copyLink()">🔗 Salin Tautan</button></div>
</header>
<main><div class="grid" id="grid"></div></main>
<section class="quote-section"><div class="quote-label">~ kata cinta ~</div><div class="quote-box" id="quoteBox"></div></section>
<section class="prayer"><h2>doa di taman cinta</h2><p>Ya Rabb, jadikan rumah kami seperti taman —<br>tempat tumbuh bunga-bunga kasih sayang,<br>tempat berseminya doa-doa indah,<br>tempat kupu-kupu kebahagiaan singgah selamanya.</p><div class="amin">~ Aamiin ~</div></section>
<div class="lb" id="lb"><button class="lb-close" onclick="closeLb()">✕</button><a class="lb-dl" id="lbDl" href="#" download>⬇</a><button class="lb-prev" onclick="navLb(-1)">‹</button><button class="lb-next" onclick="navLb(1)">›</button><div class="lb-inner" id="lbInner"></div><div class="counter" id="counter"></div></div>
<footer>"love grows where it is planted"<br>dibuat dengan <span class="heart">❤</span> untuk <em>${title}</em><br><span style="font-size:13px;opacity:.7">🌿 Garden Bloom Edition 🌿</span></footer>
<div class="toast" id="toast">Tautan disalin ✓</div>
<script>
const items=${itemsJson};const quotes=${JSON.stringify(ROMANTIC_QUOTES)};
${COMMON_JS}
buildGrid(items,'grid',openLb);
setupLightbox(items,document.getElementById('lbInner'),document.getElementById('lbDl'),document.getElementById('counter'),document.getElementById('lb'),document.getElementById('toast'));
setupCopyLink(document.getElementById('toast'));
setupQuotes(quotes);
const flowerEmojis=['❀','✿','🌸','🌼','🌷'];
const fwrap=document.getElementById('flowers');
for(let i=0;i<20;i++){const f=document.createElement('div');f.className='flower';f.textContent=flowerEmojis[i%5];const dur=12+Math.random()*15;f.style.left=Math.random()*100+'vw';f.style.fontSize=(18+Math.random()*16)+'px';f.style.color=['#a8d5b9','#ff9d6c','#ffd4b8','#5fa97a'][i%4];f.style.animationDuration=dur+'s';f.style.animationDelay=-(Math.random()*dur)+'s';f.style.setProperty('--dx',((Math.random()-.5)*150)+'px');fwrap.appendChild(f);}
</script></body></html>`;
}

// ============================================================
// TEMPLATE 4: SAKURA DREAMS (Japanese aesthetic)
// ============================================================
function renderSakura(meta) {
    const title = escapeHtml(meta.title);
    const dateStr = fmtDate(meta.date);
    const itemsJson = commonItemsScript(meta.items);
    return `<!DOCTYPE html><html lang="id"><head>${commonHead(title, meta.slug)}
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+JP:wght@300;400;600&family=Cormorant+Garamond:ital,wght@0,400;1,400&family=Sawarabi+Mincho&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--sakura:#ffb7c5;--sakura-deep:#e87a96;--sakura-soft:#ffe4eb;--ink:#2c2028;--ink-soft:#7a6a72;--paper:#fff9f7;--gold:#c4a26a}
html,body{background:var(--paper);color:var(--ink);font-family:'Sawarabi Mincho','Noto Serif JP',serif;min-height:100%;overflow-x:hidden}
a{color:inherit;text-decoration:none}
.bg{position:fixed;inset:0;background:radial-gradient(900px 700px at 50% 0%,var(--sakura-soft) 0%,transparent 60%),linear-gradient(180deg,var(--paper) 0%,#fffafb 100%);z-index:-3}
.bg::after{content:'';position:fixed;inset:0;background-image:radial-gradient(circle at 20% 30%,rgba(255,183,197,.08) 1px,transparent 2px),radial-gradient(circle at 70% 60%,rgba(255,183,197,.06) 1px,transparent 2px);background-size:60px 60px,80px 80px;pointer-events:none;z-index:-2}
.petals{position:fixed;inset:0;overflow:hidden;z-index:-1;pointer-events:none}
.petal{position:absolute;width:18px;height:18px;background:radial-gradient(circle,var(--sakura) 30%,var(--sakura-deep) 100%);border-radius:50% 0 50% 0;animation:sakuraFall linear infinite;opacity:.85;filter:drop-shadow(0 1px 2px rgba(232,122,150,.3))}
@keyframes sakuraFall{0%{transform:translate3d(0,-10vh,0) rotate(0)}50%{transform:translate3d(calc(var(--dx,40px)/2),50vh,0) rotate(360deg)}100%{transform:translate3d(var(--dx,40px),110vh,0) rotate(720deg)}}
header{padding:80px 24px 40px;text-align:center;animation:fadeIn 1.5s ease}
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
.ornament{font-family:'Noto Serif JP',serif;color:var(--sakura-deep);font-size:18px;letter-spacing:8px;writing-mode:horizontal-tb}
.ornament::before,.ornament::after{content:'';display:inline-block;width:60px;height:1px;background:var(--sakura-deep);vertical-align:middle;margin:0 14px}
h1{font-family:'Noto Serif JP',serif;font-weight:600;font-size:clamp(40px,8vw,80px);line-height:1.15;margin:18px 0 12px;color:var(--ink);position:relative}
h1::after{content:'';position:absolute;bottom:-12px;left:50%;transform:translateX(-50%);width:80px;height:2px;background:linear-gradient(90deg,transparent,var(--sakura-deep),transparent)}
.sub{font-family:'Cormorant Garamond',serif;font-style:italic;color:var(--ink-soft);font-size:18px;margin-top:24px;letter-spacing:1px}
.date-badge{display:inline-block;margin-top:22px;padding:10px 28px;background:#fff;color:var(--ink);font-family:'Noto Serif JP',serif;font-size:15px;letter-spacing:3px;border:1px solid var(--sakura);border-radius:0;position:relative}
.date-badge::before,.date-badge::after{content:'';position:absolute;width:8px;height:8px;border:1px solid var(--sakura-deep)}
.date-badge::before{top:-4px;left:-4px;border-right:none;border-bottom:none}
.date-badge::after{bottom:-4px;right:-4px;border-left:none;border-top:none}
.divider{display:flex;align-items:center;justify-content:center;gap:14px;margin:28px auto 0;max-width:480px}
.divider .line{flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--sakura-deep),transparent)}
.divider .flower{font-size:22px;color:var(--sakura-deep);animation:floatY 4s ease-in-out infinite}
@keyframes floatY{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
.meta{margin-top:14px;color:var(--ink-soft);font-size:13px;letter-spacing:4px}
.actions{margin-top:30px;display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;padding:13px 28px;border-radius:0;border:1px solid var(--ink);background:transparent;color:var(--ink);font-family:'Noto Serif JP',serif;font-weight:400;cursor:pointer;transition:all .3s;font-size:13px;letter-spacing:3px;position:relative;overflow:hidden}
.btn::before{content:'';position:absolute;inset:0;background:var(--sakura-deep);transform:translateX(-101%);transition:transform .4s ease;z-index:-1}
.btn:hover{color:#fff;border-color:var(--sakura-deep)}
.btn:hover::before{transform:translateX(0)}
.btn.primary{background:var(--ink);color:#fff;border-color:var(--ink)}
.btn.primary::before{background:var(--sakura-deep)}
.btn.primary:hover{border-color:var(--sakura-deep)}
main{max-width:1300px;margin:50px auto 60px;padding:0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
@media(max-width:560px){.grid{grid-template-columns:repeat(2,1fr);gap:8px}}
.card{position:relative;overflow:hidden;background:#fff;cursor:pointer;aspect-ratio:3/4;opacity:0;transform:translateY(40px);transition:opacity .8s ease var(--d,0s),transform .8s ease var(--d,0s),box-shadow .3s;border:1px solid rgba(0,0,0,.08);padding:6px}
.card.in{opacity:1;transform:translateY(0)}
.card:hover{box-shadow:0 16px 36px -10px rgba(232,122,150,.4);border-color:var(--sakura-deep)}
.card img,.card video{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s,filter .6s;filter:saturate(.95)}
.card:hover img,.card:hover video{transform:scale(1.06);filter:saturate(1.1)}
.badge{position:absolute;top:14px;left:14px;background:var(--ink);color:#fff;font-size:10px;padding:4px 10px;font-family:'Noto Serif JP',serif;letter-spacing:2px;z-index:1}
.lb{position:fixed;inset:0;background:rgba(44,32,40,.94);backdrop-filter:blur(14px);display:none;align-items:center;justify-content:center;z-index:50;padding:20px}
.lb.open{display:flex;animation:fade .3s}
@keyframes fade{from{opacity:0}to{opacity:1}}
.lb-inner{max-width:95vw;max-height:88vh;display:flex;align-items:center;justify-content:center}
.lb img,.lb video{max-width:95vw;max-height:88vh;box-shadow:0 30px 80px rgba(0,0,0,.5);border:6px solid #fff}
.lb-close,.lb-prev,.lb-next,.lb-dl{position:absolute;background:#fff;color:var(--ink);border:none;width:50px;height:50px;border-radius:0;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:20px;transition:all .25s;z-index:2}
.lb-close:hover,.lb-dl:hover,.lb-prev:hover,.lb-next:hover{background:var(--sakura-deep);color:#fff}
.lb-close{top:24px;right:24px}.lb-dl{top:24px;right:84px}.lb-prev{left:24px;top:50%;transform:translateY(-50%)}.lb-next{right:24px;top:50%;transform:translateY(-50%)}
.counter{position:absolute;bottom:30px;left:50%;transform:translateX(-50%);font-family:'Noto Serif JP',serif;color:#fff;font-size:13px;letter-spacing:6px;background:transparent;padding:8px 18px}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;padding:12px 26px;font-size:12px;letter-spacing:3px;opacity:0;transition:opacity .3s;z-index:60}
.toast.show{opacity:1}
.quote-section{max-width:760px;margin:80px auto 40px;padding:0 30px;text-align:center}
.quote-label{font-family:'Noto Serif JP',serif;color:var(--sakura-deep);font-size:14px;letter-spacing:10px;margin-bottom:30px;text-transform:uppercase}
.quote-box{position:relative;min-height:200px;display:flex;align-items:center;justify-content:center}
.quote{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity 1.4s}
.quote.active{opacity:1}
.quote .text{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:clamp(20px,2.6vw,26px);line-height:1.8;color:var(--ink);max-width:680px}
.quote .src{margin-top:18px;font-family:'Noto Serif JP',serif;color:var(--sakura-deep);font-size:11px;letter-spacing:5px;text-transform:uppercase}
.prayer{max-width:780px;margin:80px auto 30px;padding:50px 38px;text-align:center;background:#fff;border:1px solid var(--sakura);position:relative;box-shadow:0 20px 60px -20px rgba(232,122,150,.25)}
.prayer::before,.prayer::after{content:'';position:absolute;width:30px;height:30px;border:2px solid var(--sakura-deep)}
.prayer::before{top:-2px;left:-2px;border-right:none;border-bottom:none}
.prayer::after{bottom:-2px;right:-2px;border-left:none;border-top:none}
.prayer h2{font-family:'Noto Serif JP',serif;color:var(--ink);font-size:28px;letter-spacing:4px;margin:8px 0 24px;font-weight:600}
.prayer p{font-family:'Cormorant Garamond',serif;font-size:18px;line-height:2;color:var(--ink);font-style:italic}
.prayer .amin{margin-top:24px;font-family:'Noto Serif JP',serif;color:var(--sakura-deep);font-size:14px;letter-spacing:8px;text-transform:uppercase}
footer{text-align:center;padding:60px 20px 70px;color:var(--ink-soft);font-family:'Cormorant Garamond',serif;font-style:italic;font-size:15px;line-height:1.8}
footer .heart{color:var(--sakura-deep);animation:beat 1.6s infinite;display:inline-block}
@keyframes beat{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}
</style></head><body>
<div class="bg"></div><div class="petals" id="petals"></div>
<header>
  <div class="ornament">桜 SAKURA DREAMS 桜</div>
  <h1>${title}</h1>
  <div class="sub">cinta yang lembut bagai kelopak sakura</div>
  ${dateStr ? `<div class="date-badge">${dateStr}</div>` : ''}
  <div class="divider"><div class="line"></div><div class="flower">❀</div><div class="line"></div></div>
  <div class="meta">${meta.items.length} K E N A N G A N</div>
  <div class="actions"><a class="btn primary" href="album.zip">⬇ UNDUH SEMUA</a><button class="btn" onclick="copyLink()">🔗 SALIN TAUTAN</button></div>
</header>
<main><div class="grid" id="grid"></div></main>
<section class="quote-section"><div class="quote-label">愛 LOVE WHISPERS 愛</div><div class="quote-box" id="quoteBox"></div></section>
<section class="prayer"><h2>祈り · Doa Cinta</h2><p>Seperti kelopak sakura yang gugur dengan anggun,<br>biarlah cinta kami abadi dalam keindahannya.<br>Sebentar di dunia, namun selamanya dalam hati.</p><div class="amin">A A M I I N</div></section>
<div class="lb" id="lb"><button class="lb-close" onclick="closeLb()">✕</button><a class="lb-dl" id="lbDl" href="#" download>⬇</a><button class="lb-prev" onclick="navLb(-1)">‹</button><button class="lb-next" onclick="navLb(1)">›</button><div class="lb-inner" id="lbInner"></div><div class="counter" id="counter"></div></div>
<footer>"hana wa sakuragi, hito wa ${title}"<br>dibuat dengan <span class="heart">❤</span> untuk kalian berdua<br><span style="font-size:11px;opacity:.6;letter-spacing:5px">桜 SAKURA EDITION 桜</span></footer>
<div class="toast" id="toast">TAUTAN DISALIN</div>
<script>
const items=${itemsJson};const quotes=${JSON.stringify(ROMANTIC_QUOTES)};
${COMMON_JS}
buildGrid(items,'grid',openLb);
setupLightbox(items,document.getElementById('lbInner'),document.getElementById('lbDl'),document.getElementById('counter'),document.getElementById('lb'),document.getElementById('toast'));
setupCopyLink(document.getElementById('toast'));
setupQuotes(quotes);
const wrap=document.getElementById('petals');
for(let i=0;i<28;i++){const p=document.createElement('div');p.className='petal';const dur=10+Math.random()*15;p.style.left=Math.random()*100+'vw';p.style.top=-(Math.random()*30)+'vh';p.style.animationDuration=dur+'s';p.style.animationDelay=-(Math.random()*dur)+'s';p.style.setProperty('--dx',((Math.random()-.5)*250)+'px');const sz=10+Math.random()*16;p.style.width=sz+'px';p.style.height=sz+'px';wrap.appendChild(p);}
</script></body></html>`;
}

// ============================================================
// TEMPLATE 5: ROYAL GOLD (luxury cream + gold + dark)
// ============================================================
function renderRoyal(meta) {
    const title = escapeHtml(meta.title);
    const dateStr = fmtDate(meta.date);
    const itemsJson = commonItemsScript(meta.items);
    return `<!DOCTYPE html><html lang="id"><head>${commonHead(title, meta.slug)}
<link href="https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@400;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Italianno&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--cream:#fbf6e9;--cream-deep:#f0e6c8;--gold:#c9a86a;--gold-deep:#9c7a3e;--gold-light:#e6cf94;--ink:#2a1810;--ink-soft:#6e5440;--burgundy:#5a2030}
html,body{background:var(--cream);color:var(--ink);font-family:'Cormorant Garamond',serif;min-height:100%;overflow-x:hidden}
a{color:inherit;text-decoration:none}
.bg{position:fixed;inset:0;background:radial-gradient(1200px 900px at 50% -10%,var(--cream-deep) 0%,transparent 55%),linear-gradient(180deg,var(--cream) 0%,#f5ecd2 100%);z-index:-3}
.bg::after{content:'';position:fixed;inset:0;background-image:radial-gradient(circle at 25% 25%,rgba(201,168,106,.04) 1px,transparent 1px),radial-gradient(circle at 75% 75%,rgba(201,168,106,.04) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:-2}
.sparkles{position:fixed;inset:0;overflow:hidden;z-index:-1;pointer-events:none}
.sparkle{position:absolute;width:8px;height:8px;background:radial-gradient(circle,var(--gold-light) 0%,transparent 70%);animation:sparkle 4s ease-in-out infinite;opacity:0}
@keyframes sparkle{0%,100%{opacity:0;transform:scale(.5)}50%{opacity:1;transform:scale(1.5)}}
.frame-corner{position:fixed;width:100px;height:100px;pointer-events:none;z-index:1;opacity:.6}
.frame-corner svg{width:100%;height:100%;stroke:var(--gold-deep);fill:none;stroke-width:1.5}
.fc-tl{top:14px;left:14px}
.fc-tr{top:14px;right:14px;transform:scaleX(-1)}
.fc-bl{bottom:14px;left:14px;transform:scaleY(-1)}
.fc-br{bottom:14px;right:14px;transform:scale(-1)}
header{padding:90px 24px 50px;text-align:center;position:relative;animation:fadeIn 1.5s ease}
@keyframes fadeIn{from{opacity:0;transform:translateY(-20px)}to{opacity:1;transform:translateY(0)}}
.crown{font-size:48px;color:var(--gold);animation:shine 3s ease-in-out infinite;display:inline-block}
@keyframes shine{0%,100%{filter:drop-shadow(0 0 10px rgba(201,168,106,.4))}50%{filter:drop-shadow(0 0 25px rgba(201,168,106,.9))}}
.ornament{font-family:'Italianno',cursive;color:var(--gold-deep);font-size:42px;margin-top:8px;line-height:1}
h1{font-family:'Cinzel Decorative',serif;font-weight:700;font-size:clamp(38px,7vw,80px);line-height:1.1;margin:18px 0 14px;letter-spacing:1px;background:linear-gradient(180deg,var(--gold-deep) 0%,var(--gold) 50%,var(--gold-deep) 100%);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 2px 20px rgba(201,168,106,.2)}
.sub{font-family:'Italianno',cursive;color:var(--ink-soft);font-size:32px;margin-top:6px;line-height:1}
.date-badge{display:inline-block;margin-top:22px;padding:10px 32px;background:transparent;color:var(--gold-deep);font-family:'Cinzel Decorative',serif;font-size:13px;letter-spacing:5px;border-top:1px solid var(--gold);border-bottom:1px solid var(--gold);text-transform:uppercase}
.divider{display:flex;align-items:center;justify-content:center;gap:14px;margin:30px auto 0;max-width:520px}
.divider .line{flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--gold),transparent)}
.divider .gem{font-size:22px;color:var(--gold-deep)}
.meta{margin-top:14px;color:var(--ink-soft);font-size:14px;letter-spacing:4px;text-transform:uppercase}
.actions{margin-top:32px;display:flex;gap:16px;justify-content:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;gap:8px;padding:14px 32px;border-radius:0;border:1px solid var(--gold);background:transparent;color:var(--ink);font-family:'Cinzel Decorative',serif;font-weight:400;cursor:pointer;transition:all .3s;font-size:12px;letter-spacing:3px;position:relative;text-transform:uppercase}
.btn:hover{background:var(--gold);color:var(--cream);box-shadow:0 8px 24px -8px rgba(201,168,106,.5);transform:translateY(-2px)}
.btn.primary{background:linear-gradient(135deg,var(--gold-deep),var(--gold));color:var(--cream);border-color:var(--gold-deep);font-weight:700}
.btn.primary:hover{background:linear-gradient(135deg,var(--burgundy),var(--gold-deep));border-color:var(--burgundy)}
main{max-width:1300px;margin:50px auto 60px;padding:0 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:18px}
@media(max-width:560px){.grid{grid-template-columns:repeat(2,1fr);gap:12px}}
.card{position:relative;overflow:hidden;background:var(--cream);cursor:pointer;aspect-ratio:1/1.2;opacity:0;transform:translateY(40px);transition:opacity .8s ease var(--d,0s),transform .8s ease var(--d,0s),box-shadow .3s,border-color .3s;padding:8px;border:2px solid var(--gold-light);box-shadow:0 6px 20px -8px rgba(201,168,106,.3)}
.card.in{opacity:1;transform:translateY(0)}
.card:hover{border-color:var(--gold-deep);box-shadow:0 16px 36px -10px rgba(201,168,106,.5),inset 0 0 20px rgba(201,168,106,.15)}
.card img,.card video{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s,filter .6s;filter:sepia(.05) saturate(1.05)}
.card:hover img,.card:hover video{transform:scale(1.06);filter:sepia(.08) saturate(1.15) brightness(1.05)}
.badge{position:absolute;top:14px;left:14px;background:linear-gradient(135deg,var(--gold-deep),var(--gold));color:var(--cream);font-size:10px;padding:4px 10px;font-family:'Cinzel Decorative',serif;letter-spacing:2px;font-weight:700;z-index:1}
.lb{position:fixed;inset:0;background:rgba(42,24,16,.95);backdrop-filter:blur(16px);display:none;align-items:center;justify-content:center;z-index:50;padding:20px}
.lb.open{display:flex;animation:fade .4s}
@keyframes fade{from{opacity:0}to{opacity:1}}
.lb-inner{max-width:95vw;max-height:88vh;display:flex;align-items:center;justify-content:center}
.lb img,.lb video{max-width:95vw;max-height:88vh;box-shadow:0 30px 100px rgba(201,168,106,.4),0 0 0 1px var(--gold);border:8px solid var(--cream);outline:1px solid var(--gold)}
.lb-close,.lb-prev,.lb-next,.lb-dl{position:absolute;background:var(--cream);color:var(--ink);border:1px solid var(--gold);width:50px;height:50px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:22px;transition:all .25s;z-index:2}
.lb-close:hover,.lb-dl:hover{background:var(--gold);color:var(--cream);transform:scale(1.1)}
.lb-prev:hover,.lb-next:hover{background:var(--gold);color:var(--cream);transform:translateY(-50%) scale(1.1)}
.lb-close{top:24px;right:24px}.lb-dl{top:24px;right:88px}.lb-prev{left:24px;top:50%;transform:translateY(-50%)}.lb-next{right:24px;top:50%;transform:translateY(-50%)}
.counter{position:absolute;bottom:30px;left:50%;transform:translateX(-50%);font-family:'Cinzel Decorative',serif;color:var(--gold-light);font-size:12px;letter-spacing:5px;background:rgba(0,0,0,.4);padding:8px 22px;border:1px solid var(--gold-deep)}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--cream);color:var(--ink);padding:13px 28px;font-size:11px;letter-spacing:3px;opacity:0;transition:opacity .3s;z-index:60;border:1px solid var(--gold);text-transform:uppercase;font-family:'Cinzel Decorative',serif}
.toast.show{opacity:1}
.quote-section{max-width:780px;margin:80px auto 40px;padding:0 30px;text-align:center}
.quote-label{font-family:'Italianno',cursive;color:var(--gold-deep);font-size:48px;margin-bottom:24px;line-height:1}
.quote-box{position:relative;min-height:200px;display:flex;align-items:center;justify-content:center}
.quote{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity 1.4s}
.quote.active{opacity:1}
.quote .text{font-family:'Cormorant Garamond',serif;font-style:italic;font-size:clamp(20px,2.6vw,26px);line-height:1.8;color:var(--ink);max-width:680px}
.quote .src{margin-top:18px;font-family:'Cinzel Decorative',serif;color:var(--gold-deep);font-size:11px;letter-spacing:5px;text-transform:uppercase}
.prayer{max-width:820px;margin:80px auto 30px;padding:54px 40px;text-align:center;background:linear-gradient(135deg,var(--cream),var(--cream-deep));position:relative;border:1px solid var(--gold);box-shadow:0 20px 60px -20px rgba(201,168,106,.4)}
.prayer::before{content:'❖';position:absolute;top:18px;left:50%;transform:translateX(-50%);font-size:24px;color:var(--gold-deep);background:var(--cream);padding:0 14px}
.prayer h2{font-family:'Italianno',cursive;color:var(--gold-deep);font-size:54px;margin:18px 0 22px;line-height:1}
.prayer p{font-family:'Cormorant Garamond',serif;font-size:19px;line-height:1.95;color:var(--ink);font-style:italic}
.prayer .amin{margin-top:24px;font-family:'Cinzel Decorative',serif;color:var(--gold-deep);font-size:14px;letter-spacing:8px;text-transform:uppercase}
footer{text-align:center;padding:60px 20px 70px;color:var(--ink-soft);font-family:'Italianno',cursive;font-size:30px;line-height:1.5}
footer .heart{color:var(--burgundy);animation:beat 1.6s infinite;display:inline-block;font-size:24px}
@keyframes beat{0%,100%{transform:scale(1)}50%{transform:scale(1.3)}}
footer small{display:block;font-family:'Cinzel Decorative',serif;font-size:11px;opacity:.7;letter-spacing:5px;margin-top:14px;text-transform:uppercase}
</style></head><body>
<div class="bg"></div><div class="sparkles" id="sparkles"></div>
<div class="frame-corner fc-tl"><svg viewBox="0 0 100 100"><path d="M5 30 Q5 5 30 5 M5 5 L5 50 M5 5 L50 5 M15 15 L40 15 L15 40 Z"/></svg></div>
<div class="frame-corner fc-tr"><svg viewBox="0 0 100 100"><path d="M5 30 Q5 5 30 5 M5 5 L5 50 M5 5 L50 5 M15 15 L40 15 L15 40 Z"/></svg></div>
<div class="frame-corner fc-bl"><svg viewBox="0 0 100 100"><path d="M5 30 Q5 5 30 5 M5 5 L5 50 M5 5 L50 5 M15 15 L40 15 L15 40 Z"/></svg></div>
<div class="frame-corner fc-br"><svg viewBox="0 0 100 100"><path d="M5 30 Q5 5 30 5 M5 5 L5 50 M5 5 L50 5 M15 15 L40 15 L15 40 Z"/></svg></div>
<header>
  <div class="crown">♛</div>
  <div class="ornament">~ Royal Wedding ~</div>
  <h1>${title}</h1>
  <div class="sub">our golden chapter</div>
  ${dateStr ? `<div class="date-badge">${dateStr}</div>` : ''}
  <div class="divider"><div class="line"></div><div class="gem">❖</div><div class="line"></div></div>
  <div class="meta">${meta.items.length} treasured moments</div>
  <div class="actions"><a class="btn primary" href="album.zip">⬇ Unduh Semua</a><button class="btn" onclick="copyLink()">🔗 Salin Tautan</button></div>
</header>
<main><div class="grid" id="grid"></div></main>
<section class="quote-section"><div class="quote-label">Whispers of Gold</div><div class="quote-box" id="quoteBox"></div></section>
<section class="prayer"><h2>doa keluarga kami</h2><p>Ya Rabb, jadikan rumah tangga kami istana cinta —<br>tempat singgasana sakinah, mawaddah, dan rahmah berdiri kokoh.<br>Mahkotai cinta kami dengan keberkahan yang tak pernah pudar.</p><div class="amin">A A M I I N</div></section>
<div class="lb" id="lb"><button class="lb-close" onclick="closeLb()">✕</button><a class="lb-dl" id="lbDl" href="#" download>⬇</a><button class="lb-prev" onclick="navLb(-1)">‹</button><button class="lb-next" onclick="navLb(1)">›</button><div class="lb-inner" id="lbInner"></div><div class="counter" id="counter"></div></div>
<footer>"every love story is beautiful, but ours is gold"<br>dibuat dengan <span class="heart">❤</span> untuk <em>${title}</em><small>♛ ROYAL GOLD EDITION ♛</small></footer>
<div class="toast" id="toast">Tautan disalin</div>
<script>
const items=${itemsJson};const quotes=${JSON.stringify(ROMANTIC_QUOTES)};
${COMMON_JS}
buildGrid(items,'grid',openLb);
setupLightbox(items,document.getElementById('lbInner'),document.getElementById('lbDl'),document.getElementById('counter'),document.getElementById('lb'),document.getElementById('toast'));
setupCopyLink(document.getElementById('toast'));
setupQuotes(quotes);
const sw=document.getElementById('sparkles');
for(let i=0;i<40;i++){const s=document.createElement('div');s.className='sparkle';s.style.left=Math.random()*100+'vw';s.style.top=Math.random()*100+'vh';s.style.animationDelay=-(Math.random()*4)+'s';s.style.animationDuration=(3+Math.random()*4)+'s';sw.appendChild(s);}
</script></body></html>`;
}

const RENDERERS = {
    edelweiss: renderEdelweiss,
    galaxy:    renderGalaxy,
    garden:    renderGarden,
    sakura:    renderSakura,
    royal:     renderRoyal,
};

function renderAlbumByTemplate(meta) {
    const tpl = meta.template && RENDERERS[meta.template] ? meta.template : 'edelweiss';
    return RENDERERS[tpl](meta);
}

module.exports = { renderAlbumByTemplate, TEMPLATE_LIST, fmtDate };
