import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { fetchOngoing, fetchCompleted, fetchScheduleAnime, fetchSchedule, fetchGenres, fetchAllCompletedIds, fetchAllOngoingMap } from "@/lib/api";
import { fetchScrapeStatus, triggerScrapeRun } from "@/lib/scrapeApi";
import { fetchAniListTrending, AniListTrendingItem } from "@/lib/anilist";
import AnimeCard from "@/components/AnimeCard";
import HeroCarousel from "@/components/HeroCarousel";
import HomeParticles from "@/components/HomeParticles";
import OwnerBadge from "@/components/OwnerBadge";
import { useAniListFinishedTitles, useAniListReleasingTitles, isCompletedHeuristic, titleKey, hoursSinceRelease } from "@/lib/completion";
import { proxyImg } from "@/lib/utils";
import { useAnimeInfo } from "@/lib/usePoster";

const SCHED_DAYS = ["Senin","Selasa","Rabu","Kamis","Jumat","Sabtu","Minggu"];

const GENRE_EMOJI: Record<string, string> = {
  action: "⚔️", adventure: "🗺️", comedy: "😂", demons: "👹", drama: "🎭",
  ecchi: "🔞", fantasy: "🪄", game: "🎮", harem: "💝", historical: "🏯",
  horror: "👻", josei: "👩", magic: "✨", "martial-arts": "🥋", mecha: "🤖",
  military: "🪖", music: "🎵", mystery: "🔮", psychological: "🧠", parody: "🃏",
  police: "👮", romance: "💕", samurai: "⛩️", school: "🏫", "sci-fi": "🚀",
  seinen: "🧔", shoujo: "🌸", "shoujo-ai": "🌺", shounen: "💥", "shounen-ai": "🌷",
  "slice-of-life": "☕", sports: "⚽", space: "🌌", "super-power": "💪",
  supernatural: "🌙", thriller: "😱", vampire: "🧛", isekai: "🌀",
  reincarnation: "♻️", "magical-girl": "🔮", "martial arts": "🥋",
  "slice of life": "☕", "super power": "💪", "sci fi": "🚀",
};

const GENRE_COLORS = [
  ["rgba(96,165,250,0.12)", "#60A5FA", "rgba(96,165,250,0.25)"],
  ["rgba(167,139,250,0.12)", "#A78BFA", "rgba(167,139,250,0.25)"],
  ["rgba(244,114,182,0.12)", "#F472B6", "rgba(244,114,182,0.25)"],
  ["rgba(52,211,153,0.12)", "#34D399", "rgba(52,211,153,0.25)"],
  ["rgba(251,191,36,0.12)", "#FBBF24", "rgba(251,191,36,0.25)"],
  ["rgba(34,211,238,0.12)", "#22D3EE", "rgba(34,211,238,0.25)"],
  ["rgba(251,146,60,0.12)", "#FB923C", "rgba(251,146,60,0.25)"],
];

const FLOATERS = [
  { glyph: "🌸", left: "8%",  delay: 0,   dur: 9 },
  { glyph: "✨", left: "22%", delay: 1.5, dur: 7 },
  { glyph: "🌙", left: "38%", delay: 3,   dur: 11 },
  { glyph: "⭐", left: "55%", delay: 0.8, dur: 8 },
  { glyph: "🌸", left: "70%", delay: 2.2, dur: 10 },
  { glyph: "💫", left: "85%", delay: 4,   dur: 6 },
  { glyph: "🌺", left: "15%", delay: 5,   dur: 12 },
  { glyph: "✨", left: "92%", delay: 1,   dur: 9 },
];

const TRENDING_TABS = [
  { id: "today",   label: "🔥 Hari Ini" },
  { id: "season",  label: "🌸 Musim Ini" },
  { id: "year",    label: "📆 Tahun Ini" },
  { id: "alltime", label: "👑 All Time" },
] as const;

type TrendingFilter = typeof TRENDING_TABS[number]["id"];

function SectionHeader({
  emoji, title, sub, action, onAction,
}: {
  emoji: string; title: string; sub?: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div className="w-1 h-5 rounded-full flex-shrink-0"
          style={{ background: "linear-gradient(180deg, #60A5FA, #A78BFA)", boxShadow: "0 0 8px rgba(96,165,250,0.5)" }} />
        <div>
          <h2 className="text-base font-black leading-tight" style={{ color: "#F1F5F9" }}>
            {emoji} {title}
          </h2>
          {sub && <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>{sub}</p>}
        </div>
      </div>
      {action && onAction && (
        <button onClick={onAction}
          className="text-[11px] font-bold px-3 py-1.5 rounded-full card-press"
          style={{ background: "rgba(96,165,250,0.08)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.2)" }}>
          {action} →
        </button>
      )}
    </div>
  );
}

/* ── Trending card skeleton ── */
function TrendingCardSkeleton() {
  return (
    <div className="flex-shrink-0 w-[108px]">
      <div className="rounded-2xl animate-shimmer" style={{ aspectRatio: "2/3", width: "100%" }} />
      <div className="mt-2 h-3 rounded-full animate-shimmer" style={{ width: "80%" }} />
      <div className="mt-1 h-2.5 rounded-full animate-shimmer" style={{ width: "50%" }} />
    </div>
  );
}

/* ── Single trending card ── */
function TrendingCard({ item, rank, delay }: { item: AniListTrendingItem; rank: number; delay: number }) {
  const [imgErr, setImgErr] = useState(false);
  const title = item.title.english ?? item.title.romaji;
  // Resolve poster dari AniSub permanent cache lokal dulu (null = coba resolve via /api/poster/resolve)
  // Kalau cache hit: instan. Kalau miss: fall back ke AniList CDN URL via proxy.
  const { poster: localPoster } = useAnimeInfo(title, null);
  const anilistUrl = item.coverImage.extraLarge ?? item.coverImage.large;
  const posterUrl = localPoster ? proxyImg(localPoster) : (anilistUrl ? proxyImg(anilistUrl) : null);

  const score = item.meanScore ?? item.averageScore;
  const rankColors = ["#FFD700", "#C0C0C0", "#CD7F32"];
  const rankColor = rankColors[rank - 1] ?? "rgba(255,255,255,0.4)";
  const isTop3 = rank <= 3;

  return (
    <div
      className="flex-shrink-0 w-[108px] group cursor-pointer"
      style={{ animation: `slide-up-fade 0.4s ${delay}s ease both` }}
    >
      <div className="relative rounded-2xl overflow-hidden"
        style={{
          aspectRatio: "2/3",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
          transition: "transform 0.2s ease, box-shadow 0.2s ease",
        }}>
        {/* Poster */}
        {!imgErr && posterUrl ? (
          <img
            src={posterUrl}
            alt={title}
            className="w-full h-full object-cover"
            style={{ transition: "transform 0.3s ease" }}
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl"
            style={{ background: "rgba(96,165,250,0.08)" }}>
            🎬
          </div>
        )}

        {/* Hover glow overlay */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 pointer-events-none"
          style={{
            background: "linear-gradient(180deg, transparent 30%, rgba(96,165,250,0.25) 100%)",
            transition: "opacity 0.2s ease",
          }} />

        {/* Rank badge */}
        <div className="absolute top-2 left-2"
          style={{
            background: isTop3 ? `${rankColor}22` : "rgba(0,0,0,0.65)",
            border: `1px solid ${isTop3 ? rankColor : "rgba(255,255,255,0.15)"}`,
            backdropFilter: "blur(6px)",
            borderRadius: 8,
            padding: "2px 6px",
          }}>
          <span className="text-[10px] font-black"
            style={{ color: isTop3 ? rankColor : "rgba(255,255,255,0.7)" }}>
            #{rank}
          </span>
        </div>

        {/* Score badge */}
        {score && (
          <div className="absolute bottom-2 right-2"
            style={{
              background: "rgba(0,0,0,0.7)",
              backdropFilter: "blur(6px)",
              border: "1px solid rgba(255,215,0,0.2)",
              borderRadius: 8,
              padding: "2px 5px",
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}>
            <span style={{ color: "#FFD700", fontSize: 9 }}>★</span>
            <span className="text-[10px] font-black" style={{ color: "#FBBF24" }}>
              {(score / 10).toFixed(1)}
            </span>
          </div>
        )}
      </div>

      {/* Title */}
      <p className="text-[11px] font-bold mt-2 leading-tight line-clamp-2"
        style={{ color: "#CBD5E1" }}>
        {item.title.english ?? item.title.romaji}
      </p>
      {item.studios?.nodes?.[0] && (
        <p className="text-[9px] mt-0.5 truncate" style={{ color: "#475569" }}>
          {item.studios.nodes[0].name}
        </p>
      )}
    </div>
  );
}

/* ── Trending section with tabs ── */
function TrendingSection() {
  const [activeTab, setActiveTab] = useState<TrendingFilter>("today");
  const [cache, setCache] = useState<Partial<Record<TrendingFilter, AniListTrendingItem[]>>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (cache[activeTab]) return;
    setLoading(true);
    // 'high' priority: user sudah klik tab, jangan antri di belakang background prefetch
    fetchAniListTrending(activeTab, 12, 'high')
      .then((data) => setCache((prev) => ({ ...prev, [activeTab]: data })))
      .finally(() => setLoading(false));
  }, [activeTab, cache]);

  const items = cache[activeTab] ?? [];

  return (
    <section className="animate-slide-up" style={{ animationDelay: "0.12s" }}>
      <SectionHeader
        emoji="🏆" title="Top Trending"
        sub="Berdasarkan data AniList real-time"
      />

      {/* Tab bar */}
      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide pb-1">
        {TRENDING_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full card-press"
              style={{
                background: active
                  ? "linear-gradient(135deg, rgba(96,165,250,0.25), rgba(167,139,250,0.25))"
                  : "rgba(255,255,255,0.04)",
                color: active ? "#A5C8FF" : "#475569",
                border: active
                  ? "1px solid rgba(96,165,250,0.4)"
                  : "1px solid rgba(255,255,255,0.07)",
                transition: "all 0.18s ease",
                boxShadow: active ? "0 0 12px rgba(96,165,250,0.2)" : "none",
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Cards */}
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <TrendingCardSkeleton key={i} />)
          : items.length > 0
            ? items.map((item, i) => (
                <TrendingCard key={item.id} item={item} rank={i + 1} delay={i * 0.04} />
              ))
            : <p className="text-[12px] py-4" style={{ color: "#475569" }}>Tidak ada data trending saat ini.</p>
        }
      </div>
    </section>
  );
}

export default function Home() {
  const [, setLocation] = useLocation();
  const [greeting, setGreeting] = useState("");

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 6) setGreeting("🌙 Begadang?");
    else if (h < 12) setGreeting("🌅 Selamat Pagi");
    else if (h < 15) setGreeting("☀️ Selamat Siang");
    else if (h < 19) setGreeting("🌤️ Selamat Sore");
    else setGreeting("🌆 Selamat Malam");
  }, []);

  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const { data: ongoingData, isLoading: loadingOngoing, refetch: refetchOngoing } = useQuery({
    queryKey: ["ongoing"],
    queryFn: () => fetchOngoing(1),
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
  });

  const { data: scrapeStatus, refetch: refetchScrapeStatus } = useQuery({
    queryKey: ["scrape-status"],
    queryFn: fetchScrapeStatus,
    refetchInterval: 5000,
  });

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const lastSeenResultId = useRef<string | null>(null);
  useEffect(() => {
    const result = scrapeStatus?.lastResult;
    if (!result || result.id === lastSeenResultId.current) return;
    lastSeenResultId.current = result.id;
    refetchOngoing();
    if (!result.ok) {
      setSyncMsg("⚠️ Gagal sync");
    } else if (result.newAnimeCount > 0 || result.episodeBumpCount > 0) {
      const parts: string[] = [];
      if (result.newAnimeCount > 0) parts.push(`${result.newAnimeCount} anime baru`);
      if (result.episodeBumpCount > 0) parts.push(`${result.episodeBumpCount} episode baru`);
      setSyncMsg(`✅ ${parts.join(", ")}`);
    } else {
      setSyncMsg(`✅ ${result.totalOngoing} anime dicek, tidak ada yang baru`);
    }
    const clear = setTimeout(() => setSyncMsg(null), 4000);
    return () => clearTimeout(clear);
  }, [scrapeStatus?.lastResult, refetchOngoing]);

  const syncing = scrapeStatus?.running ?? false;

  const handleSync = async () => {
    if (syncing) return;
    setSyncMsg(null);
    try {
      const res = await triggerScrapeRun();
      if ("error" in res) {
        setSyncMsg(`⚠️ ${res.error}`);
        setTimeout(() => setSyncMsg(null), 3000);
        return;
      }
      refetchScrapeStatus();
    } catch {
      setSyncMsg("⚠️ Gagal sync");
      setTimeout(() => setSyncMsg(null), 3000);
    }
  };

  const { data: scheduleAnimeList } = useQuery({
    queryKey: ["schedule-anime"],
    queryFn: fetchScheduleAnime,
    staleTime: 60 * 60_000,
    refetchInterval: 60 * 60_000,
  });

  const countdown = scrapeStatus ? Math.max(0, Math.round((scrapeStatus.nextRunAt - now) / 1000)) : 0;
  const cdMins = Math.floor(countdown / 60).toString().padStart(2, "0");
  const cdSecs = (countdown % 60).toString().padStart(2, "0");

  const { data: genreList } = useQuery({
    queryKey: ["genres-list"],
    queryFn: fetchGenres,
    staleTime: 24 * 60 * 60_000,
  });

  const { data: completedIdsData } = useQuery({
    queryKey: ["completed-ids-all"],
    queryFn: () => fetchAllCompletedIds(),
    staleTime: 30 * 60_000,
  });
  const completedIds = completedIdsData instanceof Set ? completedIdsData : new Set<string>();

  const { data: ongoingMapData } = useQuery({
    queryKey: ["ongoing-map-all"],
    queryFn: () => fetchAllOngoingMap(),
    staleTime: 30 * 60_000,
  });
  const ongoingMap = ongoingMapData instanceof Map ? ongoingMapData : new Map();

  const { data: recentCompletedData } = useQuery({
    queryKey: ["completed-recent"],
    queryFn: () => fetchCompleted(1),
    staleTime: 30 * 60_000,
  });

  const { data: rawScheduleData } = useQuery({
    queryKey: ["schedule"],
    queryFn: fetchSchedule,
    staleTime: 60 * 60_000,
  });

  const ongoingList = ongoingData?.animeList ?? [];
  // Semua anime ongoing dari seluruh halaman (via fetchAllOngoingMap)
  const ongoingMapList = useMemo(() => Array.from(ongoingMap.values()), [ongoingMap]);
  // Carousel sumber: UTAMAKAN ongoingMapList (data lengkap termasuk latestReleaseDate)
  // supaya filter TAMAT bisa jalan dengan benar. scheduleAnimeList punya data minimal
  // (tanpa latestReleaseDate) sehingga isCompletedHeuristic tidak bisa deteksi TAMAT.
  const carouselSource = ongoingMapList.length > 0
    ? ongoingMapList
    : (scheduleAnimeList && scheduleAnimeList.length > 0) ? scheduleAnimeList : ongoingList;
  const rawCarouselList = carouselSource
    .map((a) => ({ ...ongoingMap.get(a.animeId), ...a }));

  const allWeekTitles = useMemo(() => {
    const seen = new Set<string>();
    const titles: string[] = [];
    for (const day of rawScheduleData?.scheduleList ?? []) {
      if (!SCHED_DAYS.includes(day.title)) continue;
      for (const a of day.animeList) {
        if (!seen.has(a.title)) { seen.add(a.title); titles.push(a.title); }
      }
    }
    return titles;
  }, [rawScheduleData]);

  const carouselTitles = rawCarouselList.map((a) => a.title);
  const mergedAniListTitles = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const t of [...carouselTitles, ...allWeekTitles]) {
      if (!seen.has(t)) { seen.add(t); merged.push(t); }
    }
    return merged;
  }, [carouselTitles, allWeekTitles]);

  const aniListFinishedTitles = useAniListFinishedTitles(mergedAniListTitles);
  const aniListReleasingTitles = useAniListReleasingTitles(mergedAniListTitles);
  const allWeekFinished = aniListFinishedTitles;
  const allWeekReleasing = aniListReleasingTitles;

  const totalWeeklyOngoing = useMemo(() => {
    const sched = rawScheduleData?.scheduleList ?? [];
    if (!sched.length) return null;
    const seen = new Set<string>();
    let count = 0;
    for (const day of sched) {
      if (!SCHED_DAYS.includes(day.title)) continue;
      for (const a of day.animeList) {
        if (seen.has(a.animeId)) continue;
        seen.add(a.animeId);
        const tk = titleKey(a.title);
        if (allWeekReleasing.has(tk)) { count++; continue; }
        if (allWeekFinished.has(tk)) continue;
        if (completedIds.has(a.animeId)) continue;
        const enriched = { ...ongoingMap.get(a.animeId), ...a };
        if (isCompletedHeuristic(enriched)) continue;
        count++;
      }
    }
    return count;
  }, [rawScheduleData, completedIds, ongoingMap, allWeekFinished, allWeekReleasing]);

  const carouselList = useMemo(() => {
    const filtered = rawCarouselList.filter((a) => {
      const tk = titleKey(a.title);
      if (aniListReleasingTitles.has(tk)) return true;
      if (aniListFinishedTitles.has(tk)) return false;
      if (completedIds.has(a.animeId)) return false;
      if (isCompletedHeuristic(a)) return false;
      return true;
    });
    // Urutkan: EPS BARU / RILIS BARU (rilis < 24 jam) duluan, lalu COUNTDOWN.
    // Di dalam masing-masing grup, urutkan dari yang paling baru (jam terkecil).
    return filtered.sort((a, b) => {
      const hA = hoursSinceRelease(a.latestReleaseDate ?? a.lastReleaseDate) ?? 9999;
      const hB = hoursSinceRelease(b.latestReleaseDate ?? b.lastReleaseDate) ?? 9999;
      return hA - hB;
    });
  }, [rawCarouselList, aniListReleasingTitles, aniListFinishedTitles, completedIds]);

  // Jumlah anime yang benar-benar tayang (bukan TAMAT) — dipakai di stats & subtitle.
  const trueOngoingCount = carouselList.length;

  const genres = genreList?.genreList ?? [];

  const handleRandom = () => {
    if (!ongoingList.length) return;
    const r = ongoingList[Math.floor(Math.random() * ongoingList.length)];
    setLocation(`/anime/${r.animeId}`);
  };

  const recentCompleted = recentCompletedData?.animeList ?? [];

  const topAnime = [...ongoingList]
    .filter((a) => a.score)
    .sort((a, b) => parseFloat(String(b.score ?? 0)) - parseFloat(String(a.score ?? 0)))
    .slice(0, 5);

  return (
    <div className="min-h-screen pb-28 relative" style={{ background: "#05050f" }}>

      {/* ── HOME-ONLY: Micro particle system ── */}
      <HomeParticles />

      {/* ── Floating sakura / emoji ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        {FLOATERS.map((f, i) => (
          <span key={i} style={{
            position: "absolute", left: f.left, bottom: "-10%",
            fontSize: 11 + (i % 3) * 3,
            animation: `sakura-rise ${f.dur}s ${f.delay}s ease-in-out infinite`,
            opacity: 0, filter: "drop-shadow(0 0 6px rgba(255,255,255,0.4))",
            willChange: "transform, opacity", userSelect: "none",
          }}>{f.glyph}</span>
        ))}
      </div>

      {/* ── Aurora scan line ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{
          position: "absolute", left: 0, right: 0, height: 1,
          background: "linear-gradient(90deg, transparent, rgba(96,165,250,0.35), rgba(167,139,250,0.5), rgba(244,114,182,0.35), transparent)",
          animation: "aurora-scan 8s linear infinite",
          boxShadow: "0 0 8px rgba(167,139,250,0.4)",
        }} />
        <div style={{
          position: "absolute", left: 0, right: 0, height: 1,
          background: "linear-gradient(90deg, transparent, rgba(52,211,153,0.25), rgba(34,211,238,0.4), rgba(52,211,153,0.25), transparent)",
          animation: "aurora-scan 12s 4s linear infinite",
          boxShadow: "0 0 6px rgba(34,211,238,0.35)",
        }} />
      </div>

      {/* ── Ambient orbs ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{ position: "absolute", top: -80, right: -60, width: 320, height: 320, background: "radial-gradient(circle, rgba(96,165,250,0.09) 0%, transparent 70%)", borderRadius: "50%", animation: "orb-drift 12s ease-in-out infinite" }} />
        <div style={{ position: "absolute", top: 300, left: -80, width: 260, height: 260, background: "radial-gradient(circle, rgba(167,139,250,0.08) 0%, transparent 70%)", borderRadius: "50%", animation: "orb-drift 15s ease-in-out infinite 3s" }} />
        <div style={{ position: "absolute", top: 620, right: -60, width: 220, height: 220, background: "radial-gradient(circle, rgba(244,114,182,0.07) 0%, transparent 70%)", borderRadius: "50%", animation: "orb-drift 10s ease-in-out infinite 6s" }} />
        <div style={{ position: "absolute", top: 950, left: -40, width: 200, height: 200, background: "radial-gradient(circle, rgba(52,211,153,0.06) 0%, transparent 70%)", borderRadius: "50%", animation: "orb-drift 13s ease-in-out infinite 1s" }} />
      </div>

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes sakura-rise {
          0%   { transform: translateY(0) rotate(0deg) scale(0.8);  opacity: 0; }
          10%  { opacity: 0.7; }
          50%  { transform: translateY(-55vh) rotate(180deg) scale(1.1); opacity: 0.5; }
          90%  { opacity: 0.2; }
          100% { transform: translateY(-110vh) rotate(360deg) scale(0.7); opacity: 0; }
        }
        @keyframes aurora-scan {
          0%   { top: -2px; opacity: 0; }
          5%   { opacity: 1; }
          95%  { opacity: 0.6; }
          100% { top: 100vh; opacity: 0; }
        }
        @keyframes slide-up-fade {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes trending-card-hover {
          to { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(96,165,250,0.2); }
        }
        .trending-card:hover { animation: trending-card-hover 0.2s ease forwards; }
        @keyframes lawnime-shimmer {
          0%,100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        @keyframes logo-hex-pulse {
          0%,100% { filter: drop-shadow(0 0 5px rgba(167,139,250,0.75)) drop-shadow(0 0 12px rgba(96,165,250,0.4)); }
          50%      { filter: drop-shadow(0 0 9px rgba(244,114,182,0.85)) drop-shadow(0 0 20px rgba(167,139,250,0.5)); }
        }
      `}</style>

      {/* ── Top bar ── */}
      <div className="sticky top-0 z-40 px-4 py-3"
        style={{
          background: "rgba(5,5,18,0.92)",
          backdropFilter: "blur(28px)", WebkitBackdropFilter: "blur(28px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 4px 32px rgba(0,0,0,0.5)",
        }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              {/* Premium hexagon logo mark */}
              <svg width="30" height="30" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg"
                style={{ flexShrink: 0, animation: "logo-hex-pulse 3s ease-in-out infinite" }}>
                <defs>
                  <linearGradient id="lw-g1" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#60A5FA"/>
                    <stop offset="48%" stopColor="#A78BFA"/>
                    <stop offset="100%" stopColor="#F472B6"/>
                  </linearGradient>
                  <linearGradient id="lw-g2" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#A78BFA"/>
                    <stop offset="100%" stopColor="#F472B6"/>
                  </linearGradient>
                </defs>
                {/* Outer hexagon ring */}
                <polygon points="15,1.8 27,8.4 27,21.6 15,28.2 3,21.6 3,8.4"
                  fill="rgba(8,8,24,0.92)" stroke="url(#lw-g1)" strokeWidth="1.6"/>
                {/* Inner accent ring */}
                <polygon points="15,6 23.5,10.8 23.5,19.2 15,24 6.5,19.2 6.5,10.8"
                  fill="none" stroke="url(#lw-g2)" strokeWidth="0.7" strokeOpacity="0.4"/>
                {/* L lettermark */}
                <text x="9.5" y="20.5" fontFamily="Arial Black,sans-serif" fontSize="13"
                  fontWeight="900" fill="url(#lw-g1)">L</text>
              </svg>
              <span className="text-xl font-black tracking-tight"
                style={{
                  background: "linear-gradient(135deg, #60A5FA 0%, #A78BFA 30%, #F472B6 62%, #FFD700 100%)",
                  backgroundSize: "300% 300%",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  animation: "lawnime-shimmer 4s ease-in-out infinite",
                }}>
                Lawnime
              </span>
              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                style={{ background: "rgba(52,211,153,0.15)", color: "#34D399", border: "1px solid rgba(52,211,153,0.25)", animation: "live-dot 2s ease-in-out infinite" }}>
                LIVE
              </span>
              <button onClick={handleSync}
                title="Sync data anime dari OtakuDesu"
                style={{
                  fontSize: 8, fontWeight: 900,
                  color: syncing ? "#34D399" : syncMsg ? "#34D399" : "rgba(96,165,250,0.7)",
                  letterSpacing: "0.01em", fontVariantNumeric: "tabular-nums",
                  background: "none", border: "none", padding: "2px 4px",
                  borderRadius: 6, cursor: "pointer", transition: "color 0.2s",
                  WebkitTapHighlightColor: "transparent",
                }}>
                {syncing ? "⚡SYNC..." : syncMsg ?? `⚡${cdMins}:${cdSecs}`}
              </button>
            </div>
            {greeting && <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>{greeting}</p>}
          </div>
          <div style={{ width: 120 }} />
        </div>
      </div>

      {/* ── Hero Carousel ── */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <HeroCarousel items={carouselList} />
      </div>

      {/* ── Stats strip ── */}
      {!loadingOngoing && ongoingList.length > 0 && (
        <div className="mx-4 -mt-3 mb-5 px-4 py-3 rounded-2xl flex items-center gap-0 overflow-hidden animate-slide-up"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", position: "relative", zIndex: 2 }}>
          {[
            { label: "Ongoing", value: trueOngoingCount > 0 ? String(trueOngoingCount) : (ongoingList.length > 0 ? String(ongoingList.length) : "…"), color: "#60A5FA" },
            { label: "Genre",   value: String(genres.length || "35+"), color: "#A78BFA" },
            { label: "Update",  value: "Tiap Hari", color: "#34D399" },
          ].map((s, i) => (
            <div key={i} className="flex-1 text-center"
              style={{ borderRight: i < 2 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
              <p className="text-base font-black" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[10px] font-medium" style={{ color: "#475569" }}>{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Owner Badge ── */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <OwnerBadge />
      </div>

      <div className="px-4 space-y-8" style={{ position: "relative", zIndex: 1 }}>

        {/* ── Update Terbaru ── */}
        <section className="animate-slide-up" style={{ animationDelay: "0.05s" }}>
          <SectionHeader
            emoji="🔥" title="Update Terbaru"
            sub={`${trueOngoingCount || ongoingList.length} anime sedang tayang`}
            action="Lihat Semua"
            onAction={() => setLocation("/search?status=ongoing")}
          />
          {loadingOngoing ? (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-shrink-0 w-[108px] rounded-2xl animate-shimmer"
                  style={{ aspectRatio: "2/3", minHeight: "150px" }} />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {(carouselList.length > 0 ? carouselList : ongoingList).map((anime, i) => (
                <div key={anime.animeId} className="flex-shrink-0 w-[108px]"
                  style={{ animation: `slide-up-fade 0.4s ${i * 0.04}s ease both` }}>
                  <AnimeCard anime={anime} variant="poster" />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Top Trending (AniList) ── */}
        <TrendingSection />

        {/* ── Top Rating (dari ongoing lokal) ── */}
        {topAnime.length > 0 && (
          <section className="animate-slide-up" style={{ animationDelay: "0.18s" }}>
            <SectionHeader emoji="⭐" title="Top Rating" sub="Anime terbaik yang sedang tayang" />
            <div className="space-y-2">
              {topAnime.map((anime, i) => {
                const rankColors = ["#FFD700", "#C0C0C0", "#CD7F32", "#60A5FA", "#A78BFA"];
                const rankBg = ["rgba(255,215,0,0.12)", "rgba(192,192,192,0.08)", "rgba(205,127,50,0.08)", "rgba(96,165,250,0.08)", "rgba(167,139,250,0.08)"];
                return (
                  <button key={anime.animeId}
                    onClick={() => setLocation(`/anime/${anime.animeId}`)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-2xl text-left card-press"
                    style={{
                      background: rankBg[i],
                      border: `1px solid ${rankColors[i]}22`,
                      animation: `slide-up-fade 0.4s ${0.18 + i * 0.05}s ease both`,
                    }}>
                    <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-sm"
                      style={{
                        background: `${rankColors[i]}20`, color: rankColors[i],
                        border: `1px solid ${rankColors[i]}40`,
                        animation: i < 3 ? "rank-badge 2s ease-in-out infinite" : "none",
                        animationDelay: `${i * 0.3}s`,
                      }}>
                      #{i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate" style={{ color: "#F1F5F9" }}>{anime.title}</p>
                      <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>
                        {anime.episodes && `Ep ${anime.episodes}`}
                        {anime.episodes && anime.releaseDay && " · "}
                        {anime.releaseDay}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span style={{ color: "#FFD700", fontSize: 12 }}>★</span>
                      <span className="text-sm font-black" style={{ color: "#FFD700" }}>{anime.score}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Baru Selesai ── */}
        {recentCompleted.length > 0 && (
          <section className="animate-slide-up" style={{ animationDelay: "0.20s" }}>
            <SectionHeader
              emoji="✅" title="Baru Selesai"
              sub="Anime yang baru saja tamat"
              action="Lihat Semua"
              onAction={() => setLocation("/search?status=completed")}
            />
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {recentCompleted.slice(0, 15).map((anime, i) => (
                <div key={anime.animeId} className="flex-shrink-0 w-[108px]"
                  style={{ animation: `slide-up-fade 0.4s ${i * 0.04}s ease both` }}>
                  <AnimeCard anime={anime} variant="poster" />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Genre — horizontal scroll, minimalist ── */}
        {genres.length > 0 && (
          <section className="animate-slide-up" style={{ animationDelay: "0.22s" }}>
            <SectionHeader
              emoji="🎭" title="Genre"
              sub="Temukan anime berdasarkan genre favorit"
              action="Semua"
              onAction={() => setLocation("/search?openFilter=1")}
            />

            {/* Horizontal scroll row — no wrapping */}
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {genres.map((g, i) => {
                const [bg, color, border] = GENRE_COLORS[i % GENRE_COLORS.length];
                return (
                  <button
                    key={g.genreId}
                    onClick={() => setLocation(`/search?genre=${g.genreId}`)}
                    className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full text-[11px] font-bold card-press"
                    style={{
                      background: bg,
                      color,
                      border: `1px solid ${border}`,
                      animation: `slide-up-fade 0.35s ${i * 0.018}s ease both`,
                      whiteSpace: "nowrap",
                    }}
                    data-testid={`genre-chip-${g.genreId}`}
                  >
                    <span style={{ fontSize: 13 }}>{GENRE_EMOJI[g.genreId] ?? "🎬"}</span>
                    {g.title}
                  </button>
                );
              })}
            </div>
          </section>
        )}

      </div>

      {/* ── FAB random ── */}
      <button
        onClick={handleRandom}
        className="fixed z-40 card-press"
        style={{
          bottom: 76, right: 16,
          width: 52, height: 52,
          borderRadius: "50%",
          background: "linear-gradient(135deg, #667eea, #764ba2)",
          boxShadow: "0 4px 20px rgba(102,126,234,0.55), 0 0 0 0 rgba(102,126,234,0.4)",
          animation: "pulse-glow-purple 3s ease-in-out infinite",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
        data-testid="btn-random-anime"
        title="Anime Acak 🎲"
      >
        <span className="text-xl" style={{ animation: "float 3s ease-in-out infinite" }}>🎲</span>
      </button>
    </div>
  );
}
