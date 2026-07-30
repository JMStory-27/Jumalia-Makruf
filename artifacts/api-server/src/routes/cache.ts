/**
 * Cache proxy routes — memungkinkan web app mengunduh data cache anime
 * tanpa CORS error. GitHub Releases dan CDN-nya tidak support CORS di browser,
 * jadi file didownload server-side ke /tmp/ lalu diserve langsung dari API server ini.
 */
import { Router, type Request, type Response } from "express";
import { createWriteStream, existsSync, statSync } from "fs";
import { unlink } from "fs/promises";
import { logger } from "../lib/logger";

const router = Router();

const GH_OWNER = process.env.GITHUB_OWNER || "JMStory-27";
const GH_REPO  = process.env.GITHUB_REPO  || "Jumalia-Makruf";
const GH_RAW   = `https://raw.githubusercontent.com/${GH_OWNER}/${GH_REPO}/main/data`;

// Path persisten (workspace) — tidak hilang saat server restart.
// Fallback ke /tmp kalau workspace path gagal (permission, dll).
const WORKSPACE_CACHE_DIR  = "/home/runner/workspace/.cache";
const WORKSPACE_CACHE_PATH = `${WORKSPACE_CACHE_DIR}/anisub-full-cache.json`;
const TMP_CACHE_PATH        = "/tmp/anisub-full-cache.json";
const LOCAL_CACHE_PATH      = (() => {
  try {
    const { mkdirSync } = require("fs");
    mkdirSync(WORKSPACE_CACHE_DIR, { recursive: true });
    return WORKSPACE_CACHE_PATH;
  } catch {
    return TMP_CACHE_PATH;
  }
})();
const CACHE_TTL_MS = 7 * 24 * 3600_000; // 7 hari

interface CacheUrlConfig {
  fullCacheUrl?: string;
  lightListUrl?: string;
  totalAnime?: number;
  updatedAt?: string;
  releaseTag?: string;
}

// Config cache in-memory (TTL 10 menit)
let _configCache: { data: CacheUrlConfig; ts: number } | null = null;

async function fetchCacheConfig(): Promise<CacheUrlConfig | null> {
  if (_configCache && Date.now() - _configCache.ts < 10 * 60_000) {
    return _configCache.data;
  }
  try {
    const res = await fetch(`${GH_RAW}/cache-urls.json`, {
      headers: { Accept: "application/json", "User-Agent": "AniSub-API/1.0" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as CacheUrlConfig;
    _configCache = { data, ts: Date.now() };
    return data;
  } catch {
    return null;
  }
}

/** Cek apakah file cache lokal masih valid */
function isLocalCacheFresh(): boolean {
  if (!existsSync(LOCAL_CACHE_PATH)) return false;
  try {
    const stat = statSync(LOCAL_CACHE_PATH);
    if (stat.size < 1_000_000) return false; // terlalu kecil = korup
    return Date.now() - stat.mtimeMs < CACHE_TTL_MS;
  } catch {
    return false;
  }
}

/** Download dari GitHub Releases ke file lokal, follow semua redirect */
let _downloadPromise: Promise<void> | null = null;
async function ensureLocalCache(fullCacheUrl: string): Promise<void> {
  if (isLocalCacheFresh()) return;

  // Satu download pada satu waktu — request berikutnya tunggu yang ini
  if (_downloadPromise) return _downloadPromise;

  _downloadPromise = (async () => {
    logger.info("Downloading anisub-full-cache.json from GitHub Releases...");
    const tmpPath = LOCAL_CACHE_PATH + ".tmp";

    try {
      const res = await fetch(fullCacheUrl, {
        headers: { "User-Agent": "AniSub-API/1.0" },
        signal: AbortSignal.timeout(300_000), // 5 menit — server-to-server, tidak ada proxy timeout
      });

      if (!res.ok || !res.body) throw new Error(`GitHub Releases HTTP ${res.status}`);

      const writer = createWriteStream(tmpPath);
      const reader = res.body.getReader();

      await new Promise<void>((resolve, reject) => {
        writer.on("error", reject);
        writer.on("finish", resolve);
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { writer.end(); break; }
            if (!writer.write(Buffer.from(value))) {
              await new Promise<void>((r) => writer.once("drain", r));
            }
          }
        };
        pump().catch(reject);
      });

      // Rename tmp → final (atomic)
      const { rename } = await import("fs/promises");
      await rename(tmpPath, LOCAL_CACHE_PATH);
      logger.info("anisub-full-cache.json cached locally at " + LOCAL_CACHE_PATH);
    } catch (err) {
      await unlink(tmpPath).catch(() => {});
      throw err;
    }
  })();

  try {
    await _downloadPromise;
  } finally {
    _downloadPromise = null;
  }
}

// Pre-warm cache saat server start (non-blocking)
setTimeout(async () => {
  const config = await fetchCacheConfig();
  if (config?.fullCacheUrl && !isLocalCacheFresh()) {
    ensureLocalCache(config.fullCacheUrl).catch((e) =>
      logger.warn({ err: e }, "Pre-warm cache gagal (akan coba lagi saat request pertama)")
    );
  }
}, 3_000);

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/cache/urls
 * Kembalikan config URL cache (fullCacheUrl, lightListUrl, totalAnime, dst.)
 */
router.get("/cache/urls", async (_req: Request, res: Response) => {
  try {
    const config = await fetchCacheConfig();
    if (!config) {
      return res.status(404).json({ error: "cache-urls.json tidak ditemukan di GitHub" });
    }
    return res.json(config);
  } catch (err) {
    logger.error({ err }, "cache/urls error");
    return res.status(500).json({ error: String(err) });
  }
});

/**
 * GET /api/cache/full
 * Serve anisub-full-cache.json dari local file (didownload server-side dari GitHub Releases).
 * Karena diserve langsung dari API server ini, tidak ada CORS issue.
 * File di-cache lokal selama 7 hari.
 */
router.get("/cache/full", async (req: Request, res: Response) => {
  try {
    const config = await fetchCacheConfig();
    if (!config?.fullCacheUrl) {
      return res.status(404).json({ error: "fullCacheUrl tidak tersedia di GitHub" });
    }

    // Download jika belum ada / expired (mungkin butuh waktu saat pertama kali)
    await ensureLocalCache(config.fullCacheUrl);

    if (!existsSync(LOCAL_CACHE_PATH)) {
      return res.status(503).json({ error: "Cache belum siap, coba beberapa detik lagi" });
    }

    // Serve file langsung dengan CORS header
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "public, max-age=86400"); // 1 hari
    req.on("close", () => {/* client disconnect — file stream akan berhenti otomatis */});
    return res.sendFile(LOCAL_CACHE_PATH);
  } catch (err) {
    logger.error({ err }, "cache/full error");
    return res.status(502).json({ error: String(err) });
  }
});

export default router;
