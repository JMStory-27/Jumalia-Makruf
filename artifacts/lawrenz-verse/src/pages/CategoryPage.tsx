import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Grid3x3, List, SlidersHorizontal } from "lucide-react";
import TopNavBar from "@/components/TopNavBar";
import BottomNav from "@/components/BottomNav";
import ContentCard from "@/components/ContentCard";
import { fetchFeed, FALLBACK } from "@/lib/api";
import type { ContentType } from "@/lib/types";
import { CATEGORY_META } from "@/lib/types";

const GENRES: Record<ContentType, string[]> = {
  dracin: ["Semua", "Romance", "Fantasy", "Historical", "Wuxia", "Action", "Comedy", "Thriller"],
  drakor: ["Semua", "Romance", "Drama", "Comedy", "Thriller", "Fantasy", "Life", "Mystery"],
  film:   ["Semua", "Action", "Drama", "Comedy", "Thriller", "Horror", "Sci-Fi", "Animation"],
  series: ["Semua", "Drama", "Action", "Crime", "Sci-Fi", "Horror", "Fantasy", "Thriller"],
};

export default function CategoryPage() {
  const { type } = useParams<{ type: string }>();
  const [, navigate] = useLocation();
  const ct = (type as ContentType) ?? "dracin";
  const meta = CATEGORY_META[ct] ?? CATEGORY_META.dracin;

  const [genre, setGenre]   = useState("Semua");
  const [status, setStatus] = useState("Semua");
  const [sort, setSort]     = useState("Terbaru");
  const [view, setView]     = useState<"grid" | "list">("grid");

  const { data, isLoading } = useQuery({
    queryKey: ["feed", ct],
    queryFn: () => fetchFeed(ct),
  });

  let items = data?.items ?? FALLBACK[ct] ?? [];
  if (genre !== "Semua")    items = items.filter(c => c.genres?.includes(genre));
  if (status !== "Semua")   items = items.filter(c => c.status === status);
  if (sort === "Rating")    items = [...items].sort((a, b) => parseFloat(b.rating ?? "0") - parseFloat(a.rating ?? "0"));
  if (sort === "A-Z")       items = [...items].sort((a, b) => a.title.localeCompare(b.title));

  return (
    <div className="min-h-screen pb-28">
      <TopNavBar />

      {/* Banner */}
      <div className="pt-14 relative overflow-hidden"
        style={{ background: meta.bgGrad, borderBottom: `1px solid ${meta.primaryColor}18` }}>
        <div className="px-4 sm:px-6 py-5">
          <button onClick={() => navigate("/")} className="flex items-center gap-1.5 text-white/40 text-xs mb-3 hover:text-white transition-colors font-space">
            <ArrowLeft size={13} /> Beranda
          </button>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 38, filter: `drop-shadow(0 0 12px ${meta.primaryColor})` }}>{meta.emoji}</span>
            <div>
              <h1 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "clamp(22px, 5vw, 32px)", fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>
                {meta.label}
              </h1>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12, marginTop: 2 }}>{items.length}+ judul tersedia</p>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-px"
          style={{ background: `linear-gradient(90deg, transparent, ${meta.primaryColor}80, transparent)` }} />
      </div>

      {/* Sticky filter bar — genre + status + sort + view all in one row */}
      <div className="sticky top-14 z-40"
        style={{ background: "rgba(4,4,10,0.97)", backdropFilter: "blur(24px)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>

        {/* Row 1: Genre pills */}
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar px-4 py-2.5">
          {GENRES[ct].map(g => (
            <button key={g} onClick={() => setGenre(g)}
              className="flex-shrink-0 px-3.5 py-1.5 rounded-full font-bold transition-all"
              style={{
                fontSize: 11,
                fontFamily: "'Space Grotesk',sans-serif",
                background: genre === g ? `${meta.primaryColor}28` : "rgba(255,255,255,0.05)",
                color: genre === g ? meta.primaryColor : "rgba(255,255,255,0.38)",
                border: `1px solid ${genre === g ? meta.primaryColor + "60" : "rgba(255,255,255,0.07)"}`,
                boxShadow: genre === g ? `0 0 10px ${meta.glowColor}` : "none",
              }}>
              {g}
            </button>
          ))}
        </div>

        {/* Row 2: Status + sort + view */}
        <div className="flex items-center gap-2 px-4 pb-2.5">
          {/* Status pills */}
          <div className="flex gap-1.5 flex-shrink-0">
            {["Semua", "Ongoing", "Completed"].map(s => (
              <button key={s} onClick={() => setStatus(s)}
                className="px-3 py-1.5 rounded-full font-bold transition-all"
                style={{
                  fontSize: 11, fontFamily: "'Space Grotesk',sans-serif",
                  background: status === s ? `${meta.primaryColor}20` : "transparent",
                  color: status === s ? meta.primaryColor : "rgba(255,255,255,0.3)",
                  border: `1px solid ${status === s ? meta.primaryColor + "45" : "rgba(255,255,255,0.07)"}`,
                }}>
                {s === "Ongoing" ? "● Ongoing" : s === "Completed" ? "✓ Completed" : s}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Sort */}
          <select value={sort} onChange={e => setSort(e.target.value)}
            className="flex-shrink-0 rounded-xl outline-none"
            style={{
              fontSize: 11, fontFamily: "'Space Grotesk',sans-serif",
              background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.55)",
              border: "1px solid rgba(255,255,255,0.09)",
              padding: "5px 10px",
            }}>
            {["Terbaru", "Rating", "A-Z"].map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* View toggle */}
          <div className="flex gap-1 flex-shrink-0">
            {(["grid", "list"] as const).map(v => (
              <button key={v} onClick={() => setView(v)}
                className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                style={{
                  background: view === v ? `${meta.primaryColor}28` : "rgba(255,255,255,0.05)",
                  color: view === v ? meta.primaryColor : "rgba(255,255,255,0.35)",
                  border: `1px solid ${view === v ? meta.primaryColor + "40" : "rgba(255,255,255,0.07)"}`,
                }}>
                {v === "grid" ? <Grid3x3 size={14} /> : <List size={14} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Results count */}
      {!isLoading && items.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2">
          <SlidersHorizontal size={11} color="rgba(255,255,255,0.2)" />
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.2)", fontFamily: "'Space Grotesk',sans-serif" }}>
            {items.length} judul
          </span>
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 px-4 sm:px-6 mt-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i}>
              <div className="skeleton" style={{ aspectRatio: "2/3", borderRadius: 12 }} />
              <div className="skeleton mt-2" style={{ height: 11, width: "70%", borderRadius: 5 }} />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-24 gap-4">
          <span style={{ fontSize: 48 }}>🔍</span>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, fontFamily: "'Space Grotesk',sans-serif" }}>
            Tidak ada hasil
          </p>
          <button onClick={() => { setGenre("Semua"); setStatus("Semua"); }}
            className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95"
            style={{
              background: `${meta.primaryColor}1a`, color: meta.primaryColor,
              border: `1px solid ${meta.primaryColor}35`,
            }}>
            Reset Filter
          </button>
        </div>
      ) : (
        <div className={`${view === "grid"
          ? "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3"
          : "flex flex-col gap-2"
        } px-4 sm:px-6 mt-1`}>
          {items.map(card => <ContentCard key={card.id} card={card} compact={view === "list"} />)}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
