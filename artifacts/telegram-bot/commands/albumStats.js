// Album Stats — pelacak aktivitas pengunjung album & dashboard admin
// Routes:
//   GET  /admin/stats            -> dashboard HTML (basic auth)
//   GET  /admin/stats/api        -> JSON data agregat (basic auth)
//   GET  /admin/stats/events     -> JSON event mentah terbaru (basic auth)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const STATS_FILE = path.join(DATA_DIR, 'album_stats.json');
const MAX_EVENTS = 5000;

const ADMIN_USER = process.env.ADMIN_STATS_USER;
const ADMIN_PASS = process.env.ADMIN_STATS_PASSWORD;
if (!ADMIN_USER || !ADMIN_PASS) {
    console.error('[STATS] FATAL: ADMIN_STATS_USER and ADMIN_STATS_PASSWORD env vars must be set. Admin dashboard disabled.');
}

let state = { events: [], totals: {} };
let dirty = false;
let flushTimer = null;

function loadState() {
    try {
        if (fs.existsSync(STATS_FILE)) {
            const raw = fs.readFileSync(STATS_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && Array.isArray(parsed.events)) {
                state.events = parsed.events;
                state.totals = parsed.totals || {};
            }
        }
    } catch (e) {
        console.error('[STATS load]', e.message);
    }
}

function saveState() {
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        const tmp = STATS_FILE + '.tmp';
        fs.writeFileSync(tmp, JSON.stringify({ events: state.events, totals: state.totals }));
        fs.renameSync(tmp, STATS_FILE);
        dirty = false;
    } catch (e) {
        console.error('[STATS save]', e.message);
    }
}

function scheduleFlush() {
    dirty = true;
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
        flushTimer = null;
        if (dirty) saveState();
    }, 4000);
}

function getIp(req) {
    const xf = (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim();
    return xf || req.ip || req.connection?.remoteAddress || '';
}

function hashIp(ip) {
    return crypto.createHash('sha1').update(String(ip)).digest('hex').slice(0, 12);
}

function shortUA(ua) {
    if (!ua) return '';
    const s = String(ua);
    let device = 'Desktop';
    if (/Mobile|Android|iPhone|iPad/i.test(s)) device = 'Mobile';
    let browser = 'Other';
    if (/Edg\//i.test(s)) browser = 'Edge';
    else if (/Chrome\//i.test(s)) browser = 'Chrome';
    else if (/Safari\//i.test(s)) browser = 'Safari';
    else if (/Firefox\//i.test(s)) browser = 'Firefox';
    else if (/WhatsApp/i.test(s)) browser = 'WhatsApp';
    else if (/Instagram/i.test(s)) browser = 'Instagram';
    else if (/FBAN|FBAV/i.test(s)) browser = 'Facebook';
    let os = 'Unknown';
    if (/Windows/i.test(s)) os = 'Windows';
    else if (/Android/i.test(s)) os = 'Android';
    else if (/iPhone|iPad|iOS/i.test(s)) os = 'iOS';
    else if (/Mac OS X/i.test(s)) os = 'macOS';
    else if (/Linux/i.test(s)) os = 'Linux';
    return `${device} · ${browser} · ${os}`;
}

function recordEvent(type, req, slug, extra) {
    try {
        const ip = getIp(req);
        const ua = req.headers['user-agent'] || '';
        const ev = {
            t: Date.now(),
            type,
            slug: slug || '',
            ip: hashIp(ip),
            ipRaw: String(ip).slice(0, 64),
            ua: shortUA(ua),
            ref: (req.headers['referer'] || req.headers['referrer'] || '').toString().slice(0, 200),
            path: req.originalUrl ? req.originalUrl.slice(0, 200) : ''
        };
        if (extra && typeof extra === 'object') Object.assign(ev, extra);
        state.events.push(ev);
        if (state.events.length > MAX_EVENTS) state.events.splice(0, state.events.length - MAX_EVENTS);

        const key = `${slug || '_'}::${type}`;
        state.totals[key] = (state.totals[key] || 0) + 1;
        scheduleFlush();
    } catch (e) {
        console.error('[STATS record]', e.message);
    }
}

// Klasifikasi jenis event berdasarkan path & method
function classify(req) {
    const m = req.method;
    const p = req.path || '';
    if (m !== 'GET' && m !== 'POST') return null;

    if (m === 'GET' && p === '/album') return { type: 'view_index', slug: '' };

    const mAlbum = p.match(/^\/album\/([a-z0-9-]+)\/?$/i);
    if (m === 'GET' && mAlbum) return { type: 'view_album', slug: mAlbum[1] };

    const mDl = p.match(/^\/album\/([a-z0-9-]+)\/download$/i);
    if (m === 'GET' && mDl) return { type: 'download', slug: mDl[1] };

    const mQr = p.match(/^\/album\/([a-z0-9-]+)\/qr\.png$/i);
    if (m === 'GET' && mQr) return { type: 'qr_view', slug: mQr[1] };

    const mWishGet = p.match(/^\/album\/([a-z0-9-]+)\/wishes\.json$/i);
    if (m === 'GET' && mWishGet) return { type: 'wishes_read', slug: mWishGet[1] };

    const mWishPost = p.match(/^\/album\/([a-z0-9-]+)\/wishes$/i);
    if (m === 'POST' && mWishPost) return { type: 'wish_post', slug: mWishPost[1] };

    const mMedia = p.match(/^\/album\/([a-z0-9-]+)\/files\//i);
    if (m === 'GET' && mMedia) return { type: 'view_media', slug: mMedia[1] };

    return null;
}

function trackerMiddleware(req, res, next) {
    try {
        const c = classify(req);
        if (c) {
            // Skip noisy media views — hitung saja, jangan simpan tiap event
            if (c.type === 'view_media') {
                const key = `${c.slug}::view_media`;
                state.totals[key] = (state.totals[key] || 0) + 1;
                scheduleFlush();
            } else {
                recordEvent(c.type, req, c.slug);
            }
        }
    } catch {}
    next();
}

// ===== Admin Auth (HTTP Basic) =====
function checkAuth(req, res) {
    const h = req.headers['authorization'] || '';
    if (h.startsWith('Basic ')) {
        try {
            const dec = Buffer.from(h.slice(6), 'base64').toString('utf8');
            const i = dec.indexOf(':');
            const u = i >= 0 ? dec.slice(0, i) : dec;
            const p = i >= 0 ? dec.slice(i + 1) : '';
            if (u === ADMIN_USER && p === ADMIN_PASS) return true;
        } catch {}
    }
    res.set('WWW-Authenticate', 'Basic realm="Album Admin Stats"');
    res.status(401).send('Auth required');
    return false;
}

// ===== Aggregations =====
function loadAlbumTitles() {
    const map = {};
    try {
        const f = path.join(DATA_DIR, 'albums.json');
        if (fs.existsSync(f)) {
            const arr = JSON.parse(fs.readFileSync(f, 'utf8'));
            if (Array.isArray(arr)) for (const a of arr) if (a && a.slug) map[a.slug] = a.title || a.slug;
        }
    } catch {}
    return map;
}

function aggregate() {
    const titles = loadAlbumTitles();
    const now = Date.now();
    const dayMs = 86400000;

    const perAlbum = {}; // slug -> { title, views, uniques:Set, downloads, wishes, media, qr }
    const ensure = (slug) => {
        if (!perAlbum[slug]) perAlbum[slug] = {
            slug, title: titles[slug] || slug,
            views: 0, uniques: new Set(), downloads: 0, wishes: 0, media: 0, qr: 0, lastVisit: 0
        };
        return perAlbum[slug];
    };

    // Tambahkan album yang ada dari index meski belum ada event
    for (const s of Object.keys(titles)) ensure(s);

    let totalViews = 0, totalDownloads = 0, totalWishes = 0, totalQr = 0;
    const dayBuckets = {}; // YYYY-MM-DD -> count
    const ipSetGlobal = new Set();
    const uaCounts = {};
    const refCounts = {};
    const recent = [];

    for (const ev of state.events) {
        const slug = ev.slug || '_';
        const a = ensure(slug);
        if (ev.type === 'view_album') {
            a.views++; totalViews++;
            a.uniques.add(ev.ip); ipSetGlobal.add(ev.ip);
            if (ev.t > a.lastVisit) a.lastVisit = ev.t;
            const d = new Date(ev.t); const k = d.toISOString().slice(0, 10);
            dayBuckets[k] = (dayBuckets[k] || 0) + 1;
            if (ev.ua) uaCounts[ev.ua] = (uaCounts[ev.ua] || 0) + 1;
            if (ev.ref) {
                try {
                    const u = new URL(ev.ref);
                    const host = u.hostname || ev.ref;
                    refCounts[host] = (refCounts[host] || 0) + 1;
                } catch { refCounts[ev.ref.slice(0, 40)] = (refCounts[ev.ref.slice(0, 40)] || 0) + 1; }
            } else {
                refCounts['(direct)'] = (refCounts['(direct)'] || 0) + 1;
            }
        } else if (ev.type === 'download') { a.downloads++; totalDownloads++; }
        else if (ev.type === 'wish_post') { a.wishes++; totalWishes++; }
        else if (ev.type === 'qr_view') { a.qr++; totalQr++; }
    }
    // Tambahkan media count dari totals (tidak per-event)
    for (const k of Object.keys(state.totals)) {
        const [slug, type] = k.split('::');
        if (type === 'view_media' && perAlbum[slug]) perAlbum[slug].media = state.totals[k];
    }

    // Recent activity (50 terakhir)
    for (let i = state.events.length - 1; i >= 0 && recent.length < 50; i--) {
        const ev = state.events[i];
        recent.push({
            t: ev.t, type: ev.type, slug: ev.slug,
            title: titles[ev.slug] || ev.slug, ip: ev.ip,
            ua: ev.ua, ref: ev.ref
        });
    }

    // Last 14 days timeline
    const timeline = [];
    for (let i = 13; i >= 0; i--) {
        const d = new Date(now - i * dayMs);
        const k = d.toISOString().slice(0, 10);
        timeline.push({ date: k, count: dayBuckets[k] || 0 });
    }

    const albums = Object.values(perAlbum).map(a => ({
        slug: a.slug, title: a.title,
        views: a.views, uniques: a.uniques.size,
        downloads: a.downloads, wishes: a.wishes,
        media: a.media, qr: a.qr, lastVisit: a.lastVisit
    })).sort((x, y) => y.views - x.views);

    const top = (obj, n) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ k, v }));

    return {
        generatedAt: now,
        summary: {
            totalAlbums: albums.length,
            totalViews, totalDownloads, totalWishes, totalQr,
            uniqueVisitors: ipSetGlobal.size,
            totalEvents: state.events.length
        },
        albums,
        timeline,
        topUserAgents: top(uaCounts, 8),
        topReferrers: top(refCounts, 8),
        recent
    };
}

// ===== HTML Dashboard =====
function renderDashboard() {
    return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>Admin Stats — Album</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{--bg:#0f1115;--card:#171a21;--mut:#8b93a7;--fg:#e6e9ef;--accent:#7c5cff;--accent2:#22d3ee;--ok:#34d399;--warn:#f59e0b;--bad:#f87171;--bd:#222631}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
header{padding:18px 24px;border-bottom:1px solid var(--bd);display:flex;justify-content:space-between;align-items:center;background:#12141b;position:sticky;top:0;z-index:10}
header h1{margin:0;font-size:18px;font-weight:700}
header .meta{color:var(--mut);font-size:12px}
main{padding:20px;max-width:1300px;margin:0 auto}
.grid{display:grid;gap:14px}
.cards{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.card{background:var(--card);border:1px solid var(--bd);border-radius:12px;padding:14px}
.card .lbl{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.5px}
.card .val{font-size:26px;font-weight:700;margin-top:4px}
.card .sub{color:var(--mut);font-size:12px;margin-top:2px}
section{margin-top:20px}
section h2{font-size:14px;color:var(--mut);text-transform:uppercase;letter-spacing:.5px;margin:0 0 10px}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--bd);border-radius:12px;overflow:hidden;font-size:13px}
th,td{padding:10px 12px;text-align:left;border-bottom:1px solid var(--bd)}
th{background:#1b1f28;font-size:11px;color:var(--mut);text-transform:uppercase;letter-spacing:.5px}
tr:last-child td{border-bottom:none}
tr:hover td{background:#1c2029}
.tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
.t-view_album{background:#1e3a8a33;color:#93c5fd}
.t-view_index{background:#5b21b633;color:#c4b5fd}
.t-download{background:#15803d33;color:#86efac}
.t-wish_post{background:#9a340233;color:#fdba74}
.t-qr_view{background:#0e749033;color:#67e8f9}
.t-wishes_read{background:#3f3f4633;color:#d4d4d8}
.bars{display:flex;align-items:flex-end;gap:4px;height:120px;padding:8px 0}
.bars .b{flex:1;background:linear-gradient(180deg,var(--accent),var(--accent2));border-radius:4px 4px 0 0;min-height:2px;position:relative}
.bars .b span{position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:9px;color:var(--mut);white-space:nowrap}
.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media(max-width:760px){.row{grid-template-columns:1fr}}
a{color:var(--accent2);text-decoration:none}
a:hover{text-decoration:underline}
button{background:var(--accent);color:#fff;border:none;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:600}
button:hover{filter:brightness(1.1)}
.muted{color:var(--mut)}
.bar-row{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:12px}
.bar-row .name{width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-row .bg{flex:1;height:8px;background:#1b1f28;border-radius:4px;overflow:hidden}
.bar-row .fg{height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2))}
.bar-row .v{width:42px;text-align:right;color:var(--mut)}
</style>
</head>
<body>
<header>
  <div>
    <h1>📊 Album Admin Stats</h1>
    <div class="meta" id="meta">Memuat…</div>
  </div>
  <div><button onclick="load()">↻ Refresh</button></div>
</header>
<main>
  <div class="grid cards" id="cards"></div>

  <section>
    <h2>Aktivitas 14 Hari Terakhir (kunjungan album)</h2>
    <div class="card"><div class="bars" id="timeline"></div></div>
  </section>

  <section>
    <h2>Statistik per Album</h2>
    <div class="card" style="padding:0;overflow-x:auto">
      <table>
        <thead><tr>
          <th>Album</th><th>Views</th><th>Unique IP</th><th>Media</th>
          <th>Download</th><th>Ucapan</th><th>QR</th><th>Kunjungan Terakhir</th>
        </tr></thead>
        <tbody id="albums"></tbody>
      </table>
    </div>
  </section>

  <div class="row">
    <section>
      <h2>Sumber Trafik (Referrer)</h2>
      <div class="card" id="refs"></div>
    </section>
    <section>
      <h2>Perangkat / Browser</h2>
      <div class="card" id="uas"></div>
    </section>
  </div>

  <section>
    <h2>Aktivitas Terbaru (50)</h2>
    <div class="card" style="padding:0;overflow-x:auto">
      <table>
        <thead><tr><th>Waktu</th><th>Aksi</th><th>Album</th><th>IP</th><th>Perangkat</th><th>Referrer</th></tr></thead>
        <tbody id="recent"></tbody>
      </table>
    </div>
  </section>
</main>
<script>
const labels = {
  view_index:'Lihat Index', view_album:'Buka Album', download:'Download',
  wish_post:'Kirim Ucapan', qr_view:'Lihat QR', wishes_read:'Baca Ucapan'
};
function fmtT(t){ if(!t) return '-'; const d=new Date(t); return d.toLocaleString('id-ID',{dateStyle:'short',timeStyle:'short'}); }
function ago(t){ if(!t) return '-'; const s=Math.floor((Date.now()-t)/1000); if(s<60) return s+'d lalu'; if(s<3600) return Math.floor(s/60)+'m lalu'; if(s<86400) return Math.floor(s/3600)+'j lalu'; return Math.floor(s/86400)+'h lalu'; }
function esc(s){ return String(s||'').replace(/[<>&]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }

async function load(){
  const r = await fetch('/admin/stats/api',{cache:'no-store'});
  if(!r.ok){ document.body.innerHTML='<p style=padding:20px>Gagal memuat data ('+r.status+')</p>'; return; }
  const d = await r.json();
  const s = d.summary;
  document.getElementById('meta').textContent = 'Diperbarui ' + new Date(d.generatedAt).toLocaleString('id-ID') + ' · ' + s.totalEvents + ' event tersimpan';

  document.getElementById('cards').innerHTML = [
    ['Total Album', s.totalAlbums, ''],
    ['Total Kunjungan', s.totalViews, 'pembukaan album'],
    ['Pengunjung Unik', s.uniqueVisitors, 'IP berbeda'],
    ['Total Download', s.totalDownloads, 'foto/zip'],
    ['Ucapan Terkirim', s.totalWishes, 'dari tamu'],
    ['QR Dilihat', s.totalQr, 'preview QR'],
  ].map(([l,v,sub])=>'<div class="card"><div class="lbl">'+l+'</div><div class="val">'+v+'</div><div class="sub">'+sub+'</div></div>').join('');

  const tl = d.timeline; const max = Math.max(1, ...tl.map(x=>x.count));
  document.getElementById('timeline').innerHTML = tl.map(x=>{
    const h = Math.round((x.count/max)*100);
    return '<div class="b" style="height:'+h+'%" title="'+x.date+': '+x.count+'"><span>'+x.date.slice(5)+'</span></div>';
  }).join('');

  document.getElementById('albums').innerHTML = d.albums.map(a=>(
    '<tr>'+
      '<td><a href="/album/'+esc(a.slug)+'/" target="_blank">'+esc(a.title)+'</a><div class="muted" style="font-size:11px">/'+esc(a.slug)+'</div></td>'+
      '<td>'+a.views+'</td><td>'+a.uniques+'</td><td>'+a.media+'</td>'+
      '<td>'+a.downloads+'</td><td>'+a.wishes+'</td><td>'+a.qr+'</td>'+
      '<td>'+ago(a.lastVisit)+'</td>'+
    '</tr>'
  )).join('') || '<tr><td colspan=8 class=muted style=padding:20px;text-align:center>Belum ada data</td></tr>';

  const renderBars = (arr) => {
    if(!arr.length) return '<div class=muted>Belum ada data</div>';
    const m = Math.max(...arr.map(x=>x.v));
    return arr.map(x=>(
      '<div class="bar-row"><div class="name" title="'+esc(x.k)+'">'+esc(x.k||'(kosong)')+'</div>'+
      '<div class="bg"><div class="fg" style="width:'+Math.round((x.v/m)*100)+'%"></div></div>'+
      '<div class="v">'+x.v+'</div></div>'
    )).join('');
  };
  document.getElementById('refs').innerHTML = renderBars(d.topReferrers);
  document.getElementById('uas').innerHTML = renderBars(d.topUserAgents);

  document.getElementById('recent').innerHTML = d.recent.map(r=>(
    '<tr>'+
      '<td title="'+fmtT(r.t)+'">'+ago(r.t)+'</td>'+
      '<td><span class="tag t-'+r.type+'">'+(labels[r.type]||r.type)+'</span></td>'+
      '<td>'+(r.slug?'<a href="/album/'+esc(r.slug)+'/" target="_blank">'+esc(r.title||r.slug)+'</a>':'<span class=muted>-</span>')+'</td>'+
      '<td><code style=font-size:11px>'+esc(r.ip)+'</code></td>'+
      '<td class=muted style=font-size:11px>'+esc(r.ua||'-')+'</td>'+
      '<td class=muted style=font-size:11px>'+esc(r.ref||'(direct)')+'</td>'+
    '</tr>'
  )).join('') || '<tr><td colspan=6 class=muted style=padding:20px;text-align:center>Belum ada aktivitas</td></tr>';
}
load();
setInterval(load, 15000);
</script>
</body>
</html>`;
}

function registerStatsRoutes(app) {
    loadState();

    // Pasang tracker SEBELUM route lain memprosesnya — middleware ini cuma membaca
    // req, tidak memodifikasi response, jadi aman dipanggil di awal.
    app.use(trackerMiddleware);

    app.get('/admin/stats', (req, res) => {
        if (!checkAuth(req, res)) return;
        res.set('Cache-Control', 'no-store');
        res.type('html').send(renderDashboard());
    });

    app.get('/admin/stats/api', (req, res) => {
        if (!checkAuth(req, res)) return;
        res.set('Cache-Control', 'no-store');
        res.json(aggregate());
    });

    app.get('/admin/stats/events', (req, res) => {
        if (!checkAuth(req, res)) return;
        const limit = Math.min(parseInt(req.query.limit, 10) || 200, MAX_EVENTS);
        res.json(state.events.slice(-limit).reverse());
    });

    app.post('/admin/stats/reset', (req, res) => {
        if (!checkAuth(req, res)) return;
        state.events = [];
        state.totals = {};
        saveState();
        res.json({ ok: true });
    });

    // Flush periodik (jaga-jaga kalau ada banyak event)
    setInterval(() => { if (dirty) saveState(); }, 30000).unref?.();
    process.on('SIGTERM', () => { try { saveState(); } catch {} });
    process.on('SIGINT', () => { try { saveState(); } catch {} });

    console.log(`[STATS] Admin dashboard aktif di /admin/stats (user: ${ADMIN_USER})`);
}

module.exports = { registerStatsRoutes };
