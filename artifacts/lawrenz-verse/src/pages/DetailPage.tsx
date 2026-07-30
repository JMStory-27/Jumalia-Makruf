import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Play, Bookmark, BookmarkCheck, Share2, Star, Globe, ChevronDown, ChevronUp } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import ContentCard from "@/components/ContentCard";
import { FALLBACK, fetchDetail } from "@/lib/api";
import type { ContentCard as CC, ContentType } from "@/lib/types";
import { CATEGORY_META } from "@/lib/types";
import { gradientFromTitle } from "@/lib/utils";
import { toggleWatchlist, isInWatchlist } from "@/lib/storage";
import { toast } from "sonner";

const ALL_FALLBACK = [
  ...FALLBACK.dracin,
  ...FALLBACK.drakor,
  ...FALLBACK.film,
  ...FALLBACK.series,
];

export default function DetailPage() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const [, navigate] = useLocation();
  const [bookmarked, setBookmarked] = useState(false);
  const [expand, setExpand] = useState(false);

  const ct = (type as ContentType) ?? "dracin";
  const meta = CATEGORY_META[ct];
  const decodedId = decodeURIComponent(id ?? "");

  const fallbackItem = ALL_FALLBACK.find((c) => c.id === decodedId);
  const [item, setItem] = useState<CC | undefined>(fallbackItem);
  const [loading, setLoading] = useState(!fallbackItem);

  useEffect(() => { setBookmarked(isInWatchlist(decodedId)); }, [decodedId]);

  useEffect(() => {
    if (fallbackItem) { setItem(fallbackItem); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchDetail(decodedId)
      .then((d) => { if (!cancelled && d) setItem(d); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [decodedId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-2 animate-spin"
            style={{ borderColor: `${meta.primaryColor}33`, borderTopColor: meta.primaryColor }} />
          <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, fontFamily: "'Space Grotesk',sans-serif" }}>
            Memuat detail…
          </p>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 pb-24">
        <p style={{ fontSize: 52 }}>🌌</p>
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, fontFamily: "'Space Grotesk',sans-serif" }}>
          Konten tidak ditemukan
        </p>
        <button onClick={() => navigate(-1 as unknown as string)}
          className="px-5 py-2.5 rounded-xl text-sm font-bold"
          style={{ background: `${meta.primaryColor}22`, color: meta.primaryColor, border: `1px solid ${meta.primaryColor}35` }}>
          ← Kembali
        </button>
        <BottomNav />
      </div>
    );
  }

  const grad = gradientFromTitle(item.title);
  const recs = FALLBACK[ct].filter((c) => c.id !== item.id).slice(0, 8);
  const totalEp = item.totalEpisodes || parseInt(item.episodes ?? "12") || 12;
  const isMovie = item.mediaType === "movie";
  const fakeEps = !isMovie
    ? Array.from({ length: Math.min(totalEp, 60) }, (_, i) => i + 1)
    : [];

  function handleBookmark() {
    const added = toggleWatchlist(item!);
    setBookmarked(added);
    toast(added ? "✅ Ditambahkan ke Watchlist" : "🗑️ Dihapus dari Watchlist");
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({ title: item!.title, url: window.location.href });
    } else {
      navigator.clipboard.writeText(window.location.href).then(() => toast("🔗 Link disalin!"));
    }
  }

  function goWatch(ep = 1) {
    navigate(`/watch/${ct}/${encodeURIComponent(item!.id)}?ep=${ep}`);
  }

  return (
    <div className="min-h-screen pb-28">
      {/* Hero backdrop */}
      <div className="relative" style={{ height: "clamp(280px, 52vw, 420px)" }}>
        <div className="absolute inset-0" style={{ background: grad }} />
        {item.poster && (
          <img src={item.poster} alt={item.title}
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: 0.3, filter: "blur(3px) saturate(140%)", transform: "scale(1.05)" }}
          />
        )}
        <div className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(4,4,10,1) 0%, rgba(4,4,10,0.2) 55%, rgba(4,4,10,0.5) 100%)" }}
        />

        {/* Action buttons */}
        <button onClick={() => navigate(-1 as unknown as string)}
          className="absolute top-12 left-4 w-10 h-10 rounded-full glass flex items-center justify-center z-10">
          <ArrowLeft size={18} />
        </button>

        <div className="absolute top-12 right-4 flex gap-2 z-10">
          <button onClick={handleShare}
            className="w-10 h-10 rounded-full glass flex items-center justify-center">
            <Share2 size={16} />
          </button>
          <button onClick={handleBookmark}
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
            style={{
              background: bookmarked ? `${meta.primaryColor}2a` : "rgba(255,255,255,0.08)",
              border: `1px solid ${bookmarked ? meta.primaryColor + "50" : "rgba(255,255,255,0.1)"}`,
            }}>
            {bookmarked
              ? <BookmarkCheck size={16} color={meta.primaryColor} fill={meta.primaryColor} />
              : <Bookmark size={16} />}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 sm:px-6 -mt-24 relative z-10">

        {/* Poster + Info row */}
        <div className="flex gap-4 mb-5">
          {/* Poster */}
          <div className="flex-shrink-0" style={{
            width: "clamp(100px, 26vw, 140px)",
            aspectRatio: "2/3",
            borderRadius: 14,
            border: `2.5px solid ${meta.primaryColor}`,
            boxShadow: `0 0 24px ${meta.glowColor}, 0 8px 32px rgba(0,0,0,0.7)`,
            overflow: "hidden",
            background: grad,
          }}>
            {item.poster && <img src={item.poster} alt={item.title} className="w-full h-full object-cover" />}
          </div>

          {/* Info */}
          <div className="flex-1 pt-6">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold mb-2"
              style={{ background: `${meta.primaryColor}1a`, color: meta.primaryColor, border: `1px solid ${meta.primaryColor}3a` }}>
              {meta.emoji} {meta.label}
            </span>
            <h1 style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: "clamp(16px, 4vw, 24px)",
              fontWeight: 800,
              lineHeight: 1.25,
              color: "#fff",
              marginBottom: 10,
            }}>
              {item.title}
            </h1>

            {/* Meta badges */}
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {item.rating && (
                <span className="flex items-center gap-1 font-bold text-xs" style={{ color: "#FFD700" }}>
                  <Star size={11} fill="#FFD700" />{item.rating}
                </span>
              )}
              {item.year && <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>{item.year}</span>}
              {item.episodes && (
                <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {item.episodes}{ct !== "film" ? " Ep" : ""}
                </span>
              )}
              {item.country && (
                <span className="flex items-center gap-1 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                  <Globe size={10} />{item.country}
                </span>
              )}
            </div>

            {item.status && (
              <span className="inline-block mt-2.5 text-[11px] px-2.5 py-1 rounded-full font-bold"
                style={{
                  background: item.status === "Ongoing" ? `${meta.primaryColor}1a` : "rgba(255,255,255,0.05)",
                  color: item.status === "Ongoing" ? meta.primaryColor : "#6b6b90",
                }}>
                {item.status === "Ongoing" ? "● ONGOING" : "✓ COMPLETED"}
              </span>
            )}
          </div>
        </div>

        {/* Genres */}
        {item.genres && item.genres.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-4">
            {item.genres.map((g) => (
              <span key={g} className="px-3 py-1.5 rounded-full text-[11px] font-semibold"
                style={{ background: `${meta.primaryColor}12`, color: meta.primaryColor, border: `1px solid ${meta.primaryColor}28` }}>
                {g}
              </span>
            ))}
          </div>
        )}

        {/* Watch button */}
        <button onClick={() => goWatch(1)}
          className="w-full py-4 rounded-2xl font-bold text-[15px] flex items-center justify-center gap-2.5 active:scale-98 transition-transform mb-5"
          style={{
            background: `linear-gradient(135deg, ${meta.primaryColor}, ${meta.secondaryColor})`,
            color: "#fff",
            boxShadow: `0 6px 24px ${meta.glowColor}`,
            fontFamily: "'Space Grotesk', sans-serif",
          }}>
          <Play size={18} fill="white" />
          {isMovie ? "Tonton Film" : "Tonton Ep 1"}
        </button>

        {/* Synopsis */}
        {item.synopsis && (
          <div className="mb-5 rounded-2xl px-4 py-4"
            style={{ background: "rgba(14,11,28,0.6)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", marginBottom: 8 }}>
              Sinopsis
            </h3>
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, lineHeight: 1.7 }}>
              {expand ? item.synopsis : item.synopsis.slice(0, 200) + (item.synopsis.length > 200 ? "…" : "")}
            </p>
            {item.synopsis.length > 200 && (
              <button onClick={() => setExpand(!expand)}
                className="flex items-center gap-1 mt-2 font-bold text-xs"
                style={{ color: meta.primaryColor }}>
                {expand ? <><ChevronUp size={13} /> Lebih sedikit</> : <><ChevronDown size={13} /> Selengkapnya</>}
              </button>
            )}
          </div>
        )}

        {/* Episode list */}
        {fakeEps.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14, color: "#fff" }}>
                Daftar Episode
              </h3>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", fontFamily: "'Space Grotesk',sans-serif" }}>
                {fakeEps.length} ep
              </span>
            </div>
            <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
              {fakeEps.map((ep) => (
                <button key={ep} onClick={() => goWatch(ep)}
                  className="py-3 rounded-xl font-bold text-center transition-all active:scale-95"
                  style={{
                    fontSize: 13,
                    background: `${meta.primaryColor}12`,
                    color: meta.primaryColor,
                    border: `1px solid ${meta.primaryColor}25`,
                    fontFamily: "'Space Grotesk',sans-serif",
                  }}>
                  {ep}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {recs.length > 0 && (
          <div className="mb-4">
            <h3 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 14, color: "#fff", marginBottom: 12 }}>
              Rekomendasi
            </h3>
            <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-2">
              {recs.map((c) => <ContentCard key={c.id} card={c} />)}
            </div>
          </div>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
