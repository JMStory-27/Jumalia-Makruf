#!/usr/bin/env node
/**
 * add-missing-anime.js
 * Tambahkan 17 anime yang belum ada di master-list ke master-list dan cache.
 * Scrape AniList data lengkap (poster, banner, synopsis, staff, characters, trailer).
 * Rebuild anisub-full-cache.json dan upload ke GitHub Release.
 *
 * Usage: node scripts/add-missing-anime.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR      = path.join(__dirname, '../data');
const MASTER_FILE   = path.join(DATA_DIR, 'anime-master-list.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'scrape-progress.json');
const OUTPUT_FILE   = path.join(DATA_DIR, 'anisub-full-cache.json');
const MISSING_FILE  = '/tmp/missing-from-master.json';

const GH_TOKEN    = process.env.GITHUB_TOKEN || '';
const GH_OWNER    = 'JMStory-27';
const GH_REPO     = 'Jumalia-Makruf';
const RELEASE_TAG  = 'anisub-cache-v1';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY   = process.env.GROQ_API_KEY   || '';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(m) { process.stdout.write(`[${new Date().toISOString().slice(11,19)}] ${m}\n`); }

// ─── AniList manual overrides untuk 17 anime baru ────────────────────────────
const MANUAL_ID_OVERRIDE = {
  'class2-banme-kawaii-tomodachi-natta-sub-indo':       169580,  // Class de 2-banme ni Kawaii Onnanoko to Tomodachi ni Natta
  'aishiteru-game-owarasetai-sub-indo':                 194393,  // Aishiteru Game wo Owarasetai
  'ponkotsu-fuuki-skirt-sub-indo':                      189987,  // Ponkotsu Fuuki Iin to Skirt take ga Futekisetsu na JK
  'lastame-s2-sub-indo':                                195268,  // Higeki no Genkyou... Last Boss Joou Season 2
  'tongari-boushi-atelier-sub-indo':                    147105,  // Tongari Boushi no Atelier (13 eps)
  'ghost-concert-sub-indo':                             201090,  // Ghost Concert: missing Songs
  'akane-banasi-sub-indo':                              196935,  // Akane-banashi
  'otonari-ni-tenshi-s2-sub-indo':                      170019,  // Otonari no Tenshi-sama... 2nd Season
  'kanan-kumade-choroi-sub-indo':                       190704,  // Kanan-sama wa Akumade Choroi
  'nigashita-sakana-sub-indo':                          201817,  // Nigashita Sakana wa Ookikatta ga...
  'maid-taberu-dake-sub-indo':                          197868,  // Maid-san wa Taberu dake
  'isenouka-s2-sub-indo':                               197824,  // Isekai Nonbiri Nouka 2
  'jishou-akuyaku-konyakusha-kansatsu-kiroku-sub-indo': 192808,  // Jishou Akuyaku Reijou na Konyakusha no Kansatsu Kiroku.
  'haibara-tsuyokute-seishun-new-game-sub-indo':        195333,  // Haibara-kun no Tsuyokute Seishun New Game
  'kanteish-kari-sub-indo':                             200769,  // Saikyou no Shokugyou wa... Kanteishi (Kari)
  'mato-seihei-slave-s2-sub-indo':                      176276,  // Mato Seihei no Slave 2
  'arne-jikenbo-sub-indo':                              183984,  // Arne no Jikenbo
};

// ─── Query AniList ────────────────────────────────────────────────────────────
const QUERY_BY_ID = `
query($id:Int){
  Media(id:$id,type:ANIME){
    id idMal title{ romaji english native }
    description(asHtml:false)
    bannerImage coverImage{ extraLarge large medium }
    trailer{ id site }
    genres averageScore meanScore popularity
    status episodes duration season seasonYear source countryOfOrigin
    studios(isMain:true){ nodes{ name isAnimationStudio } }
    staff(perPage:15){ edges{ role node{ id name{ full native } image{ medium } siteUrl } } }
    characters(sort:[ROLE,RELEVANCE],perPage:20){
      edges{
        role
        node{ id name{ full native } image{ medium } siteUrl }
        voiceActors(language:JAPANESE){ id name{ full native } image{ medium } siteUrl }
      }
    }
    relations{ edges{ relationType(version:2) node{ id title{ romaji } type format } } }
    nextAiringEpisode{ airingAt episode }
    siteUrl
  }
}`;

const QUERY_BY_SEARCH = `
query($search:String){
  Media(search:$search,type:ANIME,sort:SEARCH_MATCH){
    id idMal title{ romaji english native }
    description(asHtml:false)
    bannerImage coverImage{ extraLarge large medium }
    trailer{ id site }
    genres averageScore meanScore popularity
    status episodes duration season seasonYear source countryOfOrigin
    studios(isMain:true){ nodes{ name isAnimationStudio } }
    staff(perPage:15){ edges{ role node{ id name{ full native } image{ medium } siteUrl } } }
    characters(sort:[ROLE,RELEVANCE],perPage:20){
      edges{
        role
        node{ id name{ full native } image{ medium } siteUrl }
        voiceActors(language:JAPANESE){ id name{ full native } image{ medium } siteUrl }
      }
    }
    relations{ edges{ relationType(version:2) node{ id title{ romaji } type format } } }
    nextAiringEpisode{ airingAt episode }
    siteUrl
  }
}`;

function anilistRequest(query, variables) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const req = https.request({
      hostname: 'graphql.anilist.co',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { resolve(null); } });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('AniList timeout')); });
    req.write(body);
    req.end();
  });
}

async function fetchByAniListId(id) {
  const r = await anilistRequest(QUERY_BY_ID, { id });
  return r?.data?.Media || null;
}

async function searchAniList(searchStr) {
  const r = await anilistRequest(QUERY_BY_SEARCH, { search: searchStr });
  return r?.data?.Media || null;
}

// ─── Search hints — judul yang dipakai untuk search AniList ──────────────────
const SEARCH_HINTS = {
  'ponkotsu-fuuki-skirt-sub-indo':    'Ponkotsu Fuuki Iinchou to Skirt',
  'lastame-s2-sub-indo':              'Lastame Season 2',
  'ghost-concert-sub-indo':           'Ghost Concert',
  'akane-banasi-sub-indo':            'Akane-banashi',
  'kanan-kumade-choroi-sub-indo':     'Kanan-sama wa Akumade Choroi',
  'nigashita-sakana-sub-indo':        'Nigete Iru no wa Naze',
  'maid-taberu-dake-sub-indo':        'Maid-san wa Taberu dake',
  'arne-jikenbo-sub-indo':            'Arne no Jikenbo',
};

// ─── Transform AniList data → cache entry ────────────────────────────────────
function transformAniListData(masterEntry, al) {
  if (!al) return null;

  const trailer = al.trailer?.site === 'youtube'
    ? { id: al.trailer.id, site: 'youtube', url: `https://www.youtube.com/watch?v=${al.trailer.id}` }
    : null;

  const staff = (al.staff?.edges || []).map(e => ({
    id: e.node?.id,
    name: e.node?.name?.full,
    nameNative: e.node?.name?.native,
    image: e.node?.image?.medium,
    role: e.role,
    url: e.node?.siteUrl,
  })).filter(s => s.name);

  const characters = (al.characters?.edges || []).map(e => ({
    id: e.node?.id,
    name: e.node?.name?.full,
    nameNative: e.node?.name?.native,
    image: e.node?.image?.medium,
    role: e.role,
    url: e.node?.siteUrl,
    voiceActor: e.voiceActors?.[0] ? {
      id: e.voiceActors[0].id,
      name: e.voiceActors[0].name?.full,
      nameNative: e.voiceActors[0].name?.native,
      image: e.voiceActors[0].image?.medium,
      url: e.voiceActors[0].siteUrl,
    } : null,
  })).filter(c => c.name);

  return {
    animeId:      masterEntry.animeId,
    title:        masterEntry.title,
    titleRomaji:  al.title?.romaji   || masterEntry.title,
    titleEnglish: al.title?.english  || null,
    titleNative:  al.title?.native   || null,
    poster:       masterEntry.poster || null,
    posterHD:     al.coverImage?.extraLarge || al.coverImage?.large || null,
    banner:       al.bannerImage || null,
    synopsis:     al.description?.replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim() || null,
    trailer,
    genres:       al.genres || [],
    score:        al.averageScore || al.meanScore || null,
    popularity:   al.popularity || null,
    episodes:     masterEntry.episodes || al.episodes || null,
    duration:     al.duration || null,
    status:       masterEntry.status || al.status || null,
    listStatus:   masterEntry.listStatus || 'completed',
    season:       al.season || null,
    seasonYear:   al.seasonYear || null,
    source:       al.source || null,
    countryOfOrigin: al.countryOfOrigin || null,
    studios:      (al.studios?.nodes || []).map(s => ({ name: s.name, isMain: s.isAnimationStudio })),
    staff,
    characters,
    relations:    (al.relations?.edges || []).map(e => ({
      type: e.relationType,
      id: e.node?.id,
      title: e.node?.title?.romaji,
      format: e.node?.format,
    })),
    nextAiringEpisode: al.nextAiringEpisode || null,
    anilistId:    al.id,
    anilistUrl:   al.siteUrl || null,
    anilistPoster: al.coverImage?.extraLarge || al.coverImage?.large || null,
    lastReleaseDate: masterEntry.lastReleaseDate || null,
    latestReleaseDate: masterEntry.latestReleaseDate || null,
  };
}

// ─── Generate AI synopsis ─────────────────────────────────────────────────────
async function generateAISynopsis(title, nativeTitle, genres) {
  if (GEMINI_API_KEY) {
    try {
      const prompt = `Buat sinopsis singkat dalam bahasa Indonesia (3-4 kalimat) untuk anime berjudul "${title}"${nativeTitle ? ` (${nativeTitle})` : ''}${genres?.length ? ` bergenre ${genres.slice(0,3).join(', ')}` : ''}. Jangan sebut nama karakter spesifik, fokus ke premis cerita.`;
      const res = await anilistRequest('', null); // placeholder
      // Use fetch for Gemini
      const gRes = await new Promise((resolve, reject) => {
        const body = JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] });
        const req = https.request({
          hostname: 'generativelanguage.googleapis.com',
          path: `/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d))}catch{resolve(null)}}); });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body); req.end();
      });
      const text = gRes?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      if (text) return { text, source: 'gemini' };
    } catch {}
  }
  if (GROQ_API_KEY) {
    try {
      const prompt = `Buat sinopsis anime "${title}" dalam bahasa Indonesia, 3-4 kalimat, fokus ke premis cerita.`;
      const gRes = await new Promise((resolve, reject) => {
        const body = JSON.stringify({ model: 'llama3-8b-8192', messages: [{ role: 'user', content: prompt }], max_tokens: 200 });
        const req = https.request({
          hostname: 'api.groq.com',
          path: '/openai/v1/chat/completions',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Length': Buffer.byteLength(body) },
        }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d))}catch{resolve(null)}}); });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body); req.end();
      });
      const text = gRes?.choices?.[0]?.message?.content?.trim();
      if (text) return { text, source: 'groq' };
    } catch {}
  }
  return null;
}

// ─── GitHub upload ────────────────────────────────────────────────────────────
async function uploadToGitHub(filePath) {
  log('⬆️  Upload ke GitHub Release...');
  const filename = path.basename(filePath);
  const content  = fs.readFileSync(filePath);

  const listRes = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: `/repos/${GH_OWNER}/${GH_REPO}/releases/tags/${RELEASE_TAG}`,
      method: 'GET',
      headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'AddMissingAnime', 'X-GitHub-Api-Version': '2022-11-28' },
    }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d))}catch{resolve(null)}}); });
    req.on('error', reject); req.end();
  });

  const releaseId = listRes?.id;
  const assets    = listRes?.assets || [];
  const existing  = assets.find(a => a.name === filename);

  if (existing) {
    log(`  Hapus asset lama (${existing.id})`);
    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.github.com',
        path: `/repos/${GH_OWNER}/${GH_REPO}/releases/assets/${existing.id}`,
        method: 'DELETE',
        headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'AddMissingAnime', 'X-GitHub-Api-Version': '2022-11-28' },
      }, res => { res.resume(); res.on('end', resolve); });
      req.on('error', reject); req.end();
    });
    await sleep(1000);
  }

  await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'uploads.github.com',
      path: `/repos/${GH_OWNER}/${GH_REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(filename)}`,
      method: 'POST',
      headers: {
        Authorization: `Bearer ${GH_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/octet-stream',
        'Content-Length': content.length,
        'User-Agent': 'AddMissingAnime',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }, res => { res.resume(); res.on('end', resolve); });
    req.on('error', reject);
    req.write(content); req.end();
  });

  const downloadUrl = `https://github.com/${GH_OWNER}/${GH_REPO}/releases/download/${RELEASE_TAG}/${filename}`;
  log(`✅ Upload sukses: ${downloadUrl}`);

  // Update cache-urls.json
  const cacheUrls = {
    fullCacheUrl: downloadUrl,
    lightListUrl: `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/main/data/anisub-light-list.json`,
    updatedAt: new Date().toISOString(),
    totalAnime: JSON.parse(fs.readFileSync(OUTPUT_FILE,'utf8')).totalAnime,
  };
  const cuPath = path.join(DATA_DIR, 'cache-urls.json');
  fs.writeFileSync(cuPath, JSON.stringify(cacheUrls, null, 2));

  // Push cache-urls.json ke GitHub
  const cuContent = Buffer.from(fs.readFileSync(cuPath)).toString('base64');
  const cuApiUrl  = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/data/cache-urls.json`;
  let sha;
  try {
    const getRes = await new Promise((resolve, reject) => {
      const req = https.request({ hostname: 'api.github.com', path: `/repos/${GH_OWNER}/${GH_REPO}/contents/data/cache-urls.json`, headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'AddMissingAnime', 'X-GitHub-Api-Version': '2022-11-28' } }, res => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{try{resolve(JSON.parse(d))}catch{resolve(null)}}); });
      req.on('error', reject); req.end();
    });
    sha = getRes?.sha;
  } catch {}

  await new Promise((resolve, reject) => {
    const body = JSON.stringify({ message: `chore: update cache-urls.json [${new Date().toISOString()}]`, content: cuContent, branch: 'main', ...(sha ? { sha } : {}) });
    const req = https.request({ hostname: 'api.github.com', path: `/repos/${GH_OWNER}/${GH_REPO}/contents/data/cache-urls.json`, method: 'PUT', headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'User-Agent': 'AddMissingAnime', 'X-GitHub-Api-Version': '2022-11-28' } }, res => { res.resume(); res.on('end', resolve); });
    req.on('error', reject); req.write(body); req.end();
  });
  log('✅ cache-urls.json pushed ke GitHub');
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  log('════════════════════════════════════════════════');
  log('  Add Missing Anime (17 baru dari Otakudesu)');
  log('════════════════════════════════════════════════');

  // Load data
  const missing  = JSON.parse(fs.readFileSync(MISSING_FILE, 'utf8'));
  const master   = JSON.parse(fs.readFileSync(MASTER_FILE,  'utf8'));
  const prog     = JSON.parse(fs.readFileSync(PROGRESS_FILE,'utf8'));
  const cache    = JSON.parse(fs.readFileSync(OUTPUT_FILE,  'utf8'));

  log(`Missing: ${missing.length} anime`);

  const done       = prog.done  || {};
  const cacheMap   = new Map(cache.anime.map(a => [a.animeId, a]));
  const fixed      = [];
  const stillFailed = [];

  for (let i = 0; i < missing.length; i++) {
    const m = missing[i];
    const { animeId, title, poster, episodes, status, listStatus, lastReleaseDate, latestReleaseDate } = m;

    log(`\n[${i+1}/${missing.length}] ${animeId}`);
    log(`  Title: ${title}`);

    let alData = null;

    // Try manual override first
    const manualId = MANUAL_ID_OVERRIDE[animeId];
    if (manualId && manualId > 0) {
      log(`  [OVERRIDE] Fetch by AniList ID: ${manualId}`);
      alData = await fetchByAniListId(manualId);
      if (alData) log(`  ✅ Ketemu: ${alData.title?.romaji}`);
      await sleep(750);
    }

    // Search if no override or override failed
    if (!alData) {
      const searchStr = SEARCH_HINTS[animeId] || title;
      log(`  [SEARCH] "${searchStr}"`);
      alData = await searchAniList(searchStr);
      if (alData) log(`  ✅ Search ketemu: ${alData.title?.romaji} (id=${alData.id})`);
      else log(`  ❌ Tidak ketemu di AniList`);
      await sleep(750);
    }

    // Build cache entry
    const masterEntry = { animeId, title, poster, episodes, status, listStatus, lastReleaseDate, latestReleaseDate };
    let cacheEntry = transformAniListData(masterEntry, alData);

    if (!cacheEntry) {
      // No AniList data — create minimal entry from master data
      cacheEntry = {
        animeId, title, poster, posterHD: null, banner: null,
        synopsis: null, trailer: null, genres: [], score: null,
        popularity: null, episodes, duration: null, status,
        listStatus: listStatus || 'completed', season: null, seasonYear: null,
        source: null, countryOfOrigin: null, studios: [], staff: [], characters: [],
        relations: [], nextAiringEpisode: null, anilistId: null, anilistUrl: null,
        anilistPoster: null, lastReleaseDate, latestReleaseDate,
      };
    }

    // Generate AI synopsis jika belum ada
    if (!cacheEntry.synopsis && (GEMINI_API_KEY || GROQ_API_KEY)) {
      log(`  📝 Generate AI synopsis...`);
      const ai = await generateAISynopsis(cacheEntry.titleRomaji || title, cacheEntry.titleNative, cacheEntry.genres);
      if (ai) { cacheEntry.synopsis = ai.text; cacheEntry.synopsisSource = ai.source; log(`    ✓ synopsis dari ${ai.source}`); }
    }

    log(`  📊 posterHD:${!!cacheEntry.posterHD} banner:${!!cacheEntry.banner} synopsis:${!!cacheEntry.synopsis} chars:${cacheEntry.characters?.length||0} staff:${cacheEntry.staff?.length||0}`);

    // Update master list
    master[animeId] = { title, poster, episodes, animeId, latestReleaseDate: latestReleaseDate||'', lastReleaseDate: lastReleaseDate||'', status: status||'Completed', listStatus: listStatus||'completed' };

    // Update progress and cache map
    done[animeId] = cacheEntry;
    cacheMap.set(animeId, cacheEntry);

    if (cacheEntry.anilistId) fixed.push(animeId);
    else stillFailed.push(animeId);
  }

  // ── Save master list ──
  fs.writeFileSync(MASTER_FILE, JSON.stringify(master));
  log(`\n✅ anime-master-list.json updated: ${Object.keys(master).length} total`);

  // ── Save progress ──
  prog.done = done;
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(prog));
  log(`✅ scrape-progress.json updated: ${Object.keys(done).length} done`);

  // ── Rebuild full cache ──
  log('\n📦 Rebuild anisub-full-cache.json...');
  const allAnime = Array.from(cacheMap.values());
  const newCache = { generatedAt: new Date().toISOString(), totalAnime: allAnime.length, anime: allAnime };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(newCache));
  log(`Cache: ${allAnime.length} anime, ${(fs.statSync(OUTPUT_FILE).size/1024/1024).toFixed(1)} MB`);

  // ── Sync ke /tmp ──
  try {
    fs.copyFileSync(OUTPUT_FILE, '/tmp/anisub-full-cache.json');
    log('✅ Copied ke /tmp/anisub-full-cache.json');
  } catch(e) { log('⚠️ Copy ke /tmp gagal: ' + e.message); }

  // ── Upload ke GitHub ──
  await uploadToGitHub(OUTPUT_FILE);

  // ── Summary ──
  log('\n════════════════ SUMMARY ════════════════');
  log(`Total anime sekarang: ${allAnime.length}`);
  log(`Fixed (dengan AniList): ${fixed.length}`);
  fixed.forEach(id => log(`  ✅ ${id}`));
  log(`No AniList ID: ${stillFailed.length}`);
  stillFailed.forEach(id => log(`  ⚠️  ${id}`));
  log('=========================================');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
