import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "wouter";
import type { AnimeCard as AnimeCardType } from "@/lib/api";
import { titlePlaceholder, proxyImg } from "@/lib/utils";
import { useAnimeInfo } from "@/lib/usePoster";
import { useIsCompleted, hoursSinceLastAired, resolveLastAiredAt } from "@/lib/completion";
import { cacheCardPoster } from "@/lib/animeCardCache";
import { hashId, VARIANTS, CornerAccents, injectBorderStyles } from "@/lib/cardBorders";

interface AnimeCardProps {
  anime: AnimeCardType;
  variant?: "poster" | "list";
  showScore?: boolean;
}

// BORDER_CSS + injectBorderStyles sudah dipindah ke '@/lib/cardBorders'
// (lihat import di atas). Jangan definisikan ulang di sini — TS duplicate-identifier error.

function SmartPoster({ title, serverPoster, className, style }: { title: string; fallbackPoster?: string | null; serverPoster?: string | null; className?: string; style?: React.CSSProperties }) {
  // NOTE: poster mentah hasil scrape OtakuDesu (anime.poster) di-host di otakudesu.blog,
  // yang Cloudflare-block dengan 403 untuk SEMUA request (browser maupun server) — jadi
  // TIDAK BISA dipakai langsung sebagai <img src>. Poster sekarang bisa datang dari:
  // 1. serverPoster: di-inject api-server dari DB AniList (langsung, 0 latency tambahan)
  // 2. useAnimeInfo: fallback client-side AniList/MAL fetch (async, beberapa detik)
  const { poster: malPoster } = useAnimeInfo(title, serverPoster);
  const [loaded, setLoaded] = useState(false);
  // imgKey dipakai untuk force-remount <img> saat retry — browser akan re-fetch dari SW/network
  const [imgKey, setImgKey] = useState(0);
  const retryCount = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [grad, initials] = titlePlaceholder(title);
  const src = malPoster ? proxyImg(malPoster, 260) : malPoster;

  // Reset retry state tiap kali src berubah (poster URL baru datang dari AniList)
  useEffect(() => {
    retryCount.current = 0;
    setLoaded(false);
    setImgKey(k => k + 1);
    return () => { if (retryTimer.current) clearTimeout(retryTimer.current); };
  }, [src]);

  function handleError() {
    if (!src) return;
    const attempt = retryCount.current;
    if (attempt >= 5) return; // max 5 kali coba — setelah itu biarkan placeholder tampil
    retryCount.current = attempt + 1;
    // Exponential backoff: 1s → 2s → 4s → 8s → 16s
    const delay = Math.min(1000 * 2 ** attempt, 16_000);
    retryTimer.current = setTimeout(() => {
      setImgKey(k => k + 1); // remount <img> = trigger fetch baru dari SW/network
    }, delay);
  }

  return (
    <div className={`relative overflow-hidden ${className ?? ""}`} style={style}>
      <div className="absolute inset-0 flex items-center justify-center" style={{ background: grad }}>
        <span style={{ fontSize: "clamp(14px,3vw,24px)", fontWeight: 900, color: "rgba(255,255,255,0.3)", letterSpacing: "0.05em", userSelect: "none" }}>
          {initials}
        </span>
      </div>
      {src && (
        <img
          key={imgKey}
          src={src} alt={title}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.5s ease" }}
          loading="lazy"
          onLoad={() => {
            setLoaded(true);
            // Promote ke priority bucket — poster yang sudah tampil tidak akan pernah di-evict SW
            if (src && navigator.serviceWorker?.controller) {
              navigator.serviceWorker.controller.postMessage({ type: 'PRIORITY_CACHE_IMAGE', urls: [src] });
            }
          }}
          onError={handleError}
        />
      )}
    </div>
  );
}

/** Hitung target timestamp Unix (detik) untuk countdown.
 *  Prioritas: nextAiringAt dari AniList (presisi jam:menit) → fallback lastAiredAt + 7
 *  hari (asumsi jadwal mingguan, dari tanggal rilis terakhir yang diketahui).
 *
 *  BUG FIX: kalau nextAiringAt baru saja lewat (< 24 jam lalu), kembalikan nextAiringAt
 *  itu sendiri supaya secs = 0 → badge "🎉 Eps Baru!" tampil, bukan "● Ongoing".
 *  Sebelumnya: nextAiringAt lewat → resolveLastAiredAt pakai nextAiringAt − 7 hari →
 *  fallback = (nextAiringAt − 7 hari) + 7 hari = nextAiringAt yang sudah lewat → return null
 *  → secs = null → badge "● Ongoing" (SALAH). */
function resolveNextAiringAt(nextAiringAt: number | null, lastRelease?: string): number | null {
  const now = Math.floor(Date.now() / 1000);
  if (nextAiringAt && nextAiringAt > now) return nextAiringAt;
  // Baru saja lewat (< 24 jam lalu) → tampilkan secs=0 supaya badge "🎉 Eps Baru!" muncul
  if (nextAiringAt && now - nextAiringAt < 86400) return nextAiringAt;
  const lastAired = resolveLastAiredAt(nextAiringAt, lastRelease);
  if (lastAired === null) return null;
  const fallback = lastAired + 7 * 86400;
  return fallback > now ? fallback : null;
}

/** Badge premium "TAMAT" — dipakai list & poster variant */
function TamatPill() {
  return (
    <span className="tamat-badge text-[10px] px-2 py-0.5 rounded-full font-black inline-flex items-center gap-1"
      style={{
        background: "linear-gradient(135deg, #B8860B, #FFD700, #FFA500, #B8860B)",
        backgroundSize: "200% 200%",
        animation: "tamat-shimmer 2.5s linear infinite",
        color: "#1a0a00",
        boxShadow: "0 0 8px rgba(255,215,0,0.5), 0 0 16px rgba(255,165,0,0.3)",
        letterSpacing: "0.05em",
      }}>
      🏆 TAMAT
    </span>
  );
}

/** Ribbon seal buat pojok poster — lebih "keren" dari badge generik */
function TamatSeal() {
  return (
    <div className="absolute top-2 right-2 z-10" style={{ animation: "tamat-seal-glow 2.2s ease-in-out infinite" }}>
      <div className="flex items-center gap-1 pl-1.5 pr-2 py-1 rounded-l-full"
        style={{
          background: "linear-gradient(135deg, #8B5E00, #FFD700 45%, #FFA500 70%, #8B5E00)",
          backgroundSize: "200% 200%",
          animation: "tamat-shimmer 2.5s linear infinite",
          boxShadow: "0 2px 10px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.4)",
        }}>
        <span style={{ fontSize: 11 }}>🏆</span>
        <span style={{ fontSize: 9, fontWeight: 900, color: "#1a0a00", letterSpacing: "0.04em" }}>TAMAT</span>
      </div>
    </div>
  );
}

/** Shared countdown tick hook — satu sumber kebenaran buat poster & list variant. */
function useCountdown(nextAiringAt: number | null, lastRelease?: string): number | null {
  const target = useMemo(() => resolveNextAiringAt(nextAiringAt, lastRelease), [nextAiringAt, lastRelease]);
  const [secs, setSecs] = useState(() => target ? Math.max(0, target - Math.floor(Date.now() / 1000)) : null);

  useEffect(() => {
    if (target === null) { setSecs(null); return; }
    const tick = () => setSecs(Math.max(0, target - Math.floor(Date.now() / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  return secs;
}

function countdownLabel(secs: number): { d: number; h: string; m: string; s: string } {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return { d, h: String(h).padStart(2, "0"), m: String(m).padStart(2, "0"), s: String(s).padStart(2, "0") };
}

// ── Realtime countdown badge (poster variant — pojok kanan atas) ──────────
function PosterCountdownBadge({ nextAiringAt, lastRelease }: { nextAiringAt: number | null; lastRelease?: string }) {
  const secs = useCountdown(nextAiringAt, lastRelease);

  if (secs === null) {
    return (
      <span className="absolute top-2 right-2 z-10 text-[9px] font-black px-1.5 py-0.5 rounded-full"
        style={{ background: "rgba(52,211,153,0.18)", color: "#34D399", border: "1px solid rgba(52,211,153,0.35)" }}>
        ● Ongoing
      </span>
    );
  }

  if (secs === 0) {
    return (
      <span className="absolute top-2 right-2 z-10 text-[9px] font-black px-1.5 py-0.5 rounded-full animate-pulse"
        style={{ background: "linear-gradient(135deg,#7C3AED,#5B21B6)", color: "#fff", boxShadow: "0 0 8px rgba(124,58,237,0.6)" }}>
        🎉 Eps Baru!
      </span>
    );
  }

  const { d, h, m, s } = countdownLabel(secs);
  const label = d > 0 ? `${d}h ${h}:${m}:${s}` : `${h}:${m}:${s}`;

  return (
    <span className="absolute top-2 right-2 z-10 text-[9px] font-black px-1.5 py-1 rounded-full tabular-nums inline-flex items-center gap-1"
      style={{
        background: "linear-gradient(135deg, rgba(15,23,42,0.9), rgba(30,41,59,0.85))",
        color: "#7DD3FC",
        border: "1px solid rgba(96,165,250,0.4)",
        backdropFilter: "blur(8px)",
        letterSpacing: "0.03em",
        animation: "countdown-glow 2.4s ease-in-out infinite",
      }}>
      <span style={{ animation: "countdown-blink 1.6s steps(1) infinite" }}>⏳</span> {label}
    </span>
  );
}

// ── Realtime countdown badge (list variant — inline pill) ─────────────────
function ListCountdownBadge({ nextAiringAt, lastRelease }: { nextAiringAt: number | null; lastRelease?: string }) {
  const secs = useCountdown(nextAiringAt, lastRelease);

  if (secs === null) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
        style={{ background: "rgba(52,211,153,0.12)", color: "#34D399", border: "1px solid rgba(52,211,153,0.2)" }}>
        ● Ongoing
      </span>
    );
  }

  if (secs === 0) {
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold animate-pulse"
        style={{ background: "rgba(124,58,237,0.15)", color: "#A78BFA", border: "1px solid rgba(124,58,237,0.3)" }}>
        🎉 Eps Baru!
      </span>
    );
  }

  const { d, h, m, s } = countdownLabel(secs);
  const label = d > 0 ? `${d}h ${h}:${m}:${s}` : `${h}:${m}:${s}`;

  return (
    <span className="text-[10px] px-2 py-1 rounded-full font-bold tabular-nums inline-flex items-center gap-1"
      style={{
        background: "linear-gradient(135deg, rgba(15,23,42,0.75), rgba(30,58,95,0.55))",
        color: "#7DD3FC",
        border: "1px solid rgba(96,165,250,0.35)",
        letterSpacing: "0.02em",
        animation: "countdown-glow 2.4s ease-in-out infinite",
      }}>
      <span style={{ animation: "countdown-blink 1.6s steps(1) infinite" }}>⏳</span> {label}
    </span>
  );
}

/** Badge premium "EPS BARU" — episode baru dari anime yang sudah berjalan. */
function NewEpsBadge({ variant }: { variant: "poster" | "list" }) {
  const shared: React.CSSProperties = {
    background: "linear-gradient(135deg, #6D28D9, #8B5CF6 45%, #A78BFA 70%, #6D28D9)",
    backgroundSize: "200% 200%",
    animation: "newrilis-shimmer 3s linear infinite, neweps-pulse 2s ease-in-out infinite",
    color: "#fff",
    letterSpacing: "0.02em",
  };
  const dot = (
    <span style={{
      width: 5, height: 5, borderRadius: "50%", background: "#fff",
      display: "inline-block", animation: "neweps-live-dot 1.2s ease-in-out infinite",
    }} />
  );
  if (variant === "poster") {
    return (
      <span className="absolute top-2 right-2 z-10 text-[9px] font-black px-2 py-1 rounded-full inline-flex items-center gap-1.5"
        style={shared}>
        {dot} EPS BARU
      </span>
    );
  }
  return (
    <span className="text-[10px] px-2.5 py-1 rounded-full font-black inline-flex items-center gap-1.5" style={shared}>
      {dot} EPS BARU
    </span>
  );
}

/** Badge premium "RILIS BARU" — anime yang baru saja tayang episode pertamanya. */
function NewRilisBadge({ variant }: { variant: "poster" | "list" }) {
  const shared: React.CSSProperties = {
    background: "linear-gradient(135deg, #C2410C, #FF6B00 40%, #FF3D00 70%, #C2410C)",
    backgroundSize: "200% 200%",
    animation: "newrilis-shimmer 2.5s linear infinite, newrilis-flare 2s ease-in-out infinite",
    color: "#fff",
    letterSpacing: "0.02em",
  };
  if (variant === "poster") {
    return (
      <span className="absolute top-2 right-2 z-10 text-[9px] font-black px-2 py-1 rounded-full inline-flex items-center gap-1"
        style={shared}>
        🔥 RILIS BARU
      </span>
    );
  }
  return (
    <span className="text-[10px] px-2.5 py-1 rounded-full font-black inline-flex items-center gap-1" style={shared}>
      🔥 RILIS BARU
    </span>
  );
}

export default function AnimeCard({ anime, variant = "poster", showScore }: AnimeCardProps) {
  useEffect(() => { injectBorderStyles(); }, []);

  // Simpan poster ke module cache supaya AnimeDetail bisa pakai sebelum API-nya selesai
  useEffect(() => {
    cacheCardPoster(anime.animeId, anime.anilistPoster ?? anime.poster ?? null);
  }, [anime.animeId, anime.anilistPoster, anime.poster]);

  const bv = VARIANTS[hashId(anime.animeId)];
  const completed = useIsCompleted(anime);

  // Ambil currentEp + nextAiringAt + tahun + score dari AniList
  const { currentEp: anilistEp, nextAiringAt, year: anilistYear, averageScore: anilistAvgScore } = useAnimeInfo(anime.title);
  const displayEp = anime.episodes || (anilistEp != null ? String(anilistEp) : null);

  // fresh = rolling 24 jam PENUH sejak episode terakhir tayang (bukan "hari kalender
  // yang sama" — itu bug lama, eps rilis jam 23:59 cuma dapat badge ~1 menit).
  const lastRelease = anime.latestReleaseDate ?? anime.lastReleaseDate;
  const hoursSince = hoursSinceLastAired(nextAiringAt, lastRelease);
  const fresh = hoursSince !== null && hoursSince >= 0 && hoursSince < 24;

  // Jumlah episode: kalau count-nya tidak diketahui sama sekali, JANGAN asumsikan
  // episode 1 (dulu bug: anime.episodes kosong → parseInt("0")<=1 → salah dianggap
  // RILIS BARU). Default aman = anggap bukan eps pertama (EPS BARU).
  const epCountRaw = anime.episodes || (anilistEp != null ? String(anilistEp) : "");
  const epCount = epCountRaw ? parseInt(epCountRaw, 10) : null;
  const isFirst = epCount !== null && !isNaN(epCount) && epCount <= 1;

  if (variant === "list") {
    return (
      <Link href={`/anime/${anime.animeId}`} data-testid={`card-list-${anime.animeId}`}>
        {/* Glassmorphism list card */}
        <div
          className="flex gap-3 p-3 rounded-xl cursor-pointer transition-all active:scale-[0.98]"
          style={{
            background: "rgba(15,15,27,0.55)",
            backdropFilter: "blur(24px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          {/* Thumbnail */}
          <div className="relative flex-shrink-0 w-[72px] h-[100px] rounded-lg overflow-hidden"
            style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
            <SmartPoster title={anime.title} fallbackPoster={anime.poster} serverPoster={anime.anilistPoster} className="w-full h-full" />
            {/* Glass sheen */}
            <div className="absolute inset-0" style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, transparent 50%)",
              pointerEvents: "none",
            }} />
          </div>
          <div className="flex flex-col justify-between flex-1 min-w-0 py-1">
            <div>
              <h3 className="text-sm font-bold text-white line-clamp-2 leading-tight mb-1">{anime.title}</h3>
              {anime.genres && anime.genres.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {anime.genres.slice(0, 3).map((g) => (
                    <span key={g} className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      style={{ background: "rgba(255,107,0,0.12)", color: "#FF6B00", border: "1px solid rgba(255,107,0,0.2)" }}>{g}</span>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {anime.episodes && <span className="text-xs" style={{ color: "#6E6E90" }}>{anime.episodes} Eps</span>}
              {showScore && anime.score && <span className="text-xs font-bold" style={{ color: "#FFD700" }}>★ {anime.score}</span>}
              {/* Badge wajib — setiap anime PASTI dapat satu badge:
                  1. TAMAT    → AniList FINISHED atau >171 jam tanpa update
                  2. RILIS BARU → fresh (< 24 jam) DAN eps pertama (eps ≤ 1)
                  3. EPS BARU  → fresh (< 24 jam) DAN eps lanjutan (eps ≥ 2)
                  4. Countdown → timer mundur ke eps berikutnya (pakai nextAiringAt atau +7 hari)
                  Kalau hiatus berakhir: latestReleaseDate baru → fresh=true → EPS BARU otomatis. */}
              {completed
                ? <TamatPill />
                : (fresh && isFirst)
                  ? <NewRilisBadge variant="list" />
                  : (fresh && !isFirst)
                    ? <NewEpsBadge variant="list" />
                    : <ListCountdownBadge nextAiringAt={nextAiringAt} lastRelease={lastRelease} />
              }
            </div>
          </div>
        </div>
      </Link>
    );
  }

  /* ── Poster variant with flowing gradient border + 3D tilt on touch ── */
  const vi = hashId(anime.animeId);
  return (
    <Link href={`/anime/${anime.animeId}`} data-testid={`card-poster-${anime.animeId}`}>
      <div className="relative flex-shrink-0 cursor-pointer"
        style={{ transition: "transform 0.15s ease", willChange: "transform" }}
        onMouseMove={e => {
          const el = e.currentTarget;
          const r = el.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width - 0.5;
          const y = (e.clientY - r.top) / r.height - 0.5;
          el.style.transform = `perspective(600px) rotateX(${(-y * 14).toFixed(1)}deg) rotateY(${(x * 14).toFixed(1)}deg) scale(1.04)`;
        }}
        onMouseLeave={e => { e.currentTarget.style.transform = "perspective(600px) rotateX(0deg) rotateY(0deg) scale(1)"; }}
        onTouchMove={e => {
          const el = e.currentTarget;
          const r = el.getBoundingClientRect();
          const t = e.touches[0];
          const x = (t.clientX - r.left) / r.width - 0.5;
          const y = (t.clientY - r.top) / r.height - 0.5;
          el.style.transform = `perspective(600px) rotateX(${(-y * 10).toFixed(1)}deg) rotateY(${(x * 10).toFixed(1)}deg) scale(1.03)`;
        }}
        onTouchEnd={e => { e.currentTarget.style.transform = "perspective(600px) rotateX(0deg) rotateY(0deg) scale(1)"; }}
      >
        <div className={`lux-wrap lux-v${vi}`} style={{ position: "relative" }}>
          <CornerAccents color={VARIANTS[vi].glow} variant={vi} />

          <div className="relative overflow-hidden rounded-xl"
            style={{ boxShadow: "0 4px 20px rgba(0,0,0,0.6)", background: "#050510" }}>
            <SmartPoster
              title={anime.title}
              fallbackPoster={anime.poster}
              serverPoster={anime.anilistPoster}
              className="w-full"
              style={{ aspectRatio: "2/3", minHeight: "120px" }}
            />
            {/* Deep gradient */}
            <div className="absolute inset-0" style={{
              background: "linear-gradient(to top, rgba(7,7,14,0.95) 0%, transparent 50%)",
            }} />
            {/* Glassmorphism top sheen */}
            <div className="absolute inset-0" style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 45%)",
              backdropFilter: "blur(0px)",
              pointerEvents: "none",
            }} />

            {/* Bottom-left info: EP · ⭐score · year — kecil, tidak menutupi poster */}
            <div className="absolute bottom-2 left-2 flex flex-col gap-[3px]">
              {displayEp && (
                <span className="text-[10px] font-bold px-1.5 py-[2px] rounded-full w-fit"
                  style={{
                    background: "rgba(255,107,0,0.85)",
                    backdropFilter: "blur(8px)",
                    color: "#fff",
                  }}>
                  EP {displayEp}
                </span>
              )}
              {(anilistAvgScore != null || anilistYear != null) && (
                <span className="text-[9px] font-medium px-1.5 py-[2px] rounded-full w-fit whitespace-nowrap"
                  style={{
                    background: "rgba(0,0,0,0.60)",
                    backdropFilter: "blur(4px)",
                    color: "rgba(255,255,255,0.88)",
                    lineHeight: 1.2,
                  }}>
                  {anilistAvgScore != null && `🌟${(anilistAvgScore / 10).toFixed(1)}`}
                  {anilistAvgScore != null && anilistYear != null && " · "}
                  {anilistYear != null && `🗓 ${anilistYear}`}
                </span>
              )}
            </div>

            {/* Badge wajib — setiap anime PASTI dapat satu badge:
                1. TAMAT    → AniList FINISHED atau >171 jam tanpa update
                2. RILIS BARU → fresh (< 24 jam) DAN eps pertama (eps ≤ 1)
                3. EPS BARU  → fresh (< 24 jam) DAN eps lanjutan (eps ≥ 2)
                4. Countdown → timer mundur ke eps berikutnya (pakai nextAiringAt atau +7 hari)
                Kalau hiatus berakhir: latestReleaseDate baru → fresh=true → EPS BARU otomatis. */}
            {completed
              ? <TamatSeal />
              : (fresh && isFirst)
                ? <NewRilisBadge variant="poster" />
                : (fresh && !isFirst)
                  ? <NewEpsBadge variant="poster" />
                  : <PosterCountdownBadge nextAiringAt={nextAiringAt} lastRelease={lastRelease} />
            }

            {showScore && anime.score && (
              <span className="absolute top-2 left-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                style={{
                  background: "rgba(0,0,0,0.6)",
                  backdropFilter: "blur(8px)",
                  color: "#FFD700",
                  border: "1px solid rgba(255,215,0,0.2)",
                }}>★ {anime.score}</span>
            )}
          </div>
        </div>

        <p className="mt-1.5 text-xs font-semibold text-white line-clamp-2 leading-tight px-0.5">
          {anime.title}
        </p>
      </div>
    </Link>
  );
}
