#!/usr/bin/env node
/**
 * scrape-anime-turbo.js — Turbo parallel version of scrape-anime-data.js
 *
 * Strategi:
 *  1. Load cache lama (anisub-full-cache.json) — reuse data AniList yang sudah ada
 *  2. Fetch fresh list dari OtakuDesu (ongoing + completed)
 *  3. Anime SUDAH ADA di cache → skip AniList query, cukup update basic info (episode, tanggal)
 *  4. Anime BARU (tidak ada di cache) → query AniList secara paralel batch 5 concurrent
 *  5. Rate limit AniList dijaga max 80 req/menit via token bucket
 *  6. Upload ke GitHub Release
 *
 * Hasil: 1800+ anime selesai < 30 menit (biasanya < 10 menit kalau cache lama masih besar)
 *
 * Usage:
 *   node scripts/scrape-anime-turbo.js              # smart: reuse cache lama
 *   node scripts/scrape-anime-turbo.js --full       # fresh semua, tapi tetap paralel
 *   node scripts/scrape-anime-turbo.js --upload-only
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const DATA_DIR      = path.join(__dirname, '../data');
const OUTPUT_FILE   = path.join(DATA_DIR, 'anisub-full-cache.json');
const LIST_FILE     = path.join(DATA_DIR, 'anime-master-list.json');
const PROGRESS_FILE = path.join(DATA_DIR, 'scrape-progress.json');
const LIGHT_FILE    = path.join(DATA_DIR, 'anisub-light-list.json');
const CACHE_URLS    = path.join(DATA_DIR, 'cache-urls.json');

fs.mkdirSync(DATA_DIR, { recursive: true });

const API_BASE    = 'http://127.0.0.1:8080';
const GH_TOKEN    = process.env.GITHUB_TOKEN || '';
const GH_OWNER    = process.env.GITHUB_OWNER || 'JMStory-27';
const GH_REPO     = process.env.GITHUB_REPO  || 'Jumalia-Makruf';
const RELEASE_TAG  = 'anisub-cache-v1';
const RELEASE_NAME = 'AniSub Full Cache Data';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY   = process.env.GROQ_API_KEY   || '';
const ANILIST_URL    = 'https://graphql.anilist.co';

// ── Rate limiter ─────────────────────────────────────────────────────────────
// AniList: max 90 req/menit. Kita cap 75/menit untuk safety margin.
const RATE_LIMIT_PER_MIN = 75;
const TOKEN_INTERVAL_MS  = Math.ceil(60_000 / RATE_LIMIT_PER_MIN); // ~800ms per token
let   tokenBucket        = RATE_LIMIT_PER_MIN; // mulai penuh
let   lastRefill         = Date.now();

function refillBucket() {
  const now     = Date.now();
  const elapsed = now - lastRefill;
  const newTokens = Math.floor((elapsed / 60_000) * RATE_LIMIT_PER_MIN);
  if (newTokens > 0) {
    tokenBucket = Math.min(RATE_LIMIT_PER_MIN, tokenBucket + newTokens);
    lastRefill  = now;
  }
}

async function acquireToken() {
  while (true) {
    refillBucket();
    if (tokenBucket > 0) { tokenBucket--; return; }
    await sleep(TOKEN_INTERVAL_MS);
  }
}

// ── Concurrency limiter ───────────────────────────────────────────────────────
const CONCURRENCY = 5; // parallel AniList requests

async function mapConcurrent(items, fn, concurrency = CONCURRENCY) {
  const results = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function now()     { return new Date().toISOString().slice(11, 19); }
function log(msg)  { process.stdout.write(`[${now()}] ${msg}\n`); }
function saveJSON(f, d) { fs.writeFileSync(f, JSON.stringify(d, null, 0)); }
function loadJSON(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } }

const args          = process.argv.slice(2);
const FLAG_FULL     = args.includes('--full');
const FLAG_UPLOAD   = args.includes('--upload-only');

// ── Title normalization (sama dengan scraper lama) ────────────────────────────
function normalizeTitle(raw) {
  return raw
    .replace(/\s*[-–:]\s*Sub\s*Indo.*/i, '')
    .replace(/\s*Sub\s*Indo.*/i, '')
    .replace(/\s*[:-]\s*(Season|Part|Cour|Musim)\s*\d+.*/i, '')
    .replace(/\s+(Season|Part|Cour|Musim)\s+\d+\s*$/i, '')
    .replace(/\s*\(([^)]+)\)\s*/g, ' ')
    .replace(/\bS(\d+)\b/i, 'Season $1')
    .replace(/\s+/g, ' ').trim();
}

function titleVariants(raw) {
  const base  = normalizeTitle(raw);
  const words = base.split(' ');
  const set   = new Set([base]);
  if (words.length > 3) set.add(words.slice(0, -2).join(' '));
  if (words.length > 3) set.add(words.slice(0, 3).join(' '));
  if (words.length > 2) set.add(words.slice(0, 2).join(' '));
  if (words.length > 2) set.add(words.slice(0, Math.ceil(words.length / 2) + 1).join(' '));
  set.add(base.replace(/\s+\d+\s*$/, '').trim());
  set.add(base.replace(/\s+(II|III|IV|V|VI|2|3|4|5)\s*$/i, '').trim());
  const rawClean = raw.replace(/\s*Sub\s*Indo.*/i, '').replace(/\s*[-–:]\s*Sub\s*Indo.*/i, '').replace(/\s*\(([^)]+)\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  if (rawClean && rawClean !== base) set.add(rawClean);
  return [...set].filter(v => v && v.length >= 2);
}

// ── Manual overrides (dari scraper lama) ─────────────────────────────────────
const MANUAL_ID_OVERRIDE = {
  'lv2-kara-cheat-sub-indo': 170130,
  'vtuber-nankiritara-sub-indo': 160488,
  'tokidoki-russia-alya-san-sub-indo': 162804,
  'kitsutsuki-dokoro-sub-indo': 108629,
  'scooped-up-by-an-s-ranked-adventurer-sub-indo': 179885,
  'neet-kuoichi-sub-indo': 174654,
  'kabushikigaisha-lumiere-sub-indo': 171025,
  'tennis-world-cup-sub-indo': 140187,
  'joutai-ijou-skill-sub-indo': 173694,
  'tensei-datta-node-sub-indo': 156415,
  'tensei-datta-node-s2-sub-indo': 178090,
  'ichijouma-mankitsugurashi-sub-indo': 195734,
  '3z-gumi-ginpachi-sensei-sub-indo': 162890,
  'saigo-ni-hitotsu-dake-onegai-shitemo-yoroshii-deshou-ka-sub-indo': 181447,
};

const MANUAL_SEARCH_OVERRIDE = {
  'gotoubun-hanayome-season-2-sub-indo': '5-toubun no Hanayome',
  'gotobun-hanayome-subtitle-indonesia': '5-toubun no Hanayome',
  'goumon-sub-indo': 'Himesama Goumon no Jikan desu',
  'goumon-s2-sub-indo': 'Himesama Goumon no Jikan desu Season 2',
  'tensei-datta-node-sub-indo': 'Tensei shitara Dai Nana Ouji Datta node',
  'tensei-datta-node-s2-sub-indo': 'Tensei shitara Dai Nana Ouji Datta node',
  'isekai-no-ojisan-sub-indo': 'Isekai Ojisan',
  'vtuber-nankiritara-sub-indo': 'VTuber Nandaga Haishin Kiri Wasuretara',
  'tokidoki-russia-alya-san-sub-indo': 'Tokidoki Bosotto Russia-go de Dereru Tonari no Alya-san',
  'maougun-saikyou-majutsushi-ningen-sub-indo': 'Maougun Saikyou no Majutsushi wa Ningen datta',
  'akuyaku-kattemimashita-sub-indo': 'Akuyaku Reijou nanode Last Boss wo Kattemimashita',
  'kajin-kuroitsu-sub-indo': 'Kaijin Kaihatsu-bu no Kuroitsu-san',
  'lv2-kara-cheat-sub-indo': 'Lv2 kara Cheat datta Motoyuusha Kouho',
  'madougushi-dahliya-utsumukanai-sub-indo': 'Dahliya Wilts No More',
  'scooped-up-by-an-s-ranked-adventurer-sub-indo': 'Yuusha Party wo Tsuihou sareta Shiromadoushi',
  'neet-kuoichi-sub-indo': 'NEET Kunoichi to Nazeka Dousei Hajimemashita',
  'kabushikigaisha-lumiere-sub-indo': 'Kabushikigaisha Magi-Lumiere',
  'tennis-world-cup-sub-indo': 'Shin Tennis no Oujisama U-17 World Cup',
  'hoshifuru-nina-sub-indo': 'Hoshifuru Oukoku no Nina',
  'saikyou-shieshoku-sub-indo': 'Saikyou no Shienshoku Wajutsushi',
  'sayuseijinsei-sub-indo': 'Sayounara Ryuusei Konnichiwa Jinsei',
  'one-room-sub-indo': 'One Room Hiatari Futsuu Tenshi-tsuki',
  'joutai-ijou-skill-sub-indo': 'Hazurewaku no Joutai Ijou Skill de Saikyou ni Natta',
  'plastic-nee-sub-indo': 'Plastic Neesan',
  'kitsutsuki-dokoro-sub-indo': 'Kitsutsuki Tanteidokoro',
  'onichan-ai-areba-sub-indo': 'Oniichan dakedo Ai sae Areba Kankeinai yo ne',
  'nekogatari-shiro-sub-indo': 'Nekomonogatari Shiro',
  'boku-kanojo-majimesugiru-sho-bitch-na-ken-subtitle-indonesia': 'Boku no Kanojo ga Majimesugiru Sho-bitch na Ken',
  'aico-incarnation-subtitle-indonesia': 'A.I.C.O.: Incarnation',
  'dnmachi-oratoria-subtitle-indonesia': 'Dungeon ni Deai wo Motomeru Gaiden Sword Oratoria',
  'netoge-no-yome-wa-onnanoko-ja-nai-omotta-bd': 'Netoge no Yome wa Onna no Ko ja Nai to Omotta',
  'krsj-movie-subtitle-indonesia': 'Kuroshitsuji: Book of the Atlantic',
  'yai-ari-deshita-sub-indo': 'Tai-Ari deshita Ojousama wa Kakutou Game',
  'tenkouno-seiso-karen-bishoujo-sub-indo': 'Tenkou-saki no Seiso Karen na Bishoujo',
  'futsutsuka-akujo-gozaimasu-sub-indo': 'Futsutsuka na Akujo dewa Gozaimasu',
  'ichijouma-mankitsugurashi-sub-indo': 'Ichijouma Mankitsugurashi',
  '3z-gumi-ginpachi-sensei-sub-indo': 'Gintama Ginpachi-sensei',
  'saigo-ni-hitotsu-dake-onegai-shitemo-yoroshii-deshou-ka-sub-indo': 'Saigo ni Hitotsu dake Onegai',
  '12-sai-chicchana-mune-no-tokimeki': '12-sai.: Chicchana Mune no Tokimeki',
};

// ── AniList GraphQL ───────────────────────────────────────────────────────────
const AL_FIELDS = `
  id idMal
  title{ romaji english native }
  description(asHtml:false)
  bannerImage
  coverImage{ extraLarge large medium }
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
`;

const Q_BY_SEARCH = `query($search:String){ Media(search:$search,type:ANIME,sort:SEARCH_MATCH){ ${AL_FIELDS} } }`;
const Q_BY_ID     = `query($id:Int){ Media(id:$id,type:ANIME){ ${AL_FIELDS} } }`;
const Q_BY_MAL    = `query($idMal:Int){ Media(idMal:$idMal,type:ANIME){ ${AL_FIELDS} } }`;

async function alFetch(query, variables, retries = 0) {
  await acquireToken();
  try {
    const res = await fetch(ANILIST_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify({ query, variables }),
      signal:  AbortSignal.timeout(20_000),
    });
    if (res.status === 429) {
      const wait = parseInt(res.headers.get('Retry-After') || '65', 10) * 1000;
      log(`  ⚠️  Rate limit AniList! Tunggu ${Math.round(wait/1000)}s...`);
      await sleep(wait + 2000);
      return alFetch(query, variables, retries); // token already consumed, retry
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors) return null;
    return json.data?.Media || null;
  } catch (err) {
    if (retries < 3) { await sleep(3000 * (retries + 1)); return alFetch(query, variables, retries + 1); }
    return null;
  }
}

async function findOnAniList(anime) {
  // 1. Manual ID override — paling akurat
  if (MANUAL_ID_OVERRIDE[anime.animeId]) {
    const r = await alFetch(Q_BY_ID, { id: MANUAL_ID_OVERRIDE[anime.animeId] });
    if (r) return r;
  }

  // 2. Manual search override
  if (MANUAL_SEARCH_OVERRIDE[anime.animeId]) {
    const r = await alFetch(Q_BY_SEARCH, { search: MANUAL_SEARCH_OVERRIDE[anime.animeId] });
    if (r) return r;
  }

  // 3. Title variants
  const variants = titleVariants(anime.title);
  const noSpecial = normalizeTitle(anime.title).replace(/["""''【】「」『』・×\u2019\u201c\u201d]/g, ' ').replace(/\s+/g, ' ').trim();
  if (noSpecial && !variants.includes(noSpecial)) variants.push(noSpecial);

  for (const v of variants) {
    const r = await alFetch(Q_BY_SEARCH, { search: v });
    if (r) return r;
  }

  // 4. MAL fallback via Jikan
  try {
    const q = encodeURIComponent(normalizeTitle(anime.title).slice(0, 60));
    await sleep(600);
    const jr = await fetch(`https://api.jikan.moe/v4/anime?q=${q}&limit=3&sfw`, {
      headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000),
    });
    if (jr.ok) {
      const jd  = await jr.json();
      const malId = jd.data?.[0]?.mal_id;
      if (malId) {
        const r = await alFetch(Q_BY_MAL, { idMal: malId });
        if (r) return r;
      }
    }
  } catch {}

  return null;
}

async function genAISynopsis(title, titleNative, genres) {
  const genreHint = genres?.length ? ` (genre: ${genres.slice(0, 3).join(', ')})` : '';
  const prompt    = `Tulis sinopsis anime "${title}"${titleNative ? ` / "${titleNative}"` : ''}${genreHint} dalam bahasa Indonesia, 2-3 paragraf ringkas, tanpa spoiler besar. Langsung mulai isi sinopsis.`;

  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }), signal: AbortSignal.timeout(20_000) }
      );
      if (res.ok) {
        const j = await res.json();
        const t = j?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (t && t.length > 80) return t;
      }
    } catch {}
  }

  if (GROQ_API_KEY) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: prompt }], max_tokens: 500 }),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        const j = await res.json();
        const t = j?.choices?.[0]?.message?.content?.trim();
        if (t && t.length > 80) return t;
      }
    } catch {}
  }

  return null;
}

function transformAL(otaku, al) {
  const base = {
    animeId:           otaku.animeId,
    title:             otaku.title,
    otakudesuUrl:      otaku.otakudesuUrl || `https://otakudesu.blog/anime/${otaku.animeId}/`,
    poster:            otaku.poster || null,
    listStatus:        otaku.listStatus,
    episodes:          otaku.episodes || null,
    latestReleaseDate: otaku.latestReleaseDate || null,
    lastReleaseDate:   otaku.lastReleaseDate || null,
    releaseDay:        otaku.releaseDay || null,
    anilistId: null, malId: null, anilistUrl: null,
    titleRomaji: null, titleEnglish: null, titleNative: null,
    banner: null, posterHD: null, synopsis: null, trailer: null,
    genres: [], score: null, status: null, type: null,
    duration: null, season: null, seasonYear: null,
    source: null, countryOfOrigin: null,
    studios: [], staff: [], characters: [], relations: [], nextEpisode: null,
  };

  if (!al) return base;

  base.anilistId    = al.id;
  base.malId        = al.idMal;
  base.anilistUrl   = al.siteUrl;
  base.titleRomaji  = al.title?.romaji  || null;
  base.titleEnglish = al.title?.english || null;
  base.titleNative  = al.title?.native  || null;
  base.banner       = al.bannerImage    || null;
  base.posterHD     = al.coverImage?.extraLarge || al.coverImage?.large || null;
  base.synopsis     = al.description ? al.description.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim() : null;
  if (al.trailer?.id) {
    base.trailer = {
      id: al.trailer.id, site: al.trailer.site || 'youtube',
      url: al.trailer.site === 'youtube' ? `https://www.youtube.com/watch?v=${al.trailer.id}` : `https://www.dailymotion.com/video/${al.trailer.id}`,
      thumbnail: al.trailer.site === 'youtube' ? `https://img.youtube.com/vi/${al.trailer.id}/hqdefault.jpg` : null,
    };
  }
  base.genres    = al.genres || [];
  base.score     = al.averageScore || al.meanScore || null;
  base.status    = al.status   || null;
  base.type      = al.format   || null;
  base.episodes  = al.episodes ? String(al.episodes) : base.episodes;
  base.duration  = al.duration ? `${al.duration} menit` : null;
  base.season    = al.season   || null;
  base.seasonYear = al.seasonYear || null;
  base.source    = al.source   || null;
  base.countryOfOrigin = al.countryOfOrigin || null;
  base.studios   = (al.studios?.nodes || []).map(s => ({ name: s.name, isMain: s.isAnimationStudio }));
  base.staff     = (al.staff?.edges   || []).map(e => ({ id: e.node?.id, role: e.role, name: e.node?.name?.full, nameNative: e.node?.name?.native, image: e.node?.image?.medium, siteUrl: e.node?.siteUrl })).filter(s => s.name);
  base.characters = (al.characters?.edges || []).map(edge => ({
    id: edge.node?.id, role: edge.role, name: edge.node?.name?.full, nameNative: edge.node?.name?.native,
    image: edge.node?.image?.medium, siteUrl: edge.node?.siteUrl,
    voiceActors: (edge.voiceActors || []).map(va => ({ id: va.id, name: va.name?.full, nameNative: va.name?.native, image: va.image?.medium, siteUrl: va.siteUrl })).filter(v => v.name),
  })).filter(c => c.name);
  base.relations  = (al.relations?.edges || []).map(e => ({ type: e.relationType, id: e.node?.id, title: e.node?.title?.romaji, mediaType: e.node?.type, format: e.node?.format })).filter(r => r.title);
  if (al.nextAiringEpisode) base.nextEpisode = { episode: al.nextAiringEpisode.episode, airingAt: al.nextAiringEpisode.airingAt };

  return base;
}

// ── Fetch semua halaman dari OtakuDesu ───────────────────────────────────────
async function fetchAllFromOtakuDesu() {
  const all = {};

  // Ongoing (semua halaman)
  for (let page = 1; page <= 20; page++) {
    try {
      const res = await fetch(`${API_BASE}/api/otakudesu/ongoing?page=${page}`, { signal: AbortSignal.timeout(10_000) });
      const j   = await res.json();
      const list = j.data?.animeList || [];
      if (!list.length) break;
      for (const a of list) all[a.animeId] = { ...a, listStatus: 'ongoing' };
      if (list.length < 25) break;
    } catch (err) { log(`  ⚠️  Ongoing page ${page}: ${err.message}`); break; }
  }
  const ongoingCount = Object.values(all).filter(a => a.listStatus === 'ongoing').length;
  log(`  Ongoing: ${ongoingCount}`);

  // Completed (semua halaman)
  for (let page = 1; page <= 100; page++) {
    try {
      const res = await fetch(`${API_BASE}/api/otakudesu/completed?page=${page}`, { signal: AbortSignal.timeout(10_000) });
      const j   = await res.json();
      const list = j.data?.animeList || [];
      if (!list.length) break;
      for (const a of list) { if (!all[a.animeId]) all[a.animeId] = { ...a, listStatus: 'completed' }; }
      if (list.length < 25) break;
    } catch (err) { log(`  ⚠️  Completed page ${page}: ${err.message}`); break; }
  }
  log(`  Total unik dari OtakuDesu: ${Object.keys(all).length}`);
  return all;
}

// ── GitHub helpers ────────────────────────────────────────────────────────────
async function ghReq(method, path_, body) {
  const res = await fetch(`https://api.github.com${path_}`, {
    method,
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'AniSubTurbo/2.0' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok && res.status !== 404) throw new Error(`GH ${method} ${path_} → ${res.status}`);
  if (res.status === 204) return {};
  return res.json();
}

async function uploadAsset(releaseId, filename, buf) {
  const url = `https://uploads.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(filename)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/octet-stream', 'Content-Length': String(buf.length), 'User-Agent': 'AniSubTurbo/2.0' },
    body: buf, duplex: 'half', signal: AbortSignal.timeout(300_000),
  });
  if (!res.ok) { const t = await res.text(); throw new Error(`Upload ${filename} gagal ${res.status}: ${t.slice(0, 200)}`); }
  return res.json();
}

async function uploadToGitHub(output) {
  if (!GH_TOKEN) { log('⚠️  GITHUB_TOKEN tidak ada, skip upload'); return null; }
  log('\n☁️  Upload ke GitHub Release...');

  // Get or create release
  let release = await ghReq('GET', `/repos/${GH_OWNER}/${GH_REPO}/releases/tags/${RELEASE_TAG}`);
  if (!release.id) {
    release = await ghReq('POST', `/repos/${GH_OWNER}/${GH_REPO}/releases`, {
      tag_name: RELEASE_TAG, target_commitish: 'main', name: RELEASE_NAME,
      body: 'Auto-generated cache data AniSub.', draft: false, prerelease: false,
    });
  }
  log(`  Release ID: ${release.id}`);

  // Hapus asset lama
  const existing = await ghReq('GET', `/repos/${GH_OWNER}/${GH_REPO}/releases/${release.id}/assets`);
  if (Array.isArray(existing)) {
    for (const a of existing) {
      if (a.name === 'anisub-full-cache.json' || a.name === 'anisub-light-list.json') {
        await ghReq('DELETE', `/repos/${GH_OWNER}/${GH_REPO}/releases/assets/${a.id}`);
        log(`  🗑️  Hapus asset lama: ${a.name}`);
      }
    }
  }

  // Upload full cache
  saveJSON(OUTPUT_FILE, output);
  const mainBuf   = fs.readFileSync(OUTPUT_FILE);
  log(`  📤 Upload anisub-full-cache.json (${(mainBuf.length / 1024 / 1024).toFixed(2)} MB)...`);
  const mainAsset = await uploadAsset(release.id, 'anisub-full-cache.json', mainBuf);
  log(`  ✅ ${mainAsset.browser_download_url}`);

  // Build & upload light list
  const lightData = {
    meta: output.meta,
    anime: output.anime.map(a => ({
      animeId: a.animeId, title: a.title, titleRomaji: a.titleRomaji, titleEnglish: a.titleEnglish,
      poster: a.posterHD || a.poster, banner: a.banner, genres: a.genres, score: a.score,
      status: a.status, episodes: a.episodes, seasonYear: a.seasonYear, listStatus: a.listStatus,
      anilistId: a.anilistId, trailer: a.trailer,
    })),
  };
  saveJSON(LIGHT_FILE, lightData);
  const lightBuf   = fs.readFileSync(LIGHT_FILE);
  log(`  📤 Upload anisub-light-list.json (${(lightBuf.length / 1024 / 1024).toFixed(2)} MB)...`);
  const lightAsset = await uploadAsset(release.id, 'anisub-light-list.json', lightBuf);
  log(`  ✅ ${lightAsset.browser_download_url}`);

  const cacheConfig = {
    releaseTag: RELEASE_TAG, fullCacheUrl: mainAsset.browser_download_url,
    lightListUrl: lightAsset.browser_download_url, updatedAt: new Date().toISOString(),
    totalAnime: output.meta.totalAnime,
  };
  fs.writeFileSync(CACHE_URLS, JSON.stringify(cacheConfig, null, 2));
  log(`  Config: ${CACHE_URLS}`);
  return cacheConfig;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const startTime = Date.now();
  log('═══════════════════════════════════════════════════════════');
  log('  🚀 AniSub Turbo Scraper v2.0 — Parallel + Cache Reuse');
  log('═══════════════════════════════════════════════════════════');

  if (FLAG_UPLOAD) {
    const existing = loadJSON(OUTPUT_FILE, null);
    if (!existing) { log('❌ Output file tidak ada'); process.exit(1); }
    const cfg = await uploadToGitHub(existing);
    if (cfg) log(`\n🎉 Upload selesai! Total: ${existing.meta?.totalAnime} anime`);
    return;
  }

  // ── STEP 1: Fetch fresh list OtakuDesu ───────────────────────────────────
  log('\n📋 STEP 1: Fetch daftar anime OtakuDesu terbaru...');
  const freshMap = await fetchAllFromOtakuDesu();
  const allIds   = Object.keys(freshMap);

  // Simpan master list terbaru
  saveJSON(LIST_FILE, freshMap);
  log(`  Disimpan: ${LIST_FILE}`);

  // ── STEP 2: Load cache lama ───────────────────────────────────────────────
  log('\n📦 STEP 2: Load cache lama...');
  const oldCacheRaw = loadJSON(OUTPUT_FILE, null);
  const oldCacheArr = oldCacheRaw?.anime || [];

  // Bangun map dari cache lama: animeId → data lengkap
  const oldCacheMap = {};
  for (const a of oldCacheArr) oldCacheMap[a.animeId] = a;

  log(`  Cache lama: ${oldCacheArr.length} anime`);
  log(`  Mode: ${FLAG_FULL ? 'FULL REFRESH (parallel)' : 'SMART (reuse cache lama)'}`);

  // ── STEP 3: Pisahkan anime baru vs yang sudah ada ─────────────────────────
  log('\n🔍 STEP 3: Analisis anime baru vs lama...');
  const toScrape = []; // anime yang perlu AniList query
  const reused   = []; // anime yang diambil dari cache lama

  for (const id of allIds) {
    const freshAnime = freshMap[id];
    const cached     = oldCacheMap[id];

    if (!FLAG_FULL && cached && cached.anilistId) {
      // Reuse dari cache — update saja basic info yang mungkin berubah
      const updated = {
        ...cached,
        poster:            freshAnime.poster || cached.poster,
        listStatus:        freshAnime.listStatus,
        episodes:          freshAnime.episodes || cached.episodes,
        latestReleaseDate: freshAnime.latestReleaseDate || cached.latestReleaseDate,
        lastReleaseDate:   freshAnime.lastReleaseDate   || cached.lastReleaseDate,
        releaseDay:        freshAnime.releaseDay        || cached.releaseDay,
      };
      // Refresh nextEpisode untuk ongoing (data cepat kadaluarsa)
      if (freshAnime.listStatus === 'ongoing' && cached.listStatus !== 'ongoing') {
        updated.listStatus = 'ongoing';
        updated.latestReleaseDate = freshAnime.latestReleaseDate || null;
      }
      reused.push(updated);
    } else if (!FLAG_FULL && cached && !cached.anilistId && cached.posterHD) {
      // Tidak ketemu di AniList sebelumnya tapi punya poster — reuse, skip retry
      reused.push({ ...cached, poster: freshAnime.poster || cached.poster, listStatus: freshAnime.listStatus, episodes: freshAnime.episodes || cached.episodes, latestReleaseDate: freshAnime.latestReleaseDate || cached.latestReleaseDate });
    } else {
      // Anime baru atau --full mode → perlu AniList query
      toScrape.push({ ...freshAnime });
    }
  }

  log(`  ✅ Reuse dari cache: ${reused.length} anime (skip AniList query)`);
  log(`  🆕 Perlu di-scrape (baru/full): ${toScrape.length} anime`);

  if (toScrape.length === 0) {
    log('\n  ℹ️  Semua anime sudah ada di cache. Hanya perlu update metadata.');
  }

  // ── STEP 4: Parallel scrape untuk anime baru ─────────────────────────────
  const scraped   = [];
  let   processed = 0;
  const stepStart = Date.now();

  if (toScrape.length > 0) {
    log(`\n⚡ STEP 4: Parallel scrape ${toScrape.length} anime (${CONCURRENCY} concurrent, max ${RATE_LIMIT_PER_MIN} req/menit)...`);

    await mapConcurrent(toScrape, async (anime, i) => {
      const al     = await findOnAniList(anime);
      const result = transformAL(anime, al);

      // Poster fallback via Jikan jika tidak ada posterHD
      if (!result.posterHD) {
        try {
          await sleep(400);
          const q   = encodeURIComponent(normalizeTitle(anime.title).slice(0, 60));
          const jr  = await fetch(`https://api.jikan.moe/v4/anime?q=${q}&limit=3&sfw`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10_000) });
          if (jr.ok) {
            const jd = await jr.json();
            const poster = jd.data?.[0]?.images?.jpg?.large_image_url || jd.data?.[0]?.images?.jpg?.image_url;
            if (poster) { result.posterHD = poster; result.posterSource = 'jikan'; if (!result.malId && jd.data?.[0]?.mal_id) result.malId = jd.data[0].mal_id; }
          }
        } catch {}
      } else {
        result.posterSource = al ? 'anilist' : null;
      }

      // AI synopsis fallback
      if (!result.synopsis && (GEMINI_API_KEY || GROQ_API_KEY)) {
        const ai = await genAISynopsis(anime.title, result.titleNative, result.genres);
        if (ai) { result.synopsis = ai; result.synopsisSource = 'ai'; }
      } else if (result.synopsis && !result.synopsisSource) {
        result.synopsisSource = 'anilist';
      }

      scraped.push(result);
      processed++;

      if (processed % 10 === 0 || processed === toScrape.length) {
        const elapsed = (Date.now() - stepStart) / 1000;
        const rate    = processed / elapsed;
        const eta     = rate > 0 ? Math.ceil((toScrape.length - processed) / rate / 60) : 0;
        const pct     = Math.round((processed / toScrape.length) * 100);
        const found   = scraped.filter(a => a.anilistId).length;
        log(`  [${pct}%] ${processed}/${toScrape.length} | ✅ ${found} AniList | ETA: ~${eta}m`);
      }
    }, CONCURRENCY);
  }

  // ── STEP 5: Merge & compile ───────────────────────────────────────────────
  log('\n📦 STEP 5: Merge & compile output...');

  // Gabungkan reused + scraped, lalu sort by listStatus (ongoing dulu) → title
  const allResults = [...reused, ...scraped];
  allResults.sort((a, b) => {
    if (a.listStatus !== b.listStatus) return a.listStatus === 'ongoing' ? -1 : 1;
    return (a.title || '').localeCompare(b.title || '');
  });

  const output = {
    meta: {
      version:             2,
      generatedAt:         new Date().toISOString(),
      totalAnime:          allResults.length,
      totalFound:          allResults.filter(a => a.anilistId).length,
      totalNotFound:       allResults.filter(a => !a.anilistId).length,
      totalWithBanner:     allResults.filter(a => a.banner).length,
      totalWithTrailer:    allResults.filter(a => a.trailer).length,
      totalWithCharacters: allResults.filter(a => a.characters?.length > 0).length,
      reusedFromCache:     reused.length,
      freshlyScraped:      scraped.length,
    },
    anime: allResults,
  };

  // Update progress file (kompatibel dengan scrapeanisub.js lama)
  const progressData = { done: {}, failed: [] };
  for (const a of allResults) {
    progressData.done[a.animeId] = a;
    if (!a.anilistId) progressData.failed.push(a.animeId);
  }
  saveJSON(PROGRESS_FILE, progressData);

  const totalSec = Math.round((Date.now() - startTime) / 1000);
  const totalMin = Math.floor(totalSec / 60);
  log(`  Total anime: ${output.meta.totalAnime}`);
  log(`  AniList match: ${output.meta.totalFound} | Tidak ketemu: ${output.meta.totalNotFound}`);
  log(`  Banner: ${output.meta.totalWithBanner} | Trailer: ${output.meta.totalWithTrailer}`);
  log(`  Reuse cache: ${output.meta.reusedFromCache} | Fresh scraped: ${output.meta.freshlyScraped}`);
  log(`  ⏱️  Total waktu: ${totalMin}m ${totalSec % 60}s`);

  // ── STEP 6: Upload ────────────────────────────────────────────────────────
  const cacheConfig = await uploadToGitHub(output);

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  log(`\n🎉 SELESAI! ${output.meta.totalAnime} anime — ${Math.floor(elapsed/60)}m ${elapsed%60}s`);
  if (cacheConfig) {
    process.stdout.write(`CACHE_URLS_JSON:${JSON.stringify(cacheConfig)}\n`);
  }
}

main().catch(err => {
  log('❌ FATAL: ' + err.message);
  console.error(err.stack);
  process.exit(1);
});
