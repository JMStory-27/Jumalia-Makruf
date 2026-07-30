import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";
import BottomNav from "@/components/BottomNav";
import ContentCard from "@/components/ContentCard";
import { getWatchlist, getHistory } from "@/lib/storage";
import type { ContentCard as CC } from "@/lib/types";

export default function WatchlistPage() {
  const [, navigate] = useLocation();
  const [tab, setTab]           = useState<"watchlist" | "history">("watchlist");
  const [watchlist, setWatchlist] = useState<CC[]>([]);
  const [history, setHistory]   = useState<CC[]>([]);

  useEffect(() => { setWatchlist(getWatchlist()); setHistory(getHistory()); }, []);

  const items = tab === "watchlist" ? watchlist : history;

  const tabs: [typeof tab, string, string, string][] = [
    ["watchlist", "📌 Watchlist", "#BF5FFF", `(${watchlist.length})`],
    ["history",   "🕐 Riwayat",   "#00D4FF", `(${history.length})`],
  ];

  return (
    <div className="min-h-screen pb-28">
      {/* Header */}
      <div className="sticky top-0 z-50 px-4 pt-12 pb-4"
        style={{ background: "rgba(4,4,10,0.96)", backdropFilter: "blur(22px)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate("/")} className="w-9 h-9 rounded-full glass flex items-center justify-center">
            <ArrowLeft size={15} />
          </button>
          <h1 className="font-space font-bold text-base text-white">Koleksi Saya</h1>
        </div>
        <div className="flex gap-2">
          {tabs.map(([t, label, color, count]) => (
            <button key={t} onClick={() => setTab(t)}
              className="flex-1 py-2 rounded-xl text-[10px] font-bold font-space"
              style={{
                background: tab === t ? `${color}1a` : "rgba(255,255,255,0.04)",
                color: tab === t ? color : "rgba(255,255,255,0.3)",
                border: `1px solid ${tab === t ? color + "3a" : "rgba(255,255,255,0.07)"}`,
                boxShadow: tab === t ? `0 0 10px ${color}28` : "none",
              }}>
              {label} {count}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center py-20 gap-4">
            <span style={{ fontSize: 52 }}>{tab === "watchlist" ? "📌" : "🕐"}</span>
            <p className="text-white/35 text-sm font-space text-center leading-relaxed">
              {tab === "watchlist"
                ? "Belum ada yang disimpan.\nTekan ikon bookmark di card!"
                : "Belum ada riwayat tontonan."}
            </p>
            <button onClick={() => navigate("/")}
              className="px-5 py-2 rounded-xl text-xs font-bold"
              style={{ background: "rgba(191,95,255,0.15)", color: "#BF5FFF", border: "1px solid rgba(191,95,255,0.25)" }}>
              Jelajahi Konten
            </button>
          </div>
        ) : (
          <>
            <p className="text-white/25 text-[10px] mb-3 font-space">{items.length} judul</p>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {items.map(c => <ContentCard key={c.id} card={c} />)}
            </div>
          </>
        )}
      </div>

      <BottomNav />
    </div>
  );
}
