import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { fetchSearch, fetchOngoing, fetchCompleted, fetchGenreAnime, fetchGenres, fetchAllCompletedMap, fetchAllOngoingMap } from "@/lib/api";
import { searchAnimeByCharacter } from "@/lib/anilist";
import AnimeCard from "@/components/AnimeCard";

const STATUS_OPTS = [
  { value: "",          label: "✨ Semua" },
  { value: "ongoing",  label: "🔴 Ongoing" },
  { value: "completed",label: "✅ Selesai" },
];

const SORT_OPTS = [
  { value: "default", label: "Default" },
  { value: "score",   label: "⭐ Rating" },
  { value: "title",   label: "🔤 A-Z" },
];

const GENRE_EMOJI: Record<string, string> = {
  action: "⚔️", adventure: "🗺️", comedy: "😂", demons: "👹", drama: "🎭",
  ecchi: "🔞", fantasy: "🪄", game: "🎮", harem: "💝", historical: "🏯",
  horror: "👻", josei: "👩", magic: "✨", "martial-arts": "🥋", mecha: "🤖",
  military: "🪖", music: "🎵", mystery: "🔮", psychological: "🧠", parody: "🃏",
  police: "👮", romance: "💕", samurai: "⛩️", school: "🏫", "sci-fi": "🚀",
  seinen: "🧔", shoujo: "🌸", "shoujo-ai": "🌺", shounen: "💥", "shounen-ai": "🌷",
  "slice-of-life": "☕", sports: "⚽", space: "🌌", "super-power": "💪",
  supernatural: "🌙", thriller: "😱", vampire: "🧛", isekai: "🌀",
  reincarnation: "♻️", kids: "🧒", "martial arts": "🥋", "super power": "💪",
  "sci fi": "🚀", "slice of life": "☕",
};

// Genre lengkap OtakuDesu — fallback jika API mengembalikan list parsial
const FALLBACK_GENRES = [
  { genreId: "action",       title: "Action" },
  { genreId: "adventure",    title: "Adventure" },
  { genreId: "comedy",       title: "Comedy" },
  { genreId: "demons",       title: "Demons" },
  { genreId: "drama",        title: "Drama" },
  { genreId: "ecchi",        title: "Ecchi" },
  { genreId: "fantasy",      title: "Fantasy" },
  { genreId: "game",         title: "Game" },
  { genreId: "harem",        title: "Harem" },
  { genreId: "historical",   title: "Historical" },
  { genreId: "horror",       title: "Horror" },
  { genreId: "isekai",       title: "Isekai" },
  { genreId: "josei",        title: "Josei" },
  { genreId: "kids",         title: "Kids" },
  { genreId: "magic",        title: "Magic" },
  { genreId: "martial-arts", title: "Martial Arts" },
  { genreId: "mecha",        title: "Mecha" },
  { genreId: "military",     title: "Military" },
  { genreId: "music",        title: "Music" },
  { genreId: "mystery",      title: "Mystery" },
  { genreId: "parody",       title: "Parody" },
  { genreId: "police",       title: "Police" },
  { genreId: "psychological",title: "Psychological" },
  { genreId: "reincarnation",title: "Reincarnation" },
  { genreId: "romance",      title: "Romance" },
  { genreId: "samurai",      title: "Samurai" },
  { genreId: "school",       title: "School" },
  { genreId: "sci-fi",       title: "Sci-Fi" },
  { genreId: "seinen",       title: "Seinen" },
  { genreId: "shoujo",       title: "Shoujo" },
  { genreId: "shoujo-ai",    title: "Shoujo Ai" },
  { genreId: "shounen",      title: "Shounen" },
  { genreId: "shounen-ai",   title: "Shounen Ai" },
  { genreId: "slice-of-life",title: "Slice of Life" },
  { genreId: "space",        title: "Space" },
  { genreId: "sports",       title: "Sports" },
  { genreId: "super-power",  title: "Super Power" },
  { genreId: "supernatural", title: "Supernatural" },
  { genreId: "thriller",     title: "Thriller" },
  { genreId: "vampire",      title: "Vampire" },
];

function useDebounce<T>(value: T, delay: number): T {
  const [d, setD] = useState(value);
  useEffect(() => { const t = setTimeout(() => setD(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return d;
}

const GLASS = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" } as const;

const PAGE_SIZE = 25;

export default function SearchPage() {
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);

  const [query, setQuery] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState(params.get("status") ?? "");
  const [genre, setGenre] = useState(params.get("genre") ?? "");
  const [sort, setSort] = useState("default");
  const [showFilters, setShowFilters] = useState(params.get("openFilter") === "1" || !!params.get("genre"));
  // Pagination state
  const [page, setPage] = useState(1);
  const [accumulated, setAccumulated] = useState<import("@/lib/api").AnimeCard[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const dQ = useDebounce(query, 400);

  // Reset pagination when filter changes
  useEffect(() => {
    setPage(1);
    setAccumulated([]);
    setHasMore(false);
  }, [dQ, status, genre]);

  const { data: genreList } = useQuery({
    queryKey: ["genres-list"],
    queryFn: fetchGenres,
    staleTime: 24 * 60 * 60_000,
  });

  const { data: searchData, isLoading: lS } = useQuery({
    queryKey: ["search", dQ], queryFn: () => fetchSearch(dQ),
    enabled: dQ.length >= 2, staleTime: 30_000,
  });

  // Selalu coba cari juga lewat nama karakter (mis. "rimuru" -> Tensura), berjalan paralel
  // dengan pencarian judul biasa. Backend judul otakudesu suka fuzzy-match ngawur (mis. "eren"
  // nyasar ke anime lain), jadi hasil dari karakter tetap perlu dicek & diprioritaskan terpisah.
  const { data: charMatches, isLoading: lCharSearch } = useQuery({
    queryKey: ["char-search", dQ],
    queryFn: () => searchAnimeByCharacter(dQ),
    enabled: dQ.length >= 2,
    staleTime: 60_000,
  });

  const charTitles: string[] = [];
  const charTitleToName = new Map<string, string>();
  for (const m of charMatches ?? []) {
    const key = m.animeTitle.toLowerCase();
    if (!charTitleToName.has(key)) {
      charTitleToName.set(key, m.characterName);
      charTitles.push(m.animeTitle);
    }
  }
  const charTitlesKey = charTitles.slice(0, 6).join("|");

  const { data: charAnimeResults, isLoading: lCharAnime } = useQuery({
    queryKey: ["char-anime-search", charTitlesKey],
    queryFn: async () => {
      const titles = charTitlesKey ? charTitlesKey.split("|") : [];
      const found = await Promise.all(
        titles.map(async (t) => {
          try {
            const r = await fetchSearch(t);
            const top = r.animeList?.[0];
            return top ? { anime: top, character: charTitleToName.get(t.toLowerCase()) ?? "" } : null;
          } catch { return null; }
        })
      );
      const seen = new Set<string>();
      const merged: { anime: import("@/lib/api").AnimeCard; character: string }[] = [];
      for (const f of found) {
        if (f && !seen.has(f.anime.animeId)) {
          seen.add(f.anime.animeId);
          merged.push(f);
        }
      }
      return merged;
    },
    enabled: !!charTitlesKey,
    staleTime: 60_000,
  });

  // ── Local search: ongoing + completed semua halaman ──
  // Dipakai sebagai supplement search API OtakuDesu yang sangat terbatas (max 1-5 hasil).
  // fetchAllOngoingMap & fetchAllCompletedMap sudah di-cache oleh Home/Schedule page —
  // di sini pakai cache yang sama, tidak ada fetch ulang.
  const { data: ongoingMapAll } = useQuery({
    queryKey: ["ongoing-map-all"],
    queryFn: () => fetchAllOngoingMap(),
    staleTime: 30 * 60_000,
    enabled: dQ.length >= 2,
  });
  const { data: completedMapAll, isLoading: lCompletedMap } = useQuery({
    queryKey: ["completed-map-all"],
    queryFn: () => fetchAllCompletedMap(),
    staleTime: 45 * 60_000,
    enabled: dQ.length >= 2,
  });

  // Filter lokal dari semua data yang ter-cache
  const localResults = (() => {
    if (dQ.length < 2) return [];
    const ql = dQ.toLowerCase().trim();
    const seen = new Set<string>();
    const found: import("@/lib/api").AnimeCard[] = [];
    // Search ongoing map (instanceof guard: cache lama/corrupt tidak boleh bikin crash)
    if (ongoingMapAll instanceof Map) {
      for (const a of ongoingMapAll.values()) {
        if (!seen.has(a.animeId) && a.title.toLowerCase().includes(ql)) {
          seen.add(a.animeId);
          found.push(a);
        }
      }
    }
    // Search completed map (season lama, movie, OVA, dll) — instanceof guard juga di sini
    if (completedMapAll instanceof Map) {
      for (const a of completedMapAll.values()) {
        if (!seen.has(a.animeId) && a.title.toLowerCase().includes(ql)) {
          seen.add(a.animeId);
          found.push(a);
        }
      }
    }
    return found;
  })();
  const localSearching = dQ.length >= 2 && lCompletedMap;

  const directResults = dQ.length >= 2 ? (searchData?.animeList ?? []) : [];
  const directIds = new Set(directResults.map((a) => a.animeId));
  const charOnly = (charAnimeResults ?? [])
    .map((r) => r.anime)
    .filter((a) => !directIds.has(a.animeId));
  const matchedCharacterName =
    (charAnimeResults ?? []).find((r) => r.character && !directIds.has(r.anime.animeId))?.character ?? "";
  const usingCharacterFallback = charOnly.length > 0;

  // Paginated queries — fetch page 1 initially via useQuery, load more via manual fetch
  const { data: ongoingData, isLoading: lO } = useQuery({
    queryKey: ["ongoing-search", 1], queryFn: () => fetchOngoing(1),
    enabled: !dQ && status === "ongoing" && !genre, staleTime: 30_000,
  });
  const { data: completedData, isLoading: lC } = useQuery({
    queryKey: ["completed-search", 1], queryFn: () => fetchCompleted(1),
    enabled: !dQ && status === "completed" && !genre, staleTime: 60_000,
  });
  const { data: genreData, isLoading: lG } = useQuery({
    queryKey: ["genre-search", genre, 1], queryFn: () => fetchGenreAnime(genre, 1),
    enabled: !!genre && !dQ, staleTime: 60_000,
  });

  // Seed accumulated from page-1 query results
  useEffect(() => {
    let page1: import("@/lib/api").AnimeCard[] = [];
    if (!dQ && status === "ongoing" && !genre && ongoingData) page1 = ongoingData.animeList ?? [];
    else if (!dQ && status === "completed" && !genre && completedData) page1 = completedData.animeList ?? [];
    else if (!!genre && !dQ && genreData) page1 = genreData.animeList ?? [];
    if (page1.length > 0) {
      setAccumulated(page1);
      setHasMore(page1.length === PAGE_SIZE);
      setPage(1);
    }
  }, [ongoingData, completedData, genreData, dQ, status, genre]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      let data: import("@/lib/api").AnimeCard[] = [];
      if (status === "ongoing" && !genre) data = (await fetchOngoing(nextPage)).animeList ?? [];
      else if (status === "completed" && !genre) data = (await fetchCompleted(nextPage)).animeList ?? [];
      else if (genre) data = (await fetchGenreAnime(genre, nextPage)).animeList ?? [];
      setAccumulated((prev) => [...prev, ...data]);
      setPage(nextPage);
      setHasMore(data.length === PAGE_SIZE);
    } catch { setHasMore(false); }
    finally { setLoadingMore(false); }
  };

  const charPending = dQ.length >= 2 && directResults.length === 0 && (lCharSearch || lCharAnime);
  const isLoading = lS || lO || lC || lG || charPending;

  let results = (() => {
    if (dQ.length >= 2) {
      // Gabungkan: local (lengkap) + OtakuDesu API + karakter; deduplikasi by animeId
      const seen = new Set<string>();
      const merged: import("@/lib/api").AnimeCard[] = [];
      for (const a of [...localResults, ...directResults, ...charOnly]) {
        if (!seen.has(a.animeId)) { seen.add(a.animeId); merged.push(a); }
      }
      return merged;
    }
    if (!!genre || status === "ongoing" || status === "completed") return accumulated;
    return [];
  })();

  if (sort === "score") results = [...results].sort((a, b) => parseFloat(String(b.score ?? "0")) - parseFloat(String(a.score ?? "0")));
  else if (sort === "title") results = [...results].sort((a, b) => a.title.localeCompare(b.title));

  const hasQuery = dQ.length >= 2 || !!genre || !!status;
  const canLoadMore = hasMore && !dQ && (!!genre || !!status) && sort === "default";

  // Merge genre dari API dengan FALLBACK_GENRES — pastikan semua genre OtakuDesu tersedia
  // meski API hanya kembalikan sebagian. Urutan: API dulu, fallback untuk yang belum ada.
  const apiGenres = genreList?.genreList ?? [];
  const apiGenreIds = new Set(apiGenres.map((g) => g.genreId));
  const genres = apiGenres.length > 0
    ? [...apiGenres, ...FALLBACK_GENRES.filter((g) => !apiGenreIds.has(g.genreId))]
    : FALLBACK_GENRES;

  return (
    <div className="min-h-screen pb-24" style={{ background: "#05050f" }}>
      <div
        className="sticky top-0 z-40 px-4 py-3 space-y-3"
        style={{
          background: "rgba(5,5,18,0.97)",
          backdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(96,165,250,0.1)",
        }}
      >
        <div className="relative">
          <div
            className="flex items-center gap-2 px-4 py-3 rounded-2xl"
            style={{
              background: "rgba(96,165,250,0.06)",
              border: "1px solid rgba(96,165,250,0.2)",
            }}
          >
            <span className="text-base">🔍</span>
            <input
              type="search"
              value={query}
              onChange={(e) => { setQuery(e.target.value); }}
              placeholder="Cari anime favoritmu..."
              className="flex-1 bg-transparent text-sm outline-none"
              style={{ color: "#F1F5F9" }}
              autoFocus
              data-testid="input-search"
            />
            {query && (
              <button onClick={() => { setQuery(""); }} data-testid="btn-clear-search">
                <X size={16} style={{ color: "#64748B" }} />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold"
            style={{
              background: showFilters ? "linear-gradient(135deg,#667eea,#764ba2)" : "rgba(255,255,255,0.06)",
              color: showFilters ? "#fff" : "#64748B",
              boxShadow: showFilters ? "0 2px 12px rgba(102,126,234,0.4)" : "none",
            }}
            data-testid="btn-toggle-filters"
          >
            🎛️ Filter
          </button>
          {STATUS_OPTS.map((s) => (
            <button
              key={s.value}
              onClick={() => { setStatus(s.value); setGenre(""); }}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold"
              style={{
                background: status === s.value && !genre ? "rgba(34,211,238,0.15)" : "rgba(255,255,255,0.05)",
                color: status === s.value && !genre ? "#22D3EE" : "#64748B",
                border: status === s.value && !genre ? "1px solid rgba(34,211,238,0.35)" : "1px solid transparent",
              }}
              data-testid={`filter-status-${s.value}`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {showFilters && (
          <div className="space-y-2 pb-1">
            <p className="text-xs font-bold px-1" style={{ color: "#475569" }}>GENRE</p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setGenre("")}
                className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold"
                style={{
                  background: !genre ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.04)",
                  color: !genre ? "#A78BFA" : "#64748B",
                  border: !genre ? "1px solid rgba(167,139,250,0.4)" : "1px solid transparent",
                }}
              >
                🌐 Semua
              </button>
              {genres.map((g) => (
                <button
                  key={g.genreId}
                  onClick={() => { setGenre(g.genreId); setStatus(""); }}
                  className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold"
                  style={{
                    background: genre === g.genreId ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.04)",
                    color: genre === g.genreId ? "#A78BFA" : "#64748B",
                    border: genre === g.genreId ? "1px solid rgba(167,139,250,0.4)" : "1px solid transparent",
                  }}
                  data-testid={`filter-genre-${g.genreId}`}
                >
                  {GENRE_EMOJI[g.genreId] ?? "🎬"} {g.title}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {SORT_OPTS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSort(s.value)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold"
                  style={{
                    background: sort === s.value ? "rgba(244,114,182,0.15)" : "rgba(255,255,255,0.04)",
                    color: sort === s.value ? "#F472B6" : "#64748B",
                    border: sort === s.value ? "1px solid rgba(244,114,182,0.35)" : "1px solid transparent",
                  }}
                  data-testid={`sort-${s.value}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-4">
        {!hasQuery && (
          <div className="text-center py-20 space-y-4">
            <div className="text-6xl">🔭</div>
            <p className="text-base font-bold" style={{ color: "#F1F5F9" }}>
              Temukan Anime Favoritmu
            </p>
            <p className="text-sm" style={{ color: "#475569" }}>
              Ketik minimal 2 karakter atau pilih filter
            </p>
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl animate-pulse"
                style={{ background: "rgba(255,255,255,0.05)", aspectRatio: "2/3" }}
              />
            ))}
          </div>
        )}

        {!isLoading && hasQuery && results.length === 0 && (
          <div className="text-center py-20 space-y-3">
            <div className="text-5xl">😔</div>
            <p className="text-base font-bold" style={{ color: "#F1F5F9" }}>Tidak ditemukan</p>
            <p className="text-sm" style={{ color: "#475569" }}>Coba kata kunci lain</p>
          </div>
        )}

        {!isLoading && results.length > 0 && (
          <div>
            {usingCharacterFallback && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl mb-2"
                style={{ background: "rgba(167,139,250,0.1)", border: "1px solid rgba(167,139,250,0.3)" }}
              >
                <span className="text-sm">🎭</span>
                <p className="text-xs font-bold" style={{ color: "#A78BFA" }}>
                  Ditemukan lewat karakter{matchedCharacterName ? ` "${matchedCharacterName}"` : ""}
                </p>
              </div>
            )}
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl mb-3"
              style={GLASS}
            >
              <span className="text-sm">✨</span>
              <p className="text-xs font-bold" style={{ color: "#94A3B8" }}>
                {results.length} anime ditemukan
                {genre && genres.find(g => g.genreId === genre) ? ` · Genre: ${genres.find(g => g.genreId === genre)!.title}` : ""}
                {status === "ongoing" ? " · Ongoing" : status === "completed" ? " · Selesai" : ""}
                {canLoadMore ? " · Scroll untuk muat lebih" : ""}
                {localSearching && dQ.length >= 2 ? " · 🔍 sedang cari lebih..." : ""}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {results.map((anime) => (
                <AnimeCard key={anime.animeId} anime={anime} variant="poster" showScore />
              ))}
            </div>

            {/* Load More */}
            {canLoadMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full mt-5 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2"
                style={{
                  background: loadingMore ? "rgba(255,255,255,0.04)" : "rgba(96,165,250,0.10)",
                  color: loadingMore ? "#475569" : "#60A5FA",
                  border: `1px solid ${loadingMore ? "rgba(255,255,255,0.06)" : "rgba(96,165,250,0.25)"}`,
                }}
              >
                {loadingMore ? (
                  <>
                    <div className="w-4 h-4 rounded-full animate-spin"
                      style={{ border: "2px solid rgba(96,165,250,0.2)", borderTopColor: "#60A5FA" }} />
                    Memuat...
                  </>
                ) : (
                  <>🎬 Muat Lebih ({page * PAGE_SIZE}+ anime)</>
                )}
              </button>
            )}

            {!canLoadMore && accumulated.length > PAGE_SIZE && (
              <p className="text-center text-xs mt-4 font-bold" style={{ color: "#334155" }}>
                Semua {results.length} anime sudah ditampilkan ✓
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
