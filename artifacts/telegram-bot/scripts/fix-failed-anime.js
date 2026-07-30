#!/usr/bin/env node
/**
 * fix-failed-anime.js
 * Script targeted untuk retry hanya 37 anime yang gagal di scrape-progress.json
 * Menggunakan MANUAL_ID_OVERRIDE untuk lookup langsung by AniList ID (no search = faster)
 * 
 * Usage: node scripts/fix-failed-anime.js
 */

'use strict';
const fs   = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR      = path.join(__dirname, '../data');
const PROGRESS_FILE = path.join(DATA_DIR, 'scrape-progress.json');
const OUTPUT_FILE   = path.join(DATA_DIR, 'anisub-full-cache.json');

const GH_TOKEN  = process.env.GITHUB_TOKEN || '';
const GH_OWNER  = 'JMStory-27';
const GH_REPO   = 'Jumalia-Makruf';
const RELEASE_TAG = 'anisub-cache-v1';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY   = process.env.GROQ_API_KEY   || '';

const ANILIST_URL = 'https://graphql.anilist.co';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function log(m) { process.stdout.write(`[${new Date().toISOString().slice(11,19)}] ${m}\n`); }

// ─── AniList IDs yang sudah dikonfirmasi ─────────────────────────────────────
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
  // Pass 6 — 4 sisa terakhir
  'hoshifuru-nina-sub-indo':                            171038,  // Hoshi Furu Oukoku no Nina
  'madougushi-dahliya-utsumukanai-sub-indo':            168623,  // Madougushi Dahlia wa Utsumukanai
  '12-sai-chicchana-mune-no-tokimeki':                   20716,  // 12-sai. (12 eps, Chicchana Mune no Tokimeki)
  'nekogatari-shiro-sub-indo':                           17074,  // Monogatari Series: Second Season (no standalone AL entry)
};

// ─── AniList query lengkap by ID ─────────────────────────────────────────────
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

async function anilistFetch(query, variables, retries = 0) {
  const body = JSON.stringify({ query, variables });
  try {
    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 429) {
      const wait = parseInt(res.headers.get('Retry-After') || '65', 10) * 1000;
      log(`  ⚠️ Rate limit! Tunggu ${wait/1000}s...`);
      await sleep(wait + 2000);
      return anilistFetch(query, variables, retries);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors) return null;
    return json.data?.Media || null;
  } catch (err) {
    if (retries < 3) { await sleep(3000 * (retries + 1)); return anilistFetch(query, variables, retries + 1); }
    return null;
  }
}

async function generateAISynopsis(title, titleNative, genres) {
  const genreHint = genres?.length ? ` (genre: ${genres.slice(0,3).join(', ')})` : '';
  const prompt = `Tulis sinopsis anime "${title}"${titleNative ? ` / "${titleNative}"` : ''}${genreHint} dalam bahasa Indonesia, 2-3 paragraf ringkas, tanpa spoiler besar. Langsung mulai isi sinopsis.`;

  if (GEMINI_API_KEY) {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: AbortSignal.timeout(20_000),
      });
      if (res.ok) {
        const json = await res.json();
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (text && text.length > 80) return { text, source: 'ai-gemini' };
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
        const json = await res.json();
        const text = json?.choices?.[0]?.message?.content?.trim();
        if (text && text.length > 80) return { text, source: 'ai-groq' };
      }
    } catch {}
  }
  return null;
}

// ─── Transform AniList data ───────────────────────────────────────────────────
function transformAniListData(existing, al) {
  const base = { ...existing };
  base.anilistId    = al.id;
  base.malId        = al.idMal;
  base.anilistUrl   = al.siteUrl;
  base.titleRomaji  = al.title?.romaji || null;
  base.titleEnglish = al.title?.english || null;
  base.titleNative  = al.title?.native || null;
  base.banner       = al.bannerImage || null;
  base.posterHD     = al.coverImage?.extraLarge || al.coverImage?.large || null;
  base.synopsis     = al.description ? al.description.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim() : null;
  if (al.trailer?.id) {
    base.trailer = {
      id: al.trailer.id, site: al.trailer.site || 'youtube',
      url: al.trailer.site === 'youtube' ? `https://www.youtube.com/watch?v=${al.trailer.id}` : `https://www.dailymotion.com/video/${al.trailer.id}`,
      thumbnail: al.trailer.site === 'youtube' ? `https://img.youtube.com/vi/${al.trailer.id}/hqdefault.jpg` : null,
    };
  }
  base.genres        = al.genres || [];
  base.score         = al.averageScore || al.meanScore || null;
  base.status        = al.status || null;
  base.type          = al.format || null;
  base.duration      = al.duration || null;
  base.season        = al.season || null;
  base.seasonYear    = al.seasonYear || null;
  base.source        = al.source || null;
  base.countryOfOrigin = al.countryOfOrigin || null;
  base.studios = (al.studios?.nodes || []).map(s => ({ name: s.name, isMain: s.isAnimationStudio }));
  base.staff = (al.staff?.edges || []).map(e => ({
    role: e.role, id: e.node?.id, name: e.node?.name?.full, nameNative: e.node?.name?.native,
    image: e.node?.image?.medium, url: e.node?.siteUrl,
  })).filter(s => s.id);
  base.characters = (al.characters?.edges || []).map(e => ({
    role: e.role, id: e.node?.id, name: e.node?.name?.full, nameNative: e.node?.name?.native,
    image: e.node?.image?.medium, url: e.node?.siteUrl,
    voiceActors: (e.voiceActors || []).map(va => ({
      id: va.id, name: va.name?.full, nameNative: va.name?.native, image: va.image?.medium, url: va.siteUrl,
    })),
  })).filter(c => c.id);
  base.relations = (al.relations?.edges || []).filter(e => ['PREQUEL','SEQUEL','PARENT','ADAPTATION'].includes(e.relationType)).map(e => ({
    type: e.relationType, id: e.node?.id, title: e.node?.title?.romaji, mediaType: e.node?.type, format: e.node?.format,
  }));
  if (al.nextAiringEpisode) {
    base.nextEpisode = { episode: al.nextAiringEpisode.episode, airingAt: al.nextAiringEpisode.airingAt };
  }
  return base;
}

// ─── Upload ke GitHub Release ─────────────────────────────────────────────────
async function uploadToGitHub(filePath) {
  if (!GH_TOKEN) { log('⚠️ GITHUB_TOKEN tidak ada, skip upload'); return; }
  log('⬆️ Upload ke GitHub Release...');
  const data = fs.readFileSync(filePath);
  const headers = { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'AniSub-FixScript/1.0' };

  // Get release ID
  const relRes = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/tags/${RELEASE_TAG}`, { headers, signal: AbortSignal.timeout(10_000) });
  if (!relRes.ok) { log('❌ Tidak bisa ambil release info'); return; }
  const release = await relRes.json();
  const releaseId = release.id;

  // Delete old asset
  const existingAsset = (release.assets || []).find(a => a.name === 'anisub-full-cache.json');
  if (existingAsset) {
    await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/assets/${existingAsset.id}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(10_000) });
    log(`  Hapus asset lama (${existingAsset.id})`);
    await sleep(2000);
  }

  // Upload new asset
  const uploadUrl = `https://uploads.github.com/repos/${GH_OWNER}/${GH_REPO}/releases/${releaseId}/assets?name=anisub-full-cache.json`;
  const upRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: data,
    signal: AbortSignal.timeout(300_000),
  });
  if (upRes.ok) {
    const a = await upRes.json();
    log(`✅ Upload sukses: ${a.browser_download_url}`);
    // Update cache-urls.json
    const urlsPath = path.join(DATA_DIR, 'cache-urls.json');
    const urls = JSON.parse(fs.readFileSync(urlsPath, 'utf8'));
    urls.fullCacheUrl = a.browser_download_url;
    urls.updatedAt = new Date().toISOString();
    fs.writeFileSync(urlsPath, JSON.stringify(urls, null, 2));
    // Push cache-urls.json ke GitHub
    try {
      const filePath2 = 'data/cache-urls.json';
      const content = Buffer.from(JSON.stringify(urls, null, 2), 'utf8').toString('base64');
      const apiUrl = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${filePath2}`;
      let sha;
      const getRes = await fetch(apiUrl, { headers, signal: AbortSignal.timeout(10_000) });
      if (getRes.ok) { const ex = await getRes.json(); sha = ex.sha; }
      await fetch(apiUrl, {
        method: 'PUT', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'chore: update cache-urls.json after fix-failed-anime', content, branch: 'main', ...(sha ? { sha } : {}) }),
        signal: AbortSignal.timeout(20_000),
      });
      log('✅ cache-urls.json updated di GitHub');
    } catch (e) { log('⚠️ Gagal push cache-urls.json: ' + e.message); }
  } else {
    const txt = await upRes.text();
    log(`❌ Upload gagal: ${upRes.status} ${txt.slice(0, 200)}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  log('════════════════════════════════════════');
  log('  Fix Failed Anime — Targeted Script');
  log('════════════════════════════════════════');

  const prog = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  const done = prog.done || {};
  const failed = [...(prog.failed || [])];

  log(`Failed queue: ${failed.length} anime`);
  log(`ID overrides tersedia: ${Object.keys(MANUAL_ID_OVERRIDE).length}`);

  const fixedIds = [];
  const stillFailed = [];
  let newFailed = [...failed];

  for (let i = 0; i < failed.length; i++) {
    const animeId = failed[i];
    const existing = done[animeId] || { animeId };
    log(`[${i+1}/${failed.length}] ${animeId}`);

    let alData = null;

    // 1. Coba direct ID lookup
    if (MANUAL_ID_OVERRIDE[animeId]) {
      const alId = MANUAL_ID_OVERRIDE[animeId];
      log(`  [ID] Fetch by AniList ID: ${alId}`);
      alData = await anilistFetch(QUERY_BY_ID, { id: alId });
      if (alData) log(`  ✅ Ketemu: ${alData.title?.romaji}`);
      else log(`  ❌ ID ${alId} tidak ditemukan`);
    }

    // 2. Coba search fallback (untuk yang tidak ada di ID override)
    if (!alData) {
      // Skip search — ini sudah dicoba berkali-kali dan gagal
      // Cek apakah sudah ada data yang bisa dipertahankan
      if (existing.anilistId) {
        log(`  ℹ️ Sudah punya AniList ID ${existing.anilistId}, pertahankan`);
        alData = null; // tidak perlu re-fetch
        newFailed = newFailed.filter(id => id !== animeId);
        continue;
      }
      log(`  ⚠️ Tidak ada ID override, skip (genuinely no AniList entry)`);
    }

    if (alData) {
      const updated = transformAniListData(existing, alData);
      // Generate AI synopsis jika belum ada
      if (!updated.synopsis && (GEMINI_API_KEY || GROQ_API_KEY)) {
        log(`  📝 Generate AI synopsis untuk ${updated.titleRomaji || animeId}...`);
        const ai = await generateAISynopsis(updated.titleRomaji || animeId, updated.titleNative, updated.genres);
        if (ai) { updated.synopsis = ai.text; updated.synopsisSource = ai.source; }
      }
      done[animeId] = updated;
      newFailed = newFailed.filter(id => id !== animeId);
      fixedIds.push(animeId);
      log(`  ✅ Fixed! posterHD:${!!updated.posterHD} banner:${!!updated.banner} synopsis:${!!updated.synopsis} chars:${updated.characters?.length||0}`);
    } else {
      stillFailed.push(animeId);
    }

    await sleep(750); // AniList rate limit
  }

  // ── Simpan progress ──
  prog.done = done;
  prog.failed = newFailed;
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(prog));
  log(`\nProgress saved: failed queue → ${newFailed.length} (fixed: ${fixedIds.length})`);

  // ── Rebuild full cache JSON ──
  log('\n📦 Rebuild anisub-full-cache.json...');
  const allAnime = Object.values(done);
  const cacheData = { generatedAt: new Date().toISOString(), totalAnime: allAnime.length, anime: allAnime };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(cacheData));
  log(`Cache: ${allAnime.length} anime, ${(fs.statSync(OUTPUT_FILE).size/1024/1024).toFixed(1)} MB`);

  // ── Sync ke /tmp ──
  try {
    fs.copyFileSync(OUTPUT_FILE, '/tmp/anisub-full-cache.json');
    log('✅ Copied ke /tmp/anisub-full-cache.json');
  } catch (e) { log('⚠️ Copy ke /tmp gagal: ' + e.message); }

  // ── Upload ke GitHub ──
  await uploadToGitHub(OUTPUT_FILE);

  // ── Summary ──
  log('\n════════════════ SUMMARY ════════════════');
  log(`Fixed: ${fixedIds.length} anime`);
  fixedIds.forEach(id => log(`  ✅ ${id}`));
  log(`Still no AniList: ${stillFailed.length} anime`);
  stillFailed.forEach(id => log(`  ❌ ${id}`));
  log('=========================================');
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
