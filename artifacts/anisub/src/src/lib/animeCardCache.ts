/**
 * animeCardCache — quick lookup animeId → poster URL
 *
 * Diisi saat kartu anime render di Home/Search (sebelum user klik).
 * AnimeDetail membacanya segera (pakai animeId dari URL) sehingga poster
 * langsung tampil tanpa harus tunggu response API selesai.
 */

// Module-level map — hidup selama sesi browser, tidak perlu persist
const _posterMap = new Map<string, string | null>();

/**
 * Simpan poster URL untuk animeId tertentu.
 * Dipanggil di AnimeCard saat render.
 */
export function cacheCardPoster(animeId: string, poster: string | null | undefined): void {
  // Hanya simpan kalau belum ada atau nilai baru lebih baik (non-null)
  if (!_posterMap.has(animeId) || (!_posterMap.get(animeId) && poster)) {
    _posterMap.set(animeId, poster ?? null);
  }
}

/**
 * Ambil poster yang sudah dicache dari kartu.
 * Returns undefined kalau belum pernah di-cache (berbeda dari null = sudah coba tapi tidak ada).
 */
export function getCardPoster(animeId: string): string | null | undefined {
  return _posterMap.get(animeId);
}
