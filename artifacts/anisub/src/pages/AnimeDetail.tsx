import { useState, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Bookmark, BookmarkCheck, Star, Play, ChevronDown, ChevronUp, Layers, X } from "lucide-react";
import { fetchAnimeDetail, getSynopsisText } from "@/lib/api";
import CommentsSection from "@/components/CommentsSection";
import {
  getWatchlistItem, upsertWatchlist, removeWatchlist,
  toggleFavorite, isFavorite, getProgress,
} from "@/lib/storage";
import type { WatchStatus, WatchProgress } from "@/lib/storage";
import AnimeCard from "@/components/AnimeCard";
import { titlePlaceholder } from "@/lib/utils";
import { usePoster } from "@/lib/usePoster";
import { useBanner } from "@/lib/useBanner";
import { fetchAniListRichByTitle, fetchPersonDetail } from "@/lib/anilist";
import type { AniListRichData, PersonDetail } from "@/lib/anilist";

type ConfettiParticle = { id: number; color: string; tx: number; ty: number; size: number };
const CONFETTI_COLORS = ["#FF6B00","#FFD700","#F472B6","#A78BFA","#60A5FA","#34D399","#FF4444","#22D3EE"];
function spawnConfetti(): ConfettiParticle[] {
  return Array.from({ length: 20 }, (_, i) => {
    const angle = (i / 20) * 2 * Math.PI + Math.random() * 0.3;
    const dist = 50 + Math.random() * 70;
    return { id: Date.now() + i, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length], tx: Math.cos(angle) * dist, ty: Math.sin(angle) * dist, size: 5 + Math.floor(Math.random() * 7) };
  });
}

const STATUS_LABELS: Record<WatchStatus, string> = {
  watching: "Sedang Nonton", completed: "Selesai",
  plan_to_watch: "Akan Ditonton", on_hold: "Ditunda", dropped: "Berhenti",
};

const STATUS_COLORS: Record<WatchStatus, string> = {
  watching: "#00C9FF", completed: "#00FF9C",
  plan_to_watch: "#FF6B00", on_hold: "#FFD700", dropped: "#FF4444",
};

function fmt(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

const ID_MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
function fmtALDate(d?: { year?: number | null; month?: number | null; day?: number | null } | null): string {
  if (!d?.year) return "?";
  const parts: (string | number)[] = [];
  if (d.day) parts.push(d.day);
  if (d.month) parts.push(ID_MONTHS[d.month - 1]);
  parts.push(d.year);
  return parts.join(" ");
}

function fmtEpDate(unixSec: number): string {
  const date = new Date(unixSec * 1000);
  const str = date.toLocaleString("id-ID", {
    timeZone: "Asia/Jakarta",
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
  return str.replace(",", " ·") + " WIB";
}

const AL_STATUS: Record<string, string> = {
  FINISHED: "Selesai", RELEASING: "Sedang Tayang",
  NOT_YET_RELEASED: "Belum Tayang", CANCELLED: "Dibatalkan", HIATUS: "Hiatus",
};
const AL_STATUS_COLOR: Record<string, string> = {
  FINISHED: "#00FF9C", RELEASING: "#00C9FF",
  NOT_YET_RELEASED: "#FFD700", CANCELLED: "#FF4444", HIATUS: "#F472B6",
};

function InfoBar({ rich }: { rich: AniListRichData }) {
  const status = rich.status ?? "";
  const studio = rich.studios?.nodes?.[0]?.name;
  const start = fmtALDate(rich.startDate);
  const end = rich.endDate?.year ? fmtALDate(rich.endDate) : null;
  const isOngoing = status === "RELEASING";
  return (
    <div className="rounded-xl px-3 py-2.5 space-y-1.5"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {status && (
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0 animate-pulse"
              style={{ background: AL_STATUS_COLOR[status] ?? "#6E6E90",
                animationPlayState: isOngoing ? "running" : "paused" }} />
            <span className="text-xs font-bold" style={{ color: AL_STATUS_COLOR[status] ?? "#6E6E90" }}>
              {AL_STATUS[status] ?? status}
            </span>
          </div>
        )}
        {studio && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs" style={{ color: "#6E6E90" }}>Studio:</span>
            <span className="text-xs font-bold text-white">{studio}</span>
          </div>
        )}
      </div>
      {start !== "?" && (
        <p className="text-xs" style={{ color: "#6E6E90" }}>
          <span className="text-white/60">Tayang: </span>
          <span className="font-semibold text-white/80">{start}</span>
          {isOngoing && <span style={{ color: "#00C9FF" }}> · Ongoing</span>}
          {!isOngoing && end && <span className="text-white/60"> – <span className="font-semibold text-white/80">{end}</span></span>}
          {!isOngoing && !end && rich.status === "FINISHED" && <span style={{ color: "#00FF9C" }}> · Tamat</span>}
        </p>
      )}
    </div>
  );
}

function TrailerEmbed({ trailerId }: { trailerId: string }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: "rgba(255,0,0,0.14)" }}>
        <span style={{ fontSize: 14 }}>▶️</span>
        <span className="text-xs font-black text-white tracking-wide">TRAILER RESMI</span>
      </div>
      <div style={{ aspectRatio: "16/9", background: "#000" }}>
        <iframe
          src={`https://www.youtube.com/embed/${trailerId}?rel=0&modestbranding=1`}
          className="w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="Anime Trailer"
        />
      </div>
    </div>
  );
}

/* ── PersonModal ───────────────────────────────────────────────────────────── */
interface PersonSeed {
  id: number;
  type: "staff" | "character";
  name: string;
  role: string;
  image?: string | null;
}

function fmtALDatePersonModal(d?: { year?: number | null; month?: number | null; day?: number | null } | null): string {
  if (!d?.year) return "";
  const parts: (string | number)[] = [];
  if (d.day) parts.push(d.day);
  if (d.month) parts.push(ID_MONTHS[d.month - 1]);
  parts.push(d.year);
  return parts.join(" ");
}

function PersonModal({ seed, onClose }: { seed: PersonSeed; onClose: () => void }) {
  const { data: detail, isLoading } = useQuery({
    queryKey: ["person-detail", seed.type, seed.id],
    queryFn: () => fetchPersonDetail(seed.id, seed.type),
    staleTime: 24 * 3600_000,
    enabled: seed.id > 0,
  });

  const photo = detail?.image?.large ?? detail?.image?.medium ?? seed.image;
  const name = detail?.name?.full ?? seed.name;
  const native = detail?.name?.native;
  const birth = fmtALDatePersonModal(detail?.dateOfBirth);
  const occupations = detail?.primaryOccupations;
  const bio = detail?.description;
  const animeWorks = detail?.anime ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl overflow-hidden overflow-y-auto"
        style={{
          background: "linear-gradient(180deg,#12121f 0%,#0a0a16 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderBottom: "none",
          maxHeight: "88vh",
          boxShadow: "0 -8px 48px rgba(0,0,0,0.7)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }} />
        </div>

        {/* Close button */}
        <div className="flex justify-end px-4 pt-1">
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <X size={16} className="text-white" />
          </button>
        </div>

        {/* Photo + basic info */}
        <div className="flex flex-col items-center px-6 pb-4">
          <div
            className="w-32 h-32 rounded-2xl overflow-hidden mb-4"
            style={{
              border: "2px solid rgba(167,139,250,0.4)",
              boxShadow: "0 0 32px rgba(167,139,250,0.2)",
            }}
          >
            {photo ? (
              <img src={photo} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-4xl"
                style={{ background: "rgba(255,255,255,0.06)" }}>
                {seed.type === "staff" ? "✍️" : "🎭"}
              </div>
            )}
          </div>

          <h2 className="text-lg font-black text-white text-center">{name}</h2>
          {native && (
            <p className="text-sm mt-0.5 text-center" style={{ color: "#6E6E90" }}>{native}</p>
          )}

          {/* Role badge */}
          <span className="mt-2 text-xs font-bold px-3 py-1 rounded-full"
            style={{ background: "rgba(255,107,0,0.15)", color: "#FF6B00", border: "1px solid rgba(255,107,0,0.25)" }}>
            {seed.role}
          </span>
        </div>

        {isLoading && (
          <div className="px-6 pb-6 space-y-3">
            {[80, 60, 100, 50].map((w, i) => (
              <div key={i} className="h-3 rounded-full animate-pulse" style={{ background: "rgba(255,255,255,0.06)", width: `${w}%` }} />
            ))}
          </div>
        )}

        {detail && (
          <div className="px-6 pb-8 space-y-4">
            {/* Stats row */}
            {(birth || detail.age || detail.gender || detail.homeTown) && (
              <div className="grid grid-cols-2 gap-2">
                {birth && (
                  <div className="rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#475569" }}>Lahir</p>
                    <p className="text-xs font-semibold text-white mt-0.5">{birth}</p>
                  </div>
                )}
                {detail.age && (
                  <div className="rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#475569" }}>Usia</p>
                    <p className="text-xs font-semibold text-white mt-0.5">{detail.age} tahun</p>
                  </div>
                )}
                {detail.gender && (
                  <div className="rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#475569" }}>Gender</p>
                    <p className="text-xs font-semibold text-white mt-0.5">{detail.gender}</p>
                  </div>
                )}
                {detail.homeTown && (
                  <div className="rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#475569" }}>Asal</p>
                    <p className="text-xs font-semibold text-white mt-0.5 truncate">{detail.homeTown}</p>
                  </div>
                )}
                {detail.yearsActive && detail.yearsActive.length > 0 && (
                  <div className="rounded-xl px-3 py-2.5 col-span-2"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#475569" }}>Aktif</p>
                    <p className="text-xs font-semibold text-white mt-0.5">
                      {detail.yearsActive[0]}{detail.yearsActive.length > 1 ? ` – ${detail.yearsActive[detail.yearsActive.length - 1]}` : " – sekarang"}
                    </p>
                  </div>
                )}
                {detail.bloodType && (
                  <div className="rounded-xl px-3 py-2.5"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#475569" }}>Gol. Darah</p>
                    <p className="text-xs font-semibold text-white mt-0.5">{detail.bloodType}</p>
                  </div>
                )}
              </div>
            )}

            {/* Occupations */}
            {occupations && occupations.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#475569" }}>Pekerjaan</p>
                <div className="flex flex-wrap gap-1.5">
                  {occupations.map((o, i) => (
                    <span key={i} className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: "rgba(96,165,250,0.1)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.2)" }}>
                      {o}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Bio / Description */}
            {bio && bio.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#475569" }}>
                  {seed.type === "character" ? "Tentang Karakter" : "Biografi"}
                </p>
                <ExpandableBio text={bio} />
              </div>
            )}

            {/* Works */}
            {animeWorks.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#475569" }}>
                  {seed.type === "character" ? "Muncul di Anime" : "Karya Anime"}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {animeWorks.map((w, i) => (
                    <div key={i} className="flex-shrink-0 flex flex-col items-center gap-1.5" style={{ width: 64 }}>
                      <div className="w-14 h-20 rounded-xl overflow-hidden"
                        style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
                        <img src={w.image} alt={w.title} className="w-full h-full object-cover" loading="lazy" />
                      </div>
                      <p className="text-[9px] text-center text-white/70 line-clamp-2 leading-tight">{w.title}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ExpandableBio({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 300;
  const short = text.length <= LIMIT || expanded;
  return (
    <div>
      <p className="text-xs leading-relaxed whitespace-pre-line" style={{ color: "#94A3B8" }}>
        {short ? text : text.slice(0, LIMIT) + "…"}
      </p>
      {text.length > LIMIT && (
        <button onClick={() => setExpanded(!expanded)}
          className="text-xs font-semibold mt-1.5" style={{ color: "#A78BFA" }}>
          {expanded ? "Lebih sedikit" : "Selengkapnya"}
        </button>
      )}
    </div>
  );
}

function StaffSection({ rich, onClickPerson }: { rich: AniListRichData; onClickPerson: (seed: PersonSeed) => void }) {
  const authors = (rich.staff?.edges ?? []).filter(e =>
    /original story|story|manga|original creator|creator|character design|director/i.test(e.role)
  );
  if (authors.length === 0) return null;
  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(15,15,27,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <h3 className="text-sm font-bold text-white mb-3">Staff / Pengarang</h3>
      <div className="flex gap-4 overflow-x-auto pb-1 scrollbar-hide">
        {authors.map((e, i) => (
          <button
            key={i}
            className="flex-shrink-0 flex flex-col items-center gap-1.5 transition-all active:scale-95"
            style={{ width: 68 }}
            onClick={() => onClickPerson({ id: e.node.id, type: "staff", name: e.node.name.full, role: e.role, image: e.node.image?.medium })}
          >
            <div className="w-14 h-14 rounded-full overflow-hidden relative"
              style={{ background: "rgba(255,255,255,0.06)", border: "1.5px solid rgba(255,107,0,0.4)", boxShadow: "0 0 10px rgba(255,107,0,0.15)" }}>
              {e.node.image?.medium
                ? <img src={e.node.image.medium} alt={e.node.name.full}
                    className="w-full h-full object-cover" loading="lazy" />
                : <div className="w-full h-full flex items-center justify-center text-xl">✍️</div>}
              <div className="absolute inset-0 rounded-full flex items-end justify-center pb-0.5"
                style={{ background: "linear-gradient(to top, rgba(0,0,0,0.35) 0%, transparent 50%)" }}>
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.7)" }}>👆</span>
              </div>
            </div>
            <p className="text-[10px] font-semibold text-white text-center leading-tight line-clamp-2">
              {e.node.name.full}
            </p>
            <p className="text-[9px] text-center font-medium line-clamp-1" style={{ color: "#FF6B00" }}>{e.role}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function SeiyuuSection({ rich, onClickPerson }: { rich: AniListRichData; onClickPerson: (seed: PersonSeed) => void }) {
  const edges = rich.characters?.edges ?? [];
  if (edges.length === 0) return null;
  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(15,15,27,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <h3 className="text-sm font-bold text-white mb-3">Karakter & Pengisi Suara</h3>
      <div className="space-y-2">
        {edges.map((edge, i) => {
          const va = edge.voiceActors?.[0];
          return (
            <div key={i} className="flex items-center gap-2 px-2 py-2 rounded-xl"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              {/* Character photo - clickable */}
              <button
                className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 transition-all active:scale-95 relative"
                style={{ border: "1.5px solid rgba(255,255,255,0.15)" }}
                onClick={() => onClickPerson({ id: edge.node.id, type: "character", name: edge.node.name.full, role: "Karakter", image: edge.node.image?.medium })}
              >
                {edge.node.image?.medium
                  ? <img src={edge.node.image.medium} alt={edge.node.name.full}
                      className="w-full h-full object-cover" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>🎭</div>}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{edge.node.name.full}</p>
                <p className="text-[10px]" style={{ color: "#6E6E90" }}>Karakter</p>
              </div>
              <span className="text-white/20 text-sm">→</span>
              {va ? (
                <>
                  <div className="flex-1 min-w-0 text-right">
                    <p className="text-xs font-bold text-white truncate">{va.name.full}</p>
                    <p className="text-[10px]" style={{ color: "#A78BFA" }}>CV (JP)</p>
                  </div>
                  {/* VA photo - clickable */}
                  <button
                    className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 transition-all active:scale-95"
                    style={{ border: "1.5px solid rgba(167,139,250,0.35)" }}
                    onClick={() => onClickPerson({ id: va.id, type: "staff", name: va.name.full, role: "Voice Actor (JP)", image: va.image?.medium })}
                  >
                    {va.image?.medium
                      ? <img src={va.image.medium} alt={va.name.full}
                          className="w-full h-full object-cover" loading="lazy" />
                      : <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>🎤</div>}
                  </button>
                </>
              ) : <div className="w-10 h-10 flex-shrink-0" />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 17;
  const circ = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  const dash = (circ * clamped) / 100;
  const isComplete = clamped >= 99;
  const color = isComplete ? "#00FF9C" : "#667eea";
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
      <circle cx="22" cy="22" r={r} fill="rgba(0,0,0,0.3)" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
      <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 22 22)"
        style={{ transition: "stroke-dasharray 0.4s ease" }} />
      <text x="22" y="22" textAnchor="middle" dominantBaseline="middle"
        fill={isComplete ? "#00FF9C" : "white"} fontSize="9" fontWeight="800">
        {clamped === 0 ? "0%" : `${Math.round(clamped)}%`}
      </text>
    </svg>
  );
}

/** Detect season number from anime title */
function extractSeasonInfo(title: string): { baseName: string; season: number } {
  const patterns = [
    /\s+Season\s+(\d+)/i, /\s+(\d+)(?:st|nd|rd|th)\s+Season/i,
    /\s+Part\s+(\d+)/i, /\s+Cour\s+(\d+)/i,
    /\s+(\d+)$/,
  ];
  for (const pat of patterns) {
    const m = title.match(pat);
    if (m) {
      const season = parseInt(m[1]);
      const baseName = title.replace(pat, "").replace(/\s+\(End\)/i, "").trim();
      return { baseName, season };
    }
  }
  return { baseName: title.replace(/\s+\(End\)/i, "").trim(), season: 1 };
}

/** Find related seasons from recommendedAnimeList */
function findSeasons(currentTitle: string, recommendedList: { title: string; animeId: string }[]) {
  const { baseName } = extractSeasonInfo(currentTitle);
  if (!baseName || baseName.length < 4) return [];

  const related = recommendedList.filter((r) => {
    const norm = r.title.toLowerCase().replace(/[^a-z0-9\s]/g, "");
    const base = baseName.toLowerCase().replace(/[^a-z0-9\s]/g, "");
    return norm.includes(base.slice(0, Math.min(base.length, 12))) ||
      base.includes(norm.slice(0, Math.min(norm.length, 12)));
  });

  const seasons: { title: string; animeId: string; season: number }[] = [];
  const currentInfo = extractSeasonInfo(currentTitle);
  seasons.push({ title: currentTitle, animeId: "", season: currentInfo.season });

  for (const r of related) {
    const info = extractSeasonInfo(r.title);
    if (!seasons.find((s) => s.season === info.season)) {
      seasons.push({ title: r.title, animeId: r.animeId, season: info.season });
    }
  }

  return seasons.sort((a, b) => a.season - b.season).filter((s) => seasons.length > 1);
}

/** Episode thumbnail using anime poster + episode number overlay */
function EpisodeThumbnail({ posterUrl, grad, epNum }: { posterUrl: string | null; grad: string; epNum: string }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="flex-shrink-0 relative overflow-hidden rounded-lg"
      style={{ width: 80, height: 52, background: grad }}>
      {posterUrl && (
        <img src={posterUrl} alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: loaded ? 1 : 0, transition: "opacity 0.4s ease", objectPosition: "center 20%" }}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setLoaded(false)}
        />
      )}
      {/* Dark overlay */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 100%)" }} />
      {/* Episode number */}
      <span className="absolute bottom-1 left-1.5 text-[10px] font-black text-white"
        style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}>
        {epNum}
      </span>
      {/* Glass sheen */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%)" }} />
    </div>
  );
}

export default function AnimeDetail() {
  const { animeId } = useParams<{ animeId: string }>();
  const [, setLocation] = useLocation();
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [sortDesc, setSortDesc] = useState(false);
  const [, forceUpdate] = useState(0);
  const [posterImgLoaded, setPosterImgLoaded] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [confetti, setConfetti] = useState<ConfettiParticle[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonSeed | null>(null);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const clearConfetti = useCallback(() => setConfetti([]), []);

  const { data: anime, isLoading, error } = useQuery({
    queryKey: ["anime", animeId],
    queryFn: () => fetchAnimeDetail(animeId!),
    enabled: !!animeId,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
  });

  const malPoster = usePoster(anime?.title ?? "");
  const bannerImg = useBanner(anime?.title ?? "");

  const { data: rich } = useQuery({
    queryKey: ["anilist-rich", anime?.title],
    queryFn: () => fetchAniListRichByTitle(anime!.title),
    enabled: !!anime?.title,
    staleTime: 6 * 3600_000,
  });

  if (!animeId) return null;

  const watchlistItem = getWatchlistItem(animeId);
  const favd = isFavorite(animeId);

  const handleToggleFavorite = () => {
    const wasFav = isFavorite(animeId);
    toggleFavorite(animeId);
    forceUpdate((n) => n + 1);
    if (!wasFav) {
      setConfetti(spawnConfetti());
      setTimeout(clearConfetti, 850);
    }
  };

  const handleStatusChange = (status: WatchStatus) => {
    if (!anime) return;
    upsertWatchlist({
      animeId, title: anime.title, poster: anime.poster, status,
      progress: watchlistItem?.progress ?? 0,
      totalEpisodes: parseInt(anime.episodes) || anime.episodeList?.length || 0,
    });
    setShowStatusPicker(false);
    forceUpdate((n) => n + 1);
  };

  const handleRemoveWatchlist = () => {
    removeWatchlist(animeId);
    setShowStatusPicker(false);
    forceUpdate((n) => n + 1);
  };

  const rawEpisodes = anime?.episodeList ?? [];
  const episodes = sortDesc ? [...rawEpisodes].reverse() : [...rawEpisodes];

  const progressMap: Record<string, WatchProgress | null> = {};
  rawEpisodes.forEach((ep) => { progressMap[ep.episodeId] = getProgress(ep.episodeId); });

  const lastWatched = rawEpisodes
    .filter((ep) => { const p = progressMap[ep.episodeId]; return p && p.position > 5; })
    .sort((a, b) => progressMap[b.episodeId]!.updatedAt - progressMap[a.episodeId]!.updatedAt)[0] ?? null;

  const lastWatchedProgress = lastWatched ? progressMap[lastWatched.episodeId] : null;
  const lastWatchedPct = lastWatchedProgress
    ? Math.round((lastWatchedProgress.position / lastWatchedProgress.duration) * 100) : 0;

  const firstEp = rawEpisodes.length > 0 ? rawEpisodes[rawEpisodes.length - 1] : null;
  const continueEp = lastWatched ?? firstEp;

  const synopsis = anime ? getSynopsisText(anime.synopsis) : "";
  const genres = anime?.genreList?.map((g) => g.title) ?? [];

  // Multi-season detection
  const seasons = anime ? findSeasons(anime.title, anime.recommendedAnimeList ?? []) : [];

  const [grad] = anime ? titlePlaceholder(anime.title) : ["#0f0f1b", ""];

  const airDateMap = new Map<number, number>();
  rich?.airingSchedule?.nodes?.forEach(n => airDateMap.set(n.episode, n.airingAt));

  if (isLoading) {
    return (
      <div className="min-h-screen pb-24" style={{ background: "#07070e" }}>
        <div className="h-[280px] animate-pulse" style={{ background: "#161625" }} />
        <div className="px-4 py-4 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "#161625" }} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !anime) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#07070e" }}>
        <div className="text-center space-y-3">
          <p className="text-white font-bold">Gagal memuat anime</p>
          <button onClick={() => setLocation("/")} className="text-sm" style={{ color: "#FF6B00" }}>Kembali</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "#07070e", paddingBottom: lastWatched ? "120px" : "96px" }}>
      {/* Poster Header with parallax */}
      <div className="relative" style={{ height: "280px" }}>
        <div className="absolute inset-0" style={{ background: grad }} />
        {(bannerImg ?? malPoster) && (
          <img src={bannerImg ?? malPoster ?? ""}
            alt={anime.title}
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              opacity: posterImgLoaded ? 1 : 0, transition: "opacity 0.7s ease",
              objectPosition: bannerImg ? "center 25%" : "center 20%",
              transform: `scale(1.02)`,
              transformOrigin: "center center",
            }}
            onLoad={() => setPosterImgLoaded(true)}
            onError={() => setPosterImgLoaded(false)}
          />
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 35%, rgba(7,7,14,1) 100%)" }} />
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 pt-8">
          <button onClick={() => history.back()}
            className="w-9 h-9 flex items-center justify-center rounded-full"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(10px)" }}
            data-testid="btn-back">
            <ArrowLeft size={20} className="text-white" />
          </button>
          <button onClick={handleToggleFavorite}
            className="w-9 h-9 flex items-center justify-center rounded-full"
            style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(10px)" }}
            data-testid="btn-favorite">
            {favd ? <BookmarkCheck size={20} style={{ color: "#FF6B00" }} /> : <Bookmark size={20} className="text-white" />}
          </button>
        </div>
      </div>

      <div className="px-4 -mt-2 space-y-4">
        {/* Title & Meta */}
        <div>
          <div className="flex items-start justify-between gap-2">
            <h1 className="text-xl font-bold text-white leading-tight flex-1">{anime.title}</h1>
            {anime.score && (
              <div className="flex items-center gap-1 flex-shrink-0 mt-1">
                <Star size={14} fill="#FFD700" style={{ color: "#FFD700" }} />
                <span className="text-sm font-bold" style={{ color: "#FFD700" }}>{anime.score}</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {[anime.studios, anime.type, anime.status, anime.aired].filter(Boolean).map((info, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: "rgba(255,255,255,0.07)", color: "#6E6E90" }}>
                {String(info)}
              </span>
            ))}
          </div>
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {genres.map((g) => (
                <span key={g} className="text-xs px-2 py-0.5 rounded-full font-semibold"
                  style={{ background: "rgba(255,107,0,0.15)", color: "#FF6B00", border: "1px solid rgba(255,107,0,0.2)" }}>
                  {g}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* AniList Info Bar */}
        {rich && <InfoBar rich={rich} />}

        {/* Multi-Season Navigator */}
        {seasons.length > 1 && (
          <div className="rounded-xl p-3"
            style={{
              background: "rgba(15,15,27,0.6)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}>
            <div className="flex items-center gap-2 mb-2.5">
              <Layers size={13} style={{ color: "#A78BFA" }} />
              <span className="text-xs font-bold" style={{ color: "#A78BFA" }}>MULTI-SEASON</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {seasons.map((s) => {
                const isCurrent = s.animeId === "" || s.animeId === animeId;
                return (
                  <button
                    key={s.season}
                    onClick={() => !isCurrent && s.animeId && setLocation(`/anime/${s.animeId}`)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
                    style={{
                      background: isCurrent ? "rgba(167,139,250,0.2)" : "rgba(255,255,255,0.06)",
                      border: isCurrent ? "1px solid rgba(167,139,250,0.5)" : "1px solid rgba(255,255,255,0.08)",
                      color: isCurrent ? "#A78BFA" : "#6E6E90",
                      boxShadow: isCurrent ? "0 0 12px rgba(167,139,250,0.3)" : "none",
                      cursor: isCurrent ? "default" : "pointer",
                    }}>
                    Season {s.season}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Trailer */}
        {rich?.trailer?.site === "youtube" && rich.trailer.id && (
          <TrailerEmbed trailerId={rich.trailer.id} />
        )}

        {/* Synopsis */}
        {synopsis ? (
          <div className="rounded-xl p-4"
            style={{
              background: "rgba(15,15,27,0.6)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
            <h3 className="text-sm font-bold text-white mb-2">Sinopsis</h3>
            <p className={`text-sm leading-relaxed ${synopsisExpanded ? "" : "line-clamp-4"}`} style={{ color: "#a0a0b8" }}>
              {synopsis}
            </p>
            <button onClick={() => setSynopsisExpanded(!synopsisExpanded)}
              className="flex items-center gap-1 text-xs font-semibold mt-2"
              style={{ color: "#FF6B00" }}
              data-testid="btn-synopsis-toggle">
              {synopsisExpanded ? <><ChevronUp size={14} /> Sembunyikan</> : <><ChevronDown size={14} /> Selengkapnya</>}
            </button>
          </div>
        ) : null}

        {/* Staff / Author */}
        {rich && <StaffSection rich={rich} onClickPerson={setSelectedPerson} />}

        {/* Seiyuu / Voice Actors */}
        {rich && <SeiyuuSection rich={rich} onClickPerson={setSelectedPerson} />}

        {/* Action Buttons */}
        <div className="flex gap-3">
          {continueEp && (
            <button
              onClick={() => setLocation(`/watch/${continueEp.episodeId}`)}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg,#FF6B00,#FF4444)", color: "#fff", boxShadow: "0 4px 20px rgba(255,107,0,0.35)" }}
              data-testid="btn-start-watch">
              <Play size={16} fill="white" />
              {lastWatched ? `Lanjutkan Ep ${lastWatched.title}` : "Mulai Nonton"}
            </button>
          )}
          <div className="relative">
            <button
              onClick={() => setShowStatusPicker(!showStatusPicker)}
              className="flex items-center gap-2 px-4 py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
              style={{
                background: watchlistItem ? `${STATUS_COLORS[watchlistItem.status]}22` : "rgba(255,255,255,0.07)",
                color: watchlistItem ? STATUS_COLORS[watchlistItem.status] : "#6E6E90",
                border: watchlistItem ? `1px solid ${STATUS_COLORS[watchlistItem.status]}44` : "1px solid rgba(255,255,255,0.08)",
                minWidth: "130px",
                backdropFilter: "blur(8px)",
              }}
              data-testid="btn-watchlist-status">
              {watchlistItem ? STATUS_LABELS[watchlistItem.status] : "Tambah Daftar"}
              <ChevronDown size={14} />
            </button>
            {showStatusPicker && (
              <div className="absolute bottom-full mb-2 right-0 w-48 rounded-xl overflow-hidden z-20"
                style={{
                  background: "rgba(22,22,37,0.95)",
                  backdropFilter: "blur(24px)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}>
                {(Object.entries(STATUS_LABELS) as [WatchStatus, string][]).map(([s, label]) => (
                  <button key={s} onClick={() => handleStatusChange(s)}
                    className="block w-full px-4 py-2.5 text-sm text-left hover:bg-white/5 transition-colors"
                    style={{ color: STATUS_COLORS[s] }} data-testid={`status-option-${s}`}>
                    {label}
                  </button>
                ))}
                {watchlistItem && (
                  <button onClick={handleRemoveWatchlist}
                    className="block w-full px-4 py-2.5 text-sm text-left hover:bg-white/5 transition-colors border-t"
                    style={{ color: "#FF4444", borderColor: "rgba(255,255,255,0.05)" }}
                    data-testid="btn-remove-watchlist">
                    Hapus dari Daftar
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Nobar Button */}
        {animeId && anime && (
          <button
            onClick={() => {
              const p = new URLSearchParams({
                anime: animeId,
                title: anime.title,
                ...(continueEp ? { episode: continueEp.episodeId, epTitle: continueEp.title } : {}),
              });
              setLocation(`/nobar?${p.toString()}`);
            }}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
            style={{
              background: "linear-gradient(135deg,rgba(255,107,0,0.12),rgba(255,68,68,0.08))",
              border: "1px solid rgba(255,107,0,0.28)",
              color: "#FF8C42",
              boxShadow: "0 0 18px rgba(255,107,0,0.1)",
            }}
            data-testid="btn-nobar"
          >
            🍿 Nobar Anime Ini
          </button>
        )}

        {/* Episode List with Thumbnails */}
        {episodes.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-white">
                Episode ({anime.episodeList.length}{anime.episodes && anime.episodes !== "Unknown" ? ` / ${anime.episodes}` : ""})
              </h3>
              <button
                onClick={() => setSortDesc(!sortDesc)}
                className="text-xs font-semibold flex items-center gap-1 px-2 py-1 rounded-lg"
                style={{ background: "rgba(255,255,255,0.06)", color: "#6E6E90" }}
                data-testid="btn-sort-episodes">
                {sortDesc ? <><ChevronDown size={12} /> Terbaru</> : <><ChevronUp size={12} /> Terlama</>}
              </button>
            </div>
            <div className="space-y-2">
              {episodes.map((ep) => {
                const prog = progressMap[ep.episodeId];
                const pct = prog && prog.duration > 0
                  ? Math.min(100, (prog.position / prog.duration) * 100) : 0;
                const hasProgress = prog && prog.position > 5;
                const isCurrentEp = lastWatched?.episodeId === ep.episodeId;

                return (
                  <button
                    key={ep.episodeId}
                    onClick={() => setLocation(`/watch/${ep.episodeId}`)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all active:scale-[0.98]"
                    style={{
                      background: isCurrentEp
                        ? "rgba(102,126,234,0.12)"
                        : hasProgress
                        ? "rgba(0,201,255,0.06)"
                        : "rgba(15,15,27,0.6)",
                      backdropFilter: "blur(16px) saturate(160%)",
                      border: `1px solid ${
                        isCurrentEp ? "rgba(102,126,234,0.35)"
                        : hasProgress ? "rgba(0,201,255,0.15)"
                        : "rgba(255,255,255,0.07)"
                      }`,
                      boxShadow: isCurrentEp ? "0 2px 16px rgba(102,126,234,0.15)" : "none",
                    }}
                    data-testid={`episode-${ep.episodeId}`}
                  >
                    {/* Episode Thumbnail */}
                    <EpisodeThumbnail
                      posterUrl={malPoster}
                      grad={grad}
                      epNum={`EP ${ep.title}`}
                    />

                    {/* Episode info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">Episode {ep.title}</p>
                      {(() => {
                        const epNum = parseInt(ep.title);
                        const airAt = !isNaN(epNum) ? airDateMap.get(epNum) : undefined;
                        return airAt ? (
                          <p className="text-[10px] mt-0.5 font-medium" style={{ color: "#A78BFA" }}>
                            🗓 {fmtEpDate(airAt)}
                          </p>
                        ) : null;
                      })()}
                      {hasProgress && prog && (
                        <>
                          <p className="text-xs mt-0.5" style={{ color: "#6E6E90", fontVariantNumeric: "tabular-nums" }}>
                            {fmt(prog.position)} / {fmt(prog.duration)}
                          </p>
                          {/* Progress bar */}
                          <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                            <div className="h-full rounded-full transition-all" style={{
                              width: `${pct}%`,
                              background: pct >= 99 ? "#00FF9C" : "linear-gradient(90deg, #667eea, #764ba2)",
                            }} />
                          </div>
                        </>
                      )}
                    </div>

                    {/* Progress ring or play */}
                    {hasProgress ? (
                      <ProgressRing pct={pct} />
                    ) : (
                      <div className="w-8 h-8 flex items-center justify-center rounded-full flex-shrink-0"
                        style={{ background: "rgba(255,107,0,0.12)", border: "1px solid rgba(255,107,0,0.2)" }}>
                        <Play size={12} style={{ color: "#FF6B00" }} fill="#FF6B00" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Related Anime */}
        {(anime.recommendedAnimeList?.length ?? 0) > 0 && (
          <section className="pb-4">
            <h3 className="text-base font-bold text-white mb-3">Anime Terkait</h3>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
              {anime.recommendedAnimeList.map((r) => (
                <div key={r.animeId} className="flex-shrink-0 w-[100px]">
                  <AnimeCard anime={r} variant="poster" />
                </div>
              ))}
            </div>
          </section>
        )}

        <CommentsSection animeId={animeId} />
      </div>

      {/* Person Modal */}
      {selectedPerson && (
        <PersonModal seed={selectedPerson} onClose={() => setSelectedPerson(null)} />
      )}

      {/* Confetti */}
      {confetti.map((p) => (
        <div key={p.id} className="confetti-particle"
          style={{
            position: "fixed", top: 80, right: 24,
            width: p.size, height: p.size,
            borderRadius: p.id % 3 === 0 ? "50%" : "2px",
            background: p.color, zIndex: 999, pointerEvents: "none",
            boxShadow: `0 0 6px ${p.color}`,
            ["--tx" as string]: `${p.tx}px`,
            ["--ty" as string]: `${p.ty}px`,
          }}
        />
      ))}

      {/* Continue watching sticky bar */}
      {lastWatched && lastWatchedProgress && (
        <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-3"
          style={{ background: "linear-gradient(to top, rgba(7,7,14,1) 60%, rgba(7,7,14,0))" }}>
          <button
            onClick={() => setLocation(`/watch/${lastWatched.episodeId}`)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, rgba(102,126,234,0.95), rgba(118,75,162,0.95))",
              boxShadow: "0 8px 32px rgba(102,126,234,0.4)",
            }}>
            <div className="w-10 h-10 flex items-center justify-center rounded-xl flex-shrink-0"
              style={{ background: "rgba(255,255,255,0.15)" }}>
              <Play size={18} fill="white" color="white" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-bold text-white/70 uppercase tracking-wider">Lanjutkan Menonton</p>
              <p className="text-sm font-bold text-white truncate mt-0.5">
                Ep {lastWatched.title} · {fmt(lastWatchedProgress.position)} / {fmt(lastWatchedProgress.duration)}
              </p>
            </div>
            <ProgressRing pct={lastWatchedPct} />
          </button>
        </div>
      )}
    </div>
  );
}
