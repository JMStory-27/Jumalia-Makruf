import { useState } from "react";
import { useLocation } from "wouter";
import { Bookmark } from "lucide-react";
import { getWatchlist } from "@/lib/storage";
import type { WatchStatus } from "@/lib/storage";
import { proxyImg } from "@/lib/utils";

const TABS: { key: WatchStatus | "all"; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "watching", label: "Nonton" },
  { key: "completed", label: "Selesai" },
  { key: "plan_to_watch", label: "Rencana" },
  { key: "on_hold", label: "Ditunda" },
  { key: "dropped", label: "Drop" },
];

const STATUS_COLORS: Record<WatchStatus, string> = {
  watching: "#00C9FF",
  completed: "#00FF9C",
  plan_to_watch: "#FF6B00",
  on_hold: "#FFD700",
  dropped: "#FF4444",
};

export default function Watchlist() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<WatchStatus | "all">("all");
  const list = getWatchlist();
  const filtered = activeTab === "all" ? list : list.filter((i) => i.status === activeTab);

  return (
    <div className="min-h-screen pb-24" style={{ background: "#07070e" }}>
      <div className="sticky top-0 z-40 px-4 py-3"
        style={{ background: "rgba(7,7,14,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <h1 className="text-lg font-bold text-white mb-3">Daftar Tontonan</h1>
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {TABS.map((t) => {
            const count = t.key === "all" ? list.length : list.filter((i) => i.status === t.key).length;
            const isActive = activeTab === t.key;
            return (
              <button key={t.key} onClick={() => setActiveTab(t.key)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                style={{
                  background: isActive ? "#FF6B00" : "rgba(255,255,255,0.06)",
                  color: isActive ? "#fff" : "#6E6E90",
                }}
                data-testid={`watchlist-tab-${t.key}`}
              >
                {t.label} {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 py-4">
        {filtered.length === 0 ? (
          <div className="text-center py-20 space-y-3">
            <Bookmark size={48} className="mx-auto opacity-20" style={{ color: "#FF6B00" }} />
            <p className="text-base font-bold text-white">Belum ada anime di sini</p>
            <p className="text-sm" style={{ color: "#6E6E90" }}>Tambahkan anime dari halaman detail</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((item) => (
              <button
                key={item.animeId}
                onClick={() => setLocation(`/anime/${item.animeId}`)}
                className="w-full flex gap-3 p-3 rounded-xl text-left transition-all active:scale-[0.98]"
                style={{ background: "#0f0f1b", border: "1px solid rgba(255,255,255,0.06)" }}
                data-testid={`watchlist-item-${item.animeId}`}
              >
                <div className="flex-shrink-0 w-[60px] h-[85px] rounded-lg overflow-hidden">
                  <img src={proxyImg(item.poster, 90)} alt={item.title} className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = "https://via.placeholder.com/60x85/0f0f1b/6E6E90?text=?"; }} />
                </div>
                <div className="flex flex-col justify-between flex-1 min-w-0 py-0.5">
                  <p className="text-sm font-bold text-white line-clamp-2 leading-tight">{item.title}</p>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                        style={{ background: `${STATUS_COLORS[item.status]}22`, color: STATUS_COLORS[item.status] }}>
                        {item.status === "watching" ? "Nonton" : item.status === "completed" ? "Selesai" : item.status === "plan_to_watch" ? "Rencana" : item.status === "on_hold" ? "Ditunda" : "Drop"}
                      </span>
                      <span className="text-xs" style={{ color: "#6E6E90" }}>
                        {item.progress}/{item.totalEpisodes || "?"} eps
                      </span>
                    </div>
                    {item.totalEpisodes > 0 && (
                      <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (item.progress / item.totalEpisodes) * 100)}%`, background: STATUS_COLORS[item.status] }} />
                      </div>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
