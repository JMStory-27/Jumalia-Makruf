/**
 * Background prefetch service — download SEMUA data anime (banner + rich data)
 * dari AniList dan simpan ke IndexedDB secara permanen, supaya:
 * 1. Poster/banner kartu anime langsung tampil instan dari cache (bukan placeholder)
 * 2. Halaman detail anime (karakter, staff, VA) tidak perlu fetch on-demand lagi
 *
 * Cara kerja:
 * - Dipanggil saat app startup, tapi baru mulai kerja setelah delay 30 detik
 *   supaya tidak bersaing dengan request halaman awal yang lebih penting.
 * - Phase 1: Banner semua anime (ongoing + completed) — tiap kartu langsung punya gambar
 * - Phase 2: Rich data (karakter, staff, VA) untuk anime ONGOING (prioritas tinggi)
 * - State tersimpan di localStorage — jangan re-run tiap session (hemat quota AniList)
 */
import {
  fetchAniListBannersBatch,
  fetchAniListRichByTitle,
  cleanAnimeTitle,
  parseSeasonNumber,
  isBannerCachedSync,
} from "./anilist";
import { idbCacheGet } from "./persistentCache";

const PREFETCH_STATE_KEY = "anisub_prefetch_v3";
const RICH_CACHE_KEY = "anisub_rich_v2";
const RICH_TTL = 30 * 24 * 3600_000; // 30 hari

// Pakai BASE_URL dari env supaya benar saat diakses via proxy Replit
const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api";

interface PrefetchState {
  bannerDoneAt?: number;
  richOngoingDoneAt?: number;
}

function getState(): PrefetchState {
  try { return JSON.parse(localStorage.getItem(PREFETCH_STATE_KEY) ?? "{}"); } catch { return {}; }
}
function saveState(patch: Partial<PrefetchState>): void {
  try { localStorage.setItem(PREFETCH_STATE_KEY, JSON.stringify({ ...getState(), ...patch })); } catch {}
}

async function fetchPageTitles(path: string): Promise<string[]> {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return [];
    const json = await res.json() as { data?: { animeList?: { title: string }[] } };
    return (json.data?.animeList ?? []).map((a) => a.title);
  } catch { return []; }
}

async function getAllTitles(type: "ongoing" | "completed"): Promise<string[]> {
  const maxPages = type === "ongoing" ? 30 : 80;
  const titles: string[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const list = await fetchPageTitles(`/otakudesu/${type}?page=${page}`);
    if (!list.length) break;
    titles.push(...list);
    if (list.length < 25) break; // halaman terakhir
  }
  return [...new Set(titles)];
}

async function isRichCached(rawTitle: string): Promise<boolean> {
  const title = cleanAnimeTitle(rawTitle);
  if (!title) return true; // skip invalid
  const season = parseSeasonNumber(rawTitle);
  const key = `${RICH_CACHE_KEY}:${title.toLowerCase()}::s${season}`;
  const hit = await idbCacheGet<unknown>(key, RICH_TTL);
  return hit !== null;
}

let _prefetchStarted = false;

/**
 * Mulai background prefetch. Aman dipanggil berkali-kali — hanya berjalan sekali per session.
 * Delay 30 detik pertama agar tidak bersaing dengan request halaman awal.
 */
export async function startBackgroundPrefetch(): Promise<void> {
  if (_prefetchStarted) return;
  _prefetchStarted = true;

  // Tunggu 30 detik — biarkan halaman awal load dulu
  await new Promise<void>((r) => setTimeout(r, 30_000));

  const state = getState();
  const now = Date.now();
  const DAY_MS = 24 * 3600_000;

  // ── Phase 1: Banner prefetch untuk SEMUA anime (ongoing + completed) ──────────
  // Diperlukan agar semua kartu anime punya poster, bukan placeholder teks inisial.
  // Re-run setiap 24 jam untuk menangkap anime baru.
  if (!state.bannerDoneAt || now - state.bannerDoneAt > DAY_MS) {
    try {
      const [ongoingTitles, completedTitles] = await Promise.all([
        getAllTitles("ongoing"),
        getAllTitles("completed"),
      ]);
      const allTitles = [...new Set([...ongoingTitles, ...completedTitles])];
      const uncached = allTitles.filter((t) => !isBannerCachedSync(t));

      // Batch 8 judul per request AniList (lihat fetchAniListBannersBatch) — jauh
      // lebih cepat dari 1 request/judul karena total REQUEST yang harus lewat
      // antrian rate-limit turun ~8x, bukan cuma concurrency-nya yang naik.
      const BATCH_SIZE = 8;
      for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
        const chunk = uncached.slice(i, i + BATCH_SIZE);
        try { await fetchAniListBannersBatch(chunk); } catch { /* lanjut ke batch berikutnya */ }
      }
      saveState({ bannerDoneAt: Date.now() });
    } catch { /* jaringan gagal — coba lagi session berikutnya */ }
  }

  // ── Phase 2: Rich data (karakter, staff, VA) untuk anime ONGOING (prioritas) ──
  // Ongoing adalah anime yang paling sering dibuka user → cache dulu supaya detail
  // page tidak pernah nunggu skeleton lagi.
  if (!state.richOngoingDoneAt || now - state.richOngoingDoneAt > DAY_MS) {
    try {
      const ongoingTitles = await getAllTitles("ongoing");

      for (const title of ongoingTitles) {
        const cached = await isRichCached(title);
        if (!cached) {
          // 'low' priority — background, tidak ganggu user yang sedang aktif buka detail page
          try { await fetchAniListRichByTitle(title, 'low'); } catch { /* lanjut */ }
        }
      }
      saveState({ richOngoingDoneAt: Date.now() });
    } catch { /* jaringan gagal — coba lagi session berikutnya */ }
  }

  // ── Phase 3: Rich data untuk anime COMPLETED (semua 1600+ anime) ──────────────
  // Lebih rendah prioritasnya dari ongoing, tapi penting supaya user yang buka
  // detail anime completed tidak harus nunggu fetch dari scratch.
  // Di-split per hari: hanya 200 anime per run supaya tidak memakan terlalu lama.
  const COMPLETED_BATCH_KEY = "anisub_prefetch_completed_page_v1";
  const COMPLETED_PAGE_SIZE = 200; // jumlah anime completed per session
  try {
    const completedTitles = await getAllTitles("completed");
    // Ambil offset dari session sebelumnya, putar balik ke 0 kalau sudah habis
    let offset = 0;
    try { offset = parseInt(localStorage.getItem(COMPLETED_BATCH_KEY) ?? "0", 10) || 0; } catch {}
    if (offset >= completedTitles.length) offset = 0;

    const batch = completedTitles.slice(offset, offset + COMPLETED_PAGE_SIZE);
    for (const title of batch) {
      const cached = await isRichCached(title);
      if (!cached) {
        try { await fetchAniListRichByTitle(title, 'low'); } catch { /* lanjut */ }
      }
    }
    // Simpan progress untuk session berikutnya
    try { localStorage.setItem(COMPLETED_BATCH_KEY, String(offset + COMPLETED_PAGE_SIZE)); } catch {}
  } catch { /* jaringan gagal */ }
}
