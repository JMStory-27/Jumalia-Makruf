'use client';
import { useState, useEffect, useMemo, useRef } from "react";
import { useLocation, Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchSeasonLineup, getUpcomingSeasons, formatCountdown,
  formatIndonesianDate,
  classifyAiring, STATUS_RANK, type AiringStatus,
  type SeasonKey, type UpcomingAnime,
  type SeasonFetchResult,
} from "@/lib/malSeason";
import { proxyImg, titlePlaceholder } from "@/lib/utils";
import { hashId, VARIANTS, CornerAccents, injectBorderStyles } from "@/lib/cardBorders";

const SEASON_META: Record<SeasonKey["season"], { emoji: string; label: string; jpeg: string; accent: string }> = {
  WINTER: { emoji: "❄️", label: "Winter", jpeg: "Januari – Maret",    accent: "#7DD3FC" },
  SPRING: { emoji: "🌸", label: "Spring", jpeg: "April – Juni",       accent: "#F472B6" },
  SUMMER: { emoji: "☀️", label: "Summer", jpeg: "Juli – September",   accent: "#FBBF24" },
  FALL:   { emoji: "🍂", label: "Fall",   jpeg: "Oktober – Desember", accent: "#FB923C" },
};

const SEASON_GLOW: Record<SeasonKey["season"], string> = {
  WINTER: "rgba(125,211,252,0.35)",
  SPRING: "rgba(244,114,182,0.35)",
  SUMMER: "rgba(251,191,36,0.35)",
  FALL:   "rgba(251,146,60,0.35)",
};

function useTick(intervalMs = 1000) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

/** Tilt handlers — sama persis dengan AnimeCard home. */
function useTiltHandlers() {
  return {
    onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(600px) rotateX(${(-y * 14).toFixed(1)}deg) rotateY(${(x * 14).toFixed(1)}deg) scale(1.04)`;
    },
    onMouseLeave: (e: React.MouseEvent<HTMLDivElement>) => {
      e.currentTarget.style.transform = "perspective(600px) rotateX(0deg) rotateY(0deg) scale(1)";
    },
    onTouchMove: (e: React.TouchEvent<HTMLDivElement>) => {
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      const t = e.touches[0];
      const x = (t.clientX - r.left) / r.width - 0.5;
      const y = (t.clientY - r.top) / r.height - 0.5;
      el.style.transform = `perspective(600px) rotateX(${(-y * 10).toFixed(1)}deg) rotateY(${(x * 10).toFixed(1)}deg) scale(1.03)`;
    },
    onTouchEnd: (e: React.TouchEvent<HTMLDivElement>) => {
      e.currentTarget.style.transform = "perspective(600px) rotateX(0deg) rotateY(0deg) scale(1)";
    },
  };
}

/** Smart poster dengan placeholder gradient + initials fallback + double glass sheen. */
function SeasonPoster({ anime }: { anime: UpcomingAnime }) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const titleRomaji = anime.title?.romaji || anime.title?.english || "??";
  const [grad, initials] = titlePlaceholder(titleRomaji);
  const posterUrl = anime.coverImage?.extraLarge || anime.coverImage?.large || "";

  return (
    <div className="relative overflow-hidden rounded-xl"
         style={{ aspectRatio: "2/3", minHeight: 120, background: grad }}>
      {!errored && posterUrl ? (
        <img
          src={proxyImg(posterUrl, 260)}
          alt={titleRomaji}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.4s ease" }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span style={{ fontSize: "clamp(14px,3vw,24px)", fontWeight: 900, color: "rgba(255,255,255,0.3)", letterSpacing: "0.05em" }}>
            {initials}
          </span>
        </div>
      )}
      {/* Deep gradient — make title readable */}
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: "linear-gradient(to top, rgba(7,7,14,0.95) 0%, transparent 50%)" }} />
      {/* Glass sheen */}
      <div className="absolute inset-0 pointer-events-none"
           style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 45%)" }} />
    </div>
  );
}

/** MouseSparkleTrail — tiap gerakaan cursor (throttle ~16ms) ngeluarin
 *  mini-particle radial gradient yang fade-out dalam 0.9s. Bikin efek
 *  shimmer trail khas anime. Cleanup listener di unmount. */
function MouseSparkleTrail() {
  useEffect(() => {
    const palette = ["#7DD3FC", "#F472B6", "#FBBF24", "#A78BFA", "#34D399", "#FF8C42"];
    let last = 0;
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - last < 16) return;
      last = now;
      raf = requestAnimationFrame(() => {
        const c = palette[Math.floor(Math.random() * palette.length)];
        const s = document.createElement("span");
        s.className = "mouse-sparkle-life";
        const size = 6 + Math.random() * 5;
        s.style.cssText = `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle,#fff 0%,${c} 50%,transparent 100%);pointer-events:none;z-index:99999;box-shadow:0 0 10px ${c};`;
        document.body.appendChild(s);
        setTimeout(() => s.remove(), 950);
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}

/** burstAt — 14 sparkles terbang radial dari titik (cx,cy) lalu fade out.
 *  Dipakai oleh SeasonTabBar saat pill di-click. */
function burstAt(cx: number, cy: number, accent: string) {
  const palette = ["#7DD3FC", "#F472B6", "#FBBF24", "#A78BFA", "#34D399", accent];
  const N = 14;
  for (let i = 0; i < N; i++) {
    const angle = (i / N) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
    const dist = 70 + Math.random() * 55;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 25;
    const p = document.createElement("span");
    p.className = "tab-confetti-life";
    const c = palette[i % palette.length];
    const size = 5 + Math.random() * 4;
    p.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:${size}px;height:${size}px;border-radius:50%;background:${c};pointer-events:none;z-index:99998;box-shadow:0 0 9px ${c};--dx:${dx}px;--dy:${dy}px;`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 1000);
  }
}

/** Aurora-mesh + drifting petals background — bikin halaman Musim berasa cosmic,
 *  beda dari kompetitor. Layer mesh + 24 emoji petal float ke atas dengan
 *  hue-rotate per glyph supaya variatif. */
function CosmicBackground() {
  const glyphs = ["🌸", "✨", "🍂", "❄️", "🌿", "💫", "🌺"];
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true" style={{ zIndex: 0 }}>
      <div className="absolute inset-0" style={{
        background: `
          radial-gradient(ellipse 700px 500px at 18% 28%, rgba(125,211,252,0.20), transparent 60%),
          radial-gradient(ellipse 600px 400px at 78% 18%, rgba(244,114,182,0.14), transparent 60%),
          radial-gradient(ellipse 800px 500px at 50% 88%, rgba(251,191,36,0.16), transparent 60%),
          radial-gradient(ellipse 500px 350px at 8% 78%, rgba(167,139,250,0.12), transparent 60%),
          radial-gradient(ellipse 400px 300px at 90% 65%, rgba(52,211,153,0.10), transparent 60%)
        `,
        backgroundSize: "180% 180%",
        filter: "blur(28px)",
        animation: "cosmic-aurora 24s ease-in-out infinite alternate"
      }} />
      {Array.from({length: 24}).map((_, i) => {
        const glyph = glyphs[i % glyphs.length];
        const startX = (i * 7.3) % 100;
        const dur = 11 + (i % 4) * 2.5;
        const delay = (i % 7) * 1.1;
        const size = 12 + (i % 3) * 5;
        return (
          <span key={i} aria-hidden
            className="absolute"
            style={{
              left: `${startX}%`,
              bottom: -40,
              fontSize: size,
              opacity: 0,
              animation: `petal-float-up ${dur}s linear ${delay}s infinite`,
              filter: `drop-shadow(0 0 8px rgba(255,255,255,0.4)) hue-rotate(${i * 30}deg)`,
            }}>{glyph}</span>
        );
      })}
    </div>
  );
}

/** Hook: kartu reveal-on-scroll via IntersectionObserver.
 *  Return ref + boolean visible. Saat first visible → animasi jalan sekali. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, visible } as const;
}

/** Status seal — top-right poster seal dengan varian per status tayang.
 *  Visual konsisten (shimmer-gold ribbon) tapi tiap status beda warna/teks.
 *  Dipakai untuk menunjukkan UPCOMING / SEDANG_TAYANG / SUDAH_RILIS /
 *  SUDAH_TAMAT / TBA dalam satu kartu. */
const STATUS_SEAL: Record<AiringStatus, {
  label: string; icon: string; from: string; mid: string; to: string;
  text: string; glow: string; border: string;
}> = {
  UPCOMING:      { label: "COMING",      icon: "⏳", from: "#1E3A8A", mid: "#60A5FA", to: "#7DD3FC", text: "#fff",      glow: "rgba(96,165,250,0.5)",   border: "rgba(125,211,252,0.4)" },
  SEDANG_TAYANG: { label: "ON AIR",      icon: "🔴", from: "#065F46", mid: "#10B981", to: "#34D399", text: "#fff",      glow: "rgba(52,211,153,0.55)",  border: "rgba(52,211,153,0.4)"  },
  SUDAH_RILIS:   { label: "SUDAH RILIS", icon: "✅", from: "#92400E", mid: "#F59E0B", to: "#FBBF24", text: "#fff",      glow: "rgba(251,191,36,0.55)",  border: "rgba(251,191,36,0.4)"  },
  SUDAH_TAMAT:   { label: "TAMAT",       icon: "🏁", from: "#581C87", mid: "#8B5CF6", to: "#A78BFA", text: "#fff",      glow: "rgba(167,139,250,0.5)",  border: "rgba(167,139,250,0.4)" },
  TBA:           { label: "SEGERA",      icon: "📅", from: "#1F2937", mid: "#475569", to: "#64748B", text: "#D1D5DB", glow: "rgba(148,163,184,0.25)", border: "rgba(148,163,184,0.3)" },
};

function ComingSoonSeal({ status }: { status: AiringStatus }) {
  const v = STATUS_SEAL[status];
  return (
    <div className="absolute top-2 right-2 z-10"
         style={{ animation: "tamat-seal-glow 2.4s ease-in-out infinite" }}>
      <div className="flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-l-full"
           style={{
             background: `linear-gradient(135deg, ${v.from} 0%, ${v.mid} 30%, ${v.to} 50%, ${v.from} 70%, ${v.from})`,
             backgroundSize: "200% 200%",
             animation: "shimmer-gold 2.8s linear infinite",
             color: v.text,
             boxShadow: `0 2px 10px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.4), 0 0 8px ${v.glow}`,
             border: `1px solid ${v.border}`,
           }}>
        <span style={{ fontSize: 11 }}>{v.icon}</span>
        <span style={{ fontSize: 9, fontWeight: 900, letterSpacing: "0.04em", textShadow: "0 0 4px rgba(0,0,0,0.5)" }}>
          {v.label}
        </span>
      </div>
    </div>
  );
}

/** Countdown akurat ke detik (update tiap detik) — dengan shine animation. */
function CountdownBadge({ airingAt }: { airingAt: number | null }) {
  useTick(1000);
  if (!airingAt) return null;
  const remaining = Math.max(0, airingAt - Math.floor(Date.now() / 1000));
  const label = formatCountdown(remaining);

  return (
    <div className="inline-flex items-center gap-1.5"
         style={{
           padding: "4px 8px",
           borderRadius: 9999,
           background: "linear-gradient(135deg, rgba(15,23,42,0.92), rgba(30,58,95,0.7))",
           border: "1px solid rgba(96,165,250,0.45)",
           backdropFilter: "blur(8px)",
           animation: "countdown-glow 2.4s ease-in-out infinite",
           maxWidth: "100%",
         }}>
      <span style={{ animation: "countdown-blink 1.6s steps(1) infinite", fontSize: 11 }}>⏳</span>
      <span className="text-[10px] font-black tabular-nums truncate"
            style={{ color: "#7DD3FC", letterSpacing: "0.02em" }}>
        {label}
      </span>
    </div>
  );
}

/** Kartu anime musim — DESIGN LANGUAGE SAMA DENGAN HOME PAGE CARD:
 *  lux-wrap border + corner accents + tilt + bottom-left info pill + top-right seal. */
function SeasonAnimeCard({ anime, accent }: { anime: UpcomingAnime; accent: string }) {
  const [, setLocation] = useLocation();
  const vi = hashId(anime.id);
  const tiltHandlers = useTiltHandlers();
  // MAL/JIKAN ngasih 'aired.from' sebagai release EP 1. Untuk halaman Musim
  // (lineup upcoming) selalu EP 1 — tidak ada jadwal per-episode.
  const airingAt = anime.airingAt ?? null;
  const releaseEpisode = airingAt !== null ? 1 : null;
  const title = anime.title.english || anime.title.romaji;
  const releaseDate = airingAt ? formatIndonesianDate({ unix: airingAt }) : null;
  const genres = (anime.genres ?? []).slice(0, 2);
  // Status pemberian: dipakai buat variant badge UPCOMING/SEDANG/SUDAH_RILIS/TAMAT/TBA
  // dan untuk jenis subtitle di bawah kartu.
  const airingClassification = classifyAiring(airingAt, anime.status);
  // Reveal-on-scroll hook — kartu fade in + scale up saat masuk viewport.
  const { ref: cardRef, visible: cardVisible } = useReveal<HTMLDivElement>();

  return (
    <div
      ref={cardRef}
      className={`relative reveal-on-scroll ${cardVisible ? "is-visible" : ""}`}
      style={{ perspective: 600, willChange: "transform, opacity" }}
    >
    <div
      className="lux-shine flex-shrink-0 cursor-pointer"
      data-testid={`season-card-${anime.id}`}
      style={{ transition: "transform 0.15s ease", willChange: "transform" }}
      {...tiltHandlers}
      onClick={() => setLocation(`/upcoming/${anime.id}`)}
    >
      <div className={`lux-wrap lux-v${vi}`} style={{ position: "relative" }}>
        <CornerAccents color={VARIANTS[vi].glow} variant={vi} />
        <div className="relative overflow-hidden rounded-xl"
             style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.6)", background: "#050510" }}>
          <SeasonPoster anime={anime} />

          {/* Bottom-left: EP + (score · year) — sama persis dengan home card */}
          <div className="absolute bottom-2 left-2 flex flex-col gap-[3px] z-10">
            {releaseEpisode != null && (
              <span className="text-[10px] font-bold px-1.5 py-[2px] rounded-full w-fit"
                    style={{
                      background: "rgba(255,107,0,0.85)",
                      backdropFilter: "blur(8px)",
                      color: "#fff",
                      boxShadow: "0 0 8px rgba(255,107,0,0.4)",
                    }}>
                EP {releaseEpisode}
              </span>
            )}
            {(anime.seasonYear != null || anime.averageScore != null) && (
              <span className="text-[9px] font-medium px-1.5 py-[2px] rounded-full w-fit whitespace-nowrap"
                    style={{
                      background: "rgba(0,0,0,0.60)",
                      backdropFilter: "blur(4px)",
                      color: "rgba(255,255,255,0.88)",
                      lineHeight: 1.2,
                    }}>
                {anime.averageScore != null && `🌟${(anime.averageScore / 10).toFixed(1)}`}
                {anime.averageScore != null && anime.seasonYear != null && " · "}
                {anime.seasonYear != null && `🗓 ${anime.seasonYear}`}
              </span>
            )}
          </div>

          {/* Top-right: Status seal — analog posisi TAMAT seal di home,
              tapi variantnya berdasarkan airingClassification (UPCOMING/SEDANG_TAYANG/...) */}
          <ComingSoonSeal status={airingClassification} />
        </div>
      </div>

      {/* Title */}
      <p className="mt-1.5 text-xs font-semibold text-white line-clamp-2 leading-tight px-0.5">
        {title}
      </p>

      {/* Genre chips — subtle */}
      {genres.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 px-0.5">
          {genres.map((g) => (
            <span key={g} className="text-[9px] font-semibold px-1.5 py-[2px] rounded-full"
                  style={{
                    background: `${accent}1a`,
                    color: accent,
                    border: `1px solid ${accent}33`,
                    boxShadow: `0 0 6px ${accent}22`,
                  }}>
              {g}
            </span>
          ))}
        </div>
      )}

      {/* Countdown + release info — beda konten per status, TAPI selalu
          muncul supaya user lihat apakah COMING / ON AIR / RILIS / TAMAT / TBA. */}
      <div className="mt-1.5 flex flex-col gap-0.5 px-0.5">
        {airingClassification === "UPCOMING" && airingAt && (
          <>
            <CountdownBadge airingAt={airingAt} />
            {releaseDate && (
              <span className="text-[9px] font-medium truncate" style={{ color: "rgba(255,255,255,0.55)" }}>
                📅 {releaseDate}
              </span>
            )}
          </>
        )}
        {airingClassification === "SEDANG_TAYANG" && (
          <>
            <span className="text-[10px] font-black px-2 py-1 rounded-full w-fit"
                  style={{ background: "rgba(52,211,153,0.18)", color: "#34D399",
                           border: "1px solid rgba(52,211,153,0.35)" }}>
              🟢 ON AIR — episode pertama tayang
            </span>
            {releaseDate && (
              <span className="text-[9px] font-medium truncate" style={{ color: "rgba(255,255,255,0.55)" }}>
                📅 sejak {releaseDate}
              </span>
            )}
          </>
        )}
        {airingClassification === "SUDAH_RILIS" && releaseDate && (
          <span className="text-[10px] font-black px-2 py-1 rounded-full w-fit"
                style={{ background: "rgba(251,191,36,0.18)", color: "#FBBF24",
                         border: "1px solid rgba(251,191,36,0.35)" }}>
            📅 Tayang {releaseDate}
          </span>
        )}
        {airingClassification === "SUDAH_TAMAT" && (
          <span className="text-[10px] font-black px-2 py-1 rounded-full w-fit"
                style={{ background: "rgba(167,139,250,0.18)", color: "#A78BFA",
                         border: "1px solid rgba(167,139,250,0.35)" }}>
            🏁 Sudah tamat
          </span>
        )}
        {airingClassification === "TBA" && (
          <span className="text-[10px] font-black px-2 py-1 rounded-full w-fit"
                style={{ background: "rgba(148,163,184,0.16)", color: "#94A3B8",
                         border: "1px solid rgba(148,163,184,0.35)" }}>
            📅 Tanggal rilis belum diumumkan
          </span>
        )}
      </div>
    </div>
    </div>
  );
}

/** Section header sticky dengan shimmer-gold year badge.
 *  Kalau lineup waktu itu pakai backup AniList (saat MAL/JIKAN lagi down),
 *  muncul badge kecil "via AniList" supaya user paham kenapa data tiba-tiba ada. */
function SeasonSectionHeader({ sk, accent, count, isFirst, source }: { sk: SeasonKey; accent: string; count: number; isFirst?: boolean; source?: "MAL" | "AniList" | "none" }) {
  const meta = SEASON_META[sk.season];
  const showBackupBadge = source && source !== "MAL" && source !== "none";
  return (
    <div className="flex items-center gap-3 mb-3 sticky z-20 py-3 px-4 -mx-4 mt-1"
         style={{
           top: isFirst ? 0 : 56,
           background: "linear-gradient(to bottom, rgba(5,5,16,0.96), rgba(5,5,16,0.85))",
           backdropFilter: "blur(20px)",
           borderBottom: `1px solid ${accent}22`,
         }}>
      <div className="text-2xl" style={{ filter: `drop-shadow(0 0 8px ${accent}aa)` }}>
        {meta.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="holo-title text-lg font-black truncate"
            style={{ letterSpacing: "-0.01em" }}>
          {meta.label} {sk.year}
        </h2>
        <div className="flex items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: accent }}>
            {meta.jpeg} • {count} judul lineup
          </p>
          {showBackupBadge && (
            <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider"
                  title="MAL/JIKAN sedang tidak tersedia — lineup dari AniList sebagai backup"
                  style={{
                    background: "rgba(251,191,36,0.15)",
                    color: "rgba(251,191,36,0.9)",
                    border: "1px solid rgba(251,191,36,0.35)",
                    letterSpacing: "0.06em",
                  }}>
              via AniList
            </span>
          )}
        </div>
      </div>
      <span className="text-[10px] font-black px-2.5 py-1 rounded-full flex-shrink-0"
            style={{
              background: `linear-gradient(135deg, ${accent}33, ${accent}1a)`,
              backgroundSize: "200% 200%",
              animation: "shimmer-gold 3s linear infinite",
              color: accent,
              border: `1px solid ${accent}55`,
              boxShadow: `0 0 14px ${SEASON_GLOW[sk.season]}`,
            }}>
        {sk.year}
      </span>
    </div>
  );
}

/** Section satu musim. */
function SeasonBlock({ sk, accent, isFirst, searchFilter }: { sk: SeasonKey; accent: string; isFirst: boolean; searchFilter: string }) {
  const { data: result, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["season-lineup", sk.season, sk.year],
    queryFn: () => fetchSeasonLineup(sk),
    staleTime: 60 * 60_000,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 4000),
  });

  const sorted = useMemo(() => {
    if (!result) return [];
    // Dedup by MAL id SATU lagi sebagai safety net kalau server lupa dedup.
    const seen = new Set<number>();
    const unique = result.data.filter((a) => {
      if (!a.id || seen.has(a.id)) return false;
      seen.add(a.id);
      return true;
    });
    const nowMs = Date.now();
    // Filter by search query — match title.english ATAU title.romaji, case-insensitive.
    // Kalau user lagi search kosong, gak filter (tetep semua anime).
    const q = searchFilter.trim().toLowerCase();
    const filtered = q
      ? unique.filter((a) => {
          const t = (a.title?.english || a.title?.romaji || "").toLowerCase();
          return t.includes(q);
        })
      : unique;
    // Sort: UPCOMING (countdown) di paling atas, SEDANG_TAYANG di bawah,
    // SUDAH_RILIS / TBA / SUDAH_TAMAT di bawah lagi. Dalam 1 rank, urutkan
    // by tanggal paling dekat + popularity untuk tiebreak.
    return filtered.sort((a, b) => {
      const ca = STATUS_RANK[classifyAiring(a.airingAt, a.status, nowMs)];
      const cb = STATUS_RANK[classifyAiring(b.airingAt, b.status, nowMs)];
      if (ca !== cb) return ca - cb;
      const aA = a.airingAt ?? Number.MAX_SAFE_INTEGER;
      const bA = b.airingAt ?? Number.MAX_SAFE_INTEGER;
      if (aA !== bA) return aA - bA;
      return (b.popularity ?? 0) - (a.popularity ?? 0);
    });
  }, [result, searchFilter]);

  return (
    <section className="mb-8" data-testid={`season-section-${sk.season}-${sk.year}`}>
      <SeasonSectionHeader sk={sk} accent={accent} count={sorted.length} isFirst={isFirst} source={result?.source} />

      {isLoading && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 px-1">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="lux-wrap" style={{ animation: "pulse 1.5s ease-in-out infinite", opacity: 0.5 }}>
              <div className="rounded-xl"
                   style={{ aspectRatio: "2/3", background: "linear-gradient(135deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))", minHeight: 160 }} />
            </div>
          ))}
        </div>
      )}
      {!isLoading && sorted.length === 0 && (
        result?.error ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-xs" style={{ color: "rgba(251,191,36,0.85)" }}>
              Lineup MAL sedang dimuat ulang untuk {SEASON_META[sk.season].label} {sk.year}.
            </p>
            <button type="button" onClick={() => refetch()} disabled={isFetching}
              className="px-4 py-2 rounded-full text-xs font-black"
              style={{ color: accent, border: `1px solid ${accent}88`, background: `${accent}18` }}>
              {isFetching ? "Mencoba lagi…" : "Coba lagi"}
            </button>
          </div>
        ) : (
          <div className="text-center py-6 space-y-1">
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.55)" }}>
              Sepertinya semua lineup {SEASON_META[sk.season].label} {sk.year} sudah mulai tayang.
            </p>
            <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
              Lihat tab <span style={{ color: "rgba(125,211,252,0.85)" }}>Jadwal</span> untuk episode terbaru 📺
            </p>
          </div>
        )
      )}
      {sorted.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 px-1">
          {sorted.map((a) => (
            <SeasonAnimeCard key={a.id} anime={a} accent={accent} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Search bar musim — cuma untuk halaman Musim, gak share dengan Search page global.
 *  Filter anime di tab aktif by `title.english || title.romaji` substring
 *  case-insensitive. Tiap ketik → SeasonBlock useMemo re-filter instan
 *  (gak trigger fetch baru). Tombol × buat clear. Emoji 🔍 di kiri. */
function SeasonSearch({ query, onChange }: { query: string; onChange: (v: string) => void }) {
  return (
    <div className="mb-3 px-1">
      <div className="relative flex items-center" data-testid="season-search-wrap">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base pointer-events-none select-none"
              style={{ filter: "drop-shadow(0 0 7px rgba(125,211,252,0.55))" }}>
          🔍
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Cari anime di musim ini…"
          data-testid="season-search-input"
          className="w-full pl-9 pr-9 py-2.5 rounded-xl text-[13px] font-semibold outline-none"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "#F8FAFC",
            letterSpacing: "0.005em",
            transition: "all 0.18s ease",
          }}
          onFocus={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.10)";
            e.currentTarget.style.borderColor = "rgba(125,211,252,0.55)";
            e.currentTarget.style.boxShadow = "0 0 14px rgba(125,211,252,0.18)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.background = "rgba(255,255,255,0.06)";
            e.currentTarget.style.borderColor = "rgba(255,255,255,0.10)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            data-testid="season-search-clear"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full font-bold"
            style={{
              background: "rgba(255,255,255,0.10)",
              color: "#F8FAFC",
              lineHeight: 1,
              border: "1px solid rgba(255,255,255,0.18)",
              transition: "all 0.15s ease",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(244,114,182,0.30)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.10)"; }}
          >×</button>
        )}
      </div>
    </div>
  );
}

/** Tab bar musim — sama persis pattern dengan Top Trending Home: pill
 *  horizontal yang bisa di-scroll horizontal. Tiap tab = emoji + label
 *  + year. Active tab pakai gradient sesuai accent musim. Tiap tab nampilin
 *  hitungan kecil dari cache query supaya kelihatan lineup lagi loading
 *  atau sudah final. */
function SeasonTabBar({
  activeIdx, onChange, seasons,
}: {
  activeIdx: number;
  onChange: (i: number) => void;
  seasons: SeasonKey[];
}) {
  return (
    <div className="flex gap-2 mb-3 overflow-x-auto scrollbar-hide pb-1.5 -mx-1 px-1">
      {seasons.map((sk, i) => {
        const meta = SEASON_META[sk.season];
        const accent = meta.accent;
        const active = activeIdx === i;
        // Subscribe ke query supaya count auto-update saat data datang.
        // Query-key identik dengan SeasonBlock yang di bawah — React Query
        // dedupe dan share cache entry yang sama persis.
        const { data } = useQuery<SeasonFetchResult>({
          queryKey: ["season-lineup", sk.season, sk.year],
          queryFn: () => fetchSeasonLineup(sk),
          staleTime: 60 * 60_000,
        });
        const count = (data?.data ?? []).length;
        return (
          <button
            key={`${sk.season}-${sk.year}`}
            onClick={(e) => {
              onChange(i);
              const rect = e.currentTarget.getBoundingClientRect();
              burstAt(rect.left + rect.width / 2, rect.top + rect.height / 2, active ? "#7DD3FC" : "#F472B6");
            }}
            className={`season-tab-pill flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full card-press ${active ? "is-active" : ""}`}
            data-testid={`season-tab-${sk.season}-${sk.year}`}
            style={{
              background: active
                ? `linear-gradient(135deg, ${accent}33, ${accent}1a)`
                : "rgba(255,255,255,0.04)",
              color: active ? "#F8FAFC" : "#94A3B8",
              border: active
                ? `1px solid ${accent}55`
                : "1px solid rgba(255,255,255,0.07)",
              transition: "all 0.18s ease",
              boxShadow: active ? `0 0 14px ${SEASON_GLOW[sk.season]}` : "none",
              fontWeight: 800,
              fontSize: 11,
              letterSpacing: "0.01em",
            }}
          >
            <span style={{
              filter: active ? `drop-shadow(0 0 6px ${accent}77)` : "none",
              whiteSpace: "nowrap",
            }}>
              {meta.emoji} {meta.label} {sk.year}
            </span>
            <span
              className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[9px] font-black tabular-nums"
              style={{
                background: active ? `${accent}22` : "rgba(255,255,255,0.06)",
                color: active ? accent : "#64748B",
                minWidth: 18,
                border: active ? `1px solid ${accent}33` : "none",
              }}>
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Halaman utama "Musim" — pakai shared border system + visual vocabulary yang sama dengan Home. */
export default function Seasons() {
  useEffect(() => { injectBorderStyles(); }, []);
  useTick(60000);
  const queryClient = useQueryClient();
  const seasons = useMemo(() => getUpcomingSeasons(), []);
  const [now, setNow] = useState(() => new Date());
  const [activeIdx, setActiveIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const activeSk = seasons[activeIdx]!;
  const activeAccent = SEASON_META[activeSk.season].accent;

  // Prefetch keempat musim sekaligus di mount supaya perpindahan
  // tab cuma membaca cache (instan) tanpa spinner di tiap klik.
  useEffect(() => {
    seasons.forEach((sk) => {
      void queryClient.prefetchQuery({
        queryKey: ["season-lineup", sk.season, sk.year],
        queryFn: () => fetchSeasonLineup(sk),
        staleTime: 60 * 60_000,
      });
    });
  }, [queryClient, seasons]);

  return (
    <div className="min-h-screen pb-28 px-3 pt-4 relative" style={{ background: "#05050f" }}>
      <style>{`
        @keyframes cosmic-aurora {
          0%   { background-position: 0% 0%, 100% 0%, 50% 100%, 0% 100%, 80% 80%; transform: scale(1) rotate(0deg); }
          50%  { background-position: 60% 50%, 30% 60%, 70% 30%, 30% 40%, 20% 30%; transform: scale(1.08) rotate(2deg); }
          100% { background-position: 100% 100%, 0% 100%, 100% 0%, 80% 0%, 0% 0%; transform: scale(1) rotate(-2deg); }
        }
        @keyframes petal-float-up {
          0%   { transform: translate3d(0, 0, 0) rotate(0deg); opacity: 0; }
          3%   { opacity: 0.65; }
          50%  { transform: translate3d(70px, -50vh, 0) rotate(170deg); }
          98%  { opacity: 0.4; }
          100% { transform: translate3d(-30px, -110vh, 0) rotate(360deg); opacity: 0; }
        }
        @keyframes reveal-up {
          0%   { opacity: 0; transform: translateY(28px) scale(0.96); filter: blur(4px); }
          100% { opacity: 1; transform: translateY(0)     scale(1);    filter: blur(0); }
        }
        .reveal-on-scroll { opacity: 0; transform: translateY(28px) scale(0.96); filter: blur(4px); }
        .reveal-on-scroll.is-visible {
          animation: reveal-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        /* Shine-sweep — overlay gradient diagonal yang sweep saat hover */
        .lux-shine { position: relative; overflow: hidden; }
        .lux-shine::before {
          content: ""; position: absolute; inset: 0; pointer-events: none;
          background: linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.45) 50%, transparent 70%);
          background-size: 250% 250%;
          opacity: 0;
          transition: opacity 0.35s ease;
          border-radius: inherit;
          z-index: 5;
          mix-blend-mode: screen;
        }
        .lux-shine:hover::before {
          opacity: 1;
          animation: shine-sweep 1.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes shine-sweep {
          0%   { background-position: 250% 0; }
          100% { background-position: -150% 0; }
        }
        /* Mouse-trail sparkle lifecycle */
        @keyframes sparkle-life {
          0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0; }
          20%  { transform: translate(-50%, -50%) scale(1);   opacity: 1; }
          100% { transform: translate(-50%, -50%) scale(0.15); opacity: 0; }
        }
        .mouse-sparkle-life {
          animation: sparkle-life 0.9s ease-out forwards;
          transform: translate(-50%, -50%);
        }
        /* Tab-confetti fly-out */
        @keyframes tab-confetti-fly {
          0%   { transform: translate(-50%, -50%) scale(1);                                              opacity: 1; }
          60%  { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.8);         opacity: 0.7; }
          100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.2);         opacity: 0; }
        }
        .tab-confetti-life {
          animation: tab-confetti-fly 0.95s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          transform: translate(-50%, -50%);
        }
        /* Holo-rainbow title — gradient horizontal yang loop, anime aesthetic */
        @keyframes holo-shift {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 150% 50%; }
          100% { background-position: 200% 50%; }
        }
        .holo-title {
          background: linear-gradient(110deg, #7DD3FC 0%, #F472B6 25%, #FBBF24 50%, #A78BFA 75%, #7DD3FC 100%);
          background-size: 200% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          -webkit-text-fill-color: transparent;
          animation: holo-shift 4.5s linear infinite;
          filter: drop-shadow(0 0 14px rgba(244,114,182,0.35));
          display: inline-block;
        }
        .season-tab-pill::after {
          content: ""; position: absolute; left: 16%; right: 16%; bottom: -3px;
          height: 3px; border-radius: 999px; background: currentColor;
          opacity: 0; transform: scaleX(0.4);
          transition: opacity 0.3s ease, transform 0.5s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 0 12px currentColor;
        }
        .season-tab-pill.is-active::after {
          opacity: 1; transform: scaleX(1);
          animation: tab-underline-pulse 1.8s ease-in-out infinite;
        }
        @keyframes tab-underline-pulse {
          0%, 100% { transform: scaleX(1);    opacity: 0.85; }
          50%      { transform: scaleX(1.18); opacity: 1;    }
        }
        /* ── Per-season animated hero motif (snow / sakura / sun / leafs) ── */
        @keyframes season-snow-fall {
          0%   { transform: translateY(-3vh) translateX(0)       rotate(0deg);   opacity: 0;   }
          10%  { opacity: 0.95; }
          90%  { opacity: 0.7; }
          100% { transform: translateY(112vh) translateX(46px)  rotate(360deg); opacity: 0;   }
        }
        .season-particle-snow {
          animation-name: season-snow-fall;
          animation-iteration-count: infinite;
          animation-timing-function: linear;
          color: rgba(255,255,255,0.95);
          text-shadow: 0 0 6px rgba(186,230,253,0.85);
        }

        @keyframes season-sakura-sway {
          0%   { transform: translateY(-3vh) translateX(0)       rotate(0deg);   opacity: 0; }
          20%  { opacity: 1; }
          50%  { transform: translateY(50vh) translateX(22px)    rotate(180deg); opacity: 1; }
          80%  { transform: translateY(82vh) translateX(-14px)   rotate(260deg); opacity: 0.85; }
          100% { transform: translateY(112vh) translateX(8px)    rotate(360deg); opacity: 0; }
        }
        .season-particle-sakura {
          animation-name: season-sakura-sway;
          animation-iteration-count: infinite;
          animation-timing-function: ease-in-out;
          color: #FBCFE8;
          filter: drop-shadow(0 0 4px #F472B6);
        }

        @keyframes season-sun-pulse {
          0%, 100% { transform: scale(0.55); opacity: 0.35; }
          50%      { transform: scale(1.4);  opacity: 1;    }
        }
        .season-particle-sun {
          animation-name: season-sun-pulse;
          animation-iteration-count: infinite;
          animation-timing-function: ease-in-out;
          color: #FCD34D;
          text-shadow: 0 0 12px #F59E0B, 0 0 24px #FBBF24;
        }

        @keyframes season-leaf-twirl {
          0%   { transform: translateY(-3vh) translateX(0)        rotate(0deg);   opacity: 0;   }
          12%  { opacity: 0.95; }
          50%  { transform: translateY(50vh) translateX(-32px)    rotate(180deg); opacity: 0.9; }
          85%  { opacity: 0.7; }
          100% { transform: translateY(112vh) translateX(20px)   rotate(360deg); opacity: 0;   }
        }
        .season-particle-leafs {
          animation-name: season-leaf-twirl;
          animation-iteration-count: infinite;
          animation-timing-function: ease-in-out;
          color: #FED7AA;
          text-shadow: 0 0 4px rgba(220,90,30,0.55);
        }
      `}</style>
      <CosmicBackground />
      <MouseSparkleTrail />

      <div className="relative z-10">
        {/* Header */}
        <header className="mb-4 px-1">
          <div className="flex items-end justify-between mb-1">
            <h1 className="text-2xl font-black text-white tracking-tight"
                style={{ textShadow: "0 0 14px rgba(125,211,252,0.5)" }}>
              🗓 Musim
            </h1>
            <span className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: "rgba(255,255,255,0.5)" }}>
              {now.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
            </span>
          </div>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>
            4 musim ke depan • lineup + hitung mundur akurat ke detik. Update tiap jam.
          </p>
        </header>

        <SeasonHeroBanner activeSk={activeSk} isFirst={activeIdx === 0} />

        <SeasonSearch query={searchQuery} onChange={setSearchQuery} />

        <SeasonTabBar activeIdx={activeIdx} onChange={setActiveIdx} seasons={seasons} />

        <SeasonBlock sk={activeSk} accent={activeAccent} isFirst searchFilter={searchQuery} />
      </div>
    </div>
  );
}

/* ── Per-season themed animated hero banner (snow / sakura / sun / leafs) ── */
const HERO_BG: Record<SeasonKey["season"], string> = {
  WINTER: "radial-gradient(ellipse at 30% 18%, #38BDF8 0%, #1E40AF 30%, #0F172A 70%, #020617 100%)",
  SPRING: "radial-gradient(ellipse at 50% 22%, #F472B6 0%, #BE185D 30%, #831843 70%, #1E1B4B 100%)",
  SUMMER: "radial-gradient(ellipse at 60% 18%, #FEF08A 0%, #FBBF24 22%, #F59E0B 50%, #B45309 80%, #7C2D12 100%)",
  FALL:   "radial-gradient(ellipse at 70% 20%, #FB923C 0%, #EA580C 28%, #9A3412 65%, #450A0A 100%)",
};

const HERO_PARTICLES: Record<SeasonKey["season"], { kind: "snow" | "sakura" | "sun" | "leafs"; count: number }> = {
  WINTER: { kind: "snow",   count: 30 },
  SPRING: { kind: "sakura", count: 22 },
  SUMMER: { kind: "sun",    count: 14 },
  FALL:   { kind: "leafs",  count: 24 },
};

/** Per-season title gradient — chosen supaya kontras tinggi terhadap bg tiap musim
 *  (WINTER pakai ice-white, SUMMER pakai amber-on-dark, dll). Tetap pakai
 *  `holo-shift` keyframe yang sama supaya text-nya "alive". */
const HERO_TITLE_GRAD: Record<SeasonKey["season"], string> = {
  WINTER: "linear-gradient(110deg, #E0F2FE 0%, #7DD3FC 30%, #BAE6FD 50%, #7DD3FC 70%, #E0F2FE 100%)",
  SPRING: "linear-gradient(110deg, #FDF2F8 0%, #F472B6 35%, #FBCFE8 55%, #F472B6 75%, #FDF2F8 100%)",
  SUMMER: "linear-gradient(110deg, #FEF3C7 0%, #FBBF24 30%, #FDE68A 50%, #F59E0B 75%, #FEF3C7 100%)",
  FALL:   "linear-gradient(110deg, #FED7AA 0%, #FB923C 30%, #FCA5A5 55%, #EA580C 75%, #FED7AA 100%)",
};

/** Animated particles per motif. SSR-safe — pakai useMemo locked per kind biar
 *  gak bikin layout thrash dari Math.random() di tiap render. */
function SeasonParticles({ kind, count }: { kind: "snow" | "sakura" | "sun" | "leafs"; count: number }) {
  const particles = useMemo(() => {
    const glyphs = {
      snow:   ["❄", "❅", "❆"],
      sakura: ["🌸", "✿", "❀"],
      sun:    ["✦", "★", "✧"],
      leafs:  ["🍁", "🍂", "✦"],
    }[kind];
    return Array.from({ length: count }, (_, i) => ({
      k: i,
      left: Math.random() * 100,
      size: kind === "sun" ? 0.7 + Math.random() * 0.8 : 0.5 + Math.random() * 1.3,
      delay: -Math.random() * 18,
      // Sun = pulse cepat (4-7s) supaya terasa energetic. Snow/sakura/leafs
      // lebih lambat (10-22s) supaya tenang.
      duration: kind === "sun" ? 4 + Math.random() * 3 : 10 + Math.random() * 12,
      rotate: Math.random() * 360,
      drift: (Math.random() - 0.5) * 60,
      glyph: glyphs[Math.floor(Math.random() * glyphs.length)],
    }));
  }, [kind, count]);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {particles.map((p) => (
        <span
          key={p.k}
          className={`season-particle-${kind}`}
          style={{
            position: "absolute",
            left: `${p.left}%`,
            top: "-3%",
            fontSize: `${p.size}rem`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg) translateX(0)`,
            opacity: 0.85,
            willChange: "transform, opacity",
            filter: kind === "leafs" ? `drop-shadow(0 0 4px rgba(220,90,30,0.55))` : undefined,
          }}
        >{p.glyph}</span>
      ))}
    </div>
  );
}

/** Fetch banner URLs dari API server (GitHub Releases URLs per musim). */
async function fetchBannerUrls(): Promise<Record<string, string | null>> {
  try {
    const base = import.meta.env.BASE_URL?.replace(/\/$/, '') ?? '';
    const res  = await fetch(`${base}/api/banners`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return {};
    return await res.json();
  } catch { return {}; }
}

/** Hero card — per-season themed animated (snow / sakura / sun / leafs).
 *  Mengikuti tab musim yang aktif. Mendukung video background dari:
 *  1. /banners/season-{season}.mp4 (lokal — ada setelah /setmusim di instance ini)
 *  2. URL dari GitHub Releases via /api/banners (permanen — survive remixgithub)
 *  3. Fallback ke CSS gradient kalau kedua sumber gagal */
function SeasonHeroBanner({ activeSk, isFirst }: { activeSk: SeasonKey; isFirst: boolean }) {
  const cur = activeSk;
  const meta = SEASON_META[cur.season];
  const accent = meta.accent;
  const vi = hashId(`hero-${cur.season}-${cur.year}`);
  const tiltHandlers = useTiltHandlers();
  const [videoError, setVideoError] = useState(false);
  const [remoteSrc, setRemoteSrc]   = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Reset video error + replay saat musim berubah
  useEffect(() => {
    setVideoError(false);
    if (videoRef.current) {
      videoRef.current.load();
    }
  }, [cur.season]);

  // Ambil URL dari API (GitHub Releases) sekali saat mount
  useEffect(() => {
    fetchBannerUrls().then(urls => {
      const key = cur.season.toLowerCase() as string;
      if (urls[key]) setRemoteSrc(urls[key] as string);
    });
  }, [cur.season]);

  const { data: heroResult } = useQuery<SeasonFetchResult>({
    // Pakai key yang sama dengan SeasonTabBar supaya share cache — instan saat ganti tab
    queryKey: ["season-lineup", cur.season, cur.year],
    queryFn: () => fetchSeasonLineup(cur),
    staleTime: 60 * 60_000,
  });
  const count = heroResult?.data?.length ?? 0;
  const motif = HERO_PARTICLES[cur.season];
  // Prioritas: lokal (ada langsung) → GitHub Releases URL (survive remixgithub)
  const localSrc  = `${import.meta.env.BASE_URL}banners/season-${cur.season.toLowerCase()}.mp4`;
  const videoSrc  = remoteSrc ?? localSrc;

  return (
    <div className="mb-5 cursor-pointer relative"
         style={{ transition: "transform 0.15s ease", willChange: "transform" }}
         {...tiltHandlers}>
      <div className={`lux-wrap lux-v${vi}`}>
        <CornerAccents color={VARIANTS[vi].glow} variant={vi} />
        <div className="rounded-2xl relative overflow-hidden"
             style={{
               background: HERO_BG[cur.season],
               minHeight: 168,
               backdropFilter: "blur(20px)",
             }}>

          {/* ── Video background layer (fallback ke CSS gradient kalau gagal) ── */}
          {!videoError && (
            <video
              ref={videoRef}
              key={cur.season}
              autoPlay
              muted
              loop
              playsInline
              onError={() => setVideoError(true)}
              onCanPlay={() => { videoRef.current?.play().catch(() => {}); }}
              onLoadedData={() => { videoRef.current?.play().catch(() => {}); }}
              className="absolute inset-0 w-full h-full pointer-events-none"
              style={{
                objectFit: "cover",
                opacity: 1,
                zIndex: 0,
              }}
            >
              <source src={videoSrc} type="video/mp4" />
            </video>
          )}

          {/* Content overlay removed — video fills the full banner */}
        </div>
      </div>
    </div>
  );
}
