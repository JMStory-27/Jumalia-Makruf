#!/usr/bin/env node
/**
 * scrape-anime-data.js
 * Download data lengkap 1854+ anime dari AniList (poster, banner, sinopsis,
 * trailer, staf, karakter+VA) lalu upload ke GitHub Release sebagai asset JSON.
 *
 * Usage:
 *   node scripts/scrape-anime-data.js
 *   node scripts/scrape-anime-data.js --resume   # lanjut dari progress sebelumnya
 *   node scripts/scrape-anime-data.js --upload-only  # skip scrape, langsung upload
 */

const fs   = require("fs");
const path = require("path");
const https = require("https");

// ─── Paths ───────────────────────────────────────────────────────────────────
const DATA_DIR       = path.join(__dirname, "../data");
const PROGRESS_FILE  = path.join(DATA_DIR, "scrape-progress.json");
const OUTPUT_FILE    = path.join(DATA_DIR, "anisub-full-cache.json");
const LIST_FILE      = path.join(DATA_DIR, "anime-master-list.json");

fs.mkdirSync(DATA_DIR, { recursive: true });

// ─── Config ──────────────────────────────────────────────────────────────────
const API_BASE       = "http://127.0.0.1:8080";
const GH_TOKEN       = process.env.GITHUB_TOKEN || "";
const GH_OWNER       = "JMStory-27";
const GH_REPO        = "Jumalia-Makruf";
const RELEASE_TAG    = "anisub-cache-v1";
const RELEASE_NAME   = "AniSub Full Cache Data";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GROQ_API_KEY   = process.env.GROQ_API_KEY   || "";

const ANILIST_URL   = "https://graphql.anilist.co";
const REQ_DELAY_MS  = 700;   // 700ms antara request → ~85 req/min (limit 90)
const RETRY_DELAY   = 65_000; // tunggu 65 detik jika kena rate limit
const MAX_RETRIES   = 3;

const args = process.argv.slice(2);
const FLAG_RESUME      = args.includes("--resume");
const FLAG_UPLOAD_ONLY = args.includes("--upload-only");

// ─── AniList GraphQL query ────────────────────────────────────────────────────
const ANILIST_QUERY = `
query($search:String){
  Media(search:$search,type:ANIME,sort:SEARCH_MATCH){
    id
    idMal
    title{ romaji english native }
    description(asHtml:false)
    bannerImage
    coverImage{ extraLarge large medium }
    trailer{ id site }
    genres
    averageScore
    meanScore
    popularity
    status
    episodes
    duration
    season
    seasonYear
    source
    hashtag
    countryOfOrigin
    studios(isMain:true){ nodes{ name isAnimationStudio } }
    staff(perPage:15){
      edges{
        role
        node{ id name{ full native } image{ medium } siteUrl }
      }
    }
    characters(sort:[ROLE,RELEVANCE],perPage:20){
      edges{
        role
        node{ id name{ full native } image{ medium } siteUrl }
        voiceActors(language:JAPANESE){
          id name{ full native } image{ medium } siteUrl
        }
      }
    }
    relations{
      edges{
        relationType(version:2)
        node{ id title{ romaji } type format }
      }
    }
    nextAiringEpisode{ airingAt episode }
    siteUrl
  }
}`;

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function now() { return new Date().toISOString().slice(11,19); }

function log(msg) { process.stdout.write(`[${now()}] ${msg}\n`); }

function saveJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 0));
}

function loadJSON(file, def) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch { return def; }
}

// ─── Title normalization untuk matching ke AniList ────────────────────────────
function normalizeTitle(raw) {
  return raw
    .replace(/\s*[-–:]\s*Sub\s*Indo.*/i, "")
    .replace(/\s*Sub\s*Indo.*/i, "")
    .replace(/\s*[:-]\s*(Season|Part|Cour|Musim)\s*\d+.*/i, "")
    .replace(/\s+(Season|Part|Cour|Musim)\s+\d+\s*$/i, "") // trailing tanpa tanda baca
    .replace(/\s*\(([^)]+)\)\s*/g, " ")                    // hapus parenthetical "(Dub)" dll
    .replace(/\bS(\d+)\b/i, "Season $1")
    .replace(/\s+/g, " ")
    .trim();
}

// Beberapa variasi judul untuk fallback search — lebih agresif supaya 39 anime gagal bisa ketemu
function titleVariants(raw) {
  const base = normalizeTitle(raw);
  const words = base.split(" ");
  const set = new Set();

  set.add(base);

  // Hapus 2 kata terakhir (sering "Season X")
  if (words.length > 3) set.add(words.slice(0, -2).join(" "));

  // Hanya 3 kata pertama
  if (words.length > 3) set.add(words.slice(0, 3).join(" "));

  // Hanya 2 kata pertama — sering cukup untuk judul panjang
  if (words.length > 2) set.add(words.slice(0, 2).join(" "));

  // Setengah pertama
  if (words.length > 2) set.add(words.slice(0, Math.ceil(words.length / 2) + 1).join(" "));

  // Hapus angka arab/romawi di akhir
  set.add(base.replace(/\s+\d+\s*$/, "").trim());
  set.add(base.replace(/\s+(II|III|IV|V|VI|2|3|4|5)\s*$/i, "").trim());

  // Raw title tanpa "Sub Indo" — mungkin AniList cocok lebih baik dengan judul asli
  const rawClean = raw
    .replace(/\s*Sub\s*Indo.*/i, "")
    .replace(/\s*[-–:]\s*Sub\s*Indo.*/i, "")
    .replace(/\s*\(([^)]+)\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (rawClean && rawClean !== base) set.add(rawClean);

  // Coba hanya kata-kata pertama sampai ketemu angka atau kata generik
  const stopWords = new Set(["no", "the", "of", "to", "wa", "ga", "de", "ni", "wo", "to"]);
  const firstMeaningful = [];
  for (const w of words) {
    if (/^\d+$/.test(w)) break;
    if (stopWords.has(w.toLowerCase()) && firstMeaningful.length >= 2) break;
    firstMeaningful.push(w);
    if (firstMeaningful.length >= 4) break;
  }
  if (firstMeaningful.length >= 2 && firstMeaningful.join(" ") !== base) {
    set.add(firstMeaningful.join(" "));
  }

  return [...set].filter(v => v && v.length >= 2);
}

// ─── Jikan (MAL) poster fallback — coba beberapa title variants ─────────────
async function fetchMalPosterFallback(title) {
  const variants = titleVariants(title);
  // Tambah short form khusus: ambil 4 kata pertama untuk judul panjang
  const words = title.split(" ");
  if (words.length > 6) variants.push(words.slice(0, 4).join(" "));

  for (const variant of variants) {
    try {
      await sleep(500); // Jikan rate limit: max 3 req/s
      const q   = encodeURIComponent(variant.replace(/[""]/g, "").slice(0, 60));
      const res = await fetch(`https://api.jikan.moe/v4/anime?q=${q}&limit=5&sfw`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 429) { await sleep(3000); continue; }
      if (!res.ok) continue;
      const json = await res.json();
      const hit = json.data?.[0];
      if (!hit) continue;
      // Ambil jika ada hasil
      const poster = hit.images?.jpg?.large_image_url || hit.images?.jpg?.image_url || null;
      if (poster) {
        return {
          poster,
          malId:  hit.mal_id || null,
          title:  hit.title || null,
          variant,
        };
      }
    } catch { /* lanjut ke variant berikutnya */ }
  }
  return null;
}

// ─── Generate sinopsis AI via Gemini → Groq fallback ─────────────────────────
async function generateAISynopsis(title, titleNative, genres) {
  const genreHint = genres?.length ? ` (genre: ${genres.slice(0,3).join(", ")})` : "";
  const prompt =
    `Tulis sinopsis anime "${title}"${titleNative ? ` / "${titleNative}"` : ""}${genreHint} dalam bahasa Indonesia, 2-3 paragraf ringkas, tanpa spoiler besar. ` +
    `Langsung mulai isi sinopsis, tanpa kalimat intro seperti "Berikut sinopsis..." atau "Anime ini...".`;

  // ── Gemini ────────────────────────────────────────────────────────────────
  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal:  AbortSignal.timeout(20_000),
        }
      );
      if (res.ok) {
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text && text.length > 80) return text;
      }
    } catch { /* fallback ke Groq */ }
  }

  // ── Groq ──────────────────────────────────────────────────────────────────
  if (GROQ_API_KEY) {
    try {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method:  "POST",
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
        body:    JSON.stringify({
          model:      "llama-3.1-8b-instant",
          messages:   [{ role: "user", content: prompt }],
          max_tokens: 500,
          temperature: 0.7,
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 80) return text;
      }
    } catch { /* gagal */ }
  }

  return null;
}

// ─── Fetch semua anime dari API ───────────────────────────────────────────────
async function fetchAllAnimeFromAPI() {
  const all = {};

  // Ongoing
  let page = 1, maxPage = 9;
  while (page <= maxPage) {
    const res = await fetch(`${API_BASE}/api/otakudesu/ongoing?page=${page}`);
    const j   = await res.json();
    maxPage   = j.data.maxPage;
    for (const a of j.data.animeList) {
      all[a.animeId] = { ...a, listStatus: "ongoing" };
    }
    page++;
  }
  log(`  Ongoing: ${Object.values(all).filter(a=>a.listStatus==="ongoing").length} anime dari ${maxPage} halaman`);

  // Completed
  page = 1; maxPage = 66;
  while (page <= maxPage) {
    const res = await fetch(`${API_BASE}/api/otakudesu/completed?page=${page}`);
    const j   = await res.json();
    maxPage   = j.data.maxPage;
    for (const a of j.data.animeList) {
      if (!all[a.animeId]) all[a.animeId] = { ...a, listStatus: "completed" };
    }
    page++;
  }
  log(`  Total unik: ${Object.keys(all).length} anime`);
  return all;
}

// ─── AniList query by MAL ID (lebih akurat untuk anime yang susah dicari by title) ──────────
const ANILIST_BY_MAL_QUERY = `
query($idMal:Int){
  Media(idMal:$idMal,type:ANIME){
    id
    idMal
    title{ romaji english native }
    description(asHtml:false)
    bannerImage
    coverImage{ extraLarge large medium }
    trailer{ id site }
    genres
    averageScore
    meanScore
    popularity
    status
    episodes
    duration
    season
    seasonYear
    source
    hashtag
    countryOfOrigin
    studios(isMain:true){ nodes{ name isAnimationStudio } }
    staff(perPage:15){
      edges{
        role
        node{ id name{ full native } image{ medium } siteUrl }
      }
    }
    characters(sort:[ROLE,RELEVANCE],perPage:20){
      edges{
        role
        node{ id name{ full native } image{ medium } siteUrl }
        voiceActors(language:JAPANESE){
          id name{ full native } image{ medium } siteUrl
        }
      }
    }
    relations{
      edges{
        relationType(version:2)
        node{ id title{ romaji } type format }
      }
    }
    nextAiringEpisode{ airingAt episode }
    siteUrl
  }
}`;

// ─── AniList query by MAL ID dengan retry ────────────────────────────────────
async function queryAniListByMalId(malId, retries = 0) {
  const body = JSON.stringify({ query: ANILIST_BY_MAL_QUERY, variables: { idMal: malId } });
  try {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "65", 10) * 1000;
      log(`  ⚠️ Rate limit (MAL lookup)! Tunggu ${retryAfter/1000}s...`);
      await sleep(retryAfter + 2000);
      return queryAniListByMalId(malId, retries);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors) return null;
    return json.data?.Media || null;
  } catch (err) {
    if (retries < MAX_RETRIES) {
      await sleep(3000 * (retries + 1));
      return queryAniListByMalId(malId, retries + 1);
    }
    return null;
  }
}

/** Ambil MAL ID via Jikan (lebih akurat untuk judul Jepang yang sulit) */
async function fetchMalIdFallback(title) {
  const variants = titleVariants(title).slice(0, 4); // Cukup 4 variant pertama
  // Tambah variant tanpa karakter spesial (quotes, tanda baca Jepang, dll)
  const noSpecial = title
    .replace(/\s*Sub\s*Indo.*/i, "")
    .replace(/["""''【】「」『』・×\u2019\u201c\u201d]/g, " ")
    .replace(/\s+/g, " ").trim();
  if (noSpecial && !variants.includes(noSpecial)) variants.push(noSpecial);

  for (const variant of variants) {
    try {
      await sleep(500); // Jikan rate limit
      const q = encodeURIComponent(variant.replace(/["""'']/g, "").slice(0, 60));
      const res = await fetch(`https://api.jikan.moe/v4/anime?q=${q}&limit=3&sfw`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      if (res.status === 429) { await sleep(3000); continue; }
      if (!res.ok) continue;
      const json = await res.json();
      const malId = json.data?.[0]?.mal_id;
      if (malId) return malId;
    } catch { /* lanjut ke variant berikutnya */ }
  }
  return null;
}

// ─── AniList query dengan retry ───────────────────────────────────────────────
async function queryAniList(searchTitle, retries = 0) {
  const body = JSON.stringify({ query: ANILIST_QUERY, variables: { search: searchTitle } });

  try {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body,
      signal: AbortSignal.timeout(20_000),
    });

    // Rate limit
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "65", 10) * 1000;
      log(`  ⚠️ Rate limit! Tunggu ${retryAfter/1000}s...`);
      await sleep(retryAfter + 2000);
      return queryAniList(searchTitle, retries);
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();

    if (json.errors) {
      // Tidak ada hasil — bukan error fatal
      return null;
    }
    return json.data?.Media || null;
  } catch (err) {
    if (retries < MAX_RETRIES) {
      await sleep(3000 * (retries + 1));
      return queryAniList(searchTitle, retries + 1);
    }
    return null;
  }
}

// ─── Manual ID override: animeId → AniList ID langsung (bypass search sepenuhnya) ─
// Dipakai untuk anime yang search AniList selalu gagal — ID dikonfirmasi langsung.
const MANUAL_ID_OVERRIDE = {
  'lv2-kara-cheat-sub-indo':                            170130,
  'vtuber-nankiritara-sub-indo':                        160488,
  'tokidoki-russia-alya-san-sub-indo':                  162804,
  'kitsutsuki-dokoro-sub-indo':                         108629,
  'scooped-up-by-an-s-ranked-adventurer-sub-indo':      179885,
  'neet-kuoichi-sub-indo':                              174654,
  'kabushikigaisha-lumiere-sub-indo':                   171025,
  'tennis-world-cup-sub-indo':                          140187,
  'joutai-ijou-skill-sub-indo':                         173694,
  'tensei-datta-node-sub-indo':                         156415,
  'tensei-datta-node-s2-sub-indo':                      178090,
  'ichijouma-mankitsugurashi-sub-indo':                 195734,
  '3z-gumi-ginpachi-sensei-sub-indo':                   162890,
  'saigo-ni-hitotsu-dake-onegai-shitemo-yoroshii-deshou-ka-sub-indo': 181447,
};

// ─── Manual override: animeId → search term yang sudah benar di AniList ──────
// Dipakai untuk 39 anime yang selalu gagal karena judul OtakuDesu berbeda jauh
// dari judul AniList (misal: "Gotoubun" di OD vs "5-toubun" di AniList).
const MANUAL_SEARCH_OVERRIDE = {
  // Gotoubun — OD pakai "Gotoubun", AniList pakai "5-toubun"
  'gotoubun-hanayome-season-2-sub-indo':             '5-toubun no Hanayome',
  'gotobun-hanayome-subtitle-indonesia':             '5-toubun no Hanayome',
  // Goumon — tanda kutip di judul OD rusak query AniList
  'goumon-sub-indo':                                 'Himesama Goumon no Jikan desu',
  'goumon-s2-sub-indo':                             'Himesama Goumon no Jikan desu Season 2',
  // Tensei shitara Dai Nana Ouji — romanisasi OD beda
  'tensei-datta-node-sub-indo':                     'Tensei shitara Dai Nana Ouji Datta node',
  'tensei-datta-node-s2-sub-indo':                  'Tensei shitara Dai Nana Ouji Datta node',
  // Judul OD terlalu pendek atau berbeda
  'isekai-no-ojisan-sub-indo':                      'Isekai Ojisan',
  'vtuber-nankiritara-sub-indo':                    'VTuber Nandaga Haishin Kiri Wasuretara',
  'tokidoki-russia-alya-san-sub-indo':              'Tokidoki Bosotto Russia-go de Dereru Tonari no Alya-san',
  'maougun-saikyou-majutsushi-ningen-sub-indo':     'Maougun Saikyou no Majutsushi wa Ningen datta',
  'akuyaku-kattemimashita-sub-indo':                'Akuyaku Reijou nanode Last Boss wo Kattemimashita',
  'kajin-kuroitsu-sub-indo':                        'Kaijin Kaihatsu-bu no Kuroitsu-san',
  'lv2-kara-cheat-sub-indo':                        'Lv2 kara Cheat datta Motoyuusha Kouho',
  'madougushi-dahliya-utsumukanai-sub-indo':        'Dahliya Wilts No More',
  'scooped-up-by-an-s-ranked-adventurer-sub-indo':  'Yuusha Party wo Tsuihou sareta Shiromadoushi',
  'neet-kuoichi-sub-indo':                          'NEET Kunoichi to Nazeka Dousei Hajimemashita',
  'kabushikigaisha-lumiere-sub-indo':               'Kabushikigaisha Magi-Lumiere',
  'tennis-world-cup-sub-indo':                      'Shin Tennis no Oujisama U-17 World Cup',
  'hoshifuru-nina-sub-indo':                        'Hoshifuru Oukoku no Nina',
  'saikyou-shieshoku-sub-indo':                     'Saikyou no Shienshoku Wajutsushi',
  'sayuseijinsei-sub-indo':                         'Sayounara Ryuusei Konnichiwa Jinsei',
  'one-room-sub-indo':                              'One Room Hiatari Futsuu Tenshi-tsuki',
  'joutai-ijou-skill-sub-indo':                     'Hazurewaku no Joutai Ijou Skill de Saikyou ni Natta',
  'plastic-nee-sub-indo':                           'Plastic Neesan',
  'kitsutsuki-dokoro-sub-indo':                     'Kitsutsuki Tanteidokoro',
  'onichan-ai-areba-sub-indo':                      'Oniichan dakedo Ai sae Areba Kankeinai yo ne',
  'nekogatari-shiro-sub-indo':                      'Nekomonogatari Shiro',
  'boku-kanojo-majimesugiru-sho-bitch-na-ken-subtitle-indonesia': 'Boku no Kanojo ga Majimesugiru Sho-bitch na Ken',
  'aico-incarnation-subtitle-indonesia':            'A.I.C.O.: Incarnation',
  'dnmachi-oratoria-subtitle-indonesia':            'Dungeon ni Deai wo Motomeru Gaiden Sword Oratoria',
  'netoge-no-yome-wa-onnanoko-ja-nai-omotta-bd':   'Netoge no Yome wa Onna no Ko ja Nai to Omotta',
  'krsj-movie-subtitle-indonesia':                 'Kuroshitsuji: Book of the Atlantic',
  // Judul sangat panjang / unik — coba kata kunci utama
  'yai-ari-deshita-sub-indo':                       'Tai-Ari deshita Ojousama wa Kakutou Game',
  'tenkouno-seiso-karen-bishoujo-sub-indo':          'Tenkou-saki no Seiso Karen na Bishoujo',
  'futsutsuka-akujo-gozaimasu-sub-indo':            'Futsutsuka na Akujo dewa Gozaimasu',
  'ichijouma-mankitsugurashi-sub-indo':             'Ichijouma Mankitsugurashi',
  '3z-gumi-ginpachi-sensei-sub-indo':               'Gintama Ginpachi-sensei',
  'saigo-ni-hitotsu-dake-onegai-shitemo-yoroshii-deshou-ka-sub-indo': 'Saigo ni Hitotsu dake Onegai',
  '12-sai-chicchana-mune-no-tokimeki':              '12-sai.: Chicchana Mune no Tokimeki',
};

// ─── AniList query by ID langsung (paling akurat, tidak perlu search) ────────
async function queryAniListById(anilistId, retries = 0) {
  const body = JSON.stringify({ query: ANILIST_BY_MAL_QUERY.replace("idMal:$idMal", "id:$id").replace("$idMal:Int", "$id:Int"), variables: { id: anilistId } });
  try {
    const res = await fetch(ANILIST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("Retry-After") || "65", 10) * 1000;
      log(`  ⚠️ Rate limit (byId)! Tunggu ${retryAfter/1000}s...`);
      await sleep(retryAfter + 2000);
      return queryAniListById(anilistId, retries);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors) return null;
    return json.data?.Media || null;
  } catch (err) {
    if (retries < MAX_RETRIES) { await sleep(3000 * (retries + 1)); return queryAniListById(anilistId, retries + 1); }
    return null;
  }
}

// ─── Cari di AniList dengan multiple variants + MAL ID fallback ──────────────
async function findOnAniList(anime) {
  // 0. Cek MANUAL_ID_OVERRIDE — fetch langsung by ID, paling akurat & cepat
  if (MANUAL_ID_OVERRIDE[anime.animeId]) {
    const alId = MANUAL_ID_OVERRIDE[anime.animeId];
    log(`    [ID_OVERRIDE] ${anime.animeId} → AniList ID ${alId}`);
    const result = await queryAniListById(alId);
    if (result) return result;
    log(`    [ID_OVERRIDE] ID ${alId} gagal, lanjut ke search...`);
  }

  // 1. Cek manual override dulu — jauh lebih cepat dan akurat daripada fuzzy search
  if (MANUAL_SEARCH_OVERRIDE[anime.animeId]) {
    const overrideTitle = MANUAL_SEARCH_OVERRIDE[anime.animeId];
    log(`    [OVERRIDE] ${anime.animeId} → "${overrideTitle}"`);
    const result = await queryAniList(overrideTitle);
    if (result) return result;
    // Override gagal (AniList tidak punya), lanjut ke fuzzy search normal
    log(`    [OVERRIDE] Tidak ketemu di AniList, lanjut fuzzy search...`);
  }

  const variants = titleVariants(anime.title);

  // Tambah variant: hapus semua karakter spesial/tanda kutip (sering bikin AniList search gagal)
  // Contoh: 'Himesama "Goumon" no Jikan desu' → 'Himesama Goumon no Jikan desu'
  const noSpecial = normalizeTitle(anime.title)
    .replace(/["""''【】「」『』・×\u2019\u201c\u201d]/g, " ")
    .replace(/\s+/g, " ").trim();
  if (noSpecial && !variants.includes(noSpecial)) variants.push(noSpecial);
  // Versi pendek tanpa special chars (4 kata pertama)
  const noSpecialShort = noSpecial.split(" ").slice(0, 4).join(" ");
  if (noSpecialShort && noSpecialShort !== noSpecial && !variants.includes(noSpecialShort)) {
    variants.push(noSpecialShort);
  }

  for (const v of variants) {
    const result = await queryAniList(v);
    if (result) return result;
    await sleep(300);
  }

  // Fallback terakhir: cari MAL ID via Jikan → lookup AniList by MAL ID (lebih akurat)
  // Ini menangkap anime yang punya judul aneh / nama berbeda di AniList vs OtakuDesu.
  log(`    [MAL→AL] Fallback: ${anime.title}`);
  const malId = await fetchMalIdFallback(anime.title);
  if (malId) {
    log(`    [MAL→AL] MAL ID ${malId} → cari di AniList...`);
    const byMal = await queryAniListByMalId(malId);
    if (byMal) {
      log(`    [MAL→AL] ✅ Ketemu: ${byMal.title?.romaji || byMal.title?.english}`);
      return byMal;
    }
  }

  return null;
}

// ─── Transform AniList result ke format kita ─────────────────────────────────
function transformAniListData(otakuAnime, anilistData) {
  const base = {
    animeId:      otakuAnime.animeId,
    title:        otakuAnime.title,
    otakudesuUrl: otakuAnime.otakudesuUrl || `https://otakudesu.blog/anime/${otakuAnime.animeId}/`,
    poster:       otakuAnime.poster || null,
    listStatus:   otakuAnime.listStatus,
    episodes:     otakuAnime.episodes || null,
    latestReleaseDate: otakuAnime.latestReleaseDate || null,
    lastReleaseDate:   otakuAnime.lastReleaseDate || null,
    releaseDay:        otakuAnime.releaseDay || null,
    anilistId: null,
    malId: null,
    anilistUrl: null,
    titleRomaji:   null,
    titleEnglish:  null,
    titleNative:   null,
    banner:        null,
    posterHD:      null,
    synopsis:      null,
    trailer:       null,
    genres:        [],
    score:         null,
    status:        null,
    type:          null,
    duration:      null,
    season:        null,
    seasonYear:    null,
    source:        null,
    countryOfOrigin: null,
    studios:       [],
    staff:         [],
    characters:    [],
    relations:     [],
    nextEpisode:   null,
  };

  if (!anilistData) return base;

  const al = anilistData;

  // Merge AniList data
  base.anilistId     = al.id;
  base.malId         = al.idMal;
  base.anilistUrl    = al.siteUrl;
  base.titleRomaji   = al.title?.romaji || null;
  base.titleEnglish  = al.title?.english || null;
  base.titleNative   = al.title?.native || null;
  base.banner        = al.bannerImage || null;
  base.posterHD      = al.coverImage?.extraLarge || al.coverImage?.large || null;
  base.synopsis      = al.description
    ? al.description.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim()
    : null;

  // Trailer
  if (al.trailer?.id) {
    base.trailer = {
      id:   al.trailer.id,
      site: al.trailer.site || "youtube",
      url:  al.trailer.site === "youtube"
        ? `https://www.youtube.com/watch?v=${al.trailer.id}`
        : `https://www.dailymotion.com/video/${al.trailer.id}`,
      thumbnail: al.trailer.site === "youtube"
        ? `https://img.youtube.com/vi/${al.trailer.id}/hqdefault.jpg`
        : null,
    };
  }

  base.genres      = al.genres || [];
  base.score       = al.averageScore || al.meanScore || null;
  base.status      = al.status || null;
  base.type        = al.format || null;
  base.episodes    = al.episodes ? String(al.episodes) : base.episodes;
  base.duration    = al.duration ? `${al.duration} menit` : null;
  base.season      = al.season || null;
  base.seasonYear  = al.seasonYear || null;
  base.source      = al.source || null;
  base.countryOfOrigin = al.countryOfOrigin || null;

  // Studios
  base.studios = (al.studios?.nodes || []).map(s => ({
    name: s.name,
    isMain: s.isAnimationStudio,
  }));

  // Staff (simpan id untuk PersonModal di frontend)
  base.staff = (al.staff?.edges || []).map(e => ({
    id:         e.node?.id || null,
    role:       e.role,
    name:       e.node?.name?.full || null,
    nameNative: e.node?.name?.native || null,
    image:      e.node?.image?.medium || null,
    siteUrl:    e.node?.siteUrl || null,
  })).filter(s => s.name);

  // Characters + Voice Actors (simpan id untuk PersonModal di frontend)
  base.characters = (al.characters?.edges || []).map(edge => ({
    id:         edge.node?.id || null,
    role:       edge.role,
    name:       edge.node?.name?.full || null,
    nameNative: edge.node?.name?.native || null,
    image:      edge.node?.image?.medium || null,
    siteUrl:    edge.node?.siteUrl || null,
    voiceActors: (edge.voiceActors || []).map(va => ({
      id:         va.id || null,
      name:       va.name?.full || null,
      nameNative: va.name?.native || null,
      image:      va.image?.medium || null,
      siteUrl:    va.siteUrl || null,
    })).filter(v => v.name),
  })).filter(c => c.name);

  // Relations
  base.relations = (al.relations?.edges || []).map(e => ({
    type: e.relationType,
    id: e.node?.id || null,
    title: e.node?.title?.romaji || null,
    mediaType: e.node?.type || null,
    format: e.node?.format || null,
  })).filter(r => r.title);

  // Next episode
  if (al.nextAiringEpisode) {
    base.nextEpisode = {
      episode: al.nextAiringEpisode.episode,
      airingAt: al.nextAiringEpisode.airingAt,
    };
  }

  return base;
}

// ─── GitHub Release upload ────────────────────────────────────────────────────
async function ghRequest(method, path, body, contentType = "application/json") {
  const url = `https://api.github.com${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": contentType,
      "User-Agent": "AniSub-Scraper/1.0",
    },
    body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok && res.status !== 404) {
    const txt = await res.text();
    throw new Error(`GitHub ${method} ${path} → ${res.status}: ${txt.slice(0, 200)}`);
  }
  if (res.status === 204 || res.headers.get("content-length") === "0") return {};
  return res.json();
}

async function getOrCreateRelease() {
  // Coba ambil release yang ada
  const existing = await ghRequest("GET", `/repos/${GH_OWNER}/${GH_REPO}/releases/tags/${RELEASE_TAG}`);
  if (existing.id) {
    log(`  Release sudah ada: id=${existing.id}`);
    return existing;
  }

  // Buat baru
  log(`  Membuat release baru tag=${RELEASE_TAG}...`);
  const created = await ghRequest("POST", `/repos/${GH_OWNER}/${GH_REPO}/releases`, {
    tag_name:         RELEASE_TAG,
    target_commitish: "main",
    name:             RELEASE_NAME,
    body:             "Cache data lengkap untuk semua anime AniSub (poster, banner, sinopsis, trailer, staf, karakter+VA). Auto-generated oleh scraper.",
    draft:            false,
    prerelease:       false,
  });
  return created;
}

async function deleteAssetIfExists(releaseId, filename) {
  const assets = await ghRequest("GET", `/repos/${GH_OWNER}/${GH_REPO}/releases/${releaseId}/assets`);
  if (!Array.isArray(assets)) return;
  for (const asset of assets) {
    if (asset.name === filename) {
      log(`  Hapus asset lama: ${filename} (id=${asset.id})`);
      await ghRequest("DELETE", `/repos/${GH_OWNER}/${GH_REPO}/releases/assets/${asset.id}`);
    }
  }
}

async function uploadReleaseAsset(releaseId, filename, fileBuffer) {
  const uploadUrl = `https://uploads.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/${releaseId}/assets?name=${encodeURIComponent(filename)}`;
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/octet-stream",
      "User-Agent": "AniSub-Scraper/1.0",
      "Content-Length": String(fileBuffer.length),
    },
    body: fileBuffer,
    signal: AbortSignal.timeout(300_000), // 5 menit
    duplex: "half",
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Upload asset gagal ${res.status}: ${txt.slice(0,200)}`);
  }
  return res.json();
}

// ─── Main scraper ─────────────────────────────────────────────────────────────
async function main() {
  log("═══════════════════════════════════════════════════");
  log("  AniSub Full Cache Scraper");
  log("═══════════════════════════════════════════════════");

  // ── UPLOAD ONLY ──
  if (FLAG_UPLOAD_ONLY) {
    if (!fs.existsSync(OUTPUT_FILE)) {
      log("❌ Output file tidak ada: " + OUTPUT_FILE);
      process.exit(1);
    }
    log("📤 Mode upload-only. Langsung upload...");
    await uploadToGitHub();
    return;
  }

  // ── STEP 1: Fetch anime list ──
  log("\n📋 STEP 1: Ambil semua anime dari API server...");
  let animeMap = loadJSON(LIST_FILE, null);
  if (animeMap) {
    log(`  Loaded ${Object.keys(animeMap).length} anime dari cache list`);
  } else {
    animeMap = await fetchAllAnimeFromAPI();
    saveJSON(LIST_FILE, animeMap);
    log(`  Disimpan ke ${LIST_FILE}`);
  }

  const allIds      = Object.keys(animeMap);
  const totalAnime  = allIds.length;
  log(`  Total anime yang akan diproses: ${totalAnime}`);

  // ── STEP 2: Load progress ──
  log("\n🔄 STEP 2: Proses & scrape detail dari AniList...");
  const progress = FLAG_RESUME ? loadJSON(PROGRESS_FILE, { done: {}, failed: [] }) : { done: {}, failed: [] };
  // FIX: pada resume, anime yang sebelumnya gagal (tidak ketemu di AniList)
  // harus di-retry — jangan skip hanya karena sudah ada di `done`.
  // Dengan fallback baru (Jikan variants + AI synopsis) hasilnya bisa lebih baik.
  const failedSet   = new Set(progress.failed || []);
  const alreadyDone = new Set(Object.keys(progress.done).filter(id => !failedSet.has(id)));
  const remaining   = allIds.filter(id => !alreadyDone.has(id));
  log(`  Sudah selesai: ${alreadyDone.size} | Akan diproses/retry: ${remaining.length} (termasuk ${failedSet.size} yang sebelumnya gagal)`);

  // ── STEP 3: Scrape ──
  let processed = alreadyDone.size;
  let found     = alreadyDone.size;
  let notFound  = progress.failed?.length || 0;
  const startTime = Date.now();

  for (let i = 0; i < remaining.length; i++) {
    const animeId  = remaining[i];
    const anime    = animeMap[animeId];
    processed++;

    if (i > 0) await sleep(REQ_DELAY_MS);

    const anilistData = await findOnAniList(anime);
    const result      = transformAniListData(anime, anilistData);

    // ── Fallback poster: Jikan (MAL) dengan banyak title variants ─────────
    if (!result.posterHD) {
      const malFallback = await fetchMalPosterFallback(anime.title);
      if (malFallback?.poster) {
        result.posterHD      = malFallback.poster;
        result.posterSource  = "jikan";
        if (!result.malId && malFallback.malId) result.malId = malFallback.malId;
        log(`    [MAL] ${anime.title} → poster via variant: "${malFallback.variant}"`);
      }
    } else {
      result.posterSource = anilistData ? "anilist" : (result.posterHD ? "jikan" : null);
    }

    // ── Fallback sinopsis: AI (Gemini → Groq) ─────────────────────────────
    // Untuk semua anime tanpa sinopsis — baik yang gagal AniList maupun yang
    // memang tidak ada deskripsi di AniList.
    if (!result.synopsis && (GEMINI_API_KEY || GROQ_API_KEY)) {
      const aiSynopsis = await generateAISynopsis(anime.title, result.titleNative, result.genres);
      if (aiSynopsis) {
        result.synopsis       = aiSynopsis;
        result.synopsisSource = "ai";
        log(`    [AI] ${anime.title} → sinopsis dibuat`);
      }
    } else if (result.synopsis && !result.synopsisSource) {
      result.synopsisSource = "anilist";
    }

    // Reset failed list untuk anime yang sebelumnya gagal tapi kini punya data lebih
    progress.done[animeId] = result;

    if (anilistData) {
      found++;
    } else {
      notFound++;
      if (!progress.failed) progress.failed = [];
      // Jangan duplikasi di failed list
      if (!progress.failed.includes(animeId)) progress.failed.push(animeId);
    }

    // Progress report: setiap 1 anime kalau queue kecil (resume/retry),
    // setiap 10 anime kalau fresh/besar supaya tidak spam log.
    const REPORT_INTERVAL = remaining.length <= 100 ? 1 : 10;
    if ((i + 1) % REPORT_INTERVAL === 0 || i === remaining.length - 1) {
      const elapsed  = (Date.now() - startTime) / 1000;
      const rate     = elapsed > 0 ? (i + 1) / elapsed : 1;
      const etaSec   = rate > 0 ? (remaining.length - i - 1) / rate : 0;
      const etaMin   = Math.ceil(etaSec / 60);
      const pct      = Math.round((processed / totalAnime) * 100);
      log(`  [${pct}%] ${processed}/${totalAnime} | ✅ ${found} | ❌ ${notFound} | ETA: ~${etaMin}m`);

      // Simpan progress setiap interval
      saveJSON(PROGRESS_FILE, progress);
    }
  }

  // ── STEP 4: Compile output ──
  log("\n📦 STEP 4: Kompilasi output file...");

  const allAnime = Object.values(progress.done);
  const output = {
    meta: {
      version:      2,
      generatedAt:  new Date().toISOString(),
      totalAnime:   allAnime.length,
      totalFound:   allAnime.filter(a => a.anilistId).length,
      totalNotFound: allAnime.filter(a => !a.anilistId).length,
      totalWithBanner: allAnime.filter(a => a.banner).length,
      totalWithTrailer: allAnime.filter(a => a.trailer).length,
      totalWithCharacters: allAnime.filter(a => a.characters?.length > 0).length,
    },
    anime: allAnime,
  };

  saveJSON(OUTPUT_FILE, output);
  const fileSizeMB = (fs.statSync(OUTPUT_FILE).size / 1024 / 1024).toFixed(2);
  log(`  Output: ${OUTPUT_FILE} (${fileSizeMB} MB)`);
  log(`  Total: ${output.meta.totalAnime} anime`);
  log(`  AniList match: ${output.meta.totalFound} | Not found: ${output.meta.totalNotFound}`);
  log(`  Dengan banner: ${output.meta.totalWithBanner} | Trailer: ${output.meta.totalWithTrailer} | Karakter: ${output.meta.totalWithCharacters}`);

  // ── STEP 5: Upload ke GitHub Release ──
  await uploadToGitHub();

  log("\n🎉 SELESAI!");
}

async function uploadToGitHub() {
  if (!GH_TOKEN) {
    log("⚠️  GITHUB_TOKEN tidak ada, skip upload");
    return;
  }

  log("\n☁️  STEP 5: Upload ke GitHub Release...");

  const release = await getOrCreateRelease();
  if (!release.id) {
    log("❌ Gagal mendapatkan/membuat release");
    return;
  }

  // Upload main output file
  const mainFilename = "anisub-full-cache.json";
  await deleteAssetIfExists(release.id, mainFilename);

  log(`  📤 Upload ${mainFilename}...`);
  const fileBuf = fs.readFileSync(OUTPUT_FILE);
  const asset   = await uploadReleaseAsset(release.id, mainFilename, fileBuf);
  log(`  ✅ Upload berhasil! URL: ${asset.browser_download_url}`);

  // Buat juga versi terpisah: anime-list.json (hanya basic info, lebih kecil untuk list view)
  const listOnly = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
  const lightList = {
    meta: listOnly.meta,
    anime: listOnly.anime.map(a => ({
      animeId:    a.animeId,
      title:      a.title,
      titleRomaji: a.titleRomaji,
      titleEnglish: a.titleEnglish,
      poster:     a.posterHD || a.poster,
      banner:     a.banner,
      genres:     a.genres,
      score:      a.score,
      status:     a.status,
      episodes:   a.episodes,
      seasonYear: a.seasonYear,
      listStatus: a.listStatus,
      anilistId:  a.anilistId,
      trailer:    a.trailer,
    })),
  };
  const lightFile = path.join(DATA_DIR, "anisub-light-list.json");
  saveJSON(lightFile, lightList);
  const lightSize = (fs.statSync(lightFile).size / 1024 / 1024).toFixed(2);
  log(`  Light list: ${lightSize} MB`);

  const lightFilename = "anisub-light-list.json";
  await deleteAssetIfExists(release.id, lightFilename);
  log(`  📤 Upload ${lightFilename}...`);
  const lightAsset = await uploadReleaseAsset(release.id, lightFilename, fs.readFileSync(lightFile));
  log(`  ✅ Upload berhasil! URL: ${lightAsset.browser_download_url}`);

  // Tulis URL ke file config untuk dipakai /buildanisub
  const cacheConfig = {
    releaseTag:     RELEASE_TAG,
    fullCacheUrl:   asset.browser_download_url,
    lightListUrl:   lightAsset.browser_download_url,
    updatedAt:      new Date().toISOString(),
    totalAnime:     listOnly.meta.totalAnime,
  };
  const configFile = path.join(DATA_DIR, "cache-urls.json");
  fs.writeFileSync(configFile, JSON.stringify(cacheConfig, null, 2));
  log(`  Config disimpan: ${configFile}`);
  log(`  fullCacheUrl: ${asset.browser_download_url}`);
  log(`  lightListUrl: ${lightAsset.browser_download_url}`);
}

// ── Run ────────────────────────────────────────────────────────────────────────
main().catch(err => {
  log("❌ FATAL ERROR: " + err.message);
  console.error(err.stack);
  process.exit(1);
});
