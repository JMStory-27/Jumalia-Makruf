/**
 * Routes JIKAN — sumber data halaman Musim Anisub (lebih lengkap dari AniList).
 *
 * - GET  /api/jikan/season-future       4 musim ke depan (auto-compute dari hari ini)
 * - GET  /api/jikan/season/:year/:season  1 musim (winter|spring|summer|fall)
 * - GET  /api/jikan/anime/:malId        detail lengkap + characters + staff
 * - GET  /api/jikan/cache-status         info isi cache (debug)
 * - POST /api/jikan/warm                 paksa refresh lineup 4 musim (admin)
 */
import { Router, type IRouter } from "express";
import {
  fetchJikanAnimeFull,
  fetchJikanSeason,
  fetchAniListSeasonBackup,
  getJikanCacheStatus,
  getUpcomingSeasons,
  warmJikanCache,
} from "../lib/jikan";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/jikan/cache-status", (_req, res) => {
  res.json({ data: getJikanCacheStatus() });
});

router.post("/jikan/warm", async (_req, res) => {
  try {
    await warmJikanCache();
    res.json({ data: { warmed: true, ...getJikanCacheStatus() } });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/jikan/season-future", async (_req, res) => {
  const seasons = getUpcomingSeasons();
  const out: Record<string, unknown> = {};
  for (const sk of seasons) {
    const key = `${sk.season}_${sk.year}`;
    let jikanError: string | null = null;

    try {
      const list = await fetchJikanSeason(sk);
      if (list.length > 0) {
        out[key] = { season: sk.season, year: sk.year, count: list.length, list, source: "MAL" };
        continue;
      }
      jikanError = "JIKAN returned empty lineup";
    } catch (err) {
      jikanError = err instanceof Error ? err.message : String(err);
      logger.warn({ err: jikanError, sk }, "jikan/season-future: JIKAN failed, trying AniList backup");
    }

    // JIKAN gagal/empty → coba AniList GraphQL sebagai backup. `source` field
    // ditransparankan ke klien supaya UI bisa kasih badge "via AniList" supaya
    // user tahu kalau lineup waktu itu bukan dari MAL utama.
    try {
      const backupList = await fetchAniListSeasonBackup(sk);
      if (backupList.length > 0) {
        out[key] = {
          season: sk.season,
          year: sk.year,
          count: backupList.length,
          list: backupList,
          source: "AniList",
          warning: `MAL/JIKAN tidak tersedia (${jikanError}). Lineup dari AniList.`,
        };
        continue;
      }
    } catch (backupErr) {
      logger.warn({ err: String(backupErr), sk }, "jikan/season-future: AniList backup also failed");
    }

    // Dua-duanya gagal → tampilkan empty + error string. UI kasih pesan
    // "sementara tidak tersedia" (bukan "lineup belum ada" yang menyesatkan).
    out[key] = {
      season: sk.season,
      year: sk.year,
      count: 0,
      list: [],
      source: "none",
      error: jikanError || "Both MAL and AniList unavailable",
    };
  }
  res.setHeader("Cache-Control", "public, max-age=3600"); // 1 jam — lineup jarang berubah
  res.json({ data: out, generatedAt: new Date().toISOString() });
});

router.get("/jikan/season/:year/:season", async (req, res) => {
  const year = parseInt(req.params.year, 10);
  const seasonRaw = String(req.params.season ?? "").toLowerCase();
  if (!["winter", "spring", "summer", "fall"].includes(seasonRaw)) {
    return res.status(400).json({ error: "season must be winter|spring|summer|fall" });
  }
  if (!Number.isFinite(year)) return res.status(400).json({ error: "invalid year" });
  try {
    const list = await fetchJikanSeason({ season: seasonRaw as "winter" | "spring" | "summer" | "fall", year });
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.json({ data: { season: seasonRaw, year, count: list.length, list } });
  } catch (err) {
    res.status(502).json({ error: String(err instanceof Error ? err.message : String(err)) });
  }
});

router.get("/jikan/anime/:malId", async (req, res) => {
  const malId = parseInt(req.params.malId, 10);
  if (!Number.isFinite(malId) || malId <= 0) {
    return res.status(400).json({ error: "malId must be positive integer" });
  }
  try {
    const detail = await fetchJikanAnimeFull(malId);
    if (!detail) return res.status(404).json({ error: "anime not found" });
    res.setHeader("Cache-Control", "public, max-age=86400"); // 24 jam
    res.json({ data: detail, generatedAt: new Date().toISOString() });
  } catch (err) {
    res.status(502).json({ error: String(err instanceof Error ? err.message : String(err)) });
  }
});

export default router;
