import { useState, useEffect, useRef } from "react";
import { Search, X, TrendingUp } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import ContentCard from "@/components/ContentCard";
import { fetchSearch, FALLBACK } from "@/lib/api";
import type { ContentCard as CC, ContentType } from "@/lib/types";
import { CATEGORY_META } from "@/lib/types";

const HOT = ["The Untamed", "Crash Landing on You", "Parasite", "Goblin", "Squid Game", "Queen of Tears", "Nirvana in Fire", "Moving"];
const ALL: CC[] = [...FALLBACK.dracin, ...FALLBACK.drakor, ...FALLBACK.film, ...FALLBACK.series];

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CC[]>([]);
  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<ContentType | "all">("all");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetchSearch(q);
        setResults(res.length ? res : ALL.filter(c => c.title.toLowerCase().includes(q.toLowerCase())));
      } catch {
        setResults(ALL.filter(c => c.title.toLowerCase().includes(q.toLowerCase())));
      } finally { setLoading(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [q]);

  const filtered = typeFilter === "all" ? results : results.filter(c => c.type === typeFilter);

  return (
    <div className="min-h-screen pb-28">
      {/* Header */}
      <div className="sticky top-0 z-50 px-4 pt-12 pb-3"
        style={{ background: "rgba(4,4,10,0.96)", backdropFilter: "blur(22px)" }}>
        {/* Search input */}
        <div className="relative mb-2">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Cari dracin, drakor, film, series..."
            className="w-full pl-9 pr-9 py-3 rounded-2xl text-sm outline-none text-white placeholder-white/25 font-space"
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.09)", caretColor: "#BF5FFF" }}
          />
          {q && (
            <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X size={15} color="rgba(255,255,255,0.35)" />
            </button>
          )}
        </div>

        {/* Type filter */}
        {q && (
          <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-0.5">
            {([["all","Semua","🌐"],["dracin","Dracin","🐉"],["drakor","Drakor","🇰🇷"],["film","Film","🎬"],["series","Series","📺"]] as [string,string,string][]).map(([t,label,emoji]) => {
              const active = typeFilter === t;
              const color = t === "all" ? "#BF5FFF" : CATEGORY_META[t as ContentType]?.primaryColor ?? "#BF5FFF";
              return (
                <button key={t} onClick={() => setTypeFilter(t as typeof typeFilter)}
                  className="flex-shrink-0 px-3 py-1 rounded-full text-[10px] font-bold font-space"
                  style={{
                    background: active ? `${color}1a` : "rgba(255,255,255,0.05)",
                    color: active ? color : "rgba(255,255,255,0.3)",
                    border: `1px solid ${active ? color + "40" : "rgba(255,255,255,0.07)"}`,
                  }}>
                  {emoji} {label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Empty state */}
      {!q && (
        <div className="px-4 pt-3">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp size={13} color="#FFD700" style={{ filter: "drop-shadow(0 0 4px #FFD700)" }} />
              <h3 className="font-space font-bold text-sm text-white">🔥 Pencarian Populer</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {HOT.map(s => (
                <button key={s} onClick={() => setQ(s)}
                  className="px-3 py-1.5 rounded-xl text-[10px] font-semibold text-white/55 active:scale-95 transition-all"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <h3 className="font-space font-bold text-sm text-white mb-3">🌟 Semua Konten</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {ALL.slice(0, 12).map(c => <ContentCard key={c.id} card={c} />)}
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-12">
          <div className="flex gap-2">
            {["#FF3535","#FF4DB2","#00D4FF"].map((c, i) => (
              <div key={i} className="w-2.5 h-2.5 rounded-full"
                style={{ background: c, boxShadow: `0 0 6px ${c}`, animation: `float-up 0.7s ease-in-out ${i*0.15}s infinite` }} />
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {q && !loading && (
        <div className="px-4 mt-3">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <span style={{ fontSize: 44 }}>🔍</span>
              <p className="text-white/35 text-sm font-space">Tidak ada hasil untuk "{q}"</p>
            </div>
          ) : (
            <>
              <p className="text-white/25 text-[10px] mb-3 font-space">{filtered.length} hasil</p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {filtered.map(c => <ContentCard key={c.id} card={c} />)}
              </div>
            </>
          )}
        </div>
      )}

      <BottomNav />
    </div>
  );
}
