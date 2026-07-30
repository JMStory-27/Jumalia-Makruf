import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useParams, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bookmark, BookmarkCheck, Star, Play, ChevronDown, ChevronUp, Layers, X, Loader2 } from "lucide-react";
import { fetchAnimeDetail, getSynopsisText, fetchSearch, fetchBiosBatch, triggerAnimeBioCrawl, fetchAnimeRichCache } from "@/lib/api";
import type { AnimeRichCacheEntry } from "@/lib/api";
import { getWatchCount } from "@/lib/episodeMeta";
import CommentsSection from "@/components/CommentsSection";
import {
  getWatchlistItem, upsertWatchlist, removeWatchlist,
  toggleFavorite, isFavorite, getProgress,
} from "@/lib/storage";
import type { WatchStatus, WatchProgress } from "@/lib/storage";
import AnimeCard from "@/components/AnimeCard";
import { titlePlaceholder } from "@/lib/utils";
import { useAnimeInfo } from "@/lib/usePoster";
import { getCardPoster } from "@/lib/animeCardCache";
import { useBanner } from "@/lib/useBanner";
import { fetchAniListRichByTitle, fetchPersonDetail, fetchPersonBioId, clearRichCache, getPersonMemSync } from "@/lib/anilist";
import type { AniListRichData, PersonDetail } from "@/lib/anilist";
import AnimeAIChat from "@/components/AnimeAIChat";
import { proxyImg } from "@/lib/utils";

/** Konversi AnimeRichCacheEntry (format scraper/server cache) ke AniListRichData (format frontend).
 *  Dipakai sebagai fallback saat AniList tidak merespons atau anime tidak ditemukan di AniList.
 *  Jika cache punya id (dari scraper terbaru), PersonModal bisa load bio. Kalau id = 0,
 *  PersonModal tetap buka tapi tidak load detail tambahan (fine as graceful degradation). */
function cacheEntryToRichData(entry: AnimeRichCacheEntry): AniListRichData {
  return {
    id: entry.anilistId ?? 0,
    idMal: entry.malId ?? null,
    bannerImage: entry.banner ?? null,
    format: entry.type ?? null,
    trailer: entry.trailer ? { id: entry.trailer.id, site: entry.trailer.site } : null,
    status: entry.status ?? null,
    season: entry.season ?? null,
    seasonYear: entry.seasonYear ?? null,
    studios: {
      nodes: (entry.studios ?? []).map(s => ({
        name: s.name,
        isAnimationStudio: s.isMain ?? false,
      })),
    },
    staff: {
      edges: (entry.staff ?? [])
        .filter(s => s.name)
        .map(s => ({
          role: s.role,
          node: {
            id: (s as { id?: number | null }).id ?? 0,
            name: { full: s.name! },
            image: s.image ? { medium: s.image } : null,
          },
        })),
    },
    characters: {
      edges: (entry.characters ?? [])
        .filter(c => c.name)
        .map(c => ({
          role: c.role,
          node: {
            id: (c as { id?: number | null }).id ?? 0,
            name: { full: c.name! },
            image: c.image ? { medium: c.image } : null,
            gender: null,
          },
          voiceActors: (c.voiceActors ?? [])
            .filter(va => va.name)
            .map(va => ({
              id: (va as { id?: number | null }).id ?? 0,
              name: { full: va.name! },
              image: va.image ? { medium: va.image } : null,
            })),
        })),
    },
    relations: { edges: [] },
  };
}

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

/* ── Terjemahan ke Bahasa Indonesia ─────────────────────────────────────── */
const GENDER_ID: Record<string, string> = {
  Male: "Laki-laki", Female: "Perempuan",
  male: "Laki-laki", female: "Perempuan",
  "Non-binary": "Non-biner", Nonbinary: "Non-biner",
  Unknown: "Tidak Diketahui",
};

const OCCUPATION_ID: Record<string, string> = {
  "Voice Actor": "Pengisi Suara",
  "Vocalist": "Vokalis",
  "Singer": "Penyanyi",
  "Musician": "Musisi",
  "Director": "Sutradara",
  "Animator": "Animator",
  "Actress": "Aktris",
  "Actor": "Aktor",
  "Songwriter": "Penulis Lagu",
  "Composer": "Komposer",
  "Lyricist": "Penulis Lirik",
  "Model": "Model",
  "Idol": "Idol",
  "Narrator": "Narator",
  "Script Writer": "Penulis Skrip",
  "Producer": "Produser",
  "Author": "Penulis",
  "Mangaka": "Mangaka",
  "Illustrator": "Ilustrator",
  "Entrepreneur": "Wirausahawan",
  "Dancer": "Penari",
  "Poet": "Penyair",
};
function translateOccupation(o: string): string { return OCCUPATION_ID[o] ?? o; }

const STAFF_ROLE_ID: Record<string, string> = {
  "Original Story": "Cerita Asli",
  "Story": "Cerita",
  "Manga": "Manga",
  "Original Creator": "Kreator Asli",
  "Creator": "Kreator",
  "Author": "Penulis",
  "Original Work": "Karya Asli",
  "Light Novel": "Light Novel",
  "Novel": "Novel",
  "Game": "Game",
  "Character Design": "Desain Karakter",
  "Original Character Design": "Desain Karakter Asli",
  "Assistant Character Design": "Asst. Desain Karakter",
  "Sub Character Design": "Sub Desain Karakter",
  "Director": "Sutradara",
  "Assistant Director": "Asst. Sutradara",
  "Episode Director": "Sutradara Episode",
  "Series Director": "Sutradara Seri",
  "Chief Director": "Sutradara Kepala",
  "Script": "Skenario",
  "Script Writer": "Penulis Skrip",
  "Series Composition": "Komposisi Seri",
  "Art Director": "Direktur Seni",
  "Music": "Musik",
  "Music Director": "Direktur Musik",
  "Music Production": "Produksi Musik",
  "Sound Director": "Direktur Suara",
  "Animation Director": "Direktur Animasi",
  "Chief Animation Director": "Dir. Animasi Utama",
  "Assistant Animation Director": "Asst. Dir. Animasi",
  "Mechanical Animation Director": "Dir. Animasi Mekanik",
  "Producer": "Produser",
  "Executive Producer": "Produser Eksekutif",
  "Line Producer": "Line Produser",
  "Editor": "Editor",
  "Storyboard": "Storyboard",
  "Key Animation": "Animasi Kunci",
  "Background Art": "Seni Latar",
  "Color Design": "Desain Warna",
  "Color Setting": "Pengaturan Warna",
  "3D Director": "Direktur 3D",
  "Prop Design": "Desain Properti",
  "Concept Art": "Seni Konsep",
  "Photography": "Sinematografi",
  "Photography Director": "Direktur Fotografi",
  "CG Director": "Direktur CG",
  "Screenplay": "Skenario Film",
  "Illustrator": "Ilustrator",
  "Adaptation": "Adaptasi",
  "Planning": "Perencanaan",
  "Action Animation Director": "Dir. Animasi Aksi",
  "Unit Director": "Sutradara Unit",
  "2nd Key Animation": "Animasi Kunci 2",
  "In-Between Animation": "Animasi Antara",
  "Finish Animation": "Animasi Akhir",
  "Special Effects": "Efek Khusus",
  "Insert Song": "Lagu Sisipan",
  "Opening Theme Song": "Lagu Pembuka",
  "Ending Theme Song": "Lagu Penutup",
  "Theme Song Composition": "Komposisi Lagu Tema",
  "Theme Song Lyrics": "Lirik Lagu Tema",
  "Theme Song Performance": "Penampilan Lagu Tema",
  "Setting Design": "Desain Setting",
  "Monster Design": "Desain Monster",
  "Weapon Design": "Desain Senjata",
  "Casting": "Casting",
  "ADR Director": "Direktur ADR",
  "Recording": "Rekaman",
  "Mixing": "Mixing",
};
function translateStaffRole(role: string | null | undefined): string {
  if (!role) return "Pengarang";
  if (STAFF_ROLE_ID[role]) return STAFF_ROLE_ID[role];
  const lc = role.toLowerCase();
  if (lc.startsWith("assistant ")) {
    const base = role.slice("assistant ".length);
    const translated = STAFF_ROLE_ID[base];
    if (translated) return `Asst. ${translated}`;
  }
  return role || "Pengarang";
}

function translateRelationType(type: string): string {
  const map: Record<string, string> = {
    SEQUEL: "Sekuel", PREQUEL: "Prequel", ALTERNATIVE: "Alternatif",
    SIDE_STORY: "Cerita Sampingan", PARENT: "Induk", SUMMARY: "Rangkuman",
    SPIN_OFF: "Spin-off", OTHER: "Terkait", SOURCE: "Sumber",
    ADAPTATION: "Adaptasi", CHARACTER: "Karakter", CONTAINS: "Bagian Dari",
    COMPILATION: "Kompilasi",
  };
  return map[type] ?? type;
}

/** SafeImg: img dengan onError → tampilkan fallback. Dipakai di StaffSection & SeiyuuSection. */
function SafeImg({ src, alt, className, fallback }: {
  src?: string | null;
  alt: string;
  className?: string;
  fallback: React.ReactNode;
}) {
  const [err, setErr] = useState(false);
  if (!src || err) return <>{fallback}</>;
  return (
    <img
      src={src} alt={alt} className={className}
      loading="lazy" onError={() => setErr(true)}
    />
  );
}
function translateSeedRole(role: string): string {
  return role.replace("Voice Actor", "Pengisi Suara");
}

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
  const [, navigate] = useLocation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const bioSectionRef = useRef<HTMLDivElement>(null);
  const [navigatingWork, setNavigatingWork] = useState<number | null>(null);
  const [personLoadingTooLong, setPersonLoadingTooLong] = useState(false);

  // Cek PERSON_MEM synchronously — kalau sudah pernah diklik di sesi ini,
  // initialData langsung diisi dan skeleton tidak pernah muncul.
  const _memDetail = getPersonMemSync(seed.id, seed.type);
  const { data: detail, isLoading, isError, refetch: refetchDetail, isFetching } = useQuery({
    queryKey: ["person-detail", seed.type, seed.id],
    queryFn: () => fetchPersonDetail(seed.id, seed.type),
    staleTime: Infinity,       // data staf/karakter bersifat permanen
    gcTime: Infinity,          // jangan hapus dari query cache selama sesi
    enabled: seed.id > 0,
    initialData: _memDetail,   // instant: tidak ada skeleton kalau sudah di memory
    retry: 1,                  // cukup 1 retry — anilistQuery sudah punya 6 attempt internal
    retryDelay: 1500,
  });

  // Tampilkan tombol "Coba Lagi" lebih cepat (5s) supaya user tidak terjebak skeleton lama
  useEffect(() => {
    if (!isLoading) { setPersonLoadingTooLong(false); return; }
    setPersonLoadingTooLong(false);
    const t = setTimeout(() => setPersonLoadingTooLong(true), 5_000);
    return () => clearTimeout(t);
  }, [isLoading, seed.id]);

  const photo = detail?.image?.large ?? detail?.image?.medium ?? seed.image;
  const name = detail?.name?.full ?? seed.name;
  const native = detail?.name?.native;
  const birth = fmtALDatePersonModal(detail?.dateOfBirth);
  const occupations = detail?.primaryOccupations;
  const animeWorks = detail?.anime ?? [];

  // Bio: Wikipedia Indonesia (Bahasa Indonesia) jika ada, fallback AniList description
  // Data sudah di-prefetch background saat halaman detail terbuka → langsung muncul
  const { data: wikiBio, isLoading: wikiBioLoading } = useQuery({
    queryKey: ["person-bio-id", name],
    queryFn: () => fetchPersonBioId(name, detail?.description ?? ""),
    staleTime: 7 * 24 * 3600_000,
    enabled: !!detail,
  });

  // Bio: server cache (Wikipedia ID/EN → AniList) dengan fallback langsung ke AniList description
  // wikiBio bisa ""/undefined — gunakan || agar "" dianggap falsy dan jatuh ke description
  const bio = wikiBio || detail?.description || "";
  const bioLoading = isLoading || (wikiBioLoading && !detail?.description && !wikiBio);

  // Reset scroll ke atas saat modal pertama buka
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    // Kunci scroll body (penting untuk Android agar background tidak ikut scroll)
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [seed.id]);

  // Auto-scroll ke bio dihapus — sheet selalu mulai dari atas (nama/foto tampil penuh)

  // Klik karya anime → cari di OtakuDesu → navigate langsung
  const handleWorkClick = async (work: { id: number; title: string }) => {
    setNavigatingWork(work.id);
    try {
      const result = await fetchSearch(work.title);
      if (result.animeList.length > 0) {
        onClose();
        navigate(`/anime/${result.animeList[0].animeId}`);
        return;
      }
      // Fallback: coba judul lebih pendek (tanpa season info)
      const shortTitle = work.title.replace(/\s*(Season\s*\d+|Part\s*\d+|\d+th\s*Season|\(\w+\))$/i, "").trim();
      if (shortTitle !== work.title) {
        const r2 = await fetchSearch(shortTitle);
        if (r2.animeList.length > 0) {
          onClose();
          navigate(`/anime/${r2.animeList[0].animeId}`);
          return;
        }
      }
    } catch {}
    // Tidak ketemu — pergi ke halaman cari dengan query
    onClose();
    navigate(`/cari?q=${encodeURIComponent(work.title)}`);
  };

  return createPortal(
    <>
      {/* ── Backdrop ── */}
      <div
        style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "rgba(0,0,0,0.78)",
        }}
        onClick={onClose}
      />

      {/* ── Bottom Sheet ── */}
      <div
        ref={scrollRef}
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          zIndex: 9999,
          overflowY: "auto",
          background: "linear-gradient(180deg,#16162a 0%,#0d0d1e 100%)",
          borderTop: "1px solid rgba(255,255,255,0.12)",
          borderRadius: "24px 24px 0 0",
          minHeight: "80dvh",
          maxHeight: "90dvh",
          boxShadow: "0 -12px 48px rgba(0,0,0,0.8)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle + close */}
        <div className="sticky top-0 z-10 flex items-center justify-between px-4 pt-3 pb-2"
          style={{ background: "linear-gradient(180deg,#12121f 80%,transparent)" }}>
          <div className="w-10 h-1 rounded-full mx-auto" style={{ background: "rgba(255,255,255,0.2)", position: "absolute", left: "50%", transform: "translateX(-50%)", top: 12 }} />
          <div style={{ width: 32 }} />
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full ml-auto"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <X size={16} className="text-white" />
          </button>
        </div>

        {/* ── Compact header: foto kiri, nama kanan ── */}
        <div className="flex items-center gap-3 px-4 pb-3">
          <div className="w-20 h-20 rounded-2xl overflow-hidden flex-shrink-0"
            style={{ border: "2px solid rgba(167,139,250,0.5)", boxShadow: "0 0 20px rgba(167,139,250,0.2)" }}>
            {photo ? (
              <img src={proxyImg(photo, 160)} alt={name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl"
                style={{ background: "rgba(255,255,255,0.06)" }}>
                {seed.type === "staff" ? "✍️" : "🎭"}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-black text-white leading-tight">{name}</h2>
            {native && <p className="text-xs mt-0.5" style={{ color: "#6E6E90" }}>{native}</p>}
            <span className="inline-block mt-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full"
              style={{ background: "rgba(255,107,0,0.15)", color: "#FF6B00", border: "1px solid rgba(255,107,0,0.25)" }}>
              {translateSeedRole(translateStaffRole(seed.role))}
            </span>
          </div>
        </div>

        {/* ── Skeleton saat loading ── */}
        {isLoading && (
          <div className="px-4 pb-4 space-y-3">
            {[90, 70, 100, 60, 80].map((w, i) => (
              <div key={i} className="h-3 rounded-full animate-pulse"
                style={{ background: "rgba(255,255,255,0.06)", width: `${w}%` }} />
            ))}
            {/* Tombol muat ulang muncul kalau sudah >10 detik — user tidak terjebak skeleton selamanya */}
            {personLoadingTooLong && (
              <div className="flex justify-center pt-2 pb-2">
                <button
                  onClick={() => { setPersonLoadingTooLong(false); refetchDetail(); }}
                  disabled={isFetching}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold px-4 py-2 rounded-full transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: "rgba(96,165,250,0.12)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.3)" }}
                >
                  {isFetching ? "⏳ Memuat..." : "🔄 Muat Ulang Data"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Fallback: data tidak bisa dimuat ── */}
        {!isLoading && !isFetching && !detail && (
          <div className="px-4 pb-8 space-y-3">
            {/* Peran di anime ini — selalu tampil */}
            <div className="flex items-center gap-2 px-1">
              <span className="text-[10px] font-medium" style={{ color: "#475569" }}>Peran:</span>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                style={{ background: "rgba(255,107,0,0.12)", color: "#FF6B00", border: "1px solid rgba(255,107,0,0.2)" }}>
                {translateSeedRole(translateStaffRole(seed.role))}
              </span>
            </div>
            {/* Pesan gagal + retry — hanya kalau ada AniList ID */}
            {seed.id > 0 ? (
              <div className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-[11px]" style={{ color: "#4A4A6A" }}>
                  {isError ? "⚠️ Gagal memuat. Cek koneksi." : "ℹ️ Info lengkap tidak tersedia."}
                </p>
                <button
                  onClick={() => { if (!isFetching) refetchDetail(); }}
                  disabled={isFetching}
                  className="flex-shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-full transition-all active:scale-95 disabled:opacity-50"
                  style={{ background: "rgba(96,165,250,0.12)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.25)" }}
                >
                  {isFetching ? "⏳" : "🔄 Coba"}
                </button>
              </div>
            ) : (
              <p className="text-[11px] px-1" style={{ color: "#4A4A6A" }}>
                Detail tidak tersedia — data AniList belum ada untuk orang ini.
              </p>
            )}
          </div>
        )}
        {!isLoading && isFetching && !detail && (
          <div className="px-4 pb-6 space-y-3">
            {[90, 70, 100, 60, 80].map((w, i) => (
              <div key={i} className="h-3 rounded-full animate-pulse"
                style={{ background: "rgba(255,255,255,0.06)", width: `${w}%` }} />
            ))}
          </div>
        )}

        {detail && (
          <div className="px-4 pb-8 space-y-4">

            {/* ── Stats grid ── */}
            {(birth || detail.age || detail.gender || detail.homeTown || (detail.yearsActive?.length ?? 0) > 0 || detail.bloodType || (detail.languageV2 && seed.type === "staff")) && (
              <div className="grid grid-cols-2 gap-2">
                {birth && (
                  <div className="rounded-xl px-3 py-2"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#475569" }}>Lahir</p>
                    <p className="text-xs font-semibold text-white mt-0.5">{birth}</p>
                  </div>
                )}
                {detail.age && (
                  <div className="rounded-xl px-3 py-2"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#475569" }}>Usia</p>
                    <p className="text-xs font-semibold text-white mt-0.5">{detail.age} tahun</p>
                  </div>
                )}
                {detail.gender && (
                  <div className="rounded-xl px-3 py-2"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#475569" }}>Gender</p>
                    <p className="text-xs font-semibold text-white mt-0.5">{GENDER_ID[detail.gender ?? ""] ?? detail.gender}</p>
                  </div>
                )}
                {detail.homeTown && (
                  <div className="rounded-xl px-3 py-2"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#475569" }}>Asal</p>
                    <p className="text-xs font-semibold text-white mt-0.5 truncate">{detail.homeTown}</p>
                  </div>
                )}
                {(detail.yearsActive?.length ?? 0) > 0 && (
                  <div className="rounded-xl px-3 py-2 col-span-2"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#475569" }}>Aktif</p>
                    <p className="text-xs font-semibold text-white mt-0.5">
                      {detail.yearsActive![0]}{detail.yearsActive!.length > 1 ? ` – ${detail.yearsActive![detail.yearsActive!.length - 1]}` : " – sekarang"}
                    </p>
                  </div>
                )}
                {detail.bloodType && (
                  <div className="rounded-xl px-3 py-2"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#475569" }}>Gol. Darah</p>
                    <p className="text-xs font-semibold text-white mt-0.5">{detail.bloodType}</p>
                  </div>
                )}
                {detail.languageV2 && seed.type === "staff" && (
                  <div className="rounded-xl px-3 py-2"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
                    <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: "#475569" }}>Bahasa</p>
                    <p className="text-xs font-semibold text-white mt-0.5">{detail.languageV2}</p>
                  </div>
                )}
              </div>
            )}

            {/* ── Pekerjaan ── */}
            {occupations && occupations.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#475569" }}>Pekerjaan</p>
                <div className="flex flex-wrap gap-1.5">
                  {occupations.map((o, i) => (
                    <span key={i} className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: "rgba(96,165,250,0.1)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.2)" }}>
                      {translateOccupation(o)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Biografi (Wikipedia Indonesia / AniList cleaned) ── */}
            <div ref={bioSectionRef}>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "#475569" }}>
                {seed.type === "character" ? "Tentang Karakter" : "Biografi"}
              </p>
              {bioLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 size={14} className="animate-spin" style={{ color: "#A78BFA" }} />
                  <span className="text-xs" style={{ color: "#6E6E90" }}>Mencari biografi…</span>
                </div>
              ) : bio && bio.length > 0 ? (
                <ExpandableBio text={bio} />
              ) : (
                <p className="text-xs italic" style={{ color: "#475569" }}>Belum ada biografi tersedia.</p>
              )}
            </div>

            {/* ── Karya Anime (clickable → navigate ke anime) ── */}
            {animeWorks.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: "#475569" }}>
                  {seed.type === "character" ? "Muncul di Anime" : "Karya Anime"}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {animeWorks.map((w) => {
                    const isNav = navigatingWork === w.id;
                    return (
                      <button
                        key={w.id}
                        className="flex-shrink-0 flex flex-col items-center gap-1.5 transition-all active:scale-95"
                        style={{ width: 68 }}
                        onClick={() => handleWorkClick(w)}
                        disabled={isNav}
                      >
                        <div className="w-14 h-20 rounded-xl overflow-hidden relative"
                          style={{
                            border: `1.5px solid ${isNav ? "rgba(255,107,0,0.6)" : "rgba(255,255,255,0.12)"}`,
                            boxShadow: isNav ? "0 0 12px rgba(255,107,0,0.3)" : "none",
                          }}>
                          <img src={proxyImg(w.image, 120)} alt={w.title} className="w-full h-full object-cover" loading="lazy" />
                          {isNav && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-xl"
                              style={{ background: "rgba(0,0,0,0.55)" }}>
                              <Loader2 size={18} className="animate-spin text-white" />
                            </div>
                          )}
                          {/* Play overlay hint */}
                          {!isNav && (
                            <div className="absolute inset-0 flex items-end justify-center pb-1 opacity-0 hover:opacity-100 transition-opacity rounded-xl"
                              style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 60%)" }}>
                              <Play size={10} fill="white" color="white" />
                            </div>
                          )}
                        </div>
                        <p className="text-[9px] text-center text-white/70 line-clamp-2 leading-tight">{w.title}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>,
    document.body
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
              <SafeImg
                src={e.node.image?.medium ? proxyImg(e.node.image.medium, 56) : null}
                alt={e.node.name.full}
                className="w-full h-full object-cover"
                fallback={<div className="w-full h-full flex items-center justify-center text-xl">✍️</div>}
              />
              <div className="absolute inset-0 rounded-full flex items-end justify-center pb-0.5"
                style={{ background: "linear-gradient(to top, rgba(0,0,0,0.35) 0%, transparent 50%)" }}>
                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.7)" }}>👆</span>
              </div>
            </div>
            <p className="text-[10px] font-semibold text-white text-center leading-tight line-clamp-2">
              {e.node.name.full}
            </p>
            <p className="text-[9px] text-center font-medium line-clamp-1" style={{ color: "#FF6B00" }}>{translateStaffRole(e.role)}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

/** Klasifikasi label karakter berdasarkan role AniList + gender */
function getCharacterLabel(
  role: string,
  gender: string | null | undefined,
  counters: {
    mc: number; femMc: number; heroinUtama: number; heroin: number;
    rival: number; deuteragonist: number; mainOther: number; pendukungUtama: number;
  }
): { label: string; color: string; border: string } {
  const isFemale = gender === "Female";
  const isMale = gender === "Male";
  const totalMain = counters.mc + counters.femMc;

  if (role === "MAIN") {
    // Karakter MAIN pertama → MC (laki/gender unknown) atau MC Wanita (perempuan)
    if (totalMain === 0) {
      if (isFemale) {
        counters.femMc++;
        return { label: "MC Wanita", color: "#FF6B00", border: "rgba(255,107,0,0.4)" };
      }
      counters.mc++;
      return { label: "MC", color: "#FF6B00", border: "rgba(255,107,0,0.4)" };
    }
    // Selanjutnya: perempuan → Heroin Utama / Heroin
    if (isFemale) {
      if (counters.heroinUtama === 0) {
        counters.heroinUtama++;
        return { label: "Heroin Utama", color: "#FF6BA8", border: "rgba(255,107,168,0.4)" };
      }
      counters.heroin++;
      return { label: "Heroin", color: "#F9A8D4", border: "rgba(249,168,212,0.3)" };
    }
    // Selanjutnya: laki-laki/unknown → Rival → Deuteragonis → Karakter Utama
    if (counters.rival === 0) {
      counters.rival++;
      return { label: "Rival", color: "#A78BFA", border: "rgba(167,139,250,0.35)" };
    }
    if (counters.deuteragonist === 0) {
      counters.deuteragonist++;
      return { label: "Deuteragonis", color: "#60A5FA", border: "rgba(96,165,250,0.3)" };
    }
    counters.mainOther++;
    return { label: "Karakter Utama", color: "#93C5FD", border: "rgba(147,197,253,0.25)" };
  }
  if (role === "SUPPORTING") {
    counters.pendukungUtama++;
    if (counters.pendukungUtama <= 2) {
      return { label: "Pendukung Utama", color: "#34D399", border: "rgba(52,211,153,0.3)" };
    }
    return { label: "Pendukung", color: "#6E6E90", border: "rgba(255,255,255,0.1)" };
  }
  return { label: "Figuran", color: "#4A4A6A", border: "rgba(255,255,255,0.06)" };
}

function SeiyuuSection({ rich, onClickPerson }: { rich: AniListRichData; onClickPerson: (seed: PersonSeed) => void }) {
  const edges = rich.characters?.edges ?? [];
  if (edges.length === 0) return null;

  const counters = { mc: 0, femMc: 0, heroinUtama: 0, heroin: 0, rival: 0, deuteragonist: 0, mainOther: 0, pendukungUtama: 0 };
  const labeled = edges.map((edge) => ({
    edge,
    label: getCharacterLabel(edge.role ?? "SUPPORTING", edge.node.gender, counters),
  }));

  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(15,15,27,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <h3 className="text-sm font-bold text-white mb-3">Karakter & Pengisi Suara</h3>
      <div className="space-y-2">
        {labeled.map(({ edge, label }, i) => {
          const va = edge.voiceActors?.[0];
          return (
            <div key={i} className="flex items-center gap-2 px-2 py-2 rounded-xl"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
              {/* Character photo - clickable */}
              <button
                className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 transition-all active:scale-95 relative"
                style={{ border: `1.5px solid ${label.border}` }}
                onClick={() => onClickPerson({ id: edge.node.id, type: "character", name: edge.node.name.full, role: label.label, image: edge.node.image?.medium })}
              >
                <SafeImg
                  src={edge.node.image?.medium ? proxyImg(edge.node.image.medium, 40) : null}
                  alt={edge.node.name.full}
                  className="w-full h-full object-cover"
                  fallback={<div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>🎭</div>}
                />
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{edge.node.name.full}</p>
                <p className="text-[10px] font-semibold" style={{ color: label.color }}>{label.label}</p>
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
                    <SafeImg
                      src={va.image?.medium ? proxyImg(va.image.medium, 40) : null}
                      alt={va.name.full}
                      className="w-full h-full object-cover"
                      fallback={<div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>🎤</div>}
                    />
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
        <img src={proxyImg(posterUrl, 160)} alt=""
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
  const queryClient = useQueryClient();
  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [sortDesc, setSortDesc] = useState(false);
  const [, forceUpdate] = useState(0);
  const [posterImgLoaded, setPosterImgLoaded] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [confetti, setConfetti] = useState<ConfettiParticle[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<PersonSeed | null>(null);
  const [richLoadingTooLong, setRichLoadingTooLong] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const clearConfetti = useCallback(() => setConfetti([]), []);

  // Force-retry: hapus SEMUA layer cache (in-memory, localStorage null-cache, IDB)
  // sebelum refetch — tanpa ini, refetchRich() langsung balik null dari cache lagi.
  const handleForceRetry = useCallback(async (title?: string) => {
    if (title) await clearRichCache(title);
    setRichLoadingTooLong(false);
    queryClient.removeQueries({ queryKey: ["anilist-rich", title] });
    // Setelah removeQueries, React Query akan re-run queryFn secara otomatis
    // saat komponen masih mounted (enabled masih true).
  }, [queryClient]);

  const { data: anime, isLoading, error } = useQuery({
    queryKey: ["anime", animeId],
    queryFn: () => fetchAnimeDetail(animeId!),
    enabled: !!animeId,
    staleTime: 10 * 60_000,
    refetchInterval: 10 * 60_000,
    // Anime WAJIB bisa dibuka — upstream API server bisa "cold start" (sleep setelah idle)
    // dan butuh puluhan detik untuk bangun lagi. 6 percobaan dengan jeda naik sampai 15 detik
    // (~total ~50 detik) memberi cukup waktu tanpa membuat user permanen stuck di error.
    retry: 6,
    retryDelay: (attempt) => Math.min((attempt + 1) * 2500, 15_000),
  });

  // Gunakan anilistPoster dari API response (di-inject server-side) bila ada,
  // sehingga poster muncul instan tanpa perlu fetch AniList terpisah.
  // Saat anime masih loading (API belum balik), pakai card cache yang diisi saat
  // user melihat kartu di home — poster tampil langsung tanpa flash kosong.
  const cardCachePoster = animeId ? getCardPoster(animeId) : undefined;
  const { poster: malPoster } = useAnimeInfo(
    anime?.title ?? "",
    anime ? (anime.anilistPoster ?? null) : cardCachePoster,
  );
  const bannerImg = useBanner(anime?.title ?? "");

  // Server-side rich cache (synopsis, trailer, staff, characters dari full-cache.json)
  // Jauh lebih cepat dari AniList — tidak perlu tunggu rate-limit atau AniList down.
  const { data: serverRichCache } = useQuery({
    queryKey: ["server-rich-cache", animeId],
    queryFn: () => fetchAnimeRichCache(animeId!),
    enabled: !!animeId,
    staleTime: 24 * 3600_000, // 24 jam — data ini jarang berubah kecuali setelah rescrape
    retry: 1,
    retryDelay: 2000,
  });

  const { data: anilistRich, isLoading: anilistRichLoading, refetch: refetchRich, isError: isErrorRich } = useQuery({
    queryKey: ["anilist-rich", anime?.title],
    // 'high' priority — user sedang aktif melihat halaman ini, harus loncat depan antrian prefetch
    queryFn: () => fetchAniListRichByTitle(anime!.title, 'high'),
    enabled: !!anime?.title,
    staleTime: 30 * 60_000,
    retry: 3,
    retryDelay: (attempt: number) => Math.min(attempt * 4000, 15_000),
  });

  // Merge: AniList diutamakan (punya id → PersonModal bisa load bio detail).
  // Server cache menjadi fallback instan ketika AniList tidak merespons atau anime
  // memang tidak ditemukan di AniList (termasuk 39 anime yang gagal scrape).
  const rich: AniListRichData | null = anilistRich ?? (serverRichCache ? cacheEntryToRichData(serverRichCache) : null);
  // richLoading: tidak perlu tunggu AniList kalau server cache sudah ada
  const richLoading = anilistRichLoading && !serverRichCache;

  // Timer: tampilkan tombol "Coba Lagi" di dalam skeleton kalau rich data belum
  // muncul juga setelah 12 detik (kemungkinan antrian AniList sedang padat).
  useEffect(() => {
    if (!richLoading) { setRichLoadingTooLong(false); return; }
    setRichLoadingTooLong(false);
    const t = setTimeout(() => setRichLoadingTooLong(true), 12_000);
    return () => clearTimeout(t);
  }, [richLoading, anime?.title]);

  // Pre-fetch semua person detail segera saat rich data tiba
  // sehingga saat user klik staff/VA, data sudah siap & bio langsung muncul
  useEffect(() => {
    if (!rich) return;
    const toFetch: Array<{ id: number; type: "staff" | "character" }> = [];

    rich.staff?.edges?.forEach(e => {
      if (e.node.id > 0) toFetch.push({ id: e.node.id, type: "staff" });
    });
    rich.characters?.edges?.forEach(e => {
      if (e.node.id > 0) toFetch.push({ id: e.node.id, type: "character" });
      e.voiceActors?.forEach(va => {
        if (va.id > 0) toFetch.push({ id: va.id, type: "staff" });
      });
    });

    // Stagger prefetches 150ms apart to avoid AniList rate limits
    toFetch.forEach(({ id, type }, index) => {
      setTimeout(() => {
        queryClient.prefetchQuery({
          queryKey: ["person-detail", type, id],
          queryFn: () => fetchPersonDetail(id, type),
          staleTime: 24 * 3600_000,
        });
      }, index * 150);
    });

    // Kumpulkan semua nama staff + VA
    const namesToFetch: string[] = [];
    rich.staff?.edges?.forEach(e => { if (e.node.name?.full) namesToFetch.push(e.node.name.full); });
    rich.characters?.edges?.forEach(e => {
      e.voiceActors?.forEach(va => { if (va.name?.full) namesToFetch.push(va.name.full); });
    });

    if (namesToFetch.length > 0) {
      // Satu request batch ke server → server sudah crawl semua bio sebelumnya
      fetchBiosBatch(namesToFetch).then(bios => {
        // Simpan setiap bio ke React Query cache → PersonModal baca langsung tanpa loading
        for (const [personName, bioText] of Object.entries(bios)) {
          if (bioText) {
            queryClient.setQueryData(["person-bio-id", personName], bioText);
          }
        }
      }).catch(() => {});

      // Minta server crawl bio untuk anime ini jika belum ada (fire & forget)
      if (anime?.title) triggerAnimeBioCrawl(anime.title);
    }
  }, [rich, queryClient, anime?.title]);

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
  // Server cache synopsis (AniList deskripsi atau AI-generated bahasa Indonesia)
  // sebagai fallback ketika OtakuDesu tidak punya sinopsis / sangat pendek.
  const serverSynopsis = serverRichCache?.synopsis ?? null;
  const displaySynopsis = (synopsis && synopsis.length > 30 && !/tidak ada sinopsis/i.test(synopsis))
    ? synopsis
    : (serverSynopsis ?? synopsis);

  const genres = anime?.genreList?.map((g) => g.title) ?? [];

  // Context untuk AI chat (AniBot) — gabungan data scrape OtakuDesu + AniList rich data
  const aiStaff = (rich?.staff?.edges ?? [])
    .slice(0, 8)
    .map((e) => ({ role: e.role || "Staff", name: e.node.name.full }));
  const aiCharacters = (rich?.characters?.edges ?? [])
    .slice(0, 10)
    .map((e) => ({ name: e.node.name.full, role: e.role }));

  // Multi-season detection
  const seasons = anime ? findSeasons(anime.title, anime.recommendedAnimeList ?? []) : [];

  const [grad] = anime ? titlePlaceholder(anime.title) : ["#0f0f1b", ""];

  // ── Determine if anime is finished ──────────────────────────────────────
  const isAniListFinished = rich?.status === "FINISHED";
  const isOtakuDesuCompleted = anime?.status === "Completed";

  // Fallback: no new ep in 7+ days from last aired AniList episode
  const lastAiredAt = rich?.airingSchedule?.nodes?.length
    ? Math.max(...(rich.airingSchedule.nodes.map(n => n.airingAt)))
    : 0;
  const sevenDaysAgo = Date.now() / 1000 - 7 * 86400;
  const isStaleFinished = lastAiredAt > 0 && lastAiredAt < sevenDaysAgo && !rich?.airingSchedule?.nodes?.some(
    n => n.airingAt > Date.now() / 1000
  );
  const isFinished = isAniListFinished || isOtakuDesuCompleted || isStaleFinished;

  // ── Complete air date map (with extrapolation for missing episodes) ────
  function buildCompleteAirMap(
    nodes: { episode: number; airingAt: number }[],
    totalEps: number
  ): Map<number, number> {
    const map = new Map<number, number>();
    if (!nodes.length) return map;
    const sorted = [...nodes].sort((a, b) => a.episode - b.episode);
    for (const n of sorted) map.set(n.episode, n.airingAt);

    // Calculate average weekly interval from known data
    let totalInterval = 0, count = 0;
    for (let i = 1; i < sorted.length; i++) {
      const diff = sorted[i].airingAt - sorted[i - 1].airingAt;
      if (diff > 0 && diff < 14 * 86400) { totalInterval += diff; count++; }
    }
    const avgInterval = count > 0 ? totalInterval / count : 7 * 86400;

    // Extrapolate forward/backward for missing episodes
    for (let ep = 1; ep <= totalEps; ep++) {
      if (!map.has(ep)) {
        const closest = sorted.reduce((prev, cur) =>
          Math.abs(cur.episode - ep) < Math.abs(prev.episode - ep) ? cur : prev
        );
        map.set(ep, Math.round(closest.airingAt + (ep - closest.episode) * avgInterval));
      }
    }
    return map;
  }

  const totalEpCount = parseInt(anime?.episodes ?? "0") || rawEpisodes.length;
  const airDateMap = buildCompleteAirMap(
    rich?.airingSchedule?.nodes ?? [],
    totalEpCount
  );

  // ── Viewer count estimation (deterministic, realistic) ────────────────
  function seededRand(seed: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0) / 0xffffffff;
  }

  function estimateViewers(episodeId: string, epNum: number, totalEps: number): number {
    const pop = Math.max(rich?.popularity ?? 0, 500);
    const base = pop * 0.15;
    const r = seededRand(episodeId);
    const r2 = seededRand(episodeId + "_v2");
    // ep1 spike, middle normal, finale slight bump
    const pos = totalEps > 1 ? (epNum - 1) / (totalEps - 1) : 0;
    let mult: number;
    if (pos < 0.08) mult = 1.8 + r * 1.4; // premiere
    else if (pos > 0.88 && isFinished) mult = 0.8 + r * 0.9; // finale
    else mult = 0.35 + r * 0.75 + r2 * 0.2;
    return Math.max(Math.round(base * mult), 120);
  }

  // Find highest episode number (last released episode)
  const maxEpNum = rawEpisodes.length > 0
    ? Math.max(...rawEpisodes.map(ep => parseInt(ep.title) || 0))
    : 0;

  if (isLoading) {
    return (
      <div className="min-h-screen pb-24" style={{ background: "#07070e" }}>
        {/* Skeleton: blurred bg area */}
        <div className="relative" style={{ minHeight: 420 }}>
          <div className="absolute inset-0 animate-pulse" style={{ background: "#0f0f1e" }} />
          <div className="relative z-10 flex flex-col items-center pt-24 px-4">
            <div className="rounded-2xl animate-pulse" style={{ width: 160, height: 228, background: "#161625" }} />
            <div className="mt-4 w-48 h-5 rounded-full animate-pulse" style={{ background: "#161625" }} />
            <div className="mt-2 w-32 h-3 rounded-full animate-pulse" style={{ background: "#161625" }} />
          </div>
        </div>
        <div className="px-4 py-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
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

  const posterSrc = malPoster ?? anime.poster ?? null;

  return (
    <div className="min-h-screen" style={{ background: "#07070e", paddingBottom: lastWatched ? "120px" : "96px" }}>

      {/* ── Hero: blurred poster background + centered portrait card ── */}
      <div className="relative" style={{ minHeight: "420px", paddingBottom: "28px" }}>

        {/* Blurred background layer */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute inset-0" style={{ background: grad }} />
          {posterSrc && (
            <img
              src={proxyImg(posterSrc, 320)}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                opacity: posterImgLoaded ? 0.55 : 0,
                transition: "opacity 0.6s ease",
                filter: "blur(3px) saturate(1.4)",
                transform: "scale(1.15)",
                transformOrigin: "center center",
              }}
              onLoad={() => setPosterImgLoaded(true)}
              onError={() => setPosterImgLoaded(false)}
            />
          )}
          {/* Dark gradient vignette */}
          <div className="absolute inset-0" style={{
            background: "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(7,7,14,0.2) 50%, rgba(7,7,14,0.95) 100%)"
          }} />
        </div>

        {/* Top bar: back + bookmark */}
        <div className="relative z-10 flex items-center justify-between p-4 pt-10">
          <button
            onClick={() => history.back()}
            className="w-9 h-9 flex items-center justify-center rounded-full"
            style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(8px)" }}
            data-testid="btn-back">
            <ArrowLeft size={20} className="text-white" />
          </button>
          <button
            onClick={handleToggleFavorite}
            className="flex items-center gap-1.5 px-3 py-2 rounded-full font-semibold text-xs"
            style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.18)", backdropFilter: "blur(8px)", color: favd ? "#FF6B00" : "#fff" }}
            data-testid="btn-favorite">
            {favd
              ? <><BookmarkCheck size={16} style={{ color: "#FF6B00" }} /> <span>Tersimpan</span></>
              : <><Bookmark size={16} /> <span>Simpan</span></>}
          </button>
        </div>

        {/* Centered poster card */}
        <div className="relative z-10 flex flex-col items-center px-4 pt-2 pb-0">
          <div
            className="relative"
            style={{
              width: 160,
              height: 228,
              borderRadius: 18,
              overflow: "hidden",
              boxShadow: "0 20px 60px rgba(0,0,0,0.75), 0 0 0 2px rgba(255,255,255,0.12)",
            }}>
            {/* Gradient placeholder while loading */}
            <div className="absolute inset-0" style={{ background: grad }} />
            {posterSrc && (
              <img
                src={proxyImg(posterSrc, 400)}
                alt={anime.title}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ opacity: posterImgLoaded ? 1 : 0, transition: "opacity 0.5s ease" }}
              />
            )}
            {/* Subtle shine overlay */}
            <div className="absolute inset-0 pointer-events-none" style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, transparent 45%, rgba(0,0,0,0.15) 100%)"
            }} />
          </div>

          {/* Title + score below poster */}
          <div className="w-full text-center mt-4 px-2">
            <h1 className="text-lg font-black text-white leading-tight"
              style={{ textShadow: "0 2px 12px rgba(0,0,0,0.9)" }}>
              {anime.title}
            </h1>
            {/* Meta row */}
            <div className="flex flex-wrap justify-center items-center gap-1.5 mt-2">
              {[anime.studios, anime.type, anime.status].filter(Boolean).map((info, i) => (
                <span key={i} className="text-xs font-medium"
                  style={{ color: "rgba(255,255,255,0.55)" }}>
                  {i > 0 && <span className="mr-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>|</span>}
                  {String(info)}
                </span>
              ))}
              {anime.aired && (
                <span className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.55)" }}>
                  <span className="mr-1.5" style={{ color: "rgba(255,255,255,0.25)" }}>|</span>
                  {anime.aired}
                </span>
              )}
            </div>
            {/* Genre badges */}
            {genres.length > 0 && (
              <div className="flex flex-wrap justify-center gap-1.5 mt-3">
                {genres.map((g) => (
                  <span key={g} className="text-xs px-2.5 py-0.5 rounded-full font-semibold"
                    style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.75)", border: "1px solid rgba(255,255,255,0.14)" }}>
                    {g}
                  </span>
                ))}
              </div>
            )}
            {/* Rating */}
            {anime.score && (
              <div className="flex justify-center items-center gap-1.5 mt-3">
                <Star size={15} fill="#FFD700" style={{ color: "#FFD700" }} />
                <span className="text-base font-black" style={{ color: "#FFD700" }}>{anime.score}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 pt-2 space-y-4">

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
        {displaySynopsis ? (
          <div className="rounded-xl p-4"
            style={{
              background: "rgba(15,15,27,0.6)",
              backdropFilter: "blur(20px)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-bold text-white">Sinopsis</h3>
              {!synopsis && serverSynopsis && serverRichCache?.synopsisSource === "ai" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold"
                  style={{ background: "rgba(167,139,250,0.15)", color: "#A78BFA", border: "1px solid rgba(167,139,250,0.2)" }}>
                  AI
                </span>
              )}
            </div>
            <p className={`text-sm leading-relaxed ${synopsisExpanded ? "" : "line-clamp-4"}`} style={{ color: "#a0a0b8" }}>
              {displaySynopsis}
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
        {richLoading && !rich && (
          <div className="rounded-xl p-3" style={{ background: "rgba(15,15,27,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="h-3.5 w-28 rounded mb-3 animate-pulse" style={{ background: "rgba(255,255,255,0.1)" }} />
            <div className="flex gap-4 overflow-hidden">
              {[1,2,3,4].map(i => (
                <div key={i} className="flex-shrink-0 flex flex-col items-center gap-1.5" style={{ width: 68 }}>
                  <div className="w-14 h-14 rounded-full animate-pulse" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <div className="h-2 w-10 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.06)" }} />
                  <div className="h-1.5 w-8 rounded animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
                </div>
              ))}
            </div>
            {/* Tombol muat ulang muncul kalau loading sudah >12 detik */}
            {richLoadingTooLong && (
              <div className="mt-3 flex justify-center">
                <button
                  onClick={() => handleForceRetry(anime?.title)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold px-4 py-2 rounded-full transition-all active:scale-95"
                  style={{ background: "rgba(96,165,250,0.12)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.3)" }}
                >
                  🔄 Muat Ulang
                </button>
              </div>
            )}
          </div>
        )}
        {rich && <StaffSection rich={rich} onClickPerson={setSelectedPerson} />}

        {/* Seiyuu / Voice Actors */}
        {richLoading && !rich && (
          <div className="rounded-xl p-3 animate-pulse" style={{ background: "rgba(15,15,27,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="h-3.5 w-40 rounded mb-3" style={{ background: "rgba(255,255,255,0.1)" }} />
            <div className="space-y-2">
              {[1,2,3].map(i => (
                <div key={i} className="flex items-center gap-2 px-2 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-24 rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
                    <div className="h-2 w-16 rounded" style={{ background: "rgba(255,255,255,0.05)" }} />
                  </div>
                  <div className="text-white/10 text-sm">→</div>
                  <div className="flex-1 space-y-1.5 text-right">
                    <div className="h-2.5 w-24 rounded ml-auto" style={{ background: "rgba(255,255,255,0.08)" }} />
                    <div className="h-2 w-12 rounded ml-auto" style={{ background: "rgba(255,255,255,0.05)" }} />
                  </div>
                  <div className="w-10 h-10 rounded-full flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)" }} />
                </div>
              ))}
            </div>
          </div>
        )}
        {rich && <SeiyuuSection rich={rich} onClickPerson={setSelectedPerson} />}

        {/* Retry card: muncul kalau rich data gagal load (bukan loading, tapi null) */}
        {!richLoading && !rich && (
          <div className="rounded-xl px-4 py-5 text-center space-y-3"
            style={{ background: "rgba(15,15,27,0.6)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-sm font-semibold text-white/70">
              {isErrorRich ? "⚠️ Gagal memuat data staff & karakter" : "Data staff & karakter belum tersedia"}
            </p>
            <p className="text-[11px]" style={{ color: "#6E6E90" }}>
              {isErrorRich
                ? "Kemungkinan AniList rate limit. Coba lagi dalam beberapa detik."
                : "Klik Coba Lagi untuk paksa fetch ulang dari AniList."}
            </p>
            <button
              onClick={() => handleForceRetry(anime?.title)}
              className="inline-flex items-center gap-2 text-xs font-bold px-5 py-2.5 rounded-full transition-all active:scale-95"
              style={{ background: "linear-gradient(135deg,rgba(255,107,0,0.15),rgba(255,68,68,0.1))", color: "#FF6B00", border: "1px solid rgba(255,107,0,0.3)" }}
            >
              🔄 Coba Lagi
            </button>
          </div>
        )}

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
                      {/* Title row: "Episode X (End)" + viewer count */}
                      {(() => {
                        const epNum = parseInt(ep.title);
                        const isLastEp = !isNaN(epNum) && epNum === maxEpNum && isFinished;
                        const baseViewers = estimateViewers(ep.episodeId, isNaN(epNum) ? 1 : epNum, totalEpCount);
                        const viewers = baseViewers + getWatchCount(ep.episodeId);
                        const viewStr = viewers >= 1_000_000
                          ? (viewers / 1_000_000).toFixed(1).replace(/\.0$/, "") + "jt"
                          : viewers.toLocaleString("id-ID");
                        return (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold text-white truncate">
                              Episode {ep.title}{isLastEp ? " (End)" : ""}
                            </p>
                            {isLastEp && (
                              <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0"
                                style={{
                                  background: "linear-gradient(135deg,#B8860B,#FFD700,#FFA500)",
                                  color: "#1a0a00",
                                  boxShadow: "0 0 6px rgba(255,215,0,0.5)",
                                }}>✓ TAMAT</span>
                            )}
                            <span className="text-[10px] font-medium ml-auto flex-shrink-0"
                              style={{ color: "rgba(255,255,255,0.35)" }}>
                              👁 {viewStr}
                            </span>
                          </div>
                        );
                      })()}
                      {/* Airing date/time */}
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

        {/* Related Anime — prioritas: relasi AniList (sekuel/prequel/dll) lalu genre-match */}
        {(() => {
          const ANIME_FORMATS = new Set(["TV","TV_SHORT","MOVIE","OVA","ONA","SPECIAL"]);
          const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

          // Relasi langsung dari AniList
          const alEdges = (rich?.relations?.edges ?? []).filter(e =>
            e.node.type === "ANIME" && ANIME_FORMATS.has(e.node.format ?? "")
          );
          const alItems = alEdges.map(e => {
            const relTitle = e.node.title.english || e.node.title.romaji || "";
            const match = (anime.recommendedAnimeList ?? []).find(r =>
              norm(r.title).includes(norm(relTitle).slice(0, 10)) ||
              norm(relTitle).includes(norm(r.title).slice(0, 10))
            );
            return { edge: e, otakuCard: match ?? null };
          });

          // Genre-match dari OtakuDesu recommended (yang bukan sudah tampil di AniList relations)
          const alOtakuIds = new Set(alItems.map(i => i.otakuCard?.animeId).filter(Boolean));
          const currentGenreNames = new Set((anime.genreList ?? []).map(g => g.title.toLowerCase()));
          const genreMatched = (anime.recommendedAnimeList ?? []).filter(r => {
            if (alOtakuIds.has(r.animeId)) return false;
            if (!r.genres?.length) return false;
            return r.genres.some(g => currentGenreNames.has(g.toLowerCase()));
          });

          const hasAL = alItems.length > 0;
          const hasGenre = genreMatched.length > 0;
          if (!hasAL && !hasGenre) return null;

          return (
            <section className="pb-4">
              <h3 className="text-base font-bold text-white mb-3">Anime Terkait</h3>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {alItems.map((item, i) =>
                  item.otakuCard ? (
                    <div key={`al-${i}`} className="flex-shrink-0 w-[100px]">
                      <AnimeCard anime={item.otakuCard} variant="poster" />
                    </div>
                  ) : (
                    <div key={`al-${i}`} className="flex-shrink-0 w-[100px] flex flex-col gap-1">
                      <div className="relative rounded-xl overflow-hidden" style={{ paddingTop: "140%", background: "rgba(255,255,255,0.05)" }}>
                        <img
                          src={proxyImg(item.edge.node.coverImage.medium, 140)}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 55%)" }} />
                        <p className="absolute bottom-1.5 left-1 right-1 text-[9px] font-bold text-white text-center leading-tight line-clamp-2">
                          {item.edge.node.title.english || item.edge.node.title.romaji}
                        </p>
                      </div>
                      <p className="text-[9px] text-center font-bold" style={{ color: "#FF6B00" }}>
                        {translateRelationType(item.edge.relationType)}
                      </p>
                    </div>
                  )
                )}
                {genreMatched.slice(0, 8).map(r => (
                  <div key={r.animeId} className="flex-shrink-0 w-[100px]">
                    <AnimeCard anime={r} variant="poster" />
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

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

      {/* Tombol AI bulat kanan bawah — tanya apapun soal anime ini */}
      <AnimeAIChat
        context={{
          title: anime.title,
          synopsis: displaySynopsis,
          genres,
          studios: anime.studios,
          status: anime.status,
          episodes: anime.episodes,
          score: anime.score,
          aired: anime.aired,
          staff: aiStaff,
          characters: aiCharacters,
        }}
      />
    </div>
  );
}
