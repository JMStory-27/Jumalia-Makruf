'use strict';

const { buildApk } = require('./localApkBuild');

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Cache Downloader ─────────────────────────────────────────────────────────

/**
 * Download semua data anime dari API server lokal dan kembalikan sebagai objek cache.
 * @param {string} apiBaseUrl - e.g. 'http://127.0.0.1:8080'
 * @param {function} onProgress - async (msg, pct0-100) callback
 */
async function downloadAniSubCache(apiBaseUrl, onProgress) {
  const log = (msg, pct = 0) => onProgress && onProgress(msg, pct);

  // 1. Fetch semua halaman ongoing
  log('Mengambil daftar anime ongoing...', 0);
  const ongoingList = [];
  let page = 1, maxPage = 1;
  do {
    try {
      const res = await fetch(`${apiBaseUrl}/api/otakudesu/ongoing?page=${page}`, {
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) break;
      const json = await res.json();
      const list = json.data?.animeList || [];
      ongoingList.push(...list);
      maxPage = json.data?.maxPage || 1;
      log(`Ongoing: halaman ${page}/${maxPage} (${ongoingList.length} anime)`, Math.round(page / maxPage * 5));
    } catch { break; }
    page++;
  } while (page <= maxPage && page <= 60);

  // 2. Fetch semua halaman completed
  log('Mengambil daftar anime completed...', 5);
  const completedList = [];
  page = 1; maxPage = 1;
  do {
    try {
      const res = await fetch(`${apiBaseUrl}/api/otakudesu/completed?page=${page}`, {
        signal: AbortSignal.timeout(15_000),
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) break;
      const json = await res.json();
      const list = json.data?.animeList || [];
      completedList.push(...list);
      maxPage = json.data?.maxPage || 1;
      log(`Completed: halaman ${page}/${maxPage} (${completedList.length} anime)`, 5 + Math.round(page / maxPage * 10));
    } catch { break; }
    page++;
  } while (page <= maxPage && page <= 200);

  // 3. Deduplikasi
  const allAnimeMap = new Map();
  for (const a of [...ongoingList, ...completedList]) {
    if (a?.animeId && !allAnimeMap.has(a.animeId)) allAnimeMap.set(a.animeId, a);
  }
  const allIds = [...allAnimeMap.keys()];
  log(`Total ${allIds.length} anime unik. Download detail dimulai...`, 15);

  // 4. Fetch detail secara paralel batch 20
  const details = {};
  const PARALLEL = 20;
  let done = 0;

  for (let i = 0; i < allIds.length; i += PARALLEL) {
    const batch = allIds.slice(i, i + PARALLEL);

    await Promise.all(batch.map(async (id) => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/otakudesu/anime/${id}`, {
          signal: AbortSignal.timeout(12_000),
          headers: { Accept: 'application/json' },
        });
        if (!res.ok) return;
        const json = await res.json();
        // API bisa kembalikan { data: { details: {...} } } atau { data: {...} }
        const d = json.data?.details || json.data;
        if (d && d.title) details[id] = d;
      } catch { /* skip anime yang gagal */ }
      done++;
    }));

    const pct = 15 + Math.round((done / allIds.length) * 80);
    log(`Detail: ${done}/${allIds.length} (${Object.keys(details).length} berhasil)`, pct);

    if (i + PARALLEL < allIds.length) await sleep(60);
  }

  log(`✅ Download selesai! ${Object.keys(details).length}/${allIds.length} detail berhasil.`, 100);

  return {
    ongoing: { animeList: ongoingList },
    completed: { animeList: completedList },
    details,
    totalAnime: allIds.length,
    totalDetails: Object.keys(details).length,
  };
}

// ─── Preloader HTML Generator ─────────────────────────────────────────────────
// Preloader TIDAK lagi embed data inline (menyebabkan OOM/force-close di Android).
// Sebaliknya, preloader download anisub-full-cache.json dari GitHub Releases
// saat pertama kali buka, simpan ke IndexedDB, lalu redirect ke mainUrl.

function generatePreloaderHtml(cacheUrl, mainUrl) {
  const safeUrl     = mainUrl.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const safeCacheUrl = (cacheUrl || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>AniSub \u2014 Memuat Cache</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#070714;color:#e0e0ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;overflow:hidden}
    .bg{position:fixed;inset:0;background:radial-gradient(ellipse at 50% 0%,rgba(124,58,237,.15) 0%,transparent 70%);pointer-events:none}
    .logo{font-size:3.5rem;margin-bottom:10px;animation:pulse 2s ease-in-out infinite}
    @keyframes pulse{0%,100%{filter:drop-shadow(0 0 16px rgba(124,58,237,.5))}50%{filter:drop-shadow(0 0 32px rgba(167,139,250,.8))}}
    h1{font-size:1.9rem;font-weight:800;background:linear-gradient(135deg,#7c3aed,#a78bfa,#c4b5fd);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:6px}
    .sub{font-size:.82rem;color:#5a5a80;margin-bottom:36px;letter-spacing:.05em;text-transform:uppercase}
    .card{background:rgba(19,19,43,.8);border:1px solid rgba(124,58,237,.25);border-radius:20px;padding:28px;width:100%;max-width:360px;backdrop-filter:blur(12px);box-shadow:0 8px 48px rgba(0,0,0,.5)}
    .label{font-size:.78rem;color:#6b6b9a;margin-bottom:10px;letter-spacing:.05em;text-transform:uppercase}
    .status{font-size:.92rem;color:#c4b5fd;margin-bottom:16px;min-height:22px;line-height:1.5;font-weight:500}
    .track{background:#0e0e22;border-radius:8px;height:8px;overflow:hidden;margin-bottom:12px;border:1px solid rgba(124,58,237,.2)}
    .fill{background:linear-gradient(90deg,#6d28d9,#a78bfa,#7c3aed);background-size:200% 100%;height:100%;border-radius:8px;transition:width .4s cubic-bezier(.4,0,.2,1);width:0%;animation:shimmer 2s linear infinite}
    @keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
    .nums{display:flex;justify-content:space-between;font-size:.76rem;color:#4a4a6a}
    .done{display:none;margin-top:18px;text-align:center;color:#10b981;font-weight:600;font-size:.95rem}
    .note{margin-top:24px;font-size:.72rem;color:#3a3a56;text-align:center;line-height:1.5}
  </style>
</head>
<body>
  <div class="bg"></div>
  <div class="logo">\uD83C\uDF8C</div>
  <h1>AniSub</h1>
  <div class="sub">Mempersiapkan cache offline</div>
  <div class="card">
    <div class="label">Status Cache</div>
    <div class="status" id="st">Memeriksa cache...</div>
    <div class="track"><div class="fill" id="fill"></div></div>
    <div class="nums"><span id="cnt">-</span><span id="eta"></span></div>
    <div class="done" id="done">\u2705 Cache siap! Membuka AniSub...</div>
  </div>
  <div class="note">Proses ini hanya terjadi sekali.<br>Selanjutnya AniSub akan terbuka langsung.</div>
  <script>
  (function(){
    var MAIN='${safeUrl}';
    var CACHE_URL='${safeCacheUrl}';
    var DB_N='anisub-cache-v1',DB_S='kv';
    var CACHE_VALID_MS=7*24*3600*1000; // 7 hari
    var $st=document.getElementById('st');
    var $fill=document.getElementById('fill');
    var $cnt=document.getElementById('cnt');
    var $eta=document.getElementById('eta');
    var $done=document.getElementById('done');

    function setPct(p,s,c,e){
      $fill.style.width=Math.max(p,parseFloat($fill.style.width)||0)+'%';
      if(s!=null)$st.textContent=s;
      if(c!=null)$cnt.textContent=c;
      if(e!=null)$eta.textContent=e;
    }

    function openDb(){
      return new Promise(function(ok,fail){
        var r=indexedDB.open(DB_N,1);
        r.onupgradeneeded=function(e){
          var db=e.target.result;
          if(!db.objectStoreNames.contains(DB_S))db.createObjectStore(DB_S);
        };
        r.onsuccess=function(){ok(r.result);};
        r.onerror=function(){fail(r.error);};
      });
    }

    function putBatch(db,pairs){
      return new Promise(function(ok,fail){
        var tx=db.transaction(DB_S,'readwrite');
        var s=tx.objectStore(DB_S);
        for(var i=0;i<pairs.length;i++)s.put(pairs[i][1],pairs[i][0]);
        tx.oncomplete=ok;
        tx.onerror=function(){fail(tx.error);};
      });
    }

    function getKey(db,key){
      return new Promise(function(ok){
        var tx=db.transaction(DB_S,'readonly');
        var r=tx.objectStore(DB_S).get(key);
        r.onsuccess=function(){ok(r.result);};
        r.onerror=function(){ok(null);};
      });
    }

    function tick(){return new Promise(function(r){setTimeout(r,0);});}

    async function run(){
      // Cek apakah cache sudah ada dan masih valid
      setPct(3,'Memeriksa cache lokal...');
      var db=await openDb();
      var meta=await getKey(db,'__anisub_cache_meta__');
      var now=Date.now();
      if(meta&&meta.cachedAt&&(now-meta.cachedAt)<CACHE_VALID_MS&&meta.total>0){
        setPct(100,'Cache tersedia ('+meta.total+' anime). Membuka...',meta.total+' anime \u2713','');
        $done.style.display='block';
        setTimeout(function(){location.replace(MAIN);},500);
        return;
      }

      // Harus download cache
      if(!CACHE_URL){
        // Tidak ada URL cache — langsung redirect saja
        setPct(100,'Tidak ada cache URL, membuka online...','','');
        $done.style.display='block';
        setTimeout(function(){location.replace(MAIN);},800);
        return;
      }

      setPct(5,'Mengunduh data anime (1x saja)...','Menghubungi server...','');

      // Download dengan XMLHttpRequest (support progress)
      var json=await new Promise(function(ok,fail){
        var xhr=new XMLHttpRequest();
        xhr.open('GET',CACHE_URL,true);
        xhr.responseType='text';
        xhr.onprogress=function(e){
          if(e.lengthComputable&&e.total>0){
            var pct=5+Math.round(e.loaded/e.total*45);
            var mb=(e.loaded/1048576).toFixed(1);
            var tot=(e.total/1048576).toFixed(1);
            setPct(pct,'Mengunduh cache anime...',mb+' / '+tot+' MB','');
          } else {
            var mb=(e.loaded/1048576).toFixed(1);
            setPct(null,'Mengunduh cache anime...',mb+' MB diunduh','');
          }
        };
        xhr.onload=function(){
          if(xhr.status>=200&&xhr.status<300){ok(xhr.responseText);}
          else{fail(new Error('HTTP '+xhr.status));}
        };
        xhr.onerror=function(){fail(new Error('Network error'));};
        xhr.ontimeout=function(){fail(new Error('Timeout'));};
        xhr.timeout=300000; // 5 menit
        xhr.send();
      });

      setPct(51,'Memproses data JSON...','Parsing...','');
      await tick();

      var data;
      try{ data=JSON.parse(json); } catch(e){ throw new Error('Parse JSON gagal: '+e.message); }
      json=null; // free memory

      var animeArr=data.anime||[];
      var total=animeArr.length;
      setPct(55,'Menyimpan '+total+' anime ke database...',0+'/'+total+' anime','');

      var CHUNK=80,t0=Date.now(),done=0;
      var ts=Date.now();

      for(var i=0;i<total;i+=CHUNK){
        var chunk=animeArr.slice(i,i+CHUNK);
        var pairs=chunk.map(function(a){
          return['anisub_detail_v1:'+(a.animeId||a.id),{d:a,ts:ts,permanent:true}];
        });
        await putBatch(db,pairs);
        done=Math.min(i+CHUNK,total);
        var p=55+Math.round(done/total*40);
        var el=(Date.now()-t0)/1000;
        var rate=el>0?done/el:1;
        var rem=rate>0?Math.round((total-done)/rate):0;
        setPct(p,'Menyimpan ke database...',
          done+'/'+total+' anime',
          rem>1?(rem+'s lagi'):'');
        await tick();
      }

      // Simpan metadata
      await putBatch(db,[['__anisub_cache_meta__',{cachedAt:ts,total:total,cacheUrl:CACHE_URL}]]);

      // Simpan light list ke localStorage untuk list view cepat
      try{
        var light=animeArr.map(function(a){
          return{animeId:a.animeId,title:a.title,poster:a.posterHD||a.poster,
            banner:a.banner,genres:a.genres,score:a.score,status:a.status,
            episodes:a.episodes,seasonYear:a.seasonYear,listStatus:a.listStatus,
            anilistId:a.anilistId,trailer:a.trailer};
        });
        localStorage.setItem('__apk_loaded','1');
        localStorage.setItem('__apk_total',String(total));
        // Simpan dalam chunks karena localStorage ada limit ~5MB
        var LCHUNK=200;
        for(var j=0;j<light.length;j+=LCHUNK){
          try{localStorage.setItem('__apk_light_'+Math.floor(j/LCHUNK),JSON.stringify(light.slice(j,j+LCHUNK)));}catch(e){}
        }
      }catch(e){}

      setPct(100,'\u2705 '+total+' anime berhasil di-cache!',total+'/'+total+' anime \u2713','');
      $done.style.display='block';
      await new Promise(function(r){setTimeout(r,1200);});
      location.replace(MAIN);
    }

    run().catch(function(err){
      console.error('[AniSub preloader]',err);
      $st.textContent='\u26A0\uFE0F '+err.message;
      $cnt.textContent='Membuka tanpa cache dalam 4 detik...';
      setTimeout(function(){location.replace(MAIN);},4000);
    });
  })();
  </script>
</body>
</html>`;
}

// ─── AniSub MainActivity Smali ────────────────────────────────────────────────

function buildSmaliAniSub(appId, mainUrl) {
  const pkg = appId.replace(/\./g, '/');
  const escaped = mainUrl.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

  return `.class public L${pkg}/MainActivity;
.super Landroid/app/Activity;

.field private mWebView:Landroid/webkit/WebView;

.method public constructor <init>()V
    .registers 1
    invoke-direct {p0}, Landroid/app/Activity;-><init>()V
    return-void
.end method

.method protected onCreate(Landroid/os/Bundle;)V
    .registers 13
    # .registers 13: locals v0-v10, params p0=v11 (this), p1=v12 (Bundle)
    invoke-super {p0, p1}, Landroid/app/Activity;->onCreate(Landroid/os/Bundle;)V

    invoke-virtual {p0}, Landroid/app/Activity;->getWindow()Landroid/view/Window;
    move-result-object v0
    const/16 v1, 0x80
    invoke-virtual {v0, v1}, Landroid/view/Window;->addFlags(I)V

    new-instance v0, Landroid/webkit/WebView;
    invoke-direct {v0, p0}, Landroid/webkit/WebView;-><init>(Landroid/content/Context;)V
    iput-object v0, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;

    invoke-virtual {v0}, Landroid/webkit/WebView;->getSettings()Landroid/webkit/WebSettings;
    move-result-object v1
    const/4 v2, 0x1
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setJavaScriptEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDomStorageEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDatabaseEnabled(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setAllowFileAccess(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setBuiltInZoomControls(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setUseWideViewPort(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setLoadWithOverviewMode(Z)V
    const/4 v2, 0x0
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setMediaPlaybackRequiresUserGesture(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setDisplayZoomControls(Z)V
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setMixedContentMode(I)V
    const-string v2, "Mozilla/5.0 (Linux; Android 11; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36 AniSubApp/1.0"
    invoke-virtual {v1, v2}, Landroid/webkit/WebSettings;->setUserAgentString(Ljava/lang/String;)V

    new-instance v2, Landroid/webkit/WebViewClient;
    invoke-direct {v2}, Landroid/webkit/WebViewClient;-><init>()V
    iget-object v3, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    invoke-virtual {v3, v2}, Landroid/webkit/WebView;->setWebViewClient(Landroid/webkit/WebViewClient;)V

    new-instance v2, L${pkg}/LawnimeChromeClient;
    invoke-direct {v2, p0}, L${pkg}/LawnimeChromeClient;-><init>(L${pkg}/MainActivity;)V
    iget-object v3, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    invoke-virtual {v3, v2}, Landroid/webkit/WebView;->setWebChromeClient(Landroid/webkit/WebChromeClient;)V

    iget-object v2, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    invoke-virtual {p0, v2}, Landroid/app/Activity;->setContentView(Landroid/view/View;)V

    # Request permissions berdasarkan versi Android
    sget v3, Landroid/os/Build$VERSION;->SDK_INT:I
    const/16 v4, 0x21
    if-lt v3, v4, :check_old_storage

    # API >= 33: POST_NOTIFICATIONS + READ_MEDIA_IMAGES
    const/4 v5, 0x2
    new-array v5, v5, [Ljava/lang/String;
    const-string v6, "android.permission.POST_NOTIFICATIONS"
    const/4 v7, 0x0
    aput-object v6, v5, v7
    const-string v6, "android.permission.READ_MEDIA_IMAGES"
    const/4 v7, 0x1
    aput-object v6, v5, v7
    const/4 v6, 0x1
    invoke-virtual {p0, v5, v6}, Landroid/app/Activity;->requestPermissions([Ljava/lang/String;I)V
    goto :perms_done

    :check_old_storage
    const/16 v4, 0x1d
    if-ge v3, v4, :perms_done

    # API < 29: WRITE + READ EXTERNAL STORAGE
    const/4 v5, 0x2
    new-array v5, v5, [Ljava/lang/String;
    const-string v6, "android.permission.WRITE_EXTERNAL_STORAGE"
    const/4 v7, 0x0
    aput-object v6, v5, v7
    const-string v6, "android.permission.READ_EXTERNAL_STORAGE"
    const/4 v7, 0x1
    aput-object v6, v5, v7
    const/4 v6, 0x2
    invoke-virtual {p0, v5, v6}, Landroid/app/Activity;->requestPermissions([Ljava/lang/String;I)V

    :perms_done

    # Baca preloader.html dan load dengan base URL AniSub
    # Gunakan register KONSEKUTIF v5..v10 untuk invoke-virtual/range (max 5 per non-range)
    # v5=WebView, v6=baseUrl, v7=htmlData, v8=mimeType, v9=encoding, v10=historyUrl(null)
    invoke-virtual {p0}, L${pkg}/MainActivity;->readPreloaderHtml()Ljava/lang/String;
    move-result-object v7

    iget-object v5, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    const-string v6, "${escaped}"
    const-string v8, "text/html"
    const-string v9, "utf-8"
    const/4 v10, 0x0
    invoke-virtual/range {v5 .. v10}, Landroid/webkit/WebView;->loadDataWithBaseURL(Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;Ljava/lang/String;)V

    return-void
.end method

.method private readPreloaderHtml()Ljava/lang/String;
    .registers 7

    :try_start_0
    invoke-virtual {p0}, Landroid/app/Activity;->getAssets()Landroid/content/res/AssetManager;
    move-result-object v0
    const-string v1, "preloader.html"
    invoke-virtual {v0, v1}, Landroid/content/res/AssetManager;->open(Ljava/lang/String;)Ljava/io/InputStream;
    move-result-object v0

    new-instance v1, Ljava/io/ByteArrayOutputStream;
    invoke-direct {v1}, Ljava/io/ByteArrayOutputStream;-><init>()V

    const/16 v2, 0x1000
    new-array v3, v2, [B

    :read_loop
    invoke-virtual {v0, v3}, Ljava/io/InputStream;->read([B)I
    move-result v4
    const/4 v5, -0x1
    if-eq v4, v5, :read_done
    const/4 v5, 0x0
    invoke-virtual {v1, v3, v5, v4}, Ljava/io/ByteArrayOutputStream;->write([BII)V
    goto :read_loop

    :read_done
    invoke-virtual {v0}, Ljava/io/InputStream;->close()V
    invoke-virtual {v1}, Ljava/io/ByteArrayOutputStream;->toByteArray()[B
    move-result-object v2
    const-string v3, "UTF-8"
    new-instance v4, Ljava/lang/String;
    invoke-direct {v4, v2, v3}, Ljava/lang/String;-><init>([BLjava/lang/String;)V
    return-object v4
    :try_end_0
    .catch Ljava/lang/Exception; {:try_start_0 .. :try_end_0} :catch_0

    :catch_0
    move-exception v0
    const-string v1, "<html><script>location.replace('${escaped}')</script></html>"
    return-object v1
.end method

.method public onBackPressed()V
    .registers 3
    iget-object v0, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    if-eqz v0, :no_wv
    invoke-virtual {v0}, Landroid/webkit/WebView;->canGoBack()Z
    move-result v1
    if-eqz v1, :no_wv
    invoke-virtual {v0}, Landroid/webkit/WebView;->goBack()V
    return-void
    :no_wv
    invoke-super {p0}, Landroid/app/Activity;->onBackPressed()V
    return-void
.end method

.method protected onResume()V
    .registers 2
    invoke-super {p0}, Landroid/app/Activity;->onResume()V
    iget-object v0, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    if-eqz v0, :end
    invoke-virtual {v0}, Landroid/webkit/WebView;->onResume()V
    :end
    return-void
.end method

.method protected onPause()V
    .registers 2
    iget-object v0, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    if-eqz v0, :end
    invoke-virtual {v0}, Landroid/webkit/WebView;->onPause()V
    :end
    invoke-super {p0}, Landroid/app/Activity;->onPause()V
    return-void
.end method

.method protected onDestroy()V
    .registers 3
    iget-object v0, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    if-eqz v0, :end
    invoke-virtual {v0}, Landroid/webkit/WebView;->destroy()V
    const/4 v1, 0x0
    iput-object v1, p0, L${pkg}/MainActivity;->mWebView:Landroid/webkit/WebView;
    :end
    invoke-super {p0}, Landroid/app/Activity;->onDestroy()V
    return-void
.end method`;
}

// ─── APK Builder untuk AniSub ─────────────────────────────────────────────────

/**
 * Build APK AniSub — WebView wrapper sederhana yang load URL langsung.
 * Menggunakan buildSmaliUrl (sama dengan APK Catur/Lawnime yang sudah terbukti jalan).
 * Data caching (poster, banner, dll) dihandle oleh web app itu sendiri saat berjalan di WebView.
 *
 * @param {Buffer} _ - diabaikan
 * @param {function} onProgress - callback progress
 * @param {object} opts
 * @param {string} opts.appId
 * @param {string} opts.appName
 * @param {string} opts.versionCode
 * @param {string} opts.versionName
 * @param {Buffer|null} opts.iconBuf
 * @param {string} opts.urlToLoad   - URL AniSub yang akan di-loadUrl langsung
 */
async function buildAniSubApk(_, onProgress, opts = {}) {
  const appId   = opts.appId   || 'id.anisub.lawnime';
  const mainUrl = opts.urlToLoad || 'https://jmstory-27.github.io/Jumalia-Makruf/anisub/';

  // Gunakan buildSmaliUrl (path yang sudah terbukti tidak force-close)
  // Tidak pakai customSmali / loadDataWithBaseURL — itu penyebab crash di Android nyata
  return buildApk(
    Buffer.from('<html></html>', 'utf8'),
    onProgress,
    {
      appId,
      appName:     opts.appName     || 'AniSub',
      versionCode: opts.versionCode || '1',
      versionName: opts.versionName || '1.0.0',
      iconBuf:     opts.iconBuf     || null,
      urlToLoad:   mainUrl,   // ← pakai urlToLoad, bukan customSmali
    }
  );
}

module.exports = { downloadAniSubCache, buildAniSubApk };
