import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "wouter";
import type { AnimeCard as AnimeCardType } from "@/lib/api";
import { titlePlaceholder, proxyImg } from "@/lib/utils";
import { useAnimeInfo } from "@/lib/usePoster";
import { useIsCompleted, hoursSinceLastAired, resolveLastAiredAt } from "@/lib/completion";
import { cacheCardPoster } from "@/lib/animeCardCache";

interface AnimeCardProps {
  anime: AnimeCardType;
  variant?: "poster" | "list";
  showScore?: boolean;
}

function hashId(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return Math.abs(h) % 10;
}

// 10 border mewah eksklusif — gradient mengalir, tiap anime dapat satu (hash dari animeId)
const VARIANTS = [
  { glow: "#FFD700" }, // 0: Golden Crown
  { glow: "#42A5F5" }, // 1: Royal Sapphire
  { glow: "#F48FB1" }, // 2: Rose Gold Elite
  { glow: "#00C853" }, // 3: Emerald Prestige
  { glow: "#B3E5FC" }, // 4: Frost Diamond
  { glow: "#FF1744" }, // 5: Blood Crimson
  { glow: "#CE93D8" }, // 6: Amethyst Mystic
  { glow: "#FF006E" }, // 7: Aurora Spectrum
  { glow: "#CFD8DC" }, // 8: Platinum Elite
  { glow: "#00E5FF" }, // 9: Neon Hologram
];

const BORDER_CSS = `
/* ── Luxury flowing gradient border system ── */
@keyframes lux-flow{0%,100%{background-position:0% 50%}33%{background-position:66% 0%}66%{background-position:100% 50%}}
@keyframes lux-glow-pulse{0%,100%{opacity:1}50%{opacity:.72}}
.lux-wrap{border-radius:14px;padding:2.5px;background-size:400% 400%;position:relative}
.lux-v0{background:linear-gradient(135deg,#8B6914,#FFD700,#FFA500,#FFEC00,#FFF8B2,#FFA500,#B8860B,#FFD700);box-shadow:0 0 16px rgba(255,215,0,.7),0 0 36px rgba(255,165,0,.45),0 0 64px rgba(255,100,0,.22),0 0 90px rgba(255,200,0,.1);animation:lux-flow 4s ease-in-out infinite}
.lux-v1{background:linear-gradient(135deg,#0D47A1,#1E88E5,#42A5F5,#E3F2FD,#90CAF9,#1565C0,#0D47A1,#42A5F5);box-shadow:0 0 16px rgba(30,136,229,.72),0 0 36px rgba(13,71,161,.48),0 0 64px rgba(30,136,229,.22),0 0 90px rgba(66,165,245,.1);animation:lux-flow 3s ease-in-out infinite}
.lux-v2{background:linear-gradient(135deg,#880E4F,#F48FB1,#FCE4EC,#FFD54F,#F8BBD0,#AD1457,#F48FB1,#FFD54F);box-shadow:0 0 16px rgba(244,143,177,.68),0 0 34px rgba(255,213,79,.42),0 0 60px rgba(233,30,99,.2),0 0 88px rgba(255,213,79,.1);animation:lux-flow 4.5s ease-in-out infinite}
.lux-v3{background:linear-gradient(135deg,#1B5E20,#00C853,#69F0AE,#00E5FF,#80CBC4,#00695C,#00C853,#69F0AE);box-shadow:0 0 16px rgba(0,200,83,.68),0 0 34px rgba(0,229,255,.42),0 0 60px rgba(0,150,60,.22),0 0 88px rgba(0,229,255,.1);animation:lux-flow 3.5s ease-in-out infinite}
.lux-v4{background:linear-gradient(135deg,#90CAF9,#E3F2FD,#FFFFFF,#B3E5FC,#FFFFFF,#BBDEFB,#E3F2FD,#FFFFFF);box-shadow:0 0 12px rgba(179,229,252,.65),0 0 28px rgba(255,255,255,.45),0 0 52px rgba(144,202,249,.22),0 0 80px rgba(179,229,252,.1);animation:lux-flow 5.5s ease-in-out infinite}
.lux-v5{background:linear-gradient(135deg,#7F0000,#FF1744,#FF6D00,#FF8F00,#FF1744,#B71C1C,#FF1744,#FF6D00);box-shadow:0 0 18px rgba(255,23,68,.78),0 0 40px rgba(255,109,0,.52),0 0 70px rgba(183,28,28,.3),0 0 100px rgba(255,23,68,.12);animation:lux-flow 2.5s ease-in-out infinite}
.lux-v6{background:linear-gradient(135deg,#4A148C,#7B1FA2,#CE93D8,#E040FB,#BA68C8,#6A1B9A,#CE93D8,#E040FB);box-shadow:0 0 16px rgba(171,71,188,.7),0 0 36px rgba(206,147,216,.45),0 0 64px rgba(74,20,140,.25),0 0 90px rgba(206,147,216,.1);animation:lux-flow 4s ease-in-out infinite}
.lux-v7{background:linear-gradient(135deg,#FF006E,#FF6B00,#FFD700,#00E676,#00E5FF,#7C4DFF,#FF006E,#FF6B00);box-shadow:0 0 16px rgba(255,0,110,.65),0 0 34px rgba(0,229,255,.42),0 0 60px rgba(124,77,255,.25),0 0 88px rgba(255,0,110,.1);animation:lux-flow 2.8s linear infinite}
.lux-v8{background:linear-gradient(135deg,#546E7A,#CFD8DC,#FFFFFF,#ECEFF1,#FFFFFF,#90A4AE,#CFD8DC,#FFFFFF);box-shadow:0 0 12px rgba(207,216,220,.6),0 0 28px rgba(255,255,255,.38),0 0 52px rgba(176,190,197,.2),0 0 80px rgba(236,239,241,.08);animation:lux-flow 5.5s ease-in-out infinite}
.lux-v9{background:linear-gradient(135deg,#00E5FF,#00FFAA,#FF00FF,#00E5FF,#7C4DFF,#00FF88,#FF00FF,#00E5FF);box-shadow:0 0 18px rgba(0,229,255,.78),0 0 40px rgba(255,0,255,.52),0 0 70px rgba(0,255,136,.3),0 0 100px rgba(0,229,255,.12);animation:lux-flow 2s linear infinite}
@keyframes corner-spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
@keyframes corner-spin-rev { 0%{transform:rotate(0deg)} 100%{transform:rotate(-360deg)} }
@keyframes tamat-shimmer { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
@keyframes tamat-seal-glow { 0%,100%{filter:drop-shadow(0 0 4px rgba(255,215,0,0.7))} 50%{filter:drop-shadow(0 0 9px rgba(255,215,0,0.95))} }
@keyframes neweps-pulse { 0%,100%{box-shadow:0 0 6px rgba(124,58,237,.55),0 0 14px rgba(139,92,246,.35)} 50%{box-shadow:0 0 12px rgba(167,139,250,.85),0 0 26px rgba(139,92,246,.55)} }
@keyframes neweps-live-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.7)} }
@keyframes newrilis-shimmer { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
@keyframes newrilis-flare { 0%,100%{box-shadow:0 0 7px rgba(255,107,0,.6),0 0 16px rgba(255,61,0,.4)} 50%{box-shadow:0 0 13px rgba(255,159,0,.9),0 0 28px rgba(255,61,0,.6)} }
@keyframes countdown-glow { 0%,100%{box-shadow:0 0 6px rgba(96,165,250,.25),inset 0 0 0 1px rgba(96,165,250,.3)} 50%{box-shadow:0 0 12px rgba(96,165,250,.45),inset 0 0 0 1px rgba(96,165,250,.5)} }
@keyframes countdown-blink { 0%,49%{opacity:1} 50%,100%{opacity:.25} }
`;

let styleInjected = false;
function injectBorderStyles() {
  if (styleInjected || typeof document === "undefined") return;
  styleInjected = true;
  const el = document.createElement("style");
  el.textContent = BORDER_CSS;
  document.head.appendChild(el);
}

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

function CornerAccents({ color, variant }: { color: string; variant: number }) {
  const spinDir = variant % 2 === 0 ? "corner-spin" : "corner-spin-rev";
  const dur = (3 + (variant % 5) * 0.8).toFixed(1) + "s";
  const dotSize = 4 + (variant % 3);
  const style: React.CSSProperties = {
    position: "absolute", width: dotSize, height: dotSize, borderRadius: "50%",
    background: color, boxShadow: `0 0 6px ${color}, 0 0 12px ${color}`,
    pointerEvents: "none", zIndex: 5,
  };
  if (variant % 3 !== 0) return null;
  return (
    <>
      <span style={{ ...style, top: -dotSize / 2, left: -dotSize / 2, animation: `${spinDir} ${dur} linear infinite` }} />
      <span style={{ ...style, bottom: -dotSize / 2, right: -dotSize / 2, animation: `${spinDir} ${dur} linear infinite reverse` }} />
    </>
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

  // Ambil currentEp + nextAiringAt dari AniList
  const { currentEp: anilistEp, nextAiringAt } = useAnimeInfo(anime.title);
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

            {displayEp && (
              <span className="absolute bottom-2 left-2 text-[11px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: "rgba(255,107,0,0.85)",
                  backdropFilter: "blur(8px)",
                  color: "#fff",
                }}>
                Ep {displayEp}
              </span>
            )}

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
