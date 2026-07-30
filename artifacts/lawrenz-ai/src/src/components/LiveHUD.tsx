import { useLiveStats } from "@/hooks/useLiveStats";

interface Props {
  messageCount: number;
  tokenCount: number;
  mode: "daily" | "coding";
  sessionTitle?: string;
  onToggleSidebar?: () => void;
  showHamburger?: boolean;
}

const C  = "#00D4FF";
const CA = (a: number) => `rgba(0,212,255,${a})`;
const V  = "#8B5CF6";
const G  = "#00FF94";

const PING_COLOR = {
  excellent: G,
  good:      C,
  slow:      "#FF006E",
};

export default function LiveHUD({ messageCount, tokenCount, mode, sessionTitle, onToggleSidebar, showHamburger }: Props) {
  const { clock, date, ping, pingStatus, uptime, coreLoad, networkBars } = useLiveStats(messageCount, tokenCount);

  const pingColor  = PING_COLOR[pingStatus];
  const modeColor  = mode === "daily" ? C : G;

  return (
    <div
      style={{
        padding: "0 14px",
        background: "rgba(1,8,20,0.97)",
        backdropFilter: "blur(24px)",
        borderBottom: `1px solid ${CA(0.08)}`,
        flexShrink: 0,
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Top scan line */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 1,
        background: `linear-gradient(90deg, transparent, ${modeColor}70, ${V}40, transparent)`,
        animation: "scan-horizontal 3.5s linear infinite",
      }} />

      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 48 }}>

        {/* Hamburger — mobile */}
        {showHamburger && (
          <button
            className="hamburger-btn"
            onClick={onToggleSidebar}
            aria-label="Buka menu"
            style={{
              width: 36, height: 36, borderRadius: 9,
              border: `1px solid ${CA(0.25)}`,
              background: CA(0.06),
              color: C, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, fontSize: 15,
              boxShadow: `0 0 10px ${CA(0.12)}`,
            }}
          >☰</button>
        )}

        {/* Session breadcrumb */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
            color: modeColor, fontFamily: "var(--app-font-mono)",
            textTransform: "uppercase", flexShrink: 0,
            textShadow: `0 0 10px ${modeColor}`,
          }}>
            {mode === "daily" ? "✦ DAILY" : "⌥ CODING"}
          </span>
          {sessionTitle && (
            <>
              <span style={{ color: CA(0.22), fontSize: 10, flexShrink: 0 }}>›</span>
              <span style={{
                fontSize: 11, color: CA(0.45),
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                minWidth: 0,
              }}>
                {sessionTitle}
              </span>
            </>
          )}
        </div>

        {/* Live stats cluster */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>

          {/* Ping */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{
              width: 5, height: 5, borderRadius: "50%",
              background: pingColor,
              boxShadow: `0 0 8px ${pingColor}, 0 0 16px ${pingColor}60`,
              animation: "blink 1.2s ease-in-out infinite",
            }} />
            <span style={{
              fontSize: 9, fontFamily: "var(--app-font-mono)",
              color: pingColor, fontWeight: 700, letterSpacing: "0.05em",
              textShadow: `0 0 8px ${pingColor}`,
            }}>
              {ping}ms
            </span>
          </div>

          {/* Network bars */}
          <div style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 14 }}>
            {[3, 6, 9, 12].map((h, i) => (
              <div key={i} style={{
                width: 3, height: h,
                background: i < networkBars
                  ? `linear-gradient(to top, ${C}, ${V})`
                  : CA(0.1),
                borderRadius: 1,
                boxShadow: i < networkBars ? `0 0 6px ${C}60` : "none",
                transition: "background 0.5s, box-shadow 0.5s",
              }} />
            ))}
          </div>

          {/* Clock */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{
              fontSize: 11, fontFamily: "var(--app-font-mono)",
              color: C, fontWeight: 700,
              letterSpacing: "0.06em",
              textShadow: `0 0 12px ${CA(0.6)}`,
            }}>
              {clock}
            </span>
            <span style={{
              fontSize: 8, fontFamily: "var(--app-font-mono)",
              color: CA(0.3), letterSpacing: "0.04em",
            }}>
              {date}
            </span>
          </div>

          {/* CPU cores mini-bars — desktop only */}
          <div className="hud-cores" style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 14 }}>
            {coreLoad.slice(0, 4).map((load, i) => (
              <div key={i} style={{
                width: 3,
                height: Math.round(4 + load * 10),
                background: load > 0.8 ? "#FF006E" : load > 0.6 ? V : C,
                borderRadius: 1,
                boxShadow: load > 0.8 ? "0 0 6px #FF006E" : `0 0 5px ${CA(0.5)}`,
                transition: "height 0.8s ease, background 0.5s",
              }} />
            ))}
          </div>

          {/* Uptime tag */}
          <div className="hud-uptime" style={{
            fontSize: 9, fontFamily: "var(--app-font-mono)",
            color: CA(0.38), letterSpacing: "0.05em",
            background: CA(0.04),
            border: `1px solid ${CA(0.1)}`,
            padding: "2px 7px", borderRadius: 5,
            boxShadow: `inset 0 0 8px ${CA(0.02)}`,
          }}>
            ⏱ {uptime}
          </div>
        </div>
      </div>
    </div>
  );
}
