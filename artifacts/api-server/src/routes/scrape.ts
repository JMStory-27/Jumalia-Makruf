import { Router, type IRouter } from "express";
import {
  getScrapeState, onScrapeUpdate, runScrapeOnce,
  triggerFullSweepJob, getFullSweepState, onFullSweepUpdate,
} from "../lib/scrapeJob";

const router: IRouter = Router();

// GET /api/scrape/status — snapshot absolut (nextRunAt = epoch server, aman
// dipakai client walau app ditutup lalu dibuka lagi, tidak akan reset ke awal).
router.get("/scrape/status", (_req, res) => {
  const s = getScrapeState();
  res.json({
    running: s.running,
    lastRunAt: s.lastRunAt,
    nextRunAt: s.nextRunAt,
    intervalMs: 5 * 60_000,
    lastResult: s.lastResult,
    history: s.history,
  });
});

// POST /api/scrape/run — trigger manual (tombol ⚡). Tidak mengubah jadwal
// otomatis yang sudah berjalan mutlak tiap 5 menit di server.
router.post("/scrape/run", (req, res) => {
  const s = getScrapeState();
  if (s.running) {
    res.status(409).json({ error: "Scrape sedang berjalan" });
    return;
  }
  res.status(202).json({ accepted: true });
  runScrapeOnce("manual").catch((err) => {
    req.log.error({ err }, "manual scrape failed");
  });
});

// GET /api/scrape/stream — SSE, dorong update real-time (progress mulai/selesai).
router.get("/scrape/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (s: ReturnType<typeof getScrapeState>) => {
    res.write(`data: ${JSON.stringify({
      running: s.running,
      lastRunAt: s.lastRunAt,
      nextRunAt: s.nextRunAt,
      lastResult: s.lastResult,
    })}\n\n`);
  };

  send(getScrapeState());
  const unsubscribe = onScrapeUpdate(send);
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 20_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
    res.end();
  });
});

// POST /api/scrape/full-sweep — jalankan cek menyeluruh SEMUA anime (baca dari cache lokal)
router.post("/scrape/full-sweep", async (req, res) => {
  const result = await triggerFullSweepJob();
  if ("error" in result) {
    res.status(409).json(result);
    return;
  }
  res.status(202).json(result);
});

// GET /api/scrape/sweep-stream — SSE stream progress full sweep real-time
router.get("/scrape/sweep-stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (p: ReturnType<typeof getFullSweepState>) => {
    res.write(`data: ${JSON.stringify(p)}\n\n`);
  };

  // Kirim state terkini saat connect — supaya client yang baru buka langsung tahu
  // apakah sweep masih berjalan atau sudah selesai
  send(getFullSweepState());

  const unsubscribe = onFullSweepUpdate(send);
  const keepAlive = setInterval(() => res.write(": ping\n\n"), 20_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
    res.end();
  });
});

export default router;
