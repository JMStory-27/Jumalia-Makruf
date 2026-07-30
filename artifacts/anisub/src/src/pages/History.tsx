import { useLocation } from "wouter";
import { getHistory, getProgress } from "@/lib/storage";
import { usePoster } from "@/lib/usePoster";
import { titlePlaceholder, proxyImg } from "@/lib/utils";

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "Baru saja";
  if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
  return `${Math.floor(diff / 86400)} hari lalu`;
}

function fmt(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function HistoryCard({
  item,
  onClick,
}: {
  item: ReturnType<typeof getHistory>[number];
  onClick: () => void;
}) {
  const malPoster = usePoster(item.title);
  const [, setLoaded] = [false, () => {}];
  const prog = getProgress(item.episodeId);
  const pct = prog && prog.duration > 0
    ? Math.min(100, Math.round((prog.position / prog.duration) * 100))
    : 0;
  const [grad] = titlePlaceholder(item.title);

  return (
    <button
      onClick={onClick}
      className="w-full flex gap-3 p-3 rounded-2xl text-left transition-all active:scale-[0.98] overflow-hidden relative"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}
      data-testid={`history-${item.episodeId}`}
    >
      {/* Thumbnail */}
      <div
        className="flex-shrink-0 rounded-xl overflow-hidden relative"
        style={{ width: 76, height: 56 }}
      >
        <div className="absolute inset-0" style={{ background: grad }} />
        {malPoster && (
          <img
            src={proxyImg(malPoster, 120)} alt={item.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {/* Progress overlay at bottom of thumbnail */}
        {pct > 0 && (
          <div className="absolute bottom-0 left-0 right-0 h-1" style={{ background: "rgba(0,0,0,0.4)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${pct}%`,
                background: pct >= 99
                  ? "linear-gradient(90deg,#00FF9C,#00C9FF)"
                  : "linear-gradient(90deg,#667eea,#A78BFA)",
              }}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold line-clamp-1" style={{ color: "#F1F5F9" }}>
          {item.title}
        </p>
        <p className="text-xs mt-0.5" style={{ color: "#94A3B8" }}>
          📺 Episode {item.episodeNum}
        </p>

        {/* Progress time */}
        {prog && prog.position > 5 ? (
          <div className="flex items-center gap-2 mt-1.5">
            <span
              className="text-[10px] font-bold tabular-nums"
              style={{ color: pct >= 99 ? "#00FF9C" : "#A78BFA" }}
            >
              {fmt(prog.position)} / {fmt(prog.duration)}
            </span>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                background: pct >= 99 ? "rgba(0,255,156,0.12)" : "rgba(102,126,234,0.15)",
                color: pct >= 99 ? "#00FF9C" : "#A78BFA",
                border: `1px solid ${pct >= 99 ? "rgba(0,255,156,0.25)" : "rgba(102,126,234,0.25)"}`,
              }}
            >
              {pct}%
            </span>
            <span className="text-[10px]" style={{ color: "#475569" }}>
              · {timeAgo(item.timestamp)}
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 mt-1.5">
            <p className="text-[10px]" style={{ color: "#475569" }}>
              🕐 {timeAgo(item.timestamp)}
            </p>
          </div>
        )}
      </div>

      {/* Continue badge */}
      <div className="flex flex-col items-end justify-center gap-1.5 flex-shrink-0">
        <span
          className="text-[10px] font-bold px-2 py-1 rounded-full"
          style={{
            background: "rgba(96,165,250,0.15)",
            color: "#60A5FA",
            border: "1px solid rgba(96,165,250,0.25)",
          }}
        >
          ▶ Lanjut
        </span>
        {pct > 0 && pct < 100 && (
          <svg width="28" height="28" viewBox="0 0 28 28">
            <circle cx="14" cy="14" r="11" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="2.5" />
            <circle
              cx="14" cy="14" r="11" fill="none"
              stroke={pct >= 99 ? "#00FF9C" : "#667eea"} strokeWidth="2.5"
              strokeDasharray={`${(2 * Math.PI * 11 * pct) / 100} ${2 * Math.PI * 11}`}
              strokeLinecap="round"
              transform="rotate(-90 14 14)"
            />
            <text x="14" y="14" textAnchor="middle" dominantBaseline="middle"
              fill="white" fontSize="7" fontWeight="800">
              {pct}%
            </text>
          </svg>
        )}
        {pct >= 100 && (
          <span className="text-lg">✅</span>
        )}
      </div>
    </button>
  );
}

export default function History() {
  const [, setLocation] = useLocation();
  const history = getHistory();

  return (
    <div className="min-h-screen pb-24" style={{ background: "#05050f" }}>
      {/* Header */}
      <div
        className="sticky top-0 z-40 px-4 py-3"
        style={{
          background: "rgba(5,5,18,0.97)",
          backdropFilter: "blur(24px)",
          borderBottom: "1px solid rgba(96,165,250,0.1)",
        }}
      >
        <h1 className="text-lg font-black" style={{ color: "#F1F5F9" }}>
          🕐 Riwayat Tontonan
        </h1>
        {history.length > 0 && (
          <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
            {history.length} episode ditonton
          </p>
        )}
      </div>

      <div className="px-4 py-4">
        {history.length === 0 ? (
          <div className="text-center py-24 space-y-4">
            <div className="text-6xl">🌌</div>
            <p className="text-base font-bold" style={{ color: "#F1F5F9" }}>
              Riwayat masih kosong
            </p>
            <p className="text-sm" style={{ color: "#475569" }}>
              Mulai nonton anime untuk melihat riwayat di sini
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {history.map((item) => (
              <HistoryCard
                key={`${item.episodeId}-${item.timestamp}`}
                item={item}
                onClick={() => setLocation(`/watch/${item.episodeId}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
