/**
 * Poster proxy + resolver routes.
 *
 * GET /api/poster/p?url=<encoded>
 *   Download gambar dari URL eksternal (AniList, MAL, OtakuDesu, dll),
 *   simpan ke /tmp/poster-cache/<md5>.<ext>, serve dari disk berikutnya.
 *   → Gambar tersimpan permanen di server selama session (cleared saat repl restart),
 *     dan di-cache browser lewat SW / Cache-Control 7 hari.
 *
 * GET /api/poster/resolve?title=<title>&animeId=<id>
 *   Server-side AniList GraphQL lookup by title.
 *   Mengatasi kasus anime yang tidak ada di full-cache (posterHD null).
 *   Result di-cache in-memory 24 jam.
 */
import { Router, type Request, type Response } from "express";
import { existsSync, createWriteStream, mkdirSync, readFileSync } from "fs";
import { unlink } from "fs/promises";
import { createHash } from "crypto";
import path from "path";
import { logger } from "../lib/logger";

// ── Local full-cache poster index ─────────────────────────────────────────────
// Lookup lokal (tanpa AniList call) dari anisub-full-cache.json.
// Key: lowercase title variants (romaji, english, original, otakudesu title)
const WORKSPACE_CACHE_PATH = "/home/runner/workspace/.cache/anisub-full-cache.json";
const TMP_CACHE_PATH = "/tmp/anisub-full-cache.json";
let _posterTitleIndex: Map<string, string> | null = null;
let _posterIndexLoadedAt = 0;
const INDEX_TTL = 24 * 3600_000;

function getPosterTitleIndex(): Map<string, string> {
  const now = Date.now();
  if (_posterTitleIndex && now - _posterIndexLoadedAt < INDEX_TTL) return _posterTitleIndex;
  const cachePath = existsSync(WORKSPACE_CACHE_PATH) ? WORKSPACE_CACHE_PATH : TMP_CACHE_PATH;
  if (!existsSync(cachePath)) return new Map();
  try {
    const json = JSON.parse(readFileSync(cachePath, "utf-8")) as {
      anime?: Array<{
        animeId?: string; id?: string; posterHD?: string;
        title?: string; titleRomaji?: string; titleEnglish?: string; titleNative?: string;
      }>
    };
    const map = new Map<string, string>();
    for (const entry of (json.anime ?? [])) {
      if (!entry.posterHD) continue;
      const url = entry.posterHD;
      const addKey = (k: string | null | undefined) => { if (k) map.set(k.toLowerCase().trim(), url); };
      addKey(entry.titleRomaji);
      addKey(entry.titleEnglish);
      addKey(entry.title);
      // Slug → title: "kimi-no-na-wa-sub-indo" → "kimi no na wa"
      const slug = (entry.animeId || entry.id || "").replace(/-sub-indo$/i, "").replace(/-/g, " ");
      if (slug) map.set(slug, url);
    }
    _posterTitleIndex = map;
    _posterIndexLoadedAt = now;
    logger.info({ size: map.size }, "poster title index built from full cache");
    return map;
  } catch {
    return _posterTitleIndex ?? new Map();
  }
}

/** Lookup poster URL dari local cache. Coba exact match dulu, lalu partial (normalisasi angka season). */
function lookupLocalPoster(title: string): string | null {
  const index = getPosterTitleIndex();
  if (index.size === 0) return null;
  const key = title.toLowerCase().trim();
  const hit = index.get(key);
  if (hit) return hit;
  // Normalisasi: strip "season 2", "2nd season", " 2", trailing digits
  const normalized = key
    .replace(/\s+(season\s*\d+|\d+(st|nd|rd|th)\s+season|\d+)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized !== key) return index.get(normalized) ?? null;
  return null;
}

const router = Router();

// ── Poster disk cache ─────────────────────────────────────────────────────────
const POSTER_DIR = "/tmp/poster-cache";
if (!existsSync(POSTER_DIR)) mkdirSync(POSTER_DIR, { recursive: true });

function urlToFilename(url: string): string {
  const hash = createHash("md5").update(url).digest("hex");
  const extMatch = url.match(/\.(jpe?g|png|webp|gif)/i);
  const ext = extMatch?.[1]?.toLowerCase() || "jpg";
  return `${hash}.${ext}`;
}

const MIME: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg",
  png: "image/png", webp: "image/webp", gif: "image/gif",
};

/**
 * GET /api/poster/p?url=<encoded-url>
 * Proxy + disk-cache gambar poster dari URL eksternal mana pun.
 */
router.get("/poster/p", async (req: Request, res: Response) => {
  const url = req.query.url as string;
  if (!url) return res.status(400).json({ error: "url required" });

  const filename = urlToFilename(url);
  const filePath = path.join(POSTER_DIR, filename);
  const ext = path.extname(filename).slice(1);
  const contentType = MIME[ext] || "image/jpeg";

  // ── Serve dari disk jika sudah ada ─────────────────────────────────────────
  if (existsSync(filePath)) {
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=604800, immutable"); // 7 hari
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.sendFile(filePath);
  }

  // ── Download dari sumber ────────────────────────────────────────────────────
  try {
    const response = await fetch(url, {
      headers: {
        // User-Agent browser agar bypass Cloudflare OtakuDesu block
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
        "Referer": "https://anilist.co/",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok || !response.body) {
      logger.warn({ url, status: response.status }, "poster/p upstream error");
      // Jangan blok client — redirect ke URL asli sebagai fallback
      return res.redirect(302, url);
    }

    const upstreamType = response.headers.get("content-type") || contentType;

    // Kumpulkan semua chunk ke buffer, lalu tulis ke disk + kirim ke client
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) chunks.push(value);
    }

    const buffer = Buffer.concat(chunks);

    // Tulis ke disk (async, tidak blokir response)
    const writer = createWriteStream(filePath);
    writer.end(buffer, () => {
      logger.debug({ filePath, size: buffer.length }, "poster cached to disk");
    });
    writer.on("error", (e) => {
      logger.warn({ err: e }, "poster disk write failed");
    });

    res.setHeader("Content-Type", upstreamType);
    res.setHeader("Cache-Control", "public, max-age=604800, immutable");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Length", buffer.length);
    return res.send(buffer);
  } catch (err) {
    logger.warn({ err, url }, "poster/p fetch failed, redirecting to origin");
    // Fallback: redirect ke URL asli
    return res.redirect(302, url);
  }
});

// ── AniList title resolver ────────────────────────────────────────────────────
const _titleCache = new Map<string, { url: string | null; ts: number }>();
const RESOLVE_TTL = 24 * 3600_000; // 24 jam

const ANILIST_QUERY = `
  query($search: String) {
    Media(search: $search, type: ANIME) {
      coverImage { extraLarge large }
    }
  }
`;

/**
 * GET /api/poster/resolve?title=<title>
 * 1. Cek local full-cache JSON dulu (instan, tanpa AniList call).
 * 2. Kalau tidak ketemu, fallback ke live AniList GraphQL lookup.
 * Di-cache in-memory 24 jam.
 */
router.get("/poster/resolve", async (req: Request, res: Response) => {
  const title = req.query.title as string;
  if (!title) return res.status(400).json({ error: "title required" });

  const key = title.toLowerCase().trim();

  // ── 1. In-memory title cache hit (24 jam) ─────────────────────────────────
  const cached = _titleCache.get(key);
  if (cached && Date.now() - cached.ts < RESOLVE_TTL) {
    return res.json({ poster: cached.url });
  }

  // ── 2. Local full-cache JSON lookup (instant, no network) ─────────────────
  const localPoster = lookupLocalPoster(title);
  if (localPoster) {
    _titleCache.set(key, { url: localPoster, ts: Date.now() });
    logger.debug({ title, source: "local-cache" }, "poster/resolve local hit");
    return res.json({ poster: localPoster });
  }

  // ── 3. Live AniList GraphQL fallback ──────────────────────────────────────
  try {
    const gqlRes = await fetch("https://graphql.anilist.co", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: ANILIST_QUERY, variables: { search: title } }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!gqlRes.ok) {
      _titleCache.set(key, { url: null, ts: Date.now() });
      return res.json({ poster: null });
    }

    const data = await gqlRes.json() as {
      data?: { Media?: { coverImage?: { extraLarge?: string; large?: string } } };
    };
    const cover =
      data.data?.Media?.coverImage?.extraLarge ||
      data.data?.Media?.coverImage?.large ||
      null;

    _titleCache.set(key, { url: cover, ts: Date.now() });
    logger.debug({ title, cover, source: "anilist" }, "poster/resolve AniList result");
    return res.json({ poster: cover });
  } catch (err) {
    logger.warn({ err, title }, "poster/resolve AniList fetch failed");
    _titleCache.set(key, { url: null, ts: Date.now() });
    return res.json({ poster: null });
  }
});

export default router;
