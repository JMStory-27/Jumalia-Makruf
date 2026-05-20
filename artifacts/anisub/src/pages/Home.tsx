import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { fetchOngoing, fetchGenres } from "@/lib/api";
import { fetchAiringAnime, getStreamingLinks, getTitle, PLATFORM_STYLE, type AniListAnime } from "@/lib/anilist";
import AnimeCard from "@/components/AnimeCard";
import HeroCarousel from "@/components/HeroCarousel";
import HomeParticles from "@/components/HomeParticles";
import OwnerBadge from "@/components/OwnerBadge";

const GENRE_EMOJI: Record<string, string> = {
  action: "⚔️", adventure: "🗺️", comedy: "😂", demons: "👹", drama: "🎭",
  ecchi: "🔞", fantasy: "🪄", game: "🎮", harem: "💝", historical: "🏯",
  horror: "👻", josei: "👩", magic: "✨", "martial-arts": "🥋", mecha: "🤖",
  military: "🪖", music: "🎵", mystery: "🔮", psychological: "🧠", parody: "🃏",
  police: "👮", romance: "💕", samurai: "⛩️", school: "🏫", "sci-fi": "🚀",
  seinen: "🧔", shoujo: "🌸", "shoujo-ai": "🌺", shounen: "💥",
  "slice-of-life": "☕", sports: "⚽", space: "🌌", "super-power": "💪",
  supernatural: "🌙", thriller: "😱", vampire: "🧛",
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

/* ── floating sakura / anime symbols ── */
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

function SectionHeader({
  emoji, title, sub, action, onAction,
}: {
  emoji: string; title: string; sub?: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <div
          className="w-1 h-5 rounded-full flex-shrink-0"
          style={{
            background: "linear-gradient(180deg, #60A5FA, #A78BFA)",
            boxShadow: "0 0 8px rgba(96,165,250,0.5)",
          }}
        />
        <div>
          <h2 className="text-base font-black leading-tight" style={{ color: "#F1F5F9" }}>
            {emoji} {title}
          </h2>
          {sub && <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>{sub}</p>}
        </div>
      </div>
      {action && onAction && (
        <button
          onClick={onAction}
          className="text-[11px] font-bold px-3 py-1.5 rounded-full card-press"
          style={{
            background: "rgba(96,165,250,0.08)",
            color: "#60A5FA",
            border: "1px solid rgba(96,165,250,0.2)",
          }}
        >
          {action} →
        </button>
      )}
    </div>
  );
}

function GlobalMiniCard({ anime }: { anime: AniListAnime }) {
  const [, setLocation] = useLocation();
  const streams = getStreamingLinks(anime).slice(0, 1);
  const s0 = streams[0] ? (PLATFORM_STYLE[streams[0].site] ?? null) : null;
  return (
    <button onClick={() => setLocation(`/global/${anime.id}`)}
      className="flex-shrink-0 w-[90px] flex flex-col card-press"
      style={{ animation: "slide-up-fade 0.4s ease both" }}>
      <div className="relative w-full rounded-2xl overflow-hidden" style={{ aspectRatio: "2/3" }}>
        <img src={anime.coverImage.large} alt={getTitle(anime)}
          className="w-full h-full object-cover" loading="lazy" />
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 55%)" }} />
        {s0 && (
          <span className="absolute bottom-1.5 left-1.5 text-[8px] font-black px-1.5 py-0.5 rounded-full"
            style={{ background: s0.bg, color: s0.color }}>
            {s0.emoji}
          </span>
        )}
        {anime.averageScore && (
          <span className="absolute top-1.5 right-1.5 text-[9px] font-black px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(0,0,0,0.65)", color: "#FBBF24" }}>
            ★{(anime.averageScore / 10).toFixed(1)}
          </span>
        )}
      </div>
      <p className="text-[10px] font-bold mt-1.5 leading-tight line-clamp-2 px-0.5" style={{ color: "#94A3B8" }}>
        {getTitle(anime)}
      </p>
    </button>
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

  const { data: ongoingData, isLoading: loadingOngoing, dataUpdatedAt } = useQuery({
    queryKey: ["ongoing"],
    queryFn: () => fetchOngoing(1),
    staleTime: 30 * 60_000,
    refetchInterval: 30 * 60_000,
  });

  const REFRESH_SECS = 30 * 60;
  const [countdown, setCountdown] = useState(REFRESH_SECS);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setCountdown(REFRESH_SECS);
  }, [dataUpdatedAt]);

  useEffect(() => {
    countdownRef.current = setInterval(() => {
      setCountdown((p) => (p <= 1 ? REFRESH_SECS : p - 1));
    }, 1000);
    return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
  }, []);

  const cdMins = Math.floor(countdown / 60).toString().padStart(2, "0");
  const cdSecs = (countdown % 60).toString().padStart(2, "0");

  const { data: genreList } = useQuery({
    queryKey: ["genres-list"],
    queryFn: fetchGenres,
    staleTime: 24 * 60 * 60_000,
  });

  const { data: globalData } = useQuery({
    queryKey: ["global-airing", 1],
    queryFn: () => fetchAiringAnime(1, 12),
    staleTime: 10 * 60_000,
  });

  const ongoingList = ongoingData?.animeList ?? [];
  const genres = genreList?.genreList ?? [];

  const handleRandom = () => {
    if (!ongoingList.length) return;
    const r = ongoingList[Math.floor(Math.random() * ongoingList.length)];
    setLocation(`/anime/${r.animeId}`);
  };

  const topAnime = [...ongoingList]
    .filter((a) => a.score)
    .sort((a, b) => parseFloat(String(b.score ?? 0)) - parseFloat(String(a.score ?? 0)))
    .slice(0, 5);

  return (
    <div className="min-h-screen pb-28 relative" style={{ background: "#05050f" }}>

      {/* ── HOME-ONLY: Micro particle system (stars + sparkles) ── */}
      <HomeParticles />

      {/* ── HOME-ONLY: Floating sakura / emoji ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        {FLOATERS.map((f, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: f.left,
              bottom: "-10%",
              fontSize: 11 + (i % 3) * 3,
              animation: `sakura-rise ${f.dur}s ${f.delay}s ease-in-out infinite`,
              opacity: 0,
              filter: "drop-shadow(0 0 6px rgba(255,255,255,0.4))",
              willChange: "transform, opacity",
              userSelect: "none",
            }}
          >
            {f.glyph}
          </span>
        ))}
      </div>

      {/* ── HOME-ONLY: Horizontal aurora scan line ── */}
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

      {/* ── Ambient background orbs ── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div style={{
          position: "absolute", top: -80, right: -60, width: 320, height: 320,
          background: "radial-gradient(circle, rgba(96,165,250,0.09) 0%, transparent 70%)",
          borderRadius: "50%", animation: "orb-drift 12s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", top: 300, left: -80, width: 260, height: 260,
          background: "radial-gradient(circle, rgba(167,139,250,0.08) 0%, transparent 70%)",
          borderRadius: "50%", animation: "orb-drift 15s ease-in-out infinite 3s",
        }} />
        <div style={{
          position: "absolute", top: 620, right: -60, width: 220, height: 220,
          background: "radial-gradient(circle, rgba(244,114,182,0.07) 0%, transparent 70%)",
          borderRadius: "50%", animation: "orb-drift 10s ease-in-out infinite 6s",
        }} />
        <div style={{
          position: "absolute", top: 950, left: -40, width: 200, height: 200,
          background: "radial-gradient(circle, rgba(52,211,153,0.06) 0%, transparent 70%)",
          borderRadius: "50%", animation: "orb-drift 13s ease-in-out infinite 1s",
        }} />
      </div>

      {/* ── HOME-ONLY keyframes ── */}
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
      `}</style>

      {/* ── Top bar ── */}
      <div
        className="sticky top-0 z-40 px-4 py-3"
        style={{
          background: "rgba(5,5,18,0.92)",
          backdropFilter: "blur(28px)",
          WebkitBackdropFilter: "blur(28px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 4px 32px rgba(0,0,0,0.5)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <span
                className="text-xl font-black tracking-tight animate-gradient-pan"
                style={{
                  background: "linear-gradient(135deg, #60A5FA, #A78BFA, #F472B6, #60A5FA)",
                  backgroundSize: "200% 200%",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}
              >
                🌌 Lawnime
              </span>
              <span
                className="text-[9px] font-black px-1.5 py-0.5 rounded-full"
                style={{
                  background: "rgba(52,211,153,0.15)",
                  color: "#34D399",
                  border: "1px solid rgba(52,211,153,0.25)",
                  animation: "live-dot 2s ease-in-out infinite",
                }}
              >
                LIVE
              </span>
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 900,
                  color: "rgba(96,165,250,0.7)",
                  letterSpacing: "0.01em",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                ⚡{cdMins}:{cdSecs}
              </span>
            </div>
            {greeting && (
              <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>{greeting}</p>
            )}
          </div>
          {/* buttons are rendered by HomeActions overlay in App.tsx */}
          <div style={{ width: 120 }} />
        </div>
      </div>

      {/* ── Hero Carousel ── */}
      <div style={{ position: "relative", zIndex: 1 }}>
        <HeroCarousel items={ongoingList} />
      </div>

      {/* ── Stats strip ── */}
      {!loadingOngoing && ongoingList.length > 0 && (
        <div
          className="mx-4 -mt-3 mb-5 px-4 py-3 rounded-2xl flex items-center gap-0 overflow-hidden animate-slide-up"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
            position: "relative", zIndex: 2,
          }}
        >
          {[
            { label: "Ongoing", value: ongoingData?.maxPage && ongoingData.maxPage > 1 ? (ongoingData.maxPage * 25) + "+" : ongoingList.length + "+", color: "#60A5FA" },
            { label: "Genre",   value: genres.length || "35+",   color: "#A78BFA" },
            { label: "Update",  value: "Tiap Hari",               color: "#34D399" },
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
            sub={`${ongoingList.length} anime sedang tayang`}
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
              {ongoingList.map((anime, i) => (
                <div key={anime.animeId} className="flex-shrink-0 w-[108px]"
                  style={{ animation: `slide-up-fade 0.4s ${i * 0.04}s ease both` }}>
                  <AnimeCard anime={anime} variant="poster" />
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Global Release ── */}
        {(globalData?.list.length ?? 0) > 0 && (
          <section className="animate-slide-up" style={{ animationDelay: "0.08s" }}>
            <SectionHeader
              emoji="🌐" title="Global Release"
              sub="Dari AniList · Crunchyroll · Netflix · YouTube"
              action="Lihat Semua"
              onAction={() => setLocation("/global")}
            />
            <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-hide">
              {globalData!.list.map((anime, i) => (
                <div key={anime.id} style={{ animationDelay: `${i * 0.04}s` }}>
                  <GlobalMiniCard anime={anime} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Top Rating ── */}
        {topAnime.length > 0 && (
          <section className="animate-slide-up" style={{ animationDelay: "0.1s" }}>
            <SectionHeader emoji="⭐" title="Top Rating" sub="Anime terbaik minggu ini" />
            <div className="space-y-2">
              {topAnime.map((anime, i) => {
                const rankColors = ["#FFD700", "#C0C0C0", "#CD7F32", "#60A5FA", "#A78BFA"];
                const rankBg = ["rgba(255,215,0,0.12)", "rgba(192,192,192,0.08)", "rgba(205,127,50,0.08)", "rgba(96,165,250,0.08)", "rgba(167,139,250,0.08)"];
                return (
                  <button
                    key={anime.animeId}
                    onClick={() => setLocation(`/anime/${anime.animeId}`)}
                    className="w-full flex items-center gap-3 p-2.5 rounded-2xl text-left card-press"
                    style={{
                      background: rankBg[i],
                      border: `1px solid ${rankColors[i]}22`,
                      animation: `slide-up-fade 0.4s ${0.1 + i * 0.05}s ease both`,
                    }}
                  >
                    <div
                      className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 font-black text-sm"
                      style={{
                        background: `${rankColors[i]}20`,
                        color: rankColors[i],
                        border: `1px solid ${rankColors[i]}40`,
                        animation: i < 3 ? "rank-badge 2s ease-in-out infinite" : "none",
                        animationDelay: `${i * 0.3}s`,
                      }}
                    >
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

        {/* ── Quick Access ── */}
        <section className="animate-slide-up" style={{ animationDelay: "0.15s" }}>
          <SectionHeader emoji="🚀" title="Akses Cepat" />
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: "📅", label: "Jadwal", sub: "Minggu ini", grad: "linear-gradient(135deg, #667eea, #764ba2)", bg: "linear-gradient(135deg, rgba(102,126,234,0.18), rgba(118,75,162,0.12))", bdr: "rgba(102,126,234,0.25)", path: "/schedule" },
              { icon: "🎭", label: "Kategori", sub: "35+ genre", grad: "linear-gradient(135deg, #F472B6, #FB923C)", bg: "linear-gradient(135deg, rgba(244,114,182,0.14), rgba(251,146,60,0.10))", bdr: "rgba(244,114,182,0.2)", path: "/search" },
              { icon: "📚", label: "Daftar", sub: "Tontonanku", grad: "linear-gradient(135deg, #34D399, #22D3EE)", bg: "linear-gradient(135deg, rgba(52,211,153,0.12), rgba(34,211,238,0.08))", bdr: "rgba(52,211,153,0.2)", path: "/watchlist" },
              { icon: "🕐", label: "Riwayat", sub: "Terakhir ditonton", grad: "linear-gradient(135deg, #FBBF24, #FB923C)", bg: "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(251,146,60,0.08))", bdr: "rgba(251,191,36,0.2)", path: "/history" },
            ].map((c) => (
              <button key={c.path} onClick={() => setLocation(c.path)}
                className="flex flex-col items-start gap-2 p-4 rounded-2xl text-left card-press overflow-hidden relative"
                style={{ background: c.bg, border: `1px solid ${c.bdr}` }}>
                <div className="absolute -right-4 -top-4 w-20 h-20 rounded-full"
                  style={{ background: `radial-gradient(circle, ${c.bdr.replace("0.2", "0.15")} 0%, transparent 70%)` }} />
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: c.grad, boxShadow: `0 4px 12px ${c.bdr.replace("0.2", "0.4")}` }}>
                  <span className="text-xl">{c.icon}</span>
                </div>
                <div>
                  <p className="text-sm font-black text-white">{c.label}</p>
                  <p className="text-[10px]" style={{ color: "#94A3B8" }}>{c.sub}</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Genre ── */}
        {genres.length > 0 && (
          <section className="animate-slide-up pb-2" style={{ animationDelay: "0.2s" }}>
            <SectionHeader emoji="🎭" title="Genre" sub="Temukan berdasarkan genre favoritmu" />
            <div className="flex flex-wrap gap-2">
              {genres.slice(0, 18).map((g, i) => {
                const [bg, color, border] = GENRE_COLORS[i % GENRE_COLORS.length];
                return (
                  <button
                    key={g.genreId}
                    onClick={() => setLocation(`/search?genre=${g.genreId}`)}
                    className="px-3 py-1.5 rounded-full text-xs font-bold card-press"
                    style={{ background: bg, color, border: `1px solid ${border}`, animation: `scale-in 0.3s ${i * 0.02}s ease both` }}
                    data-testid={`genre-chip-${g.genreId}`}
                  >
                    {GENRE_EMOJI[g.genreId] ?? "🎬"} {g.title}
                  </button>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* ── FAB ── */}
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
