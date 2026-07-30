/**
 * Jikan API (unofficial MAL) — poster fetching with proper queue + cache.
 * Processes one request at a time with 400ms gap → 2.5 req/s, within Jikan limit (3/s).
 *
 * Poster URL yang sudah ketemu (bukan null) disimpan PERMANEN — poster MAL praktis tidak
 * pernah berubah, jadi begitu ketemu sekali, tidak perlu di-fetch ulang lagi selamanya.
 * Hasil "tidak ketemu" tetap dicoba ulang tiap 7 hari (CACHE_TTL) — mungkin nanti kepasang.
 */

const CACHE_KEY = "lawnime_mal_posters_v2";
const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days — hanya berlaku untuk entry null (belum ketemu)

interface CacheEntry { url: string; ts: number }

function loadCache(): Record<string, CacheEntry> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}"); }
  catch { return {}; }
}
function saveCache(cache: Record<string, CacheEntry>) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); }
  catch { try { localStorage.removeItem(CACHE_KEY); } catch {} }
}

// In-memory cache for this session
const memCache = new Map<string, string | null>();
// Deduplicate in-flight requests
const inFlight = new Map<string, Promise<string | null>>();

/* ── Sequential request queue ── */
type QueueTask = () => Promise<void>;
const queue: QueueTask[] = [];
let queueRunning = false;
const DELAY_MS = 420; // ~2.4 req/s — safely within Jikan's 3/s limit

async function runQueue() {
  if (queueRunning) return;
  queueRunning = true;
  while (queue.length > 0) {
    const task = queue.shift()!;
    await task();
    if (queue.length > 0) await new Promise((r) => setTimeout(r, DELAY_MS));
  }
  queueRunning = false;
}

function enqueueRequest<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push(async () => {
      try { resolve(await fn()); }
      catch (e) { reject(e); }
    });
    runQueue();
  });
}

/* ── Title normalisation ── */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\s+Subtitle\s+Indonesia/i, "")
    .replace(/\s+Sub\s+Indo/i, "")
    .replace(/\s+\(End\)/i, "")
    .replace(/\s+Season\s+\d+/i, "")
    .replace(/\s+Part\s+\d+/i, "")
    .replace(/\s+Cour\s+\d+/i, "")
    .replace(/\s+\d+th\s+Season/i, "")
    .replace(/\s+2nd\s+Season/i, "")
    .replace(/\s+3rd\s+Season/i, "")
    .trim();
}

/* ── Public API ── */
export async function fetchMalPoster(rawTitle: string): Promise<string | null> {
  const title = cleanTitle(rawTitle);
  if (!title) return null;
  const key = title.toLowerCase();

  // 1. Memory cache
  if (memCache.has(key)) return memCache.get(key) ?? null;

  // 2. localStorage cache — hit positif (url ketemu) permanent, hit negatif pakai TTL 7 hari
  const stored = loadCache();
  const entry = stored[key];
  if (entry && (entry.url || Date.now() - entry.ts < CACHE_TTL)) {
    memCache.set(key, entry.url || null);
    return entry.url || null;
  }

  // 3. Deduplicate concurrent requests for same title
  if (inFlight.has(key)) return inFlight.get(key)!;

  const promise = enqueueRequest(async (): Promise<string | null> => {
    try {
      const res = await fetch(
        `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&limit=3&sfw`,
        { signal: AbortSignal.timeout(8_000) }
      );
      if (!res.ok) return null;

      const json = await res.json();
      const items: Array<{
        title: string;
        images: { jpg: { large_image_url: string; image_url: string } };
      }> = json.data ?? [];

      if (items.length === 0) {
        memCache.set(key, null);
        return null;
      }

      const keyLow = key;
      const best =
        items.find((a) => a.title.toLowerCase() === keyLow) ?? items[0];

      const url =
        best.images?.jpg?.large_image_url ||
        best.images?.jpg?.image_url ||
        null;

      // Persist
      const updated = loadCache();
      updated[key] = { url: url ?? "", ts: Date.now() };
      saveCache(updated);
      memCache.set(key, url);
      return url;
    } catch {
      return null;
    } finally {
      inFlight.delete(key);
    }
  });

  inFlight.set(key, promise);
  return promise;
}
