import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { TrendingUp, Clock, Sparkles } from "lucide-react";
import TopNavBar from "@/components/TopNavBar";
import BottomNav from "@/components/BottomNav";
import HeroCarousel from "@/components/HeroCarousel";
import CategoryRow from "@/components/CategoryRow";
import LiveUpdateTicker from "@/components/LiveUpdateTicker";
import ContentCard from "@/components/ContentCard";
import { fetchFeed, fetchTrending, fetchTodayUpdates, FALLBACK } from "@/lib/api";
import { CATEGORY_META } from "@/lib/types";
import { getHistory } from "@/lib/storage";

function SectionTitle({ icon, title, badge }: { icon: React.ReactNode; title: string; badge?: string }) {
  return (
    <div className="flex items-center gap-2.5 px-4 sm:px-6 mb-4">
      <div className="section-bar h-5" />
      {icon}
      <h2 style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 800, fontSize: 15, color: "#f5f0ff" }}>
        {title}
      </h2>
      {badge && (
        <span style={{
          fontSize: 9, padding: "2px 8px", borderRadius: 9999, fontWeight: 800,
          background: "rgba(251,191,36,0.12)", color: "#FBBF24",
          border: "1px solid rgba(251,191,36,0.28)",
        }}>
          {badge}
        </span>
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex gap-3 overflow-x-hidden px-4 sm:px-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex-shrink-0" style={{ width: 130 }}>
          <div className="skeleton" style={{ aspectRatio: "2/3", borderRadius: 12 }} />
          <div className="skeleton mt-2" style={{ height: 11, width: "78%", borderRadius: 6 }} />
          <div className="skeleton mt-1.5" style={{ height: 9, width: "45%", borderRadius: 6 }} />
        </div>
      ))}
    </div>
  );
}

export default function HomePage() {
  const [, navigate] = useLocation();

  const defaultTrending = (() => {
    const seen = new Set<string>();
    return [...FALLBACK.drakor.slice(0,3), ...FALLBACK.dracin.slice(0,3), ...FALLBACK.film.slice(0,2), ...FALLBACK.series.slice(0,2)]
      .filter(c => seen.has(c.id) ? false : (seen.add(c.id), true));
  })();

  const { data: trending = [] } = useQuery({ queryKey: ["trending"], queryFn: fetchTrending, initialData: defaultTrending, staleTime: 5 * 60 * 1000 });
  const { data: today = [] } = useQuery({ queryKey: ["today"], queryFn: fetchTodayUpdates, initialData: [...FALLBACK.dracin.slice(0,3), ...FALLBACK.drakor.slice(0,3)], staleTime: 5 * 60 * 1000 });
  const { data: dracinData } = useQuery({ queryKey: ["feed", "dracin"], queryFn: () => fetchFeed("dracin"), initialData: { ok: true, items: FALLBACK.dracin }, staleTime: 5 * 60 * 1000 });
  const { data: drakorData } = useQuery({ queryKey: ["feed", "drakor"], queryFn: () => fetchFeed("drakor"), initialData: { ok: true, items: FALLBACK.drakor }, staleTime: 5 * 60 * 1000 });
  const { data: filmData   } = useQuery({ queryKey: ["feed", "film"],   queryFn: () => fetchFeed("film"),   initialData: { ok: true, items: FALLBACK.film   }, staleTime: 5 * 60 * 1000 });
  const { data: seriesData } = useQuery({ queryKey: ["feed", "series"], queryFn: () => fetchFeed("series"), initialData: { ok: true, items: FALLBACK.series }, staleTime: 5 * 60 * 1000 });

  const dracin = dracinData?.items ?? FALLBACK.dracin;
  const drakor = drakorData?.items ?? FALLBACK.drakor;
  const film   = filmData?.items   ?? FALLBACK.film;
  const series = seriesData?.items ?? FALLBACK.series;

  const heroItems = trending.length >= 4 ? trending.slice(0, 8) : (() => {
    const seen = new Set<string>();
    return [...FALLBACK.drakor.slice(0, 2), ...FALLBACK.dracin.slice(0, 2), ...FALLBACK.film.slice(0, 2), ...FALLBACK.series.slice(0, 2)]
      .filter(c => seen.has(c.id) ? false : (seen.add(c.id), true));
  })();

  const top10 = trending.length >= 5 ? trending.slice(0, 10) : (() => {
    const seen = new Set<string>();
    return [...FALLBACK.drakor.slice(0, 3), ...FALLBACK.dracin.slice(0, 3), ...FALLBACK.film.slice(0, 2), ...FALLBACK.series.slice(0, 2)]
      .filter(c => seen.has(c.id) ? false : (seen.add(c.id), true));
  })();

  const history = getHistory().slice(0, 10);
  const tickerItems = today.length ? today : [...FALLBACK.dracin.slice(0, 3), ...FALLBACK.drakor.slice(0, 3)];

  const topRated = [...dracin, ...drakor, ...film]
    .sort((a, b) => parseFloat(b.rating ?? "0") - parseFloat(a.rating ?? "0"))
    .slice(0, 10);

  return (
    <div className="min-h-screen pb-28">
      <TopNavBar />

      <div className="pt-14">
        <HeroCarousel items={heroItems} />
      </div>

      <LiveUpdateTicker items={tickerItems} />

      <div className="flex flex-col gap-7 mt-6">

        {/* Continue Watching */}
        {history.length > 0 && (
          <section>
            <SectionTitle
              icon={<Clock size={16} color="#F472B6" style={{ filter: "drop-shadow(0 0 5px rgba(244,114,182,0.7))" }} />}
              title="Lanjut Nonton"
            />
            <div className="flex gap-3 overflow-x-auto hide-scrollbar px-4 sm:px-6 pb-2">
              {history.map(c => <ContentCard key={c.id} card={c} />)}
            </div>
          </section>
        )}

        {/* Top 10 Trending */}
        <section>
          <SectionTitle
            icon={<TrendingUp size={16} color="#FBBF24" style={{ filter: "drop-shadow(0 0 5px rgba(251,191,36,0.7))" }} />}
            title="Top 10 Trending"
            badge="🔥 MINGGU INI"
          />
          <div className="flex gap-5 overflow-x-auto hide-scrollbar pb-2" style={{ paddingLeft: 24, paddingRight: 16 }}>
            {top10.map((c, i) => <ContentCard key={c.id} card={c} rank={i + 1} />)}
          </div>
        </section>

        {/* Category quick access */}
        <div className="grid grid-cols-4 gap-2.5 px-4 sm:px-6">
          {(["dracin", "drakor", "film", "series"] as const).map(t => {
            const m = CATEGORY_META[t];
            return (
              <button key={t} onClick={() => navigate(`/category/${t}`)}
                className="flex flex-col items-center gap-2 py-4 rounded-2xl transition-all active:scale-95"
                style={{
                  background: `${m.primaryColor}0e`,
                  border: `1px solid ${m.primaryColor}25`,
                  boxShadow: `0 0 20px ${m.glowColor}10, inset 0 1px 0 rgba(255,255,255,0.04)`,
                  backdropFilter: "blur(8px)",
                }}>
                <span style={{ fontSize: 26, filter: `drop-shadow(0 0 7px ${m.primaryColor})` }}>{m.emoji}</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: m.primaryColor, fontFamily: "'Space Grotesk',sans-serif", letterSpacing: "0.03em" }}>
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Dracin */}
        <CategoryRow title="Dracin Terbaru" emoji="🐉" items={dracin} type="dracin" viewAllPath="/category/dracin" badge="BARU" />

        {/* Drakor */}
        <CategoryRow title="Drakor Terbaru" emoji="🇰🇷" items={drakor} type="drakor" viewAllPath="/category/drakor" badge="HOT" />

        {/* Film */}
        <CategoryRow title="Film Terbaru" emoji="🎬" items={film} type="film" viewAllPath="/category/film" />

        {/* Series */}
        <CategoryRow title="Series Dunia" emoji="📺" items={series} type="series" viewAllPath="/category/series" />

        {/* Top Rated */}
        <section>
          <SectionTitle
            icon={<Sparkles size={16} color="#FBBF24" style={{ filter: "drop-shadow(0 0 5px rgba(251,191,36,0.7))" }} />}
            title="⭐ Rating Tertinggi"
          />
          <div className="flex gap-3 overflow-x-auto hide-scrollbar px-4 sm:px-6 pb-2">
            {topRated.map(c => <ContentCard key={c.id} card={c} />)}
          </div>
        </section>

        {/* Footer */}
        <div className="px-4 sm:px-6 pb-4 text-center">
          <div className="h-px mb-5" style={{
            background: "linear-gradient(90deg, transparent, rgba(244,114,182,0.2), rgba(167,139,250,0.15), rgba(96,165,250,0.2), transparent)",
          }} />
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2.5">
              <div className="shimmer-pill" style={{ width: 36, height: 2 }} />
              <span style={{
                fontFamily: "'Orbitron',sans-serif", fontSize: 11, letterSpacing: "0.12em",
                background: "linear-gradient(90deg, #F472B6, #A78BFA, #60A5FA)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                fontWeight: 700,
              }}>
                LAWRENZVERSE
              </span>
              <div className="shimmer-pill" style={{ width: 36, height: 2 }} />
            </div>
            <p style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 10, color: "rgba(167,139,250,0.3)", letterSpacing: "0.05em" }}>
              🐉 Dracin · 🇰🇷 Drakor · 🎬 Film · 📺 Series
            </p>
          </div>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
