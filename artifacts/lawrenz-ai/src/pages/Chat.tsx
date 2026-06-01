import { useEffect, useRef, useState, useCallback } from "react";
import { useChat } from "@/hooks/useChat";
import { useLiveStats } from "@/hooks/useLiveStats";
import Sidebar from "@/components/Sidebar";
import MessageBubble from "@/components/MessageBubble";
import InputArea from "@/components/InputArea";
import TypingIndicator from "@/components/TypingIndicator";
import NeonBackground from "@/components/NeonBackground";
import LiveHUD from "@/components/LiveHUD";

export default function Chat() {
  const {
    sessions,
    activeSession,
    messages,
    isLoading,
    mode,
    subMode,
    setSubMode,
    switchMode,
    sendMessage,
    newChat,
    switchSession,
    stopGeneration,
  } = useChat();

  const bottomRef = useRef<HTMLDivElement>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  const handleSelectSession = useCallback(
    (id: string) => { switchSession(id); setSidebarOpen(false); },
    [switchSession]
  );
  const handleNewChat = useCallback(() => { newChat(); setSidebarOpen(false); }, [newChat]);

  const totalTokens = messages.reduce((acc, m) => acc + Math.ceil(m.content.length / 3.8), 0);

  return (
    <div style={{ display: "flex", height: "100dvh", width: "100%", overflow: "hidden", position: "relative" }}>
      <NeonBackground />

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div onClick={closeSidebar} style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.65)",
          zIndex: 40, backdropFilter: "blur(2px)",
        }} />
      )}

      {/* Sidebar */}
      <div className="sidebar-wrapper" style={{ position: "relative", zIndex: 50, flexShrink: 0 }}>
        <Sidebar
          sessions={sessions}
          activeSessionId={activeSession?.id ?? null}
          mode={mode}
          isOpen={sidebarOpen}
          onSwitchMode={switchMode}
          onNewChat={handleNewChat}
          onSelectSession={handleSelectSession}
          onClose={closeSidebar}
        />
      </div>

      {/* Main area */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        position: "relative", zIndex: 5, overflow: "hidden", minWidth: 0,
      }}>
        {/* HUD Header */}
        <LiveHUD
          messageCount={messages.length}
          tokenCount={totalTokens}
          mode={mode}
          sessionTitle={activeSession?.title}
          onToggleSidebar={toggleSidebar}
          showHamburger
        />

        {/* Messages area */}
        <div style={{ flex: 1, overflowY: "auto", padding: "10px 0 6px", WebkitOverflowScrolling: "touch" }}>
          {messages.length === 0 ? (
            <WelcomeScreen mode={mode} onSend={sendMessage} />
          ) : (
            <>
              {messages.map((msg, i) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  index={i}
                  isStreaming={
                    isLoading && i === messages.length - 1 &&
                    msg.role === "assistant" && msg.content.length > 0
                  }
                />
              ))}
              {isLoading &&
                messages[messages.length - 1]?.type !== "file-loading" &&
                messages[messages.length - 1]?.type !== "image" &&
                (messages[messages.length - 1]?.role !== "assistant" ||
                  messages[messages.length - 1]?.content === "") && (
                  <TypingIndicator type={subMode === "file" ? "file" : "chat"} />
                )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Message counter bar — only during chat */}
        {messages.length > 0 && (
          <MessageStatsBar
            count={messages.length}
            tokens={totalTokens}
            isLoading={isLoading}
            mode={mode}
          />
        )}

        {/* Input */}
        <InputArea
          mode={mode}
          subMode={subMode}
          isLoading={isLoading}
          onSubModeChange={setSubMode}
          onSend={sendMessage}
          onStop={stopGeneration}
        />
      </div>
    </div>
  );
}

/* ── Message stats bar ── */
function MessageStatsBar({
  count, tokens, isLoading, mode,
}: { count: number; tokens: number; isLoading: boolean; mode: string }) {
  const modeColor = mode === "coding" ? "#00ff88" : "#00d4ff";
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "4px 16px",
      borderTop: "1px solid rgba(0,212,255,0.05)",
      background: "rgba(4,4,20,0.7)",
      backdropFilter: "blur(10px)",
    }}>
      <div style={{
        width: 5, height: 5, borderRadius: "50%",
        background: isLoading ? modeColor : "#00ff88",
        boxShadow: `0 0 6px ${isLoading ? modeColor : "#00ff88"}`,
        animation: "blink 1s step-end infinite", flexShrink: 0,
      }} />
      <span style={{
        fontSize: 9, fontFamily: "var(--app-font-mono)",
        color: "rgba(160,160,220,0.3)", letterSpacing: "0.07em",
      }}>
        {count} PESAN
      </span>
      <div style={{ width: 1, height: 10, background: "rgba(0,212,255,0.1)" }} />
      <span style={{
        fontSize: 9, fontFamily: "var(--app-font-mono)",
        color: "rgba(0,212,255,0.3)", letterSpacing: "0.07em",
      }}>
        ~{tokens.toLocaleString()} TOKEN
      </span>
      <div style={{ flex: 1 }} />
      {isLoading && (
        <span style={{
          fontSize: 9, fontFamily: "var(--app-font-mono)",
          color: modeColor, letterSpacing: "0.07em",
          animation: "neon-pulse 1s ease-in-out infinite",
        }}>
          ◈ NEURAL ENGINE AKTIF
        </span>
      )}
    </div>
  );
}

/* ── Welcome Screen ── */
function WelcomeScreen({ mode, onSend }: { mode: "daily" | "coding"; onSend: (c: string) => void }) {
  const msgs = mode === "daily"
    ? ["Halo! Kamu siapa?", "Bantu aku bikin caption Instagram yang keren", "Ceritain sesuatu yang menarik tentang AI", "Buat rencana belajar coding 30 hari"]
    : ["Buat REST API sederhana dengan Node.js + Express", "Jelaskan perbedaan async/await vs Promise", "Review code React ini dan kasih saran perbaikan", "Buat fungsi sorting bubble sort di Python"];

  const { clock, date, ping, pingStatus, uptime, coreLoad } = useLiveStats(0, 0);
  const [line, setLine] = useState(0);
  const pingColor = pingStatus === "excellent" ? "#00ff88" : pingStatus === "good" ? "#00d4ff" : "#ff006e";
  const modeColor = mode === "daily" ? "#00d4ff" : "#00ff88";

  useEffect(() => {
    const t = setInterval(() => setLine((l) => (l + 1) % 6), 2000);
    return () => clearInterval(t);
  }, []);

  const TERMINAL_LINES = [
    `> SYSTEM ONLINE — Neural Core v2.0 aktif`,
    `> MODE: ${mode.toUpperCase()} ENGINE terhubung`,
    `> LATENCY: ${ping}ms — status ${pingStatus.toUpperCase()}`,
    `> UPTIME: ${uptime} — semua core normal`,
    `> ${coreLoad.map((c, i) => `C${i+1}:${Math.round(c*100)}%`).join(" ")}`,
    `> Siap menerima perintah dari pengguna...`,
  ];

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      minHeight: "100%", padding: "20px 16px", gap: 18,
      animation: "fade-up 0.5s ease-out",
    }}>
      {/* Orb */}
      <div className="welcome-orb" style={{ width: 90, height: 90 }}>
        <img src="/lawrenz/icon.png" alt="Z" style={{ width: 74, height: 74, objectFit: "cover", borderRadius: "50%" }} />
      </div>

      {/* Title */}
      <div style={{ textAlign: "center" }}>
        <h1 className="neon-logo" style={{ fontSize: 26, fontWeight: 900, letterSpacing: "0.08em", marginBottom: 5 }}>
          Lawren<span style={{ color: "#9d4edd" }}>Z</span> AI
        </h1>
        <p style={{ color: "rgba(160,160,220,0.45)", fontSize: 12, letterSpacing: "0.04em", lineHeight: 1.5 }}>
          {mode === "daily"
            ? "AI masa depan untuk produktivitas & kreativitas"
            : "Expert coding AI — melampaui batas pemrograman"}
        </p>
      </div>

      {/* Terminal live panel */}
      <div style={{
        width: "100%", maxWidth: 480,
        background: "rgba(0,0,0,0.55)",
        border: `1px solid ${modeColor}25`,
        borderRadius: 12, padding: "12px 14px",
        position: "relative", overflow: "hidden",
      }}>
        {/* Corner accents */}
        <div style={{ position: "absolute", top: 0, left: 0, width: 12, height: 12, borderTop: `1.5px solid ${modeColor}60`, borderLeft: `1.5px solid ${modeColor}60` }} />
        <div style={{ position: "absolute", top: 0, right: 0, width: 12, height: 12, borderTop: `1.5px solid ${modeColor}60`, borderRight: `1.5px solid ${modeColor}60` }} />
        <div style={{ position: "absolute", bottom: 0, left: 0, width: 12, height: 12, borderBottom: `1.5px solid ${modeColor}60`, borderLeft: `1.5px solid ${modeColor}60` }} />
        <div style={{ position: "absolute", bottom: 0, right: 0, width: 12, height: 12, borderBottom: `1.5px solid ${modeColor}60`, borderRight: `1.5px solid ${modeColor}60` }} />

        {/* Terminal header */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {["#ff5f57","#febc2e","#28c840"].map((c) => (
              <div key={c} style={{ width: 8, height: 8, borderRadius: "50%", background: c, opacity: 0.8 }} />
            ))}
          </div>
          <span style={{
            fontSize: 9, fontFamily: "var(--app-font-mono)",
            color: `${modeColor}60`, letterSpacing: "0.1em",
          }}>
            LAWRENZ-AI-TERMINAL — {clock}
          </span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: "rgba(160,160,220,0.25)" }}>
            {date}
          </span>
        </div>

        {/* Terminal lines */}
        {TERMINAL_LINES.map((l, i) => (
          <div key={i} style={{
            fontSize: 10, fontFamily: "var(--app-font-mono)",
            color: i === line
              ? modeColor
              : i < line
                ? `${modeColor}50`
                : "rgba(160,160,220,0.15)",
            letterSpacing: "0.04em", lineHeight: 1.8,
            transition: "color 0.4s ease",
          }}>
            {l}
            {i === line && (
              <span style={{ animation: "blink 0.5s step-end infinite", color: modeColor }}>█</span>
            )}
          </div>
        ))}

        {/* Live stats row */}
        <div style={{
          display: "flex", gap: 16, marginTop: 12,
          paddingTop: 10, borderTop: `1px solid ${modeColor}15`,
        }}>
          {[
            { label: "PING", value: `${ping}ms`, color: pingColor },
            { label: "UPTIME", value: uptime, color: modeColor },
            { label: "JAM", value: clock, color: "rgba(0,212,255,0.8)" },
            { label: "STATUS", value: "ONLINE", color: "#00ff88" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ flex: 1, textAlign: "center" }}>
              <div style={{
                fontSize: 11, fontFamily: "var(--app-font-mono)",
                color, fontWeight: 700, letterSpacing: "0.03em",
              }}>{value}</div>
              <div style={{
                fontSize: 8, fontFamily: "var(--app-font-mono)",
                color: "rgba(160,160,220,0.3)", letterSpacing: "0.08em", marginTop: 1,
              }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Suggestion chips */}
      <div style={{ display: "flex", flexDirection: "column", gap: 7, width: "100%", maxWidth: 480 }}>
        <div style={{
          fontSize: 9, fontFamily: "var(--app-font-mono)",
          color: "rgba(160,160,220,0.3)", letterSpacing: "0.1em",
          textTransform: "uppercase", paddingLeft: 4,
        }}>
          ◈ Mulai dengan pertanyaan
        </div>
        {msgs.map((s, i) => (
          <button key={s} onClick={() => onSend(s)} style={{
            padding: "10px 14px", borderRadius: 10,
            border: `1px solid ${mode === "daily" ? "rgba(0,212,255,0.18)" : "rgba(0,255,136,0.18)"}`,
            background: mode === "daily" ? "rgba(0,212,255,0.03)" : "rgba(0,255,136,0.03)",
            color: mode === "daily" ? "rgba(0,212,255,0.8)" : "rgba(0,255,136,0.8)",
            fontSize: 12, cursor: "pointer", textAlign: "left",
            lineHeight: 1.4, width: "100%",
            transition: "all 0.2s ease",
            fontFamily: "var(--app-font-sans)",
            display: "flex", alignItems: "center", gap: 10,
            animationDelay: `${i * 0.05}s`,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = mode === "daily" ? "rgba(0,212,255,0.08)" : "rgba(0,255,136,0.08)";
            (e.currentTarget as HTMLElement).style.borderColor = mode === "daily" ? "rgba(0,212,255,0.4)" : "rgba(0,255,136,0.4)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = mode === "daily" ? "rgba(0,212,255,0.03)" : "rgba(0,255,136,0.03)";
            (e.currentTarget as HTMLElement).style.borderColor = mode === "daily" ? "rgba(0,212,255,0.18)" : "rgba(0,255,136,0.18)";
          }}>
            <span style={{ opacity: 0.4, fontSize: 10, flexShrink: 0, fontFamily: "var(--app-font-mono)" }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            {s}
            <span style={{ marginLeft: "auto", opacity: 0.25, fontSize: 10 }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
