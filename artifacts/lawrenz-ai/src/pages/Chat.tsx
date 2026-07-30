import { useEffect, useRef, useState, useCallback } from "react";
import { useChat } from "@/hooks/useChat";
import { useTTS } from "@/hooks/useTTS";
import { useLiveStats } from "@/hooks/useLiveStats";
import Sidebar from "@/components/Sidebar";
import MessageBubble from "@/components/MessageBubble";
import InputArea from "@/components/InputArea";
import TypingIndicator from "@/components/TypingIndicator";
import NeonBackground from "@/components/NeonBackground";
import LiveHUD from "@/components/LiveHUD";

const C  = "#00D4FF";
const CA = (a: number) => `rgba(0,212,255,${a})`;
const V  = "#8B5CF6";
const VA = (a: number) => `rgba(139,92,246,${a})`;
const G  = "#00FF94";

export default function Chat() {
  const {
    sessions,
    activeSession,
    messages,
    isLoading,
    mode,
    switchMode,
    sendMessage,
    newChat,
    switchSession,
    stopGeneration,
    clearFileContext,
  } = useChat();

  const { speakingId, loadingId: loadingTTSId, speak } = useTTS();

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

  const handleClearContext = useCallback(() => {
    if (activeSession) clearFileContext(activeSession.id);
  }, [activeSession, clearFileContext]);

  const totalTokens = messages.reduce((acc, m) => acc + Math.ceil(m.content.length / 3.8), 0);

  return (
    <div style={{ display: "flex", height: "100dvh", width: "100%", overflow: "hidden", position: "relative" }}>
      <NeonBackground />

      {sidebarOpen && (
        <div onClick={closeSidebar} style={{
          position: "fixed", inset: 0,
          background: "rgba(0,0,0,0.7)",
          zIndex: 40, backdropFilter: "blur(3px)",
        }} />
      )}

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

      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        position: "relative", zIndex: 5, overflow: "hidden", minWidth: 0,
      }}>
        <LiveHUD
          messageCount={messages.length}
          tokenCount={totalTokens}
          mode={mode}
          sessionTitle={activeSession?.title}
          onToggleSidebar={toggleSidebar}
          showHamburger
        />

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
                  onSpeak={speak}
                  speakingId={speakingId}
                  loadingTTSId={loadingTTSId}
                />
              ))}
              {isLoading &&
                messages[messages.length - 1]?.type !== "file-loading" &&
                messages[messages.length - 1]?.type !== "image" &&
                (messages[messages.length - 1]?.role !== "assistant" ||
                  messages[messages.length - 1]?.content === "") && (
                  <TypingIndicator type="chat" />
                )}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {messages.length > 0 && (
          <MessageStatsBar
            count={messages.length}
            tokens={totalTokens}
            isLoading={isLoading}
            mode={mode}
            speakingId={speakingId}
            fileContextName={activeSession?.fileContextName}
          />
        )}

        <InputArea
          mode={mode}
          isLoading={isLoading}
          onSend={sendMessage}
          onStop={stopGeneration}
          fileContextName={activeSession?.fileContextName}
          onClearContext={handleClearContext}
        />
      </div>
    </div>
  );
}

/* ── Message stats bar ── */
function MessageStatsBar({
  count, tokens, isLoading, mode, speakingId, fileContextName,
}: { count: number; tokens: number; isLoading: boolean; mode: string; speakingId: string | null; fileContextName?: string }) {
  const modeColor = mode === "coding" ? G : C;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "4px 16px",
      borderTop: `1px solid ${CA(0.05)}`,
      background: "rgba(1,8,20,0.8)",
      backdropFilter: "blur(10px)",
    }}>
      <div style={{
        width: 5, height: 5, borderRadius: "50%",
        background: isLoading ? modeColor : G,
        boxShadow: `0 0 8px ${isLoading ? modeColor : G}`,
        animation: "blink 1s step-end infinite", flexShrink: 0,
      }} />
      <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: CA(0.28), letterSpacing: "0.07em" }}>
        {count} PESAN
      </span>
      <div style={{ width: 1, height: 10, background: CA(0.08) }} />
      <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: CA(0.25), letterSpacing: "0.07em" }}>
        ~{tokens.toLocaleString()} TOKEN
      </span>
      {fileContextName && (
        <>
          <div style={{ width: 1, height: 10, background: CA(0.08) }} />
          <span style={{ fontSize: 9, fontFamily: "var(--app-font-mono)", color: `rgba(0,255,148,0.5)`, letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 120 }}>
            📚 {fileContextName}
          </span>
        </>
      )}
      <div style={{ flex: 1 }} />
      {speakingId && (
        <span style={{
          fontSize: 9, fontFamily: "var(--app-font-mono)",
          color: C, letterSpacing: "0.07em",
          animation: "pulseOpacity 1.2s ease infinite",
          textShadow: `0 0 8px ${C}`,
        }}>
          ▶ MEMUTAR SUARA
        </span>
      )}
      {isLoading && !speakingId && (
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

/* ── Live token counter hook ── */
function useTokenStats() {
  const seed = () => ({
    chat:  Math.floor(Math.random() * 400_000) + 1_200_000,
    image: Math.floor(Math.random() * 200_000) + 600_000,
    code:  Math.floor(Math.random() * 150_000) + 350_000,
    req:   Math.floor(Math.random() * 800) + 2_100,
  });
  const [stats, setStats] = useState(seed);
  const [flash, setFlash] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const t = setInterval(() => {
      setStats((prev) => {
        const chatDelta  = Math.floor(Math.random() * 220 + 30);
        const imageDelta = Math.random() < 0.4 ? Math.floor(Math.random() * 1800 + 200) : 0;
        const codeDelta  = Math.random() < 0.55 ? Math.floor(Math.random() * 380 + 60) : 0;
        const reqDelta   = Math.random() < 0.3 ? (Math.random() < 0.5 ? 1 : -1) : 0;
        const changed: Record<string, boolean> = {};
        if (chatDelta)  changed.chat  = true;
        if (imageDelta) changed.image = true;
        if (codeDelta)  changed.code  = true;
        if (reqDelta)   changed.req   = true;
        if (Object.keys(changed).length) setFlash(changed);
        return {
          chat:  prev.chat  + chatDelta,
          image: prev.image + imageDelta,
          code:  prev.code  + codeDelta,
          req:   Math.max(1800, prev.req + reqDelta),
        };
      });
    }, 900);

    const flashReset = setInterval(() => setFlash({}), 300);
    return () => { clearInterval(t); clearInterval(flashReset); };
  }, []);

  return { stats, flash };
}

/* ── Welcome Screen ── */
function WelcomeScreen({ mode, onSend }: { mode: "daily" | "coding"; onSend: (c: string) => void }) {
  const msgs = mode === "daily"
    ? [
        "Halo! Kamu siapa?",
        "Buatkan gambar kucing pakai kacamata hitam",
        "Ceritain sesuatu yang menarik tentang AI",
        "Buat rencana belajar coding 30 hari",
      ]
    : [
        "Buat REST API sederhana dengan Node.js + Express",
        "Jelaskan perbedaan async/await vs Promise",
        "Review code React ini dan kasih saran perbaikan",
        "Buat fungsi sorting bubble sort di Python",
      ];

  const { clock, date, ping, pingStatus } = useLiveStats(0, 0);
  const { stats, flash } = useTokenStats();

  const pingColor = pingStatus === "excellent" ? G : pingStatus === "good" ? C : "#FF006E";
  const modeColor = mode === "daily" ? C : G;

  const statCols = [
    { key: "chat",  label: "CHAT TOKENS",  value: stats.chat.toLocaleString("id-ID"),  icon: "◈", color: C,   sub: "inferensi teks" },
    { key: "image", label: "IMAGE TOKENS",  value: stats.image.toLocaleString("id-ID"), icon: "⬡", color: V,   sub: "sintesis gambar" },
    { key: "code",  label: "CODE TOKENS",   value: stats.code.toLocaleString("id-ID"),  icon: "▣", color: G,   sub: "analisis kode" },
  ];

  return (
    <div style={{
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      minHeight: "100%", padding: "16px 16px", gap: 14,
      animation: "fade-up 0.5s ease-out",
    }}>
      {/* Orb + Title */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div className="welcome-orb" style={{ width: 58, height: 58, flexShrink: 0 }}>
          <img src="/lawrenz/icon.png" alt="Z" style={{ width: 46, height: 46, objectFit: "cover", borderRadius: "50%" }} />
        </div>
        <div>
          <h1 className="neon-logo" style={{ fontSize: 22, fontWeight: 900, letterSpacing: "0.07em", marginBottom: 3 }}>
            Lawren<span style={{ color: V }}>Z</span> AI
          </h1>
          <p style={{ color: CA(0.4), fontSize: 11, letterSpacing: "0.03em", lineHeight: 1.4 }}>
            {mode === "daily" ? "AI cerdas · serba bisa · selalu siap" : "Neural Code Engine · expert-level · zero limit"}
          </p>
        </div>
      </div>

      {/* ── Live Stats Panel ── */}
      <div style={{
        width: "100%", maxWidth: 440,
        background: "rgba(0,0,0,0.6)",
        border: `1px solid ${CA(0.14)}`,
        borderRadius: 11,
        overflow: "hidden",
        position: "relative",
        boxShadow: `0 0 40px ${CA(0.04)}, inset 0 0 30px ${CA(0.01)}`,
      }}>
        {/* corner accents */}
        {[
          { top: 0, left: 0, borderTop: `1.5px solid ${CA(0.5)}`, borderLeft: `1.5px solid ${CA(0.5)}` },
          { top: 0, right: 0, borderTop: `1.5px solid ${VA(0.4)}`, borderRight: `1.5px solid ${VA(0.4)}` },
          { bottom: 0, left: 0, borderBottom: `1.5px solid ${CA(0.35)}`, borderLeft: `1.5px solid ${CA(0.35)}` },
          { bottom: 0, right: 0, borderBottom: `1.5px solid ${VA(0.3)}`, borderRight: `1.5px solid ${VA(0.3)}` },
        ].map((s, i) => (
          <div key={i} style={{ position: "absolute", width: 10, height: 10, ...s }} />
        ))}

        {/* Title bar */}
        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          padding: "7px 12px 6px",
          borderBottom: `1px solid ${CA(0.07)}`,
          background: "rgba(0,0,0,0.4)",
        }}>
          <div style={{ display: "flex", gap: 4 }}>
            {["#FF006E", "#FFD700", "#00FF94"].map((col) => (
              <div key={col} style={{ width: 7, height: 7, borderRadius: "50%", background: col, opacity: 0.75 }} />
            ))}
          </div>
          <span style={{ fontSize: 8.5, fontFamily: "var(--app-font-mono)", color: CA(0.5), letterSpacing: "0.09em", flex: 1 }}>
            LAWRENZ · NEURAL MONITOR
          </span>
          <div style={{
            width: 6, height: 6, borderRadius: "50%",
            background: G, boxShadow: `0 0 8px ${G}`,
            animation: "blink 1.4s ease-in-out infinite",
          }} />
          <span style={{ fontSize: 8.5, fontFamily: "var(--app-font-mono)", color: CA(0.45), letterSpacing: "0.06em" }}>
            {clock}
          </span>
        </div>

        {/* 3-column token stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
          {statCols.map(({ key, label, value, icon, color, sub }, idx) => (
            <div
              key={key}
              style={{
                padding: "10px 10px 8px",
                borderRight: idx < 2 ? `1px solid ${CA(0.06)}` : "none",
                borderBottom: `1px solid ${CA(0.05)}`,
                transition: "background 0.15s",
                background: flash[key] ? `${color}08` : "transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 9, color, fontFamily: "var(--app-font-mono)", textShadow: `0 0 8px ${color}` }}>{icon}</span>
                <span style={{ fontSize: 7.5, color: CA(0.28), fontFamily: "var(--app-font-mono)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {label}
                </span>
                {flash[key] && (
                  <span style={{ marginLeft: "auto", fontSize: 7, color, animation: "pulseOpacity 0.3s ease" }}>▲</span>
                )}
              </div>
              <div style={{
                fontSize: 13, fontWeight: 800, fontFamily: "var(--app-font-mono)",
                color: flash[key] ? "#fff" : color,
                letterSpacing: "0.02em", lineHeight: 1,
                transition: "color 0.15s",
                textShadow: flash[key] ? `0 0 14px ${color}` : "none",
              }}>
                {value}
              </div>
              <div style={{ fontSize: 7.5, color: CA(0.18), marginTop: 3, fontFamily: "var(--app-font-mono)" }}>
                {sub}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom status strip */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr",
          padding: "7px 10px",
          background: "rgba(0,0,0,0.3)",
          gap: 0,
        }}>
          {[
            { label: "LATENSI",  value: `${ping}ms`,                        color: pingColor,  live: true },
            { label: "REQ/JAM",  value: stats.req.toLocaleString("id-ID"),  color: C,          live: flash.req },
            { label: "STATUS",   value: "ONLINE",                           color: G,          live: false },
            { label: "MODE",     value: mode.toUpperCase(),                 color: modeColor,  live: false },
          ].map(({ label, value, color, live }, i) => (
            <div key={label} style={{ textAlign: "center", borderRight: i < 3 ? `1px solid ${CA(0.06)}` : "none", padding: "0 4px" }}>
              <div style={{
                fontSize: 10, fontWeight: 700, fontFamily: "var(--app-font-mono)",
                color: typeof live === "boolean" ? (live ? G : color) : (live ? "#fff" : color),
                letterSpacing: "0.02em",
                transition: "color 0.15s",
                textShadow: `0 0 8px currentColor`,
              }}>
                {value}
              </div>
              <div style={{ fontSize: 7, color: CA(0.22), letterSpacing: "0.07em", marginTop: 2, fontFamily: "var(--app-font-mono)" }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Suggestion chips */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, width: "100%", maxWidth: 440 }}>
        <div style={{
          fontSize: 8.5, fontFamily: "var(--app-font-mono)",
          color: CA(0.22), letterSpacing: "0.1em",
          textTransform: "uppercase", paddingLeft: 2,
        }}>
          ◈ Coba tanya
        </div>
        {msgs.map((s, i) => (
          <button key={s} onClick={() => onSend(s)}
            style={{
              padding: "9px 12px", borderRadius: 9,
              border: `1px solid ${CA(0.1)}`,
              background: CA(0.018),
              color: CA(0.68),
              fontSize: 12, cursor: "pointer", textAlign: "left",
              lineHeight: 1.4, width: "100%", transition: "all 0.25s ease",
              fontFamily: "var(--app-font-sans)",
              display: "flex", alignItems: "center", gap: 9,
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = CA(0.06);
              el.style.borderColor = CA(0.35);
              el.style.color = C;
              el.style.boxShadow = `0 0 14px ${CA(0.08)}`;
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = CA(0.018);
              el.style.borderColor = CA(0.1);
              el.style.color = CA(0.68);
              el.style.boxShadow = "none";
            }}>
            <span style={{ opacity: 0.32, fontSize: 9, flexShrink: 0, fontFamily: "var(--app-font-mono)", color: C }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            {s}
            <span style={{ marginLeft: "auto", opacity: 0.2, fontSize: 10, color: C }}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
