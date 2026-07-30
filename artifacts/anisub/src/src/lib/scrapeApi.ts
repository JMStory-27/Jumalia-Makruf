const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api";

export interface DetailEnrichReport {
  queued: number;
  processed: number;
  ok: number;
  failed: number;
  bannerFilled: string[];
  synopsisFilled: string[];
  genreFilled: string[];
  scoreFilled: string[];
  studioFilled: string[];
  seasonDetected: string[];
  episodeCountUpdated: string[];
  failedTitles: string[];
  charactersNote: string;
  retryQueueSize: number;
}

export interface ScrapeResult {
  id: string;
  startedAt: number;
  finishedAt: number;
  trigger: "auto" | "manual";
  ok: boolean;
  totalOngoing: number;
  totalCompleted: number;
  totalAnime: number;
  newAnimeCount: number;
  episodeBumpCount: number;
  removedCount: number;
  newCompletedCount: number;
  newAnimeTitles: string[];
  episodeBumpTitles: string[];
  removedTitles: string[];
  newCompletedTitles: string[];
  detail: DetailEnrichReport;
  sweep: { coveredSoFar: number; totalUnique: number; cycleCount: number };
  errors: string[];
  githubSynced: boolean;
  webReportSynced: boolean;
  webReportUrl: string;
}

export interface ScrapeStatus {
  running: boolean;
  lastRunAt: number | null;
  /** Epoch ms mutlak dari server — aman dipakai lintas reload/tutup-buka app. */
  nextRunAt: number;
  intervalMs: number;
  lastResult: ScrapeResult | null;
  history: ScrapeResult[];
}

export async function fetchScrapeStatus(): Promise<ScrapeStatus> {
  const res = await fetch(`${BASE_URL}/scrape/status`, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`scrape status HTTP ${res.status}`);
  return res.json();
}

export async function triggerScrapeRun(): Promise<{ accepted: boolean } | { error: string }> {
  const res = await fetch(`${BASE_URL}/scrape/run`, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) throw new Error(body?.error || `scrape run HTTP ${res.status}`);
  return body;
}

export interface FullSweepProgress {
  current: number;
  total: number;
  done: boolean;
  lastTitle: string;
  okCount: number;
  failedCount: number;
  skippedCached: number;
  missingBanner: number;
  missingSynopsis: number;
  missingGenre: number;
  missingScore: number;
  /** Hanya ada di pesan pertama saat connect — status sweep sungguhan di server,
   *  supaya UI tahu kalau sweep masih jalan walau halaman baru dibuka/dibuka lagi. */
  running?: boolean;
}

export async function triggerFullSweep(): Promise<{ accepted: boolean } | { error: string }> {
  const res = await fetch(`${BASE_URL}/scrape/full-sweep`, { method: "POST" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 409) throw new Error(body?.error || `full sweep HTTP ${res.status}`);
  return body;
}

/** Buka SSE stream untuk progress full sweep. Panggil triggerFullSweep() dulu,
 *  lalu connect ke sini untuk menerima update real-time. */
export function openSweepStream(onProgress: (p: FullSweepProgress) => void): () => void {
  const es = new EventSource(`${BASE_URL}/scrape/sweep-stream`);
  es.onmessage = (e) => {
    try { onProgress(JSON.parse(e.data) as FullSweepProgress); } catch { /* skip */ }
  };
  return () => es.close();
}
