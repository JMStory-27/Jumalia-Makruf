'use client';
import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  fetchUpcomingDetail, formatCountdown, formatIndonesianDate, formatIndonesianDateLong,
  type UpcomingAnime,
} from "@/lib/malSeason";
import { proxyImg, titlePlaceholder } from "@/lib/utils";
import AnimeAIChat from "@/components/AnimeAIChat";
import type { AnimeAIContext } from "@/lib/aiApi";

function useTick(intervalMs = 1000) {
  const [, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((n) => n + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

function cleanHtml(html: string | null | undefined): string {
  if (!html) return "";
  // AniList description punya tag <br>, <i>, <b> minimal — bersihkan yang lain agar tidak break layout
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<i>/gi, "").replace(/<\/i>/gi, "")
    .replace(/<b>/gi, "").replace(/<\/b>/gi, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, "");
}

export default function UpcomingDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const id = Number(params.id);
  useTick(1000);

  const { data: anime, isLoading, error } = useQuery({
    queryKey: ["upcoming-detail", id],
    queryFn: () => fetchUpcomingDetail(id),
    enabled: !isNaN(id) && id > 0,
    staleTime: 60 * 60_000,
    retry: 4,
  });

  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  // Parallax offset untuk hero banner — image drift naik perlahan saat scroll.
  const parallax = useScrollY();
  // Mouse-follow 3D tilt — lagi cursor bergerak di atas window, banner slight
  // rotate 3D ke arah cursor. Sangat cinematic, jarang ada di anime apps.
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  useEffect(() => {
    let raf = 0;
    const onMove = (e: MouseEvent) => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setTilt({
          x: (e.clientX / window.innerWidth - 0.5) * 2,
          y: (e.clientY / window.innerHeight - 0.5) * 2,
        });
        raf = 0;
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); };
  }, []);

  if (isLoading || !anime) {
    return (
      <div className="min-h-screen pb-28" style={{ background: "#05050f" }}>
        <div className="flex items-center justify-center" style={{ height: "70vh" }}>
          <div className="text-center">
            <div style={{ width: 38, height: 38, borderRadius: "50%", border: "3px solid rgba(255,255,255,0.07)", borderTopColor: "#7DD3FC", animation: "spin 0.7s linear infinite", margin: "0 auto 12px" }} />
            <p className="text-xs font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
              {error ? "Gagal memuat detail..." : "Memuat detail upcoming..."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const title = anime.title.english || anime.title.romaji;
  const synopsisRaw = cleanHtml(anime.description);
  const synopsisShort = synopsisRaw.length > 380 ? synopsisRaw.slice(0, 380) + "…" : synopsisRaw;
  const airingAt = anime.airingAt ?? null;
  const releaseEpisode = airingAt !== null ? 1 : null;
  const remaining = airingAt ? airingAt - Math.floor(Date.now() / 1000) : null;
  const isReleased = remaining !== null && remaining <= 0;

  // Trailer YouTube embed
  const trailerUrl = anime.trailer?.site === "youtube" && anime.trailer?.id
    ? `https://www.youtube.com/embed/${anime.trailer.id}`
    : null;

  // Staff + karakter hanya ditampilkan kalau ada (supaya hemat quota)
  const staffList = (anime.staff?.edges ?? []).slice(0, 10);
  const charList = (anime.characters?.edges ?? []).slice(0, 16);

  // Konteks untuk LawrenzBot AI — semua data anime ini di-inject ke
  // system prompt supaya AI kasih jawaban spesifik (tanggal rilis,
  // status tayang, nama karakter & VA, studio, dll). Dipakai oleh
  // AnimeAIChat yang ngerender FAB di pojok kanan bawah.
  const aiContext: AnimeAIContext = {
    title,
    synopsis: cleanHtml(anime.description) || undefined,
    genres: anime.genres,
    studios: anime.studios?.nodes?.[0]?.name,
    status: anime.status,
    episodes: anime.episodes != null ? String(anime.episodes) : undefined,
    score: anime.averageScore != null ? String((anime.averageScore / 10).toFixed(1)) : undefined,
    aired: airingAt ? formatIndonesianDateLong({ unix: airingAt }) : undefined,
    staff: staffList.map((s) => ({ role: s.role, name: s.node.name.full })),
    characters: charList.map((c) => ({ name: c.node.name.full, role: c.role })),
  };

  return (
    <div className="min-h-screen pb-28 relative" style={{ background: "#05050f" }}>
      <style>{`
        @keyframes season-glow {
          0%,100% { box-shadow: 0 0 6px rgba(96,165,250,.25), inset 0 0 0 1px rgba(96,165,250,.3); }
          50%      { box-shadow: 0 0 16px rgba(96,165,250,.5), inset 0 0 0 1px rgba(96,165,250,.55); }
        }
        @keyframes live-bg-pan {
          0%,100% { background-position: 0% 50%; }
          50%     { background-position: 100% 50%; }
        }
        @keyframes flip-digit {
          0%   { opacity: 0; transform: rotateX(-90deg) translateY(-50%) scale(0.9); }
          50%  { opacity: 0.7; transform: rotateX(-15deg) translateY(-15%) scale(0.95); }
          100% { opacity: 1; transform: rotateX(0) translateY(0) scale(1); }
        }
        .flip-digit { display: inline-block; transform-origin: center bottom; perspective: 200px; }
        .flip-digit.changed { animation: flip-digit 0.55s cubic-bezier(0.5, 0.0, 0.3, 1) backwards; }
        @keyframes sparkle-pulse {
          0%, 100% { opacity: 0;    transform: scale(0.4); }
          50%      { opacity: 0.95; transform: scale(1.0); }
        }
        @keyframes reveal-up {
          0%   { opacity: 0; transform: translateY(24px); filter: blur(4px); }
          100% { opacity: 1; transform: translateY(0);    filter: blur(0); }
        }
        .reveal-section { opacity: 0; transform: translateY(24px); filter: blur(4px); }
        .reveal-section.is-visible { animation: reveal-up 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes wave-bar-pulse {
          0%, 100% { transform: scaleY(0.18); opacity: 0.5; }
          50%      { transform: scaleY(1);    opacity: 1;   }
        }
        .wave-bar {
          display: inline-block;
          animation: wave-bar-pulse 1s ease-in-out infinite;
          transform-origin: center bottom;
        }
        /* Kanji drift backdrop — Japanese kanji floating, slow rotation */
        .kanji-field { position: fixed; inset: 0; pointer-events: none; overflow: hidden; z-index: 0; }
        @keyframes kanji-drift {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); }
          50%      { transform: translate3d(10px, -14px, 0) rotate(3deg); }
        }
      `}</style>
      <KanjiField />
      <SparkleField />

      {/* Hero Banner image — parallax translateY as user scrolls + mouse-follow 3D tilt */}
      <div className="relative w-full" style={{
        aspectRatio: "16/9", minHeight: 220, maxHeight: 360, overflow: "hidden",
        perspective: "1200px",
        transform: `rotateX(${-tilt.y * 4}deg) rotateY(${tilt.x * 4}deg)`,
        transition: "transform 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
        willChange: "transform",
      }}>
        {anime.bannerImage ? (
          <img
            src={proxyImg(anime.bannerImage, 720)}
            alt={title}
            onLoad={() => {
              const img = proxyImg(anime.bannerImage as string, 720);
              navigator.serviceWorker?.controller?.postMessage({ type: "PRIORITY_CACHE_IMAGE", urls: [img] });
            }}
            className="absolute inset-0 w-full h-full object-cover"
            style={{
              transform: `translate3d(0, ${-parallax * 0.28}px, 0) scale(${Math.min(1.08, 1 + parallax * 0.00045)})`,
              transformOrigin: "center 60%",
              transition: "transform 0.1s linear",
              willChange: "transform",
            }}
          />
        ) : (
          <div className="absolute inset-0"
               style={{
                 background: `linear-gradient(135deg, ${titlePlaceholder(title)[0]})`,
                 animation: "live-bg-pan 8s ease-in-out infinite",
                 backgroundSize: "200% 200%",
                 transform: `translate3d(0, ${-parallax * 0.28}px, 0)`,
                 transition: "transform 0.1s linear",
               }} />
        )}
        {/* Deep shading agar teks kebaca */}
        <div className="absolute inset-0"
             style={{ background: "linear-gradient(to top, rgba(7,7,14,1) 0%, rgba(7,7,14,0.55) 50%, rgba(7,7,14,0.25) 100%)" }} />
        {/* Back button */}
        <button
          onClick={() => setLocation("/seasons")}
          aria-label="Kembali ke daftar musim"
          className="absolute top-4 left-4 z-30 flex items-center gap-1.5 px-3 py-2 rounded-full"
          style={{ background: "rgba(10,10,22,0.85)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <span className="text-base text-white">←</span>
          <span className="text-xs font-bold text-white">Musim</span>
        </button>

        {/* Floating top-right: season tag */}
        {anime.season && anime.seasonYear && (
          <div className="absolute top-4 right-4 z-30 px-3 py-1.5 rounded-full"
               style={{
                 background: "rgba(10,10,22,0.85)", backdropFilter: "blur(12px)",
                 border: "1px solid rgba(125,211,252,0.4)",
                 color: "#7DD3FC",
                 fontSize: 11, fontWeight: 800, letterSpacing: "0.05em",
               }}>
            {anime.season} {anime.seasonYear}
          </div>
        )}
      </div>

      <div className="px-4 -mt-10 relative z-10">
        {/* Title + meta */}
        <h1 className="text-2xl font-black text-white leading-tight mb-1.5">{title}</h1>
        {anime.title.native && anime.title.native !== title && (
          <p className="text-xs font-medium mb-2" style={{ color: "rgba(255,255,255,0.55)" }}>{anime.title.native}</p>
        )}

        {/* Big cinematic countdown — flip-card multi-unit (tahun/bln/hari/jam/mnt/dtk)
            dengan animasi flip-down per detik. Lebih mewah dari teks polos. */}
        {airingAt && !isReleased && (
          <div className="rounded-3xl p-5 mb-5 relative overflow-hidden"
               style={{
                 background: "linear-gradient(160deg, rgba(15,23,42,0.92) 0%, rgba(30,41,59,0.78) 60%, rgba(54,21,93,0.6) 100%)",
                 border: "1px solid rgba(125,211,252,0.35)",
                 animation: "season-glow 2.6s ease-in-out infinite",
                 backdropFilter: "blur(16px)",
                 boxShadow: "0 8px 32px rgba(96,165,250,0.15), inset 0 1px 0 rgba(255,255,255,0.05)",
               }}>
            {/* Animated corner ornaments */}
            <div aria-hidden className="absolute top-0 right-2 text-6xl opacity-10"
                 style={{ filter: "drop-shadow(0 0 12px rgba(125,211,252,0.6))", lineHeight: 1 }}>⏳</div>
            <div aria-hidden className="absolute -bottom-4 -left-2 text-7xl opacity-10"
                 style={{ filter: "drop-shadow(0 0 12px rgba(125,211,252,0.6))", lineHeight: 1 }}>📺</div>
            <div className="flex items-center justify-center gap-3 mb-3 relative z-10">
              <ProgressRing airingAt={airingAt} size={64} />
              <div className="flex flex-col items-start text-left">
                <span className="text-[10px] font-black uppercase tracking-[0.18em]"
                      style={{ color: "rgba(125,211,252,0.95)" }}>
                  ⚡ Hitung Mundur Rilis
                </span>
                {releaseEpisode != null && (
                  <p className="text-[10px] mt-0.5 font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
                    Episode pertama · EP {releaseEpisode}
                  </p>
                )}
                <p className="text-[10px] mt-0.5" style={{ color: "rgba(125,211,252,0.7)" }}>
                  Tinggal <span className="font-black text-sm" style={{ color: "#7DD3FC", textShadow: "0 0 8px rgba(125,211,252,0.7)" }}>
                    {Math.max(0, Math.ceil((airingAt - Date.now() / 1000) / 86400))}
                  </span> hari lagi
                </p>
              </div>
            </div>
            <MusicWave />
            <FlipCountdown airingAt={airingAt} />
            <div className="text-center mt-3 relative z-10">
              <p className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>
                📅 {formatIndonesianDateLong({ unix: airingAt })}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: "rgba(125,211,252,0.6)" }}>
                ({formatIndonesianDate({ unix: airingAt })})
              </p>
            </div>
          </div>
        )}
        {airingAt && isReleased && (
          <div className="rounded-2xl p-4 mb-4 text-center"
               style={{
                 background: "rgba(167,139,250,0.10)",
                 border: "1px solid rgba(167,139,250,0.4)",
               }}>
            <p className="text-base font-black" style={{ color: "#A78BFA" }}>
              🏁 Episode pertama sudah tayang
            </p>
            <p className="text-[10px] mt-1" style={{ color: "rgba(167,139,250,0.7)" }}>
              Cek di Beranda / Jadwal untuk episode terbaru.
            </p>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {anime.format && <StatCell label="Format" value={anime.format} icon="🎬" />}
          {anime.episodes != null && <StatCell label="Episode" value={String(anime.episodes)} icon="📺" />}
          {anime.duration != null && <StatCell label="Durasi" value={`${anime.duration} min`} icon="⏱️" />}
          {(anime.averageScore != null || anime.meanScore != null) && (
            <StatCell
              label="Skor"
              value={(((anime.averageScore ?? anime.meanScore ?? 0) / 10).toFixed(1))}
              icon="⭐"
              color="#FFD700"
            />
          )}
        </div>

        {/* Genres + studio */}
        <div className="flex flex-wrap items-center gap-1.5 mb-4">
          {anime.genres?.map((g) => (
            <span key={g} className="text-[10px] font-semibold px-2 py-1 rounded-full"
                  style={{ background: "rgba(96,165,250,0.12)", color: "#7DD3FC", border: "1px solid rgba(96,165,250,0.25)" }}>
              {g}
            </span>
          ))}
          {anime.studios?.nodes?.[0]?.name && (
            <span className="text-[10px] font-semibold px-2 py-1 rounded-full"
                  style={{ background: "rgba(244,114,182,0.12)", color: "#F472B6", border: "1px solid rgba(244,114,182,0.25)" }}>
              🎨 {anime.studios.nodes[0].name}
            </span>
          )}
        </div>

        {/* Synopsis */}
        <Section title="📖 Sinopsis">
          <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "rgba(255,255,255,0.85)" }}>
            {synopsisExpanded ? synopsisRaw : synopsisShort}
          </p>
          {synopsisRaw.length > 380 && (
            <button
              onClick={() => setSynopsisExpanded((s) => !s)}
              className="mt-2 text-xs font-bold"
              style={{ color: "#7DD3FC" }}
            >
              {synopsisExpanded ? "Sembunyikan ↑" : "Baca selengkapnya ↓"}
            </button>
          )}
        </Section>

        {/* Trailer YouTube */}
        {trailerUrl && (
          <Section title="🎬 Trailer / Bocoran Resmi">
            <div className="rounded-2xl overflow-hidden" style={{ aspectRatio: "16/9", background: "rgba(0,0,0,0.5)" }}>
              <iframe
                src={trailerUrl}
                title={`Trailer ${title}`}
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="w-full h-full"
                style={{ border: 0 }}
              />
            </div>
            <a
              href={`https://www.youtube.com/watch?v=${anime.trailer!.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-2 text-xs font-bold"
              style={{ color: "#FF4444" }}
            >
              🔗 Buka di YouTube
            </a>
          </Section>
        )}

        {/* Karakter + VA */}
        {charList.length > 0 && (
          <Section title="🎭 Karakter & Pengisi Suara (VA)">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {charList.map((edge, i) => (
                <div key={i} className="rounded-xl overflow-hidden p-2"
                     style={{ background: "rgba(15,15,27,0.55)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div className="flex items-center gap-2 mb-1">
                    {edge.node.image?.medium ? (
                      <img
                        src={proxyImg(edge.node.image.medium, 120)}
                        alt={edge.node.name.full}
                        loading="lazy"
                        className="rounded-full object-cover"
                        style={{ width: 38, height: 38 }}
                      />
                    ) : (
                      <div className="rounded-full"
                           style={{ width: 38, height: 38, background: "rgba(255,255,255,0.06)" }} />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-white line-clamp-1">{edge.node.name.full}</p>
                      <p className="text-[9px] uppercase tracking-wide" style={{ color: edge.role === "MAIN" ? "#7DD3FC" : "rgba(255,255,255,0.45)" }}>
                        {edge.role}
                      </p>
                    </div>
                  </div>
                  {edge.voiceActors?.[0] && (
                    <div className="flex items-center gap-1.5 mt-1 pt-1" style={{ borderTop: "1px dashed rgba(255,255,255,0.08)" }}>
                      {edge.voiceActors[0].image?.medium ? (
                        <img
                          src={proxyImg(edge.voiceActors[0].image.medium, 64)}
                          alt={edge.voiceActors[0].name.full}
                          loading="lazy"
                          className="rounded-full object-cover"
                          style={{ width: 22, height: 22 }}
                        />
                      ) : (
                        <span style={{ fontSize: 12 }}>🎙️</span>
                      )}
                      <p className="text-[10px] font-medium truncate" style={{ color: "rgba(255,255,255,0.6)" }}>
                        🎙 {edge.voiceActors[0].name.full}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Staff kreatif */}
        {staffList.length > 0 && (
          <Section title="🎥 Staf Kreatif">
            <div className="space-y-1.5">
              {staffList.map((edge, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl"
                     style={{ background: "rgba(15,15,27,0.55)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {edge.node.image?.medium ? (
                    <img
                      src={proxyImg(edge.node.image.medium, 64)}
                      alt={edge.node.name.full}
                      loading="lazy"
                      className="rounded-full object-cover"
                      style={{ width: 28, height: 28 }}
                    />
                  ) : (
                    <div className="rounded-full"
                         style={{ width: 28, height: 28, background: "rgba(255,255,255,0.06)" }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white line-clamp-1">{edge.node.name.full}</p>
                    <p className="text-[10px] line-clamp-1" style={{ color: "rgba(255,255,255,0.55)" }}>
                      {edge.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Tautan eksternal (ke AniList page resmi anime ini) */}
        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={`https://myanimelist.net/anime/${anime.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-bold px-3 py-2 rounded-full inline-flex items-center gap-1.5"
            style={{ background: "rgba(79,209,255,0.15)", color: "#4FD1FF", border: "1px solid rgba(79,209,255,0.3)" }}
          >
            🔗 Lihat di MyAnimeList
          </a>
          {anime.averageScore != null && (
            <a
              href={`https://myanimelist.net/anime/${anime.id}/reviews`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold px-3 py-2 rounded-full inline-flex items-center gap-1.5"
              style={{ background: "rgba(125,211,252,0.15)", color: "#7DD3FC", border: "1px solid rgba(125,211,252,0.3)" }}
            >
              ⭐ Skor MAL: {(anime.averageScore / 10).toFixed(2)}
            </a>
          )}
        </div>
      </div>

      {/* ── LawrenzBot AI Chat — FAB mengambang (portal ke body),
              konteks anime-nya lengkap: judul, sinopsis, tanggal, status,
              karakter, studio. Tap tombol oranye ➜ chat panel terbuka. */}
      <AnimeAIChat context={aiContext} />
    </div>
  );
}

/** useScrollY — RAF-throttled window scroll listener, return posisi y. */
function useScrollY() {
  const [y, setY] = useState(0);
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (!raf) {
        raf = requestAnimationFrame(() => { setY(window.scrollY); raf = 0; });
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return y;
}

/** Hook: section reveal-on-scroll via IntersectionObserver. */
function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { threshold: 0.12, rootMargin: "0px 0px -60px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, visible } as const;
}

/** SparkleField — fixed overlay berisi 28 partikel bintang kelap-kelip.
 *  Setiap sparkle punya posisi, ukuran, warna, dan animasi pulse unik. */
function SparkleField() {
  const sparkles = useMemo(() => Array.from({ length: 28 }).map((_, i) => ({
    l: (i * 11.3) % 100,
    t: (i * 7.7) % 100,
    s: 1.6 + ((i * 3) % 5) * 0.6,
    c: ["#7DD3FC", "#F472B6", "#FBBF24", "#A78BFA", "#34D399", "#FF8C42"][i % 6],
    d: 2.4 + (i % 4) * 0.7,
    delay: (i % 9) * 0.35,
  })), []);
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden"
         aria-hidden="true" style={{ zIndex: 1 }}>
      {sparkles.map((sp, i) => (
        <span key={i} aria-hidden
          style={{
            position: "absolute",
            left: `${sp.l}%`,
            top: `${sp.t}%`,
            width: sp.s,
            height: sp.s,
            borderRadius: "50%",
            background: sp.c,
            boxShadow: `0 0 ${sp.s * 6}px ${sp.c}, 0 0 ${sp.s * 14}px ${sp.c}55`,
            animation: `sparkle-pulse ${sp.d}s ease-in-out ${sp.delay}s infinite`,
          }} />
      ))}
    </div>
  );
}

/** FlipCell — 1 unit countdown: nilai 2 digit + label, dengan animasi
 *  flip-down setiap kali value berubah. */
function FlipCell({ value, label }: { value: number; label: string }) {
  const padded = String(value).padStart(2, "0");
  return (
    <div className="flex flex-col items-center rounded-2xl px-2 py-1.5"
         style={{
           background: "linear-gradient(160deg, rgba(125,211,252,0.10) 0%, rgba(255,107,0,0.10) 100%)",
           border: "1px solid rgba(125,211,252,0.30)",
           minWidth: 60,
           backdropFilter: "blur(8px)",
           boxShadow: "inset 0 1px 0 rgba(255,255,255,0.10), 0 4px 12px rgba(0,0,0,0.3)",
         }}>
      <div className="relative overflow-hidden" style={{ height: 30 }}>
        <span key={padded} className="flip-digit changed text-2xl font-black tabular-nums"
              style={{ color: "#7DD3FC", textShadow: "0 0 12px rgba(96,165,250,0.85)", lineHeight: 1 }}>
          {padded}
        </span>
      </div>
      <span className="text-[9px] font-black uppercase tracking-widest mt-1"
            style={{ color: "rgba(125,211,252,0.7)" }}>
        {label}
      </span>
    </div>
  );
}

/** FlipCountdown — multi-unit cinematic countdown (tahun/bln/hari/jam/mnt/dtk)
 *  dengan flip animation per detik. Lebih mewah dari teks polos. */
function FlipCountdown({ airingAt }: { airingAt: number }) {
  useTick(1000);
  const remaining = Math.max(0, airingAt - Math.floor(Date.now() / 1000));
  const SEC_PER_MIN = 60, SEC_PER_HOUR = 3600, SEC_PER_DAY = 86400;
  const SEC_PER_MONTH = 30 * SEC_PER_DAY, SEC_PER_YEAR = 365 * SEC_PER_DAY;
  const years = Math.floor(remaining / SEC_PER_YEAR);
  const months = Math.floor((remaining % SEC_PER_YEAR) / SEC_PER_MONTH);
  const days = Math.floor((remaining % SEC_PER_MONTH) / SEC_PER_DAY);
  const hours = Math.floor((remaining % SEC_PER_DAY) / SEC_PER_HOUR);
  const mins = Math.floor((remaining % SEC_PER_HOUR) / SEC_PER_MIN);
  const secs = remaining % SEC_PER_MIN;
  return (
    <div className="flex items-end justify-center gap-1.5 flex-wrap">
      {years > 0 ? <FlipCell value={years} label="tahun" /> : null}
      {months > 0 ? <FlipCell value={months} label="bln" /> : null}
      <FlipCell value={days} label="hari" />
      <FlipCell value={hours} label="jam" />
      <FlipCell value={mins} label="mnt" />
      <FlipCell value={secs} label="dtk" />
    </div>
  );
}

/** ProgressRing — SVG lingkaran progres yang fill dari 0% ke 100% berdasarkan
 *  days-to-release (cap 365d). Tiap hari, ring makin penuh → sebelum release 100%.
 *  Re-render tiap menit via useTick(60_000) supaya progress parity dengan countdown detik. */
function ProgressRing({ airingAt, size = 64 }: { airingAt: number; size?: number }) {
  useTick(60_000);
  const daysLeft = Math.max(0, Math.ceil((airingAt - Date.now() / 1000) / 86400));
  const percent = Math.max(0, Math.min(100, ((365 - Math.min(daysLeft, 365)) / 365) * 100));
  const radius = size / 2 - 4;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - percent / 100);
  return (
    <div className="relative inline-flex items-center justify-center flex-shrink-0"
         style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
                stroke="rgba(125,211,252,0.18)" strokeWidth="3" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#7DD3FC"
                strokeWidth="3"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
                style={{ transition: "stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)",
                         filter: "drop-shadow(0 0 6px #7DD3FC88)" }} />
      </svg>
      <div className="absolute inset-0 flex items-baseline justify-center font-black tabular-nums"
           style={{ color: "#7DD3FC", textShadow: "0 0 10px rgba(125,211,252,0.85)" }}>
        <span className="text-xl leading-none">{daysLeft}</span>
        <span className="text-[10px] ml-0.5 leading-none" style={{ color: "rgba(125,211,252,0.75)" }}>d</span>
      </div>
    </div>
  );
}

/** MusicWave — 15 vertical bars pulse dengan delay bertingkat.
 *  Pengaruh visualizer equalizer di bawah FlipCountdown — anime-cyber vibe. */
function MusicWave() {
  return (
    <div className="flex items-end justify-center gap-1 mx-auto" style={{ height: 26 }}>
      {Array.from({ length: 15 }).map((_, i) => (
        <span key={i}
          className="w-1 rounded-full wave-bar"
          style={{
            background: "linear-gradient(180deg, #7DD3FC 0%, #F472B6 100%)",
            animationDelay: `${(i % 7) * 0.12}s`,
            animationDuration: `${1.0 + (i % 4) * 0.2}s`,
            boxShadow: "0 0 6px rgba(125,211,252,0.6)",
            height: "100%",
          }} />
      ))}
    </div>
  );
}

/** KanjiField — 9 kanji Jepang floating semi-transparan dengan slow drift
 *  rotation. Bikin vibe anime-aesthetic di halaman detail. */
function KanjiField() {
  const kanjis = ["桜", "月", "火", "風", "空", "雪", "龍", "心", "魑"];
  return (
    <div className="kanji-field" aria-hidden="true">
      {kanjis.map((k, i) => {
        const colors = ["rgba(125,211,252,0.06)", "rgba(244,114,182,0.08)", "rgba(167,139,250,0.07)", "rgba(251,191,36,0.07)"];
        return (
          <span key={i}
            className="absolute select-none font-black"
            style={{
              left: `${(i * 13.7) % 92}%`,
              top: `${(i * 17.3) % 92}%`,
              fontSize: 90 + ((i * 11) % 70),
              color: colors[i % colors.length],
              animation: `kanji-drift ${26 + (i * 3) % 8}s ease-in-out ${i * 1.7}s infinite`,
            }}>{k}</span>
        );
      })}
    </div>
  );
}

function StatCell({ label, value, icon, color }: { label: string; value: string; icon: string; color?: string }) {
  return (
    <div className="rounded-xl px-3 py-2.5"
         style={{
           background: "rgba(15,15,27,0.55)",
           border: "1px solid rgba(255,255,255,0.08)",
         }}>
      <p className="text-[9px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.5)" }}>
        {icon} {label}
      </p>
      <p className="text-xl font-black mt-0.5" style={{ color: color ?? "#fff" }}>
        {value}
      </p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { ref, visible } = useReveal<HTMLElement>();
  return (
    <section ref={ref} className={`mb-5 reveal-section ${visible ? "is-visible" : ""}`}>
      <h2 className="text-base font-black text-white mb-2.5">{title}</h2>
      {children}
    </section>
  );
}
