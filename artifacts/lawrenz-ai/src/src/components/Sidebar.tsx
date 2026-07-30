import { useLiveStats } from "@/hooks/useLiveStats";
import type { ChatMode, ChatSession } from "@/hooks/useChat";

interface Props {
  sessions: ChatSession[];
  activeSessionId: string | null;
  mode: ChatMode;
  isOpen: boolean;
  onSwitchMode: (m: ChatMode) => void;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onClose: () => void;
}

const C  = "#00D4FF";
const CA = (a: number) => `rgba(0,212,255,${a})`;
const V  = "#8B5CF6";
const VA = (a: number) => `rgba(139,92,246,${a})`;
const G  = "#00FF94";

function CoreBar({ load }: { load: number }) {
  const color = load > 0.8 ? "#FF006E" : load > 0.6 ? V : C;
  return (
    <div style={{ flex: 1, height: 4, background: CA(0.07), borderRadius: 2, overflow: "hidden" }}>
      <div style={{
        height: "100%",
        width: `${load * 100}%`,
        background: load > 0.8
          ? "linear-gradient(90deg, #FF006E, #FF4D94)"
          : load > 0.6
            ? "linear-gradient(90deg, #8B5CF6, #A78BFA)"
            : "linear-gradient(90deg, #00D4FF, #38BDF8)",
        boxShadow: `0 0 8px ${color}`,
        borderRadius: 2,
        transition: "width 0.8s ease, background 0.5s",
      }} />
    </div>
  );
}

export default function Sidebar({
  sessions, activeSessionId, mode, isOpen,
  onSwitchMode, onNewChat, onSelectSession, onClose,
}: Props) {
  const totalMessages = sessions.reduce((acc, s) => acc + s.messages.length, 0);
  const { clock, date, ping, pingStatus, uptime, coreLoad, networkBars } =
    useLiveStats(totalMessages, 0);

  const pingColor = pingStatus === "excellent" ? G : pingStatus === "good" ? C : "#FF006E";

  return (
    <aside className={`sidebar flex flex-col sidebar-responsive ${isOpen ? "sidebar-open" : ""}`}>

      {/* ── Logo header ── */}
      <div style={{
        padding: "14px 14px 12px",
        borderBottom: `1px solid ${CA(0.07)}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "relative", overflow: "hidden",
      }}>
        {/* Ambient corner glow */}
        <div style={{
          position: "absolute", top: -30, left: -30, width: 100, height: 100,
          background: `radial-gradient(circle, ${CA(0.1)} 0%, transparent 70%)`,
          pointerEvents: "none",
        }} />
        {/* Top accent line */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 1,
          background: `linear-gradient(90deg, transparent, ${CA(0.5)}, ${VA(0.3)}, transparent)`,
        }} />

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: "50%",
            background: "rgba(0,0,0,0.6)",
            border: `1.5px solid ${CA(0.55)}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: `0 0 20px ${CA(0.4)}, 0 0 50px ${CA(0.12)}, inset 0 0 12px ${CA(0.05)}`,
            animation: "glow-pulse 2.5s ease-in-out infinite",
            flexShrink: 0, overflow: "hidden",
          }}>
            <img src="/lawrenz/icon.png" alt="Z" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
          </div>
          <div>
            <div className="neon-logo" style={{ fontSize: 14, fontWeight: 800, letterSpacing: "0.06em" }}>
              Lawren<span style={{ color: V }}>Z</span> AI
            </div>
            <div style={{ fontSize: 9, color: CA(0.4), letterSpacing: "0.06em", fontFamily: "var(--app-font-mono)" }}>
              by Mas Lawrenz • v2.0
            </div>
          </div>
        </div>
        <button onClick={onClose} className="sidebar-close-btn" aria-label="Tutup menu"
          style={{
            width: 30, height: 30, borderRadius: 8,
            border: `1px solid ${CA(0.2)}`,
            background: CA(0.05),
            color: CA(0.7), cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, flexShrink: 0,
          }}>✕</button>
      </div>

      {/* ── Live status bar ── */}
      <div style={{
        padding: "8px 14px",
        borderBottom: `1px solid ${CA(0.05)}`,
        display: "flex", alignItems: "center", gap: 10,
        background: "rgba(0,0,0,0.3)",
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: "50%",
          background: G, boxShadow: `0 0 10px ${G}, 0 0 20px rgba(0,255,148,0.4)`,
          animation: "blink 1.5s ease-in-out infinite", flexShrink: 0,
        }} />
        <span style={{
          fontSize: 9, fontFamily: "var(--app-font-mono)",
          color: `rgba(0,255,148,0.7)`, letterSpacing: "0.08em", fontWeight: 700,
        }}>ONLINE</span>

        <div style={{ flex: 1 }} />

        <span style={{
          fontSize: 9, fontFamily: "var(--app-font-mono)",
          color: pingColor, letterSpacing: "0.06em",
          textShadow: `0 0 8px ${pingColor}`,
        }}>
          {ping}ms
        </span>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 10 }}>
          {[3, 5, 7, 9].map((h, i) => (
            <div key={i} style={{
              width: 2.5, height: h,
              background: i < networkBars
                ? `linear-gradient(to top, #00D4FF, #8B5CF6)`
                : CA(0.1),
              borderRadius: 1, transition: "background 0.5s",
              boxShadow: i < networkBars ? `0 0 4px ${C}` : "none",
            }} />
          ))}
        </div>

        <span style={{
          fontSize: 9, fontFamily: "var(--app-font-mono)",
          color: CA(0.75), letterSpacing: "0.06em",
          textShadow: `0 0 10px ${CA(0.5)}`,
        }}>
          {clock}
        </span>
      </div>

      {/* ── Mode Toggle ── */}
      <div style={{ padding: "12px 14px 8px" }}>
        <div style={{
          fontSize: 9, color: CA(0.28),
          marginBottom: 7, letterSpacing: "0.1em",
          textTransform: "uppercase", fontWeight: 700,
          fontFamily: "var(--app-font-mono)",
        }}>◈ ENGINE MODE</div>
        <div style={{
          display: "flex",
          background: "rgba(0,0,0,0.55)",
          border: `1px solid ${CA(0.1)}`,
          borderRadius: 10, padding: 3, gap: 3,
        }}>
          {(["daily", "coding"] as ChatMode[]).map((m) => {
            const isActive = mode === m;
            const isDaily = m === "daily";
            return (
              <button key={m} onClick={() => onSwitchMode(m)} style={{
                flex: 1, padding: "8px 0",
                borderRadius: 7, border: "none",
                fontSize: 12, fontWeight: 700,
                cursor: "pointer", letterSpacing: "0.04em",
                transition: "all 0.3s cubic-bezier(0.4,0,0.2,1)",
                background: isActive
                  ? isDaily
                    ? `linear-gradient(135deg, ${CA(0.18)}, ${VA(0.08)})`
                    : `linear-gradient(135deg, rgba(0,255,148,0.15), ${CA(0.06)})`
                  : "transparent",
                color: isActive
                  ? isDaily ? C : G
                  : CA(0.3),
                boxShadow: isActive
                  ? isDaily
                    ? `0 0 14px ${CA(0.2)}, inset 0 0 10px ${CA(0.04)}`
                    : `0 0 14px rgba(0,255,148,0.18), inset 0 0 10px rgba(0,255,148,0.03)`
                  : "none",
                textTransform: "uppercase",
                textShadow: isActive ? `0 0 10px currentColor` : "none",
              }}>
                {m === "daily" ? "✦ Daily" : "⌥ Coding"}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── New Chat ── */}
      <div style={{ padding: "0 14px 10px" }}>
        <button onClick={onNewChat} className="btn-neon" style={{
          width: "100%", padding: "10px 0",
          borderRadius: 10, fontSize: 13,
          fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Chat Baru
        </button>
      </div>

      <div style={{ height: 1, background: `linear-gradient(90deg, transparent, ${CA(0.12)}, transparent)`, margin: "0 14px 8px" }} />

      {/* ── Chat History ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 10px", WebkitOverflowScrolling: "touch" }}>
        <div style={{
          fontSize: 9, color: CA(0.25),
          letterSpacing: "0.1em", textTransform: "uppercase",
          fontWeight: 700, padding: "0 6px 8px",
          fontFamily: "var(--app-font-mono)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span>◈ Riwayat Chat</span>
          <span style={{ color: CA(0.4) }}>{sessions.length}</span>
        </div>
        {sessions.length === 0 ? (
          <div style={{ textAlign: "center", padding: "20px 0", color: CA(0.2), fontSize: 11 }}>
            Belum ada riwayat chat
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {sessions.map((s) => {
              const isActive = s.id === activeSessionId;
              const icon = s.mode === "daily" ? "✦" : "⌥";
              const msgCount = s.messages.length;
              return (
                <div key={s.id} onClick={() => onSelectSession(s.id)}
                  className={`history-item ${isActive ? "active" : ""}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                    <span style={{ fontSize: 9, opacity: 0.5, flexShrink: 0, color: isActive ? C : "inherit" }}>{icon}</span>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.title}
                    </span>
                  </div>
                  {msgCount > 0 && (
                    <span style={{
                      fontSize: 9, flexShrink: 0,
                      background: CA(0.08),
                      color: CA(0.55),
                      border: `1px solid ${CA(0.15)}`,
                      borderRadius: 99, padding: "0 5px",
                      fontFamily: "var(--app-font-mono)",
                    }}>
                      {msgCount}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Neural Core Stats ── */}
      <div style={{
        margin: "0 10px 10px",
        background: "rgba(0,0,0,0.45)",
        border: `1px solid ${CA(0.1)}`,
        borderRadius: 12, padding: "10px 12px",
        boxShadow: `inset 0 0 20px ${CA(0.02)}`,
      }}>
        <div style={{
          fontSize: 9, fontFamily: "var(--app-font-mono)",
          color: CA(0.45), letterSpacing: "0.1em",
          fontWeight: 700, marginBottom: 8, textTransform: "uppercase",
          display: "flex", alignItems: "center", gap: 5,
        }}>
          <span style={{ color: C }}>⬡</span> Neural Core Status
        </div>

        {coreLoad.map((load, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <span style={{
              fontSize: 8, fontFamily: "var(--app-font-mono)",
              color: CA(0.35), width: 28, flexShrink: 0,
            }}>C{i + 1}</span>
            <CoreBar load={load} />
            <span style={{
              fontSize: 8, fontFamily: "var(--app-font-mono)",
              color: load > 0.8 ? "#FF006E" : load > 0.6 ? V : C,
              width: 30, textAlign: "right", flexShrink: 0,
              textShadow: `0 0 8px currentColor`,
            }}>
              {Math.round(load * 100)}%
            </span>
          </div>
        ))}

        <div style={{
          display: "flex", justifyContent: "space-between",
          marginTop: 8, paddingTop: 8,
          borderTop: `1px solid ${CA(0.06)}`,
        }}>
          {[
            { value: sessions.length, label: "SESI", color: C },
            { value: totalMessages,   label: "MSG",  color: V },
            { value: uptime,          label: "UP",   color: G },
          ].map(({ value, label, color }) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{
                fontSize: 12, fontWeight: 700, color,
                fontFamily: "var(--app-font-mono)",
                textShadow: `0 0 10px ${color}`,
              }}>{value}</div>
              <div style={{ fontSize: 8, color: CA(0.28), letterSpacing: "0.06em" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: "8px 14px 12px",
        borderTop: `1px solid ${CA(0.05)}`,
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: CA(0.22), letterSpacing: "0.05em" }}>
          LAWRENZ AI v2.0
        </span>
        <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: CA(0.15), letterSpacing: "0.03em" }}>
          {date}
        </span>
      </div>
    </aside>
  );
}
