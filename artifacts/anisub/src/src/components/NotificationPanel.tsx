import { useState, useEffect, useRef } from "react";
import { X, Crown, Bell, Zap, Star, Calendar, Heart, BookOpen } from "lucide-react";
import { getNotifications, markRead, markAllRead, type AppNotification } from "@/lib/notifications";

const TYPE_ICON: Record<string, React.ReactNode> = {
  episode: <Zap size={13} style={{ color: "#FF6B00" }} />,
  recommendation: <Star size={13} style={{ color: "#A78BFA" }} />,
  admin: <Crown size={13} style={{ color: "#FFD700" }} />,
  welcome_back: <Heart size={13} style={{ color: "#F472B6" }} />,
  award: <BookOpen size={13} style={{ color: "#34D399" }} />,
};
const TYPE_COLOR: Record<string, string> = {
  episode: "#FF6B00", recommendation: "#A78BFA", admin: "#FFD700",
  welcome_back: "#F472B6", award: "#34D399",
};

function timeSince(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Baru saja";
  if (m < 60) return `${m} menit lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  return `${Math.floor(h / 24)} hari lalu`;
}

function NotifItem({ n, onRead }: { n: AppNotification; onRead: (id: string) => void }) {
  const color = TYPE_COLOR[n.type] ?? "#60A5FA";
  const isAdmin = n.type === "admin" || n.adminBadge;
  return (
    <div
      onClick={() => !n.read && onRead(n.id)}
      className="flex gap-3 p-3 rounded-2xl cursor-pointer transition-all active:scale-[0.98]"
      style={{
        background: n.read ? "rgba(255,255,255,0.02)" : `${color}10`,
        border: `1px solid ${n.read ? "rgba(255,255,255,0.05)" : color + "30"}`,
        marginBottom: 8,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Admin glow line */}
      {isAdmin && (
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
          boxShadow: `0 0 10px ${color}88`,
        }} />
      )}

      {/* Thumbnail or Icon */}
      {n.thumbnail ? (
        <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 12, overflow: "hidden", border: `1.5px solid ${color}44` }}>
          <img src={n.thumbnail} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      ) : (
        <div style={{
          width: 44, height: 44, flexShrink: 0, borderRadius: 12,
          background: `${color}15`, border: `1.5px solid ${color}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          {TYPE_ICON[n.type] ?? <Bell size={13} />}
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
          {isAdmin && (
            <span style={{
              fontSize: 9, fontWeight: 900, padding: "1px 6px", borderRadius: 999,
              background: `linear-gradient(135deg, #FFD700, #FF6B00)`,
              color: "#000", letterSpacing: "0.05em",
            }}>
              👑 OWNER
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 800, color: n.read ? "#64748B" : "#F1F5F9", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {n.title}
          </span>
          {!n.read && (
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0 }} />
          )}
        </div>
        <p style={{ fontSize: 11, color: "#64748B", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {n.body}
        </p>
        <p style={{ fontSize: 10, color: "#475569", marginTop: 4 }}>{timeSince(n.timestamp)}</p>
      </div>
    </div>
  );
}

export default function NotificationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [notifs, setNotifs] = useState<AppNotification[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) setNotifs(getNotifications());
  }, [open]);

  const handleRead = (id: string) => {
    markRead(id);
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const handleMarkAll = () => {
    markAllRead();
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90]"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panelRef}
        className="absolute left-0 right-0 bottom-0 rounded-t-3xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #0c0c1e 0%, #07070e 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderBottom: "none",
          maxHeight: "80vh",
          animation: "slide-up-fade 0.3s ease both",
        }}
      >
        {/* Header */}
        <div style={{ padding: "20px 16px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 34, height: 34, borderRadius: 12, background: "rgba(96,165,250,0.15)", border: "1.5px solid rgba(96,165,250,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Bell size={16} color="#60A5FA" />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 900, color: "#F1F5F9" }}>Notifikasi</p>
              <p style={{ fontSize: 10, color: "#475569" }}>{notifs.filter(n => !n.read).length} belum dibaca</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {notifs.some(n => !n.read) && (
              <button onClick={handleMarkAll} style={{ fontSize: 11, fontWeight: 700, color: "#60A5FA", background: "rgba(96,165,250,0.1)", border: "1px solid rgba(96,165,250,0.2)", padding: "4px 10px", borderRadius: 999 }}>
                Tandai Semua
              </button>
            )}
            <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <X size={15} color="#94A3B8" />
            </button>
          </div>
        </div>

        {/* Notification list */}
        <div style={{ overflowY: "auto", maxHeight: "calc(80vh - 80px)", padding: "12px 16px 32px" }}>
          {notifs.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ fontSize: 40 }}>🔔</div>
              <p style={{ color: "#475569", fontSize: 13, marginTop: 12 }}>Belum ada notifikasi</p>
              <p style={{ color: "#334155", fontSize: 11, marginTop: 4 }}>Notifikasi anime akan muncul di sini</p>
            </div>
          ) : (
            notifs.map(n => <NotifItem key={n.id} n={n} onRead={handleRead} />)
          )}
        </div>
      </div>
    </div>
  );
}
