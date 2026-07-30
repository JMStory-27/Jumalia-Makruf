import { Router, type IRouter } from "express";
import { existsSync, readFileSync } from "fs";

const router: IRouter = Router();

const WGAPI = "https://wg-anime-api-v2.onrender.com";

// ── Full cache: posterHD + banner dari AniList (di-download cache.ts saat boot) ──
// Prioritas: workspace persisten → /tmp fallback (sesuai ANISUB_NOTES.md)
const WORKSPACE_CACHE_PATH = "/home/runner/workspace/.cache/anisub-full-cache.json";
const TMP_CACHE_PATH = "/tmp/anisub-full-cache.json";
function getLocalCachePath(): string {
  return existsSync(WORKSPACE_CACHE_PATH) ? WORKSPACE_CACHE_PATH : TMP_CACHE_PATH;
}

type CacheEntry = { animeId?: string; id?: string; posterHD?: string; banner?: string; status?: string };
let _posterMap: Map<string, { posterHD: string; banner?: string }> | null = null;
let _posterMapTs = 0;
const POSTER_MAP_TTL = 30 * 60_000; // reload tiap 30 menit

function getPosterMap(): Map<string, { posterHD: string; banner?: string }> {
  const now = Date.now();
  if (_posterMap && now - _posterMapTs < POSTER_MAP_TTL) return _posterMap;
  const cachePath = getLocalCachePath();
  if (!existsSync(cachePath)) return _posterMap ?? new Map();
  try {
    const raw = readFileSync(cachePath, "utf-8");
    const json = JSON.parse(raw) as { anime?: CacheEntry[] };
    const map = new Map<string, { posterHD: string; banner?: string }>();
    for (const entry of (json.anime || [])) {
      const id = entry.animeId || entry.id;
      if (id && entry.posterHD) map.set(id, { posterHD: entry.posterHD, banner: entry.banner });
    }
    _posterMap = map;
    _posterMapTs = now;
    return map;
  } catch {
    return _posterMap ?? new Map();
  }
}

/** Fallback: strip season suffix jika exact animeId tidak ada di cache.
 *  Contoh: "nige-wakagimi-s2-sub-indo" → "nige-wakagimi-sub-indo" */
function lookupPosterWithFallback(
  map: Map<string, { posterHD: string; banner?: string }>,
  animeId: string
): { posterHD: string; banner?: string } | undefined {
  const exact = map.get(animeId);
  if (exact) return exact;
  // strip -sN-sub-indo → -sub-indo
  const stripped = animeId.replace(/-s\d+(-sub-indo)?(-sub)?$/i, "-sub-indo").replace(/-s\d+/gi, "");
  if (stripped !== animeId) {
    const f1 = map.get(stripped);
    if (f1) return f1;
    const f2 = map.get(stripped.replace(/-sub-indo$/, ""));
    if (f2) return f2;
  }
  const noSuffix = animeId.replace(/-sub-indo$/, "");
  return noSuffix !== animeId ? map.get(noSuffix) : undefined;
}

/** Inject anilistPoster ke response anime DETAIL (/otakudesu/anime/:id).
 *  Sama dengan enrichListResponse tapi untuk satu anime bukan list. */
function enrichDetailResponse(body: string, animeId: string): string {
  try {
    const json = JSON.parse(body) as { data?: { details?: Record<string, unknown> } };
    const details = json.data?.details;
    if (!details || typeof details !== "object") return body;

    const map = getPosterMap();
    if (map.size === 0) return body;

    const entry = lookupPosterWithFallback(map, animeId);
    if (!entry) return body;

    const enriched: Record<string, unknown> = { ...details, anilistPoster: entry.posterHD };
    // Ganti poster OtakuDesu (blocked 403) dengan AniList HD URL
    const curPoster = details["poster"] as string | undefined;
    if (!curPoster || curPoster.includes("otakudesu.blog")) {
      enriched["poster"] = entry.posterHD;
    }

    return JSON.stringify({ ...json, data: { ...json.data, details: enriched } });
  } catch {
    return body;
  }
}

/** Inject anilistPoster ke setiap AnimeCard dalam list response.
 *  Juga ganti field `poster` dengan AniList HD URL jika OtakuDesu poster-nya
 *  kena Cloudflare block (URL mengandung otakudesu.blog). */
function enrichListResponse(body: string): string {
  try {
    const json = JSON.parse(body) as { data?: { animeList?: Array<Record<string, unknown>> } };
    const list = json.data?.animeList;
    if (!Array.isArray(list) || list.length === 0) return body;

    const map = getPosterMap();
    if (map.size === 0) return body;

    let changed = false;
    const enriched = list.map(card => {
      const id = card["animeId"] as string | undefined;
      if (!id) return card;
      const entry = map.get(id);
      if (!entry) return card;
      changed = true;
      const result: Record<string, unknown> = { ...card, anilistPoster: entry.posterHD };
      // Ganti poster OtakuDesu (blocked 403) dengan AniList HD URL
      const curPoster = card["poster"] as string | undefined;
      if (!curPoster || (curPoster.includes("otakudesu.blog") && entry.posterHD)) {
        result["poster"] = entry.posterHD;
      }
      return result;
    });

    if (!changed) return body;
    return JSON.stringify({ ...json, data: { ...json.data, animeList: enriched } });
  } catch {
    return body;
  }
}

const WGAPI_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
  "Accept": "application/json, */*;q=0.8",
  "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
  "Referer": "https://otakudesu.blog/",
  "Origin": "https://otakudesu.blog",
};

// ── In-memory response cache untuk wg-api (cegah 504 pada cold start Render) ──
type WgCacheEntry = { status: number; body: string; contentType: string; ts: number };
const _wgCache = new Map<string, WgCacheEntry>();
// Pending map: satu request per path, request berikutnya tunggu yang pertama selesai
const _wgPending = new Map<string, Promise<WgCacheEntry>>();

// TTL berbeda tiap tipe path
function wgCacheTtl(path: string): number {
  if (path.startsWith("/otakudesu/ongoing") || path.startsWith("/otakudesu/completed")) return 3 * 60_000; // 3 menit
  if (path.startsWith("/otakudesu/anime/")) return 5 * 60_000; // 5 menit
  if (path.startsWith("/otakudesu/search")) return 60_000; // 1 menit
  return 2 * 60_000;
}

/** Fetch satu URL dari WGAPI, kembalikan { status, body, contentType } */
async function wgFetch(path: string, timeoutMs = 20000): Promise<{ status: number; body: string; contentType: string }> {
  const cacheKey = path;
  const ttl = wgCacheTtl(path);
  const cached = _wgCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < ttl) return cached;

  // Deduplicate in-flight: kalau sudah ada request yang sama berjalan, tunggu hasilnya
  const pending = _wgPending.get(cacheKey);
  if (pending) return pending;

  const promise = (async (): Promise<WgCacheEntry> => {
    try {
      const url = `${WGAPI}${path}`;
      const upstream = await fetch(url, { headers: WGAPI_HEADERS, signal: AbortSignal.timeout(timeoutMs) });
      const body = await upstream.text();
      const entry: WgCacheEntry = {
        status: upstream.status,
        body,
        contentType: upstream.headers.get("content-type") ?? "application/json",
        ts: Date.now(),
      };
      // Hanya cache respon sukses (2xx) — jangan cache error
      if (upstream.status >= 200 && upstream.status < 300) {
        _wgCache.set(cacheKey, entry);
      }
      return entry;
    } finally {
      _wgPending.delete(cacheKey);
    }
  })();

  _wgPending.set(cacheKey, promise);
  return promise;
}

/** Ekstrak kata-kata kunci dari animeId untuk fallback search.
 *  Contoh: "buchigire-reijou-houfuku-chikaimashita-sub-indo" → "buchigire reijou"
 *  Hapus suffix -sub-indo, -bd, -s2 dst., ambil 2-3 kata pertama. */
function animeIdToSearchQuery(animeId: string): string {
  return animeId
    .replace(/-sub-indo$/, "")
    .replace(/-bd$/, "")
    .replace(/-dub$/, "")
    .replace(/-[0-9]+$/, "")
    .split("-")
    .filter(w => w.length > 2 && !["sub", "indo", "the", "and", "season"].includes(w))
    .slice(0, 3)
    .join(" ");
}

/** Coba cari animeId yang benar di WGAPI saat ID kita tidak cocok.
 *  Return animeId yang benar atau null kalau tidak ketemu. */
async function resolveAnimeId(wrongId: string): Promise<string | null> {
  const q = animeIdToSearchQuery(wrongId);
  if (!q) return null;
  try {
    const { status, body } = await wgFetch(`/otakudesu/search?q=${encodeURIComponent(q)}`, 10000);
    if (status !== 200) return null;
    const json = JSON.parse(body) as { data?: { animeList?: { animeId: string; title: string }[] } };
    const list = json.data?.animeList ?? [];
    if (list.length === 0) return null;
    // Prefer exact prefix match, fallback ke result pertama
    const prefixWords = wrongId.replace(/-sub-indo$/, "").split("-").slice(0, 3).join("-");
    const exact = list.find(a => a.animeId.startsWith(prefixWords));
    return (exact ?? list[0]!).animeId;
  } catch {
    return null;
  }
}

// ── Proxy: /api/otakudesu/* → wg-anime-api-v2.onrender.com/otakudesu/* ───────
// Browser pakai BASE_URL="/api" sehingga semua fetchEpisode/fetchServer
// diarahkan ke sini; server forward ke external API.
// • ongoing/completed: inject anilistPoster + ganti OtakuDesu poster yg di-block Cloudflare
// • anime/:id 404: auto-resolve ID via search (handle mismatch GitHub vs wg-api)
const LIST_PATHS = new Set(["ongoing", "completed"]);

router.get(/^\/otakudesu\/(.+)$/, async (req, res) => {
  const sub = (req.params as unknown as string[])[0] ?? "";
  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  // path root = "ongoing" dari "ongoing?page=1"
  const pathRoot = sub.split("?")[0]!.split("/")[0]!;

  try {
    let { status, body, contentType } = await wgFetch(`/otakudesu/${sub}${qs}`);

    // Kalau anime detail 404, coba resolve ID yang benar via search
    if (status === 404 && sub.startsWith("anime/")) {
      const wrongId = sub.slice("anime/".length);
      const correctId = await resolveAnimeId(wrongId);
      if (correctId && correctId !== wrongId) {
        const retry = await wgFetch(`/otakudesu/anime/${correctId}${qs}`);
        status = retry.status;
        body = retry.body;
        contentType = retry.contentType;
      }
    }

    // Inject anilistPoster + fix OtakuDesu poster untuk list endpoints
    if (status === 200 && LIST_PATHS.has(pathRoot)) {
      body = enrichListResponse(body);
    }
    // Inject anilistPoster ke anime detail response juga
    if (status === 200 && pathRoot === "anime") {
      const animeId = sub.startsWith("anime/") ? sub.slice("anime/".length).split("?")[0] : "";
      if (animeId) body = enrichDetailResponse(body, animeId);
    }

    res.status(status)
      .setHeader("Content-Type", contentType)
      .setHeader("Access-Control-Allow-Origin", "*")
      .send(body);
  } catch (err) {
    req.log.error({ err, sub }, "otakudesu proxy failed");
    res.status(502).json({ error: "Upstream fetch failed" });
  }
});

// ── Regex patterns untuk ekstrak URL video dari berbagai embed player ─────────
const VIDEO_PATTERNS: RegExp[] = [
  // HTML <source src="..."> tags — highest priority, catches desustream googlevideo URLs
  // Note: googlevideo uses ?mime=video/mp4, NOT .mp4 extension, so match broadly
  /<source[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*type=["']video\//gi,
  /<source[^>]+src=["'](https?:\/\/[^"']+)["']/gi,
  // Specifically catch googlevideo.com/videoplayback URLs (IP-signed mp4 from desustream)
  /["'](https?:\/\/[^"']*googlevideo\.com\/videoplayback[^"']*)["']/gi,
  // Standard patterns for JS-based players
  /['"]\s*file\s*['"]\s*:\s*['"](https?:\/\/[^'"]+\.(?:m3u8|mp4|webm)[^'"]*)['"]/gi,
  /['"]\s*(?:file|src|source|url|stream)\s*['"]\s*:\s*['"](https?:\/\/[^'"]+\.(?:m3u8|mp4|webm)[^'"]*)['"]/gi,
  /source\s+[^>]*src\s*=\s*['"](https?:\/\/[^'"]+\.(?:m3u8|mp4|webm)[^'"]*)['"]/gi,
  /var\s+(?:file|source|videoUrl|url|src|stream|hlsUrl|m3u8)\s*=\s*['"](https?:\/\/[^'"]+\.(?:m3u8|mp4|webm)[^'"]*)['"]/gi,
  /setup\s*\(\s*\{[^}]*['"](https?:\/\/[^'"]+\.(?:m3u8|mp4|webm)[^'"]*)['"]/gi,
  /src\s*=\s*['"](https?:\/\/[^'"]+\.(?:m3u8|mp4)[^'"]*)['"]/gi,
  /[{,]\s*['"]\s*(?:src|file|source|url)\s*['"]\s*:\s*['"](https?:\/\/[^'"]+\.(?:m3u8|mp4|webm)[^'"]*)['"]/gi,
  /(?:source|stream|video|file|url|hls|m3u8)\s*[=:]\s*['"](https?:\/\/[^'"<>\s]+\.(?:m3u8|mp4|webm)(?:\?[^'"<>\s]*)?)['"]/gi,
  /loadSource\s*\(\s*['"](https?:\/\/[^'"]+\.(?:m3u8|mp4)[^'"]*)['"]/gi,
  /(?:hls|player)\.load(?:Source)?\s*\(\s*['"](https?:\/\/[^'"]+\.(?:m3u8)[^'"]*)['"]/gi,
];

const AD_DOMAINS = [
  "googlesyndication", "doubleclick", "shopee", "lazada",
  "moatads", "outbrain", "taboola", "monetag", "propellerads",
  "popcash", "exoclick", "adcash", "bidvertiser",
];

// Decode semua atob("...") calls dalam HTML → tambah ke search space
function expandAtob(html: string): string {
  const re = /atob\s*\(\s*["']([A-Za-z0-9+/=]{20,})["']\s*\)/g;
  const extra: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const decoded = Buffer.from(m[1], "base64").toString("utf-8");
      extra.push(decoded);
    } catch { /* skip invalid base64 */ }
  }
  // Also try standalone base64 blobs that happen to contain video URLs
  const re2 = /["']([A-Za-z0-9+/=]{60,})["']/g;
  re2.lastIndex = 0;
  while ((m = re2.exec(html)) !== null) {
    try {
      const decoded = Buffer.from(m[1], "base64").toString("utf-8");
      if (/\.(m3u8|mp4|webm)/i.test(decoded)) extra.push(decoded);
    } catch { /* skip */ }
  }
  return extra.length ? html + "\n" + extra.join("\n") : html;
}

function extractVideoUrl(html: string, _baseOrigin: string): string | null {
  // Expand encoded content before scanning
  const expanded = expandAtob(html);
  const candidates: string[] = [];

  for (const pattern of VIDEO_PATTERNS) {
    pattern.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = pattern.exec(expanded)) !== null) {
      const raw = m[1];
      if (!raw) continue;
      const url = raw
        .replace(/&amp;/g, "&").replace(/&#x2F;/g, "/")
        .replace(/\\u002F/gi, "/").replace(/\\\//g, "/")
        .replace(/\\n|\\t/g, "");
      if (url.startsWith("http") && !AD_DOMAINS.some(d => url.includes(d))) {
        candidates.push(url);
      }
    }
  }

  if (candidates.length === 0) return null;
  const m3u8 = candidates.find(u => u.includes(".m3u8"));
  if (m3u8) return m3u8;
  const mp4 = candidates.find(u => u.includes(".mp4"));
  if (mp4) return mp4;
  return candidates[0];
}

// ── GET /api/proxy/extract?url=<encoded>[&referer=<encoded>] ─────────────────
// Critical: always pass the OtakuDesu episode page as referer for desustream URLs,
// otherwise desustream returns 403. The caller should supply the correct referer.
// URLs signed with our server IP (googlevideo.com with ip= param) are auto-wrapped
// in /api/proxy/stream so the browser doesn't need to match the IP.
router.get("/proxy/extract", async (req, res) => {
  const embedUrl = req.query["url"] as string | undefined;
  const customReferer = req.query["referer"] as string | undefined;
  if (!embedUrl) { res.status(400).json({ error: "Missing url" }); return; }

  let parsed: URL;
  try { parsed = new URL(embedUrl); } catch { res.status(400).json({ error: "Invalid url" }); return; }

  // Use caller-supplied referer if provided, otherwise fall back to embed origin
  const referer = customReferer || (parsed.origin + "/");

  try {
    const upstream = await fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
        "Referer": referer,
        "Origin": parsed.origin,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
        "Accept-Encoding": "identity",
        "Sec-Fetch-Dest": "iframe",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "cross-site",
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });

    if (!upstream.ok) { res.status(upstream.status).json({ error: "Upstream returned " + upstream.status }); return; }

    const html = await upstream.text();
    const rawVideoUrl = extractVideoUrl(html, parsed.origin);

    if (!rawVideoUrl) { res.status(404).json({ error: "No video URL found in embed page" }); return; }

    // If URL is IP-signed (googlevideo.com with ip= param), auto-proxy so the browser
    // doesn't need to match the server IP that was used during signing.
    let videoUrl = rawVideoUrl;
    let proxied = false;
    try {
      const vu = new URL(rawVideoUrl);
      if (vu.hostname.includes("googlevideo.com") && vu.searchParams.has("ip")) {
        videoUrl = `/api/proxy/stream?url=${encodeURIComponent(rawVideoUrl)}&origin=${encodeURIComponent(parsed.origin + "/")}`;
        proxied = true;
      }
    } catch { /* leave as-is */ }

    res.json({ videoUrl, proxied });
  } catch (err) {
    req.log.error({ err }, "proxy/extract fetch failed");
    const errStr = String((err as Error)?.message ?? "");
    // EAI_AGAIN = DNS lookup failed (host unreachable from this environment)
    const isNetErr = errStr.includes("EAI_AGAIN") || errStr.includes("ECONNREFUSED") || errStr.includes("ETIMEDOUT") || errStr.includes("fetch failed");
    res.status(502).json({ error: "Proxy fetch failed", code: isNetErr ? "NETWORK_ERROR" : "UPSTREAM_ERROR" });
  }
});

// ── GET /api/proxy/stream?url=<encoded>[&origin=<encoded>] ────────────────────
// HLS/video stream proxy — bypass CORS untuk play langsung di <video> element.
// - m3u8: fetch, rewrite semua URI ke /api/proxy/stream, return
// - segment (.ts/.aac/.mp4/.key/.vtt): fetch & pipe langsung
// Handles manual redirect for googlevideo (preserves headers through redirects).
router.get("/proxy/stream", async (req, res) => {
  const rawUrl = req.query["url"] as string | undefined;
  const rawOrigin = req.query["origin"] as string | undefined;
  if (!rawUrl) { res.status(400).json({ error: "Missing url" }); return; }

  let targetUrl: string;
  try { targetUrl = decodeURIComponent(rawUrl); } catch { targetUrl = rawUrl; }

  let parsed: URL;
  try { parsed = new URL(targetUrl); } catch { res.status(400).json({ error: "Invalid url" }); return; }

  const referer = rawOrigin ? decodeURIComponent(rawOrigin) : parsed.origin + "/";
  const rangeHeader = req.headers["range"];

  // Build request headers — forwarded on every hop (including after redirects)
  const buildHeaders = (currentUrl: string): Record<string, string> => {
    let currentParsed: URL;
    try { currentParsed = new URL(currentUrl); } catch { currentParsed = parsed; }
    const h: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Linux; Android 13; Redmi Note 12) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      "Referer": referer,
      "Accept": "*/*",
      "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
      "Accept-Encoding": "identity",
    };
    // Don't set Origin for cross-origin video CDNs as it can trigger CORS preflight
    if (!currentParsed.hostname.includes("googlevideo.com")) {
      h["Origin"] = currentParsed.origin;
    }
    if (rangeHeader) h["Range"] = rangeHeader;
    return h;
  };

  // Fetch helper that manually follows redirects while preserving headers (up to 5 hops)
  const fetchWithRedirects = async (url: string, hops = 0): Promise<Response> => {
    if (hops > 5) throw new Error("Too many redirects");
    const r = await fetch(url, {
      headers: buildHeaders(url),
      signal: AbortSignal.timeout(25000),
      redirect: "manual",
    });
    if ((r.status === 301 || r.status === 302 || r.status === 303 || r.status === 307 || r.status === 308)) {
      const location = r.headers.get("location");
      if (location) {
        const nextUrl = location.startsWith("http") ? location : new URL(location, url).toString();
        return fetchWithRedirects(nextUrl, hops + 1);
      }
    }
    return r;
  };

  try {
    const upstream = await fetchWithRedirects(targetUrl);

    if (!upstream.ok && upstream.status !== 206) { res.status(upstream.status).end(); return; }

    const contentType = upstream.headers.get("content-type") || "";
    const isM3u8 = targetUrl.includes(".m3u8") || contentType.includes("mpegurl") || contentType.includes("x-mpegURL");

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");

    if (isM3u8) {
      // Rewrite playlist: semua URI/segment → lewat proxy ini
      const text = await upstream.text();
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-store");

      // Base URL untuk resolve relative paths
      const base = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
      const proxyOriginParam = encodeURIComponent(parsed.origin + "/");

      const rewritten = text.split("\n").map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#EXT-X-ENDLIST") || trimmed.startsWith("#EXT-X-VERSION") || trimmed.startsWith("#EXT-X-TARGETDURATION") || trimmed.startsWith("#EXT-X-MEDIA-SEQUENCE") || trimmed.startsWith("#EXT-X-DISCONTINUITY")) {
          return line;
        }
        // Rewrite EXT-X-KEY URI
        if (trimmed.startsWith("#EXT-X-KEY")) {
          return line.replace(/URI="([^"]+)"/, (_: string, uri: string) => {
            const absUri = uri.startsWith("http") ? uri : base + uri;
            return `URI="/api/proxy/stream?url=${encodeURIComponent(absUri)}&origin=${proxyOriginParam}"`;
          });
        }
        // Rewrite EXT-X-MAP URI
        if (trimmed.startsWith("#EXT-X-MAP")) {
          return line.replace(/URI="([^"]+)"/, (_: string, uri: string) => {
            const absUri = uri.startsWith("http") ? uri : base + uri;
            return `URI="/api/proxy/stream?url=${encodeURIComponent(absUri)}&origin=${proxyOriginParam}"`;
          });
        }
        // Rewrite segment lines (tidak dimulai dengan #)
        if (!trimmed.startsWith("#")) {
          const absUrl = trimmed.startsWith("http") ? trimmed : base + trimmed;
          return `/api/proxy/stream?url=${encodeURIComponent(absUrl)}&origin=${proxyOriginParam}`;
        }
        return line;
      }).join("\n");

      res.end(rewritten);
    } else {
      // Binary segment / key / mp4 — pipe langsung
      const ct = upstream.headers.get("content-type");
      if (ct) res.setHeader("Content-Type", ct);
      const cl = upstream.headers.get("content-length");
      if (cl) res.setHeader("Content-Length", cl);
      // Forward Content-Range for 206 Partial Content (critical for video seeking)
      const cr = upstream.headers.get("content-range");
      if (cr) res.setHeader("Content-Range", cr);
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Cache-Control", "public, max-age=3600");

      // Use upstream status code (206 for range requests, 200 otherwise)
      res.status(upstream.status);

      if (!upstream.body) { res.end(); return; }
      const reader = upstream.body.getReader();
      req.on("close", () => { reader.cancel().catch(() => { /* ignore */ }); });
      const pump = async (): Promise<void> => {
        const { done, value } = await reader.read();
        if (done) { res.end(); return; }
        if (res.destroyed) { reader.cancel().catch(() => { /* ignore */ }); return; }
        res.write(Buffer.from(value));
        return pump();
      };
      await pump();
    }
  } catch (err) {
    req.log.error({ err }, "proxy/stream fetch failed");
    if (!res.headersSent) res.status(502).end();
  }
});

// ── GET /api/proxy/embed?url=<encoded> ───────────────────────────────────────
// Fallback: serve HTML embed dengan ad-blocker disuntikkan
const AD_PATTERNS_STR = [
  "shopeepay", "shopee", "lazada", "tokopedia-ads",
  "googlesyndication", "doubleclick", "adsbygoogle",
  "moatads", "outbrain", "taboola", "revenuehits",
  "propellerads", "popcash", "adcash", "bidvertiser",
  "exoclick", "trafficjunky", "adfly", "adf.ly",
  "oketag", "mgid", "activerevenue", "hilltopads",
  "pushcrew", "pushnotification", "monetag",
];

const INJECT = `
<script id="__video_interceptor__">
(function(){
  var _sent=false;
  var _AD=['googlesyndication','doubleclick','moatads','monetag','propellerads','shopeepay','exoclick','popcash','adcash'];
  function isVideoUrl(u){return typeof u==='string'&&/\\.(m3u8|mp4|webm)(\\?|$|#)/i.test(u)&&!_AD.some(function(x){return u.indexOf(x)!==-1;});}
  function send(u){if(_sent||!isVideoUrl(u))return;_sent=true;try{window.top.postMessage({type:'ANISUB_VIDEO_URL',url:u},'*');}catch(e){window.parent.postMessage({type:'ANISUB_VIDEO_URL',url:u},'*');}}

  /* JW Player */
  (function(){
    var _jw=window.jwplayer;
    function wrapJW(fn){
      return function(){
        var p=fn.apply(this,arguments);
        if(p&&typeof p.setup==='function'){
          var _s=p.setup.bind(p);
          p.setup=function(cfg){
            if(cfg){var srcs=cfg.sources||[];if(cfg.file)srcs=[{file:cfg.file}].concat(srcs);srcs.forEach(function(s){if(s&&s.file)send(s.file);});}
            return _s(cfg);
          };
        }
        return p;
      };
    }
    if(typeof _jw==='function'){window.jwplayer=wrapJW(_jw);}
    else{Object.defineProperty(window,'jwplayer',{configurable:true,get:function(){return _jw;},set:function(v){_jw=typeof v==='function'?wrapJW(v):v;}});}
  })();

  /* HTMLMediaElement.src */
  (function(){
    var d=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'src');
    if(!d||!d.set)return;
    Object.defineProperty(HTMLMediaElement.prototype,'src',{configurable:true,get:d.get,set:function(v){send(v);d.set.call(this,v);}});
  })();

  /* setAttribute src on video/source */
  (function(){
    var _sa=Element.prototype.setAttribute;
    Element.prototype.setAttribute=function(name,val){
      if(name==='src'&&(this.tagName==='VIDEO'||this.tagName==='SOURCE'))send(val);
      return _sa.apply(this,arguments);
    };
  })();

  /* XHR */
  (function(){
    var _o=XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open=function(m,u){if(typeof u==='string')send(u);return _o.apply(this,arguments);};
  })();

  /* fetch — block ads, intercept video */
  (function(){
    var _AD2=['googlesyndication','doubleclick','moatads','monetag','propellerads','shopeepay','exoclick','popcash'];
    var _f=window.fetch;
    window.fetch=function(input,init){
      var u=typeof input==='string'?input:(input&&input.url)||'';
      if(_AD2.some(function(n){return String(u).indexOf(n)!==-1;}))return Promise.resolve(new Response('',{status:200}));
      send(u);
      return _f.apply(this,arguments);
    };
  })();

  /* DOM scan */
  function scan(){document.querySelectorAll('video,source').forEach(function(el){var s=el.src||el.getAttribute('src')||el.currentSrc;if(s)send(s);});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);
  else scan();
  setTimeout(scan,1500);setTimeout(scan,4000);

  /* ── ANISUB Controller: 2-way bridge antara AniSub dan video di dalam proxy ── */
  (function(){
    var _cv=null;
    function findVid(){
      /* Cari video langsung di dokumen */
      var v=document.querySelector('video');
      /* Jika tidak ada, coba di nested iframe yang same-origin */
      if(!v){
        var frames=document.querySelectorAll('iframe');
        for(var i=0;i<frames.length;i++){
          try{
            var fd=frames[i].contentDocument;
            if(fd){var fv=fd.querySelector('video');if(fv){v=fv;break;}}
          }catch(e){}
        }
      }
      return v;
    }
    function setupSync(v){
      if(_cv===v)return;
      _cv=v;
      v.addEventListener('timeupdate',function(){
        try{window.parent.postMessage({type:'ANISUB_TIME',cur:v.currentTime,dur:isFinite(v.duration)&&v.duration>0?v.duration:0},'*');}catch(e){}
      });
      v.addEventListener('play',function(){try{window.parent.postMessage({type:'ANISUB_STATE',playing:true},'*');}catch(e){}});
      v.addEventListener('pause',function(){try{window.parent.postMessage({type:'ANISUB_STATE',playing:false},'*');}catch(e){}});
      v.addEventListener('ended',function(){try{window.parent.postMessage({type:'ANISUB_STATE',playing:false,ended:true},'*');}catch(e){}});
    }
    /* Poll video element sampai ditemukan */
    var _polls=0;
    var _pollI=setInterval(function(){
      if(++_polls>120){clearInterval(_pollI);return;}
      var v=findVid();
      if(v){clearInterval(_pollI);setupSync(v);}
    },500);
    /* Dengarkan perintah dari AniSub */
    window.addEventListener('message',function(e){
      if(!e.data||e.data.type!=='ANISUB_CMD')return;
      var v=_cv||findVid();
      if(!v)return;
      var c=e.data.cmd;
      if(c==='play'){try{v.play();}catch(ex){}}
      else if(c==='pause'){try{v.pause();}catch(ex){}}
      else if(c==='seek'&&typeof e.data.time==='number'){try{v.currentTime=e.data.time;}catch(ex){}}
      else if(c==='speed'&&typeof e.data.rate==='number'){try{v.playbackRate=e.data.rate;}catch(ex){}}
    });
  })();
})();
</script>
<style id="__adblocker__">
  /* ── Sembunyikan ads & popup (HATI-HATI: jangan hide player container) ── */
  ins.adsbygoogle,
  [id^="div-gpt-ad"],[id^="google_ads"],
  iframe[src*="googlesyndication"],iframe[src*="doubleclick"],
  iframe[src*="shopeepay"],iframe[src*="shopee"],
  .preroll-ad,.preroll-container,
  .banner-ads,.ads-banner {
    display:none!important;
  }

  /* ── Paksa video tampil penuh, semua container visible ── */
  html,body {
    margin:0!important; padding:0!important;
    overflow:hidden!important; background:#000!important;
    width:100%!important; height:100%!important;
  }
  /* Semua elemen player harus terlihat */
  video,
  .jw-wrapper,.jw-video,.jw-stretch-uniform,
  .vjs-tech,.vjs-fluid,.video-js,
  .plyr,.plyr__video-wrapper,.plyr video,
  .dplayer-video-wrap,.dplayer-video,
  .shaka-video-container,
  [class*="player-wrap"],[class*="player-container"],[class*="video-wrap"],
  [class*="video-container"],[class*="stream-player"] {
    display:block!important; visibility:visible!important;
    opacity:1!important; width:100%!important; height:100%!important;
    object-fit:contain!important;
  }
  video { pointer-events:none!important; background:#000!important; }

  /* ── Sembunyiin SEMUA kontrol dari streaming site player ── */
  /* JWPlayer */
  .jw-controlbar,.jw-dock,.jw-logo,.jw-title,.jw-overlay,.jw-rightclick,
  .jw-nextup-container,.jw-related-btn,.jw-related-overlay,.jw-captions,
  .jw-ads-container,.jwplayer .jw-controls-right,.jw-plugin-dock,
  /* Video.js */
  .vjs-control-bar,.vjs-big-play-button,.vjs-error-display,
  .vjs-loading-spinner,.vjs-text-track-display,.vjs-menu-button,
  /* Plyr */
  .plyr__controls,.plyr__control--overlaid,.plyr__captions,
  /* DPlayer */
  .dplayer-controller,.dplayer-bar-wrap,.dplayer-menu,.dplayer-setting,
  .dplayer-full-in-icon,.dplayer-full-icon,.dplayer-volume,
  .dplayer-time,.dplayer-subtitle,
  /* Shaka */
  .shaka-bottom-controls,.shaka-spinner-container,
  /* Generic player controls */
  [class*="player-control"],[class*="player-bar"],[class*="player-bottom"],
  [class*="player-toolbar"],[class*="player-overlay"],[class*="control-bar"],
  [class*="controlbar"],[class*="controls-wrapper"],[class*="player-ui"],
  [class*="video-controls"],[class*="media-controls"],
  /* Desustream / ondesuhd spesifik */
  .art-controls,.art-layer,.art-bottom,.art-top,.art-mask,
  /* Popup, overlay, loading text */
  .loading-text,.player-loading,[class*="loading-overlay"],
  [class*="buffer-overlay"],[class*="play-btn"],[class*="playbtn"],
  /* Context menu */
  [class*="context-menu"],[class*="rightclick"],[class*="right-click"] {
    display:none!important;
    opacity:0!important;
    visibility:hidden!important;
    pointer-events:none!important;
  }
</style>
<script id="__adblocker_js__">
(function(){
  /* Blokir popup window */
  window.open=function(){return null;};
  /* Stub Google Ad services agar tidak error */
  window.googletag=window.googletag||{cmd:{push:function(){}},defineSlot:function(){return{addService:function(){return{};}};},pubads:function(){return{enableSingleRequest:function(){},refresh:function(){},disableInitialLoad:function(){},setTargeting:function(){},addEventListener:function(){},collapseEmptyDivs:function(){}};},enableServices:function(){},display:function(){}};
  window.adsbygoogle=window.adsbygoogle||{push:function(){}};
  /* Hanya hapus iframe iklan yang benar-benar aman dihapus (bukan player) */
  function rmAds(){
    var safeSelectors=[
      'iframe[src*="googlesyndication"]',
      'iframe[src*="doubleclick.net"]',
      'iframe[src*="adserve"]',
      'ins.adsbygoogle',
      'script[src*="pagead2"]',
      'script[src*="googlesyndication"]'
    ];
    safeSelectors.forEach(function(s){
      try{document.querySelectorAll(s).forEach(function(el){
        /* Jangan hapus jika di dalam player container */
        if(!el.closest('video')&&!el.closest('[class*="player"]')&&!el.closest('[class*="video"]')){
          el.remove();
        }
      });}catch(e){}
    });
  }
  if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',rmAds);}else{rmAds();}
  /* TIDAK pakai MutationObserver — bisa ngehapus player elements yang di-render async */
})();
</script>
`;

router.get("/proxy/embed", async (req, res) => {
  const embedUrl = req.query["url"] as string | undefined;
  if (!embedUrl) { res.status(400).json({ error: "Missing url" }); return; }

  let parsed: URL;
  try { parsed = new URL(embedUrl); } catch { res.status(400).json({ error: "Invalid url" }); return; }

  try {
    const upstream = await fetch(embedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36",
        "Referer": parsed.origin + "/",
        "Origin": parsed.origin,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "id-ID,id;q=0.9,en-US;q=0.8",
        "Accept-Encoding": "identity",
      },
      signal: AbortSignal.timeout(12000),
      redirect: "follow",
    });

    if (!upstream.ok) { res.status(upstream.status).json({ error: "Upstream returned " + upstream.status }); return; }

    let html = await upstream.text();

    AD_PATTERNS_STR.forEach(pattern => {
      const esc = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      html = html.replace(new RegExp(`<script[^>]+src=["'][^"']*${esc}[^"']*["'][^>]*>(<\\/script>)?`, "gi"), "");
      html = html.replace(new RegExp(`<script[^>]*>[\\s\\S]*?${esc}[\\s\\S]*?<\\/script>`, "gi"), "");
      html = html.replace(new RegExp(`<iframe[^>]+src=["'][^"']*${esc}[^"']*["'][^>]*>[\\s\\S]*?<\\/iframe>`, "gi"), "");
      html = html.replace(new RegExp(`<ins[^>]*>[\\s\\S]*?${esc}[\\s\\S]*?<\\/ins>`, "gi"), "");
    });

    const injection = `<base href="${parsed.origin}/">` + INJECT;
    html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => m + injection) : injection + html;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.removeHeader("X-Frame-Options");
    res.setHeader("Cache-Control", "no-store, no-cache");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.removeHeader("Content-Security-Policy");
    res.send(html);
  } catch (err) {
    req.log.error({ err }, "proxy/embed fetch failed");
    const errStr = String((err as Error)?.message ?? "");
    const isNetErr = errStr.includes("EAI_AGAIN") || errStr.includes("ECONNREFUSED") || errStr.includes("ETIMEDOUT") || errStr.includes("fetch failed");
    res.status(502).json({ error: "Proxy fetch failed", code: isNetErr ? "NETWORK_ERROR" : "UPSTREAM_ERROR" });
  }
});

export default router;
