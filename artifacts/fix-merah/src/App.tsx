import { useState, useEffect, useCallback, useId } from "react";
import { MatrixRain } from "./components/MatrixRain";
import { Terminal } from "./components/Terminal";
import { GmailManager } from "./components/GmailManager";
import { TemplateSelector } from "./components/TemplateSelector";
import { ReplyMonitor } from "./components/ReplyMonitor";
import { Stats } from "./components/Stats";
import { SendingOverlay } from "./components/SendingOverlay";
import { useSound } from "./hooks/useSound";
import { createSSE, listGmailAccounts, sendAppeal } from "./lib/api";
import { EMAIL_TEMPLATES } from "./data/templates";
import type { GmailAccount, EmailTemplate, TerminalLog, ReplyRecord } from "./types";

type Tab = "appeal" | "stats";
const STEP_LABELS = ["Nomor WA", "Template", "Gmail", "Kirim"];
const STEP_ICONS  = ["📱", "📝", "📧", "🚀"];

function formatPhone(raw: string): string {
  let n = raw.replace(/\D/g, "");
  if (n.startsWith("0")) n = "62" + n.slice(1);
  if (!n.startsWith("62")) n = "62" + n;
  return "+" + n;
}

let logCounter = 0;
function makeLog(type: TerminalLog["type"], message: string): TerminalLog {
  return { id: `${++logCounter}`, timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }), type, message };
}

function NeonPanel({ children, className = "", color = "#00ff88", style }: {
  children: React.ReactNode; className?: string; color?: string; style?: React.CSSProperties;
}) {
  return (
    <div
      className={`relative rounded-2xl overflow-hidden ${className}`}
      style={{
        background: "rgba(6,16,30,0.92)",
        border: `1px solid ${color}20`,
        boxShadow: `0 0 24px ${color}08, inset 0 0 24px ${color}04`,
        backdropFilter: "blur(16px)",
        ...style,
      }}
    >
      <span className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 rounded-tl-2xl pointer-events-none" style={{ borderColor: color, zIndex: 10 }} />
      <span className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 rounded-tr-2xl pointer-events-none" style={{ borderColor: color, zIndex: 10 }} />
      <span className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 rounded-bl-2xl pointer-events-none" style={{ borderColor: color, zIndex: 10 }} />
      <span className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 rounded-br-2xl pointer-events-none" style={{ borderColor: color, zIndex: 10 }} />
      <div className="absolute pointer-events-none" style={{
        height: 1, left: 0, right: 0, top: "35%",
        background: `linear-gradient(90deg,transparent,${color}18,transparent)`,
        animation: "scanHoriz 4s linear infinite", zIndex: 1,
      }} />
      {children}
    </div>
  );
}

function StatChip({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-lg shrink-0 transition-all hover:scale-105 cursor-default"
      style={{ background: `${color}10`, border: `1px solid ${color}25` }}
    >
      <span className="text-sm">{icon}</span>
      <div>
        <div className="text-[13px] font-black font-mono leading-none" style={{ color, textShadow: `0 0 10px ${color}80` }}>{value}</div>
        <div className="text-[8px] uppercase tracking-widest mt-0.5" style={{ color: `${color}60` }}>{label}</div>
      </div>
    </div>
  );
}

function GlitchText({ text, color }: { text: string; color: string }) {
  return (
    <span style={{ color, animation: "glitchText 8s ease-in-out infinite", textShadow: `0 0 18px ${color}55` }}>
      {text}
    </span>
  );
}

export default function App() {
  const uid = useId();
  const [tab, setTab] = useState<Tab>("appeal");
  const [step, setStep] = useState(0);
  const [phoneRaw, setPhoneRaw] = useState("");
  const [phoneFormatted, setPhoneFormatted] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [logs, setLogs] = useState<TerminalLog[]>([
    makeLog("system", "⚡ Fix Merah v2.0 initialized — sistem siap"),
    makeLog("system", "📡 IMAP monitor: standby"),
    makeLog("info",   "⏳ Menunggu input pengguna..."),
  ]);
  const [replies, setReplies] = useState<ReplyRecord[]>([]);
  const [sending, setSending] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [apiDone, setApiDone] = useState(false);
  const [apiSuccess, setApiSuccess] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [notifGranted, setNotifGranted] = useState(Notification.permission === "granted");
  const [clock, setClock] = useState(new Date().toLocaleTimeString("en-US", { hour12: false }));
  const [totalSent, setTotalSent] = useState(0);

  const { playSuccess, playError, playNotification, playSend, playKeypress, playStep, playClick, toggle } = useSound();

  const addLog = useCallback((type: TerminalLog["type"], message: string) => {
    setLogs((prev) => [...prev.slice(-299), makeLog(type, message)]);
  }, []);

  useEffect(() => {
    const iv = setInterval(() => setClock(new Date().toLocaleTimeString("en-US", { hour12: false })), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    listGmailAccounts()
      .then((data: GmailAccount[]) => {
        setAccounts(data.map((a: GmailAccount) => ({ ...a, selected: true, status: "idle" })));
        if (data.length > 0) addLog("info", `✅ Loaded ${data.length} Gmail account(s) — siap kirim`);
      })
      .catch(() => addLog("warn", "⚠️ API server belum ready."));
  }, [addLog]);

  useEffect(() => {
    const cleanup = createSSE(
      (log) => {
        addLog(log.type as TerminalLog["type"], log.message);
        if (log.type === "success") playSuccess();
        if (log.type === "error") playError();
      },
      (reply) => {
        setReplies((prev) => [reply as ReplyRecord, ...prev]);
        addLog("success", `📬 REPLY DITERIMA dari WhatsApp! Cek Reply Monitor!`);
        addLog("success", `📧 REPLY dari ${(reply as ReplyRecord).fromEmail}: "${(reply as ReplyRecord).subject}"`);
        playNotification();
        if (notifGranted) {
          new Notification("📬 Fix Merah — Reply Masuk!", {
            body: `WhatsApp Support membalas! From: ${(reply as ReplyRecord).fromEmail}`,
            icon: "/favicon.ico",
          });
        }
      }
    );
    return cleanup;
  }, [addLog, notifGranted, playError, playNotification, playSuccess]);

  useEffect(() => {
    if (phoneRaw.replace(/\D/g, "").length >= 6) setPhoneFormatted(formatPhone(phoneRaw));
    else setPhoneFormatted("");
  }, [phoneRaw]);

  async function requestNotifPermission() {
    const perm = await Notification.requestPermission();
    setNotifGranted(perm === "granted");
    addLog("info", `🔔 Push notification: ${perm}`);
  }

  function handlePhoneChange(val: string) { setPhoneRaw(val); playKeypress(); }
  function handleSoundToggle() { const on = toggle(); setSoundOn(on); addLog("info", `🔊 Sound: ${on ? "ON" : "OFF"}`); }

  const selectedAccounts = accounts.filter((a) => a.selected);
  const canSend = phoneFormatted && selectedTemplate && selectedAccounts.length > 0;

  async function handleSend() {
    if (!canSend || sending) return;
    setSending(true);
    setApiDone(false);
    setApiSuccess(false);
    setOverlayVisible(true);
    playSend();

    addLog("system", `⚡ Memulai pengiriman appeal → support@support.whatsapp.com`);
    addLog("info", `🎯 Target: ${phoneFormatted} | 📋 Template: ${selectedTemplate!.name}`);
    addLog("info", `📧 Pengirim: ${selectedAccounts.length} akun Gmail`);
    addLog("packet", `🔒 Mengenkripsi koneksi SMTP...`);

    setAccounts((prev) => prev.map((a) => (a.selected ? { ...a, status: "sending" } : a)));

    try {
      const result = await sendAppeal({
        targetNumber: phoneFormatted,
        templateId: selectedTemplate!.id,
        accountIds: selectedAccounts.map((a) => a.id),
        templateSubject: selectedTemplate!.subject,
        templateHtml: selectedTemplate!.htmlBody,
        templateName: selectedTemplate!.name,
      });

      let successCount = 0;
      for (const r of result.results ?? []) {
        if (r.success) { addLog("success", `✅ Terkirim via ${r.email} → support@support.whatsapp.com`); successCount++; }
        else addLog("error", `❌ Gagal via ${r.email}: ${r.error}`);
      }

      setAccounts((prev) =>
        prev.map((a) => {
          if (!a.selected) return a;
          const res = result.results?.find((r: { email: string; success: boolean; error?: string }) => r.email === a.email);
          return { ...a, status: res?.success ? "sent" : "error", error: res?.error };
        })
      );

      setTotalSent(p => p + successCount);
      setApiSuccess(successCount > 0);
      addLog("system", `📡 IMAP monitor aktif — memantau balasan setiap 30 detik`);
      if (successCount > 0) playSuccess();
      else playError();
    } catch (err) {
      addLog("error", `❌ Gagal: ${err instanceof Error ? err.message : String(err)}`);
      setAccounts((prev) => prev.map((a) => (a.selected ? { ...a, status: "error" } : a)));
      setApiSuccess(false);
      playError();
    } finally {
      setApiDone(true);
    }
  }

  function handleOverlayFinish() {
    setOverlayVisible(false);
    setSending(false);
  }

  function goStep(n: number) {
    setStep(n);
    playStep();
    addLog("info", `📍 Step ${n + 1}: ${STEP_LABELS[n]}`);
  }

  const stepValid = [!!phoneFormatted, !!selectedTemplate, selectedAccounts.length > 0, !!(canSend)];

  return (
    <div className="min-h-screen relative overflow-hidden" id={uid} style={{ background: "#030812" }}>
      <MatrixRain />

      <style>{`
        @keyframes scanHoriz   { 0%{left:-20%} 100%{left:110%} }
        @keyframes scanVert    { 0%{top:-2px} 100%{top:100%} }
        @keyframes floatLogo   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        @keyframes shimmer     { 0%{background-position:-200% center} 100%{background-position:200% center} }
        @keyframes dotPulse    { 0%,100%{opacity:.5;transform:scale(1)} 50%{opacity:1;transform:scale(1.5)} }
        @keyframes appear      { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes borderGlow  { 0%,100%{box-shadow:0 0 12px #00ff8815,inset 0 0 12px #00ff8806} 50%{box-shadow:0 0 28px #00ff8830,0 0 60px #00ff8810,inset 0 0 20px #00ff8810} }
        @keyframes blink       { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes redPulse    { 0%,100%{box-shadow:0 0 20px #ff003c35,0 4px 20px #ff003c18} 50%{box-shadow:0 0 40px #ff003c65,0 4px 40px #ff003c35} }
        @keyframes cyanPulse   { 0%,100%{box-shadow:0 0 10px #00e5ff20} 50%{box-shadow:0 0 30px #00e5ff50} }
        @keyframes glitchText  { 0%,88%,100%{transform:translate(0);filter:none} 89%{transform:translate(-2px);filter:hue-rotate(90deg)} 91%{transform:translate(2px);filter:hue-rotate(-90deg)} 93%{transform:translate(0)} }
        @keyframes slideIn     { from{opacity:0;transform:translateX(-16px)} to{opacity:1;transform:translateX(0)} }
        @keyframes scaleIn     { from{opacity:0;transform:scale(0.9)} to{opacity:1;transform:scale(1)} }
        @keyframes packetFlow  { 0%{left:-20%} 100%{left:110%} }
        @keyframes scanHorizOverlay { 0%{left:-20%} 100%{left:110%} }
        .animate-appear        { animation: appear 0.35s ease-out both; }
        .animate-slide-in      { animation: slideIn 0.3s ease-out both; }
        .neon-badge            { display:inline-flex;align-items:center;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;font-family:monospace; }
        .neon-input            { width:100%;background:#050810;border:1px solid #00ff8828;border-radius:12px;padding:12px 16px;color:#00ff88;font-family:monospace;font-size:14px;outline:none;transition:border-color 0.2s,box-shadow 0.2s; }
        .neon-input:focus      { border-color:#00ff8870;box-shadow:0 0 0 3px #00ff8810; }
        .neon-input::placeholder{ color:#00ff8820; }
        .btn-green             { background:linear-gradient(135deg,#00cc70,#00ff88);color:#000;font-weight:900;font-family:monospace;border:none;cursor:pointer;transition:all 0.2s;letter-spacing:0.08em; }
        .btn-green:hover       { filter:brightness(1.12);transform:translateY(-1px);box-shadow:0 4px 20px #00ff8840; }
        .btn-green:disabled    { opacity:0.35;pointer-events:none; }
        .btn-red               { background:linear-gradient(135deg,#cc0028,#ff003c);color:#fff;font-weight:900;font-family:monospace;border:none;cursor:pointer;transition:all 0.2s; }
        .btn-red:hover         { filter:brightness(1.1);transform:translateY(-1px);box-shadow:0 6px 24px #ff003c50; }
        .btn-red:disabled      { opacity:0.35;pointer-events:none; }
        .btn-outline           { background:transparent;border:1px solid #00ff8828;color:#00ff8855;font-family:monospace;cursor:pointer;transition:all 0.2s; }
        .btn-outline:hover     { border-color:#00ff8860;color:#00ff8899;background:#00ff8808; }
        .grad-green            { background:linear-gradient(90deg,#00ff88,#00e5ff,#00ff88);background-size:200%;-webkit-background-clip:text;-webkit-text-fill-color:transparent;animation:shimmer 3s linear infinite; }
        .scrollbar-thin        { scrollbar-width:thin;scrollbar-color:#00ff8820 transparent; }
        .animate-dot           { animation:dotPulse 1.5s ease-in-out infinite; }
        .animate-blink         { animation:blink 1s step-end infinite; }
      `}</style>

      {/* Sending Overlay */}
      <SendingOverlay
        visible={overlayVisible}
        accounts={selectedAccounts}
        target={phoneFormatted}
        templateName={selectedTemplate?.name}
        onFinish={handleOverlayFinish}
        apiDone={apiDone}
        apiSuccess={apiSuccess}
      />

      <div className="relative flex flex-col min-h-screen" style={{ zIndex: 2 }}>

        {/* ═══ HEADER ═══ */}
        <header
          className="sticky top-0 z-20 shrink-0"
          style={{ background: "rgba(3,8,18,0.94)", borderBottom: "1px solid #00ff8815", backdropFilter: "blur(24px)" }}
        >
          <div className="max-w-[1440px] mx-auto px-3 sm:px-5 py-2 sm:py-3 flex items-center gap-2 sm:gap-4 flex-wrap">

            {/* Logo */}
            <div className="flex items-center gap-2 sm:gap-3 shrink-0" style={{ animation: "floatLogo 5s ease-in-out infinite" }}>
              <div className="relative shrink-0">
                <svg width="38" height="38" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="fmBg" x1="0" y1="0" x2="46" y2="46" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#1a0a1e"/>
                      <stop offset="45%" stopColor="#6b0f2a"/>
                      <stop offset="100%" stopColor="#b5002b"/>
                    </linearGradient>
                    <linearGradient id="fmShine" x1="0" y1="0" x2="46" y2="20" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.12"/>
                      <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
                    </linearGradient>
                    <filter id="fmShadow" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#ff003c" floodOpacity="0.5"/>
                    </filter>
                    <filter id="fmGlowIcon">
                      <feGaussianBlur stdDeviation="1.2" result="blur"/>
                      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                  </defs>
                  <rect width="46" height="46" rx="13" fill="url(#fmBg)" filter="url(#fmShadow)"/>
                  <rect width="46" height="46" rx="13" fill="url(#fmShine)"/>
                  <rect x="0.75" y="0.75" width="44.5" height="44.5" rx="12.5" stroke="white" strokeOpacity="0.12" strokeWidth="1.5"/>
                  <path d="M23 10.5C16.1 10.5 10.5 16.1 10.5 23C10.5 25.55 11.27 27.92 12.6 29.9L10.5 36L16.6 33.9C18.58 35.23 20.95 36 23 36C29.9 36 35.5 30.4 35.5 23C35.5 16.1 29.9 10.5 23 10.5Z"
                    fill="white" fillOpacity="0.97" filter="url(#fmGlowIcon)"/>
                  <path d="M17.5 23L21 26.5L28.5 19" stroke="#8b0020" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div className="absolute -inset-1.5 rounded-2xl pointer-events-none" style={{ border: "1px solid #ff003c28", boxShadow: "0 0 16px #ff003c25, 0 0 40px #ff003c0a", animation: "redPulse 3s ease-in-out infinite" }} />
              </div>
              <div>
                <div className="text-[17px] sm:text-[21px] font-black tracking-wide leading-none" style={{ color: "#fff", textShadow: "0 0 18px #ff003c55, 0 1px 3px rgba(0,0,0,0.6)", letterSpacing: "0.04em", animation: "glitchText 12s ease-in-out infinite" }}>
                  FIX MERAH
                </div>
                <div className="hidden sm:block text-[8px] tracking-[0.28em] uppercase mt-[3px]" style={{ color: "#ffffff28" }}>
                  WhatsApp Appeal System v2.0
                </div>
              </div>
            </div>

            {/* Nav tabs */}
            <div className="flex gap-1 ml-1 sm:ml-4">
              {(["appeal", "stats"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); playClick(); }}
                  className="px-2 sm:px-4 py-1.5 rounded-lg text-[10px] sm:text-[11px] font-bold tracking-wide transition-all font-mono"
                  style={tab === t
                    ? { background: "#00ff88", color: "#000", boxShadow: "0 0 18px #00ff8840" }
                    : { color: "#00ff8855", border: "1px solid #00ff8818" }
                  }
                >
                  {t === "appeal" ? "🚀 APPEAL" : "📊 STATS"}
                </button>
              ))}
            </div>

            {/* Stat chips */}
            <div className="hidden lg:flex items-center gap-2 ml-2">
              <StatChip label="Gmail Aktif" value={String(accounts.length)} color="#00ff88" icon="📧" />
              <StatChip label="Total Kirim" value={String(totalSent)} color="#00e5ff" icon="📤" />
              <StatChip label="Reply" value={`${replies.length}`} color="#ff003c" icon="📬" />
              <StatChip label="Status" value="ONLINE" color="#b44bff" icon="📡" />
            </div>

            {/* Right controls */}
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              {replies.length > 0 && (
                <div
                  className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 rounded-full cursor-pointer"
                  onClick={() => setTab("appeal")}
                  style={{ background: "#ff003c15", border: "1px solid #ff003c40", animation: "redPulse 2s ease-in-out infinite" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#ff003c", animation: "dotPulse 1s infinite" }} />
                  <span className="text-[10px] font-bold font-mono" style={{ color: "#ff003c" }}>📬 {replies.length}</span>
                </div>
              )}
              {!notifGranted && (
                <button onClick={requestNotifPermission} className="hidden sm:block text-[10px] font-mono px-2 py-1 rounded transition-colors" style={{ color: "#ffcc00", border: "1px solid #ffcc0030" }}>
                  🔔 Notif
                </button>
              )}
              <button onClick={handleSoundToggle} className="text-[15px] transition-all hover:scale-125">
                {soundOn ? "🔊" : "🔇"}
              </button>
              <div className="flex items-center gap-1">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full" style={{ background: "#00ff88", boxShadow: "0 0 8px #00ff88", animation: "dotPulse 1.5s ease-in-out infinite" }} />
                <span className="hidden sm:block text-[9px] font-mono" style={{ color: "#00ff8870" }}>LIVE</span>
              </div>
              <span className="hidden sm:block text-[11px] font-mono tabular-nums" style={{ color: "#00e5ff80" }}>{clock}</span>
            </div>
          </div>
        </header>

        {/* ═══ MAIN ═══ */}
        <main className="flex-1 max-w-[1440px] mx-auto w-full px-2 sm:px-5 py-3 sm:py-5">

          {/* ─── APPEAL TAB ─── */}
          {tab === "appeal" && (
            <div className="grid gap-3 sm:gap-5 grid-cols-1 lg:grid-cols-2">

              {/* ── LEFT: Wizard ── */}
              <div className="flex flex-col gap-4 min-w-0">

                {/* Step indicator */}
                <NeonPanel color="#00ff88">
                  <div className="px-4 py-3">
                    <div className="flex items-center">
                      {STEP_LABELS.map((label, i) => (
                        <div key={i} className="flex items-center flex-1">
                          <button onClick={() => goStep(i)} className="flex flex-col items-center gap-1 shrink-0 transition-all group">
                            <div
                              className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-bold font-mono transition-all"
                              style={{
                                background: step === i ? "#00ff88" : stepValid[i] && step !== i ? "#00ff8820" : "#0a1628",
                                border: `2px solid ${step === i ? "#00ff88" : stepValid[i] ? "#00ff8840" : "#0d2040"}`,
                                color: step === i ? "#000" : stepValid[i] ? "#00ff88" : "#1a3050",
                                boxShadow: step === i ? "0 0 16px #00ff8870, 0 0 32px #00ff8830" : stepValid[i] ? "0 0 8px #00ff8825" : undefined,
                                transform: step === i ? "scale(1.1)" : "scale(1)",
                              }}
                            >
                              {stepValid[i] && step !== i ? "✓" : STEP_ICONS[i]}
                            </div>
                            <span className="text-[9px] font-mono whitespace-nowrap hidden sm:block" style={{ color: step === i ? "#00ff88" : "#1a3050" }}>
                              {label}
                            </span>
                          </button>
                          {i < STEP_LABELS.length - 1 && (
                            <div className="flex-1 h-[1px] mx-2" style={{ background: stepValid[i] ? "linear-gradient(90deg,#00e5ff40,#00ff8840)" : "#0a1628" }} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </NeonPanel>

                {/* Step content */}
                <NeonPanel color="#00ff88" className="flex-1 p-4 sm:p-5 overflow-y-auto">

                  {/* STEP 0 */}
                  {step === 0 && (
                    <div className="space-y-5 animate-appear">
                      <div className="flex items-center gap-2">
                        <div className="w-px h-5 rounded-full" style={{ background: "#00ff88", boxShadow: "0 0 6px #00ff88" }} />
                        <span className="text-[12px] font-bold" style={{ color: "#00ff88" }}>
                          📱 STEP 1 — NOMOR WHATSAPP TARGET
                        </span>
                      </div>

                      <div className="relative">
                        <input
                          type="tel"
                          value={phoneRaw}
                          onChange={(e) => handlePhoneChange(e.target.value)}
                          placeholder="08xxxxxxxxxx atau +62xxxxxxxxx"
                          autoFocus
                          className="neon-input text-[15px]"
                        />
                        {phoneFormatted && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px]" style={{ color: "#00ff88" }}>✅</span>
                        )}
                      </div>

                      {phoneFormatted ? (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl animate-appear" style={{ background: "#00ff8808", border: "1px solid #00ff8825" }}>
                          <span className="text-[10px] font-mono" style={{ color: "#2a5040" }}>✨ Auto-format:</span>
                          <span className="text-[16px] font-black font-mono" style={{ color: "#00ff88", textShadow: "0 0 10px #00ff8870" }}>{phoneFormatted}</span>
                          <span className="ml-auto text-[9px] font-bold" style={{ color: "#00ff8860" }}>✅ VALID</span>
                        </div>
                      ) : (
                        <p className="text-[11px] font-mono" style={{ color: "#1a3030" }}>
                          💡 Format: 08xxx / +62xxx → otomatis diformat ke +62
                        </p>
                      )}

                      <div className="p-3 sm:p-4 rounded-xl text-[11px] font-mono space-y-2" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid #00ff8812" }}>
                        <div className="font-bold mb-2" style={{ color: "#00ff88" }}>📋 Info Sistem</div>
                        {[
                          ["📧 Email target:", "support@support.whatsapp.com", "#00e5ff"],
                          ["🔒 Protocol:", "SMTP Gmail + App Password", "#7a9080"],
                          ["📡 Monitoring:", "IMAP real-time (30s polling)", "#7a9080"],
                          ["🔔 Notifikasi:", "Browser push notification", "#7a9080"],
                        ].map(([k, v, c]) => (
                          <div key={k as string} className="flex flex-col sm:flex-row sm:gap-2">
                            <span className="shrink-0" style={{ color: "#1a3030" }}>{k as string}</span>
                            <span className="break-all" style={{ color: c as string }}>{v as string}</span>
                          </div>
                        ))}
                      </div>

                      <button
                        disabled={!phoneFormatted}
                        onClick={() => goStep(1)}
                        className="btn-green w-full py-3.5 rounded-2xl text-[13px] font-mono tracking-widest"
                      >
                        LANJUT → 📝 PILIH TEMPLATE
                      </button>
                    </div>
                  )}

                  {/* STEP 1 */}
                  {step === 1 && (
                    <div className="space-y-4 animate-appear">
                      <div className="flex items-center gap-2">
                        <div className="w-px h-5 rounded-full" style={{ background: "#00ff88", boxShadow: "0 0 6px #00ff88" }} />
                        <span className="text-[12px] font-bold" style={{ color: "#00ff88" }}>📝 STEP 2 — PILIH TEMPLATE EMAIL</span>
                      </div>
                      <TemplateSelector
                        selected={selectedTemplate}
                        onSelect={(t) => { setSelectedTemplate(t); addLog("info", `📋 Template dipilih: ${t.name}`); playClick(); }}
                        targetNumber={phoneFormatted}
                        senderEmail={selectedAccounts[0]?.email}
                      />
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => goStep(0)} className="btn-outline flex-1 py-2.5 rounded-xl text-[12px] font-mono">← KEMBALI</button>
                        <button disabled={!selectedTemplate} onClick={() => goStep(2)} className="btn-green flex-1 py-2.5 rounded-xl text-[12px] font-mono">
                          LANJUT → 📧 GMAIL
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 2 */}
                  {step === 2 && (
                    <div className="space-y-4 animate-appear">
                      <div className="flex items-center gap-2">
                        <div className="w-px h-5 rounded-full" style={{ background: "#00ff88", boxShadow: "0 0 6px #00ff88" }} />
                        <span className="text-[12px] font-bold" style={{ color: "#00ff88" }}>📧 STEP 3 — PILIH AKUN GMAIL</span>
                      </div>
                      <GmailManager accounts={accounts} onAccountsChange={setAccounts} onLog={addLog} />
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => goStep(1)} className="btn-outline flex-1 py-2.5 rounded-xl text-[12px] font-mono">← KEMBALI</button>
                        <button disabled={selectedAccounts.length === 0} onClick={() => goStep(3)} className="btn-green flex-1 py-2.5 rounded-xl text-[12px] font-mono">
                          LANJUT → 🚀 KIRIM
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 3 */}
                  {step === 3 && (
                    <div className="space-y-5 animate-appear">
                      <div className="flex items-center gap-2">
                        <div className="w-px h-5 rounded-full" style={{ background: "#ff003c", boxShadow: "0 0 6px #ff003c" }} />
                        <span className="text-[12px] font-bold" style={{ color: "#ff003c" }}>🚀 STEP 4 — KONFIRMASI & KIRIM</span>
                      </div>

                      {/* Summary */}
                      <div className="p-4 rounded-2xl font-mono text-[12px] space-y-0" style={{ background: "rgba(0,0,0,0.45)", border: "1px solid #00ff8818" }}>
                        <div className="font-bold mb-3" style={{ color: "#00ff88" }}>📋 Ringkasan Pengiriman</div>
                        {[
                          ["🎯 Target Nomor",  phoneFormatted,                              "#00ff88"],
                          ["📝 Template",      `${selectedTemplate?.icon} ${selectedTemplate?.name}`, "#e0ffe0"],
                          ["📧 Kirim dari",    `${selectedAccounts.length} akun Gmail`,    "#00e5ff"],
                          ["📬 Tujuan Email",  "support@support.whatsapp.com",             "#ffcc00"],
                        ].map(([k, v, c]) => (
                          <div key={k as string} className="flex justify-between py-2" style={{ borderBottom: "1px solid #06101e" }}>
                            <span style={{ color: "#1a3030" }}>{k as string}</span>
                            <span className="font-bold" style={{ color: c as string }}>{v as string}</span>
                          </div>
                        ))}
                        <div className="pt-3 space-y-1.5">
                          <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color: "#0a2030" }}>📧 Akun Pengirim</div>
                          {selectedAccounts.map((a) => (
                            <div key={a.id} className="flex items-center gap-2">
                              <div className={`w-2 h-2 rounded-full shrink-0 ${a.status === "sending" ? "animate-pulse" : ""}`} style={{
                                background: a.status === "sent" ? "#00ff88" : a.status === "sending" ? "#ffcc00" : a.status === "error" ? "#ff003c" : "#1a3050",
                                boxShadow: a.status === "sent" ? "0 0 6px #00ff88" : a.status === "sending" ? "0 0 6px #ffcc00" : undefined,
                              }} />
                              <span style={{ color: "#4a6070" }} className="text-[11px]">{a.email}</span>
                              {a.label && <span className="text-[9px]" style={{ color: "#00e5ff60" }}>({a.label})</span>}
                              {a.status === "sent" && <span className="text-[9px] ml-auto" style={{ color: "#00ff88" }}>✅</span>}
                              {a.status === "sending" && <span className="text-[9px] ml-auto animate-pulse" style={{ color: "#ffcc00" }}>⏳</span>}
                              {a.status === "error" && <span className="text-[9px] ml-auto" style={{ color: "#ff003c" }}>❌</span>}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* SEND BUTTON */}
                      <button
                        disabled={!canSend || sending}
                        onClick={handleSend}
                        className="btn-red w-full py-4 rounded-2xl text-[16px] font-mono tracking-widest font-black relative overflow-hidden"
                        style={{ animation: !sending && canSend ? "redPulse 2s ease-in-out infinite" : undefined }}
                      >
                        <span className="relative z-10 flex items-center justify-center gap-3">
                          {sending ? (
                            <>
                              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ⚡ MENGIRIM...
                            </>
                          ) : "🚀 KIRIM APPEAL SEKARANG"}
                        </span>
                        {!sending && canSend && (
                          <div className="absolute inset-0 opacity-20" style={{
                            background: "linear-gradient(90deg,transparent,white,transparent)",
                            animation: "scanHoriz 2s linear infinite",
                          }} />
                        )}
                      </button>

                      {totalSent > 0 && (
                        <div className="flex items-center justify-center gap-2 text-[11px] font-mono py-1" style={{ color: "#00ff8860" }}>
                          ✅ Total terkirim sesi ini: <span className="font-bold" style={{ color: "#00ff88" }}>{totalSent} email</span>
                        </div>
                      )}

                      <button onClick={() => goStep(2)} className="btn-outline w-full py-2.5 rounded-xl text-[12px] font-mono">
                        ← KEMBALI
                      </button>
                    </div>
                  )}
                </NeonPanel>
              </div>

              {/* ── RIGHT: Terminal + Reply ── */}
              <div className="flex flex-col gap-3 sm:gap-4 min-w-0">
                <NeonPanel color="#00e5ff" className="h-[260px] sm:h-[340px] lg:h-[420px]">
                  <Terminal logs={logs} />
                </NeonPanel>
                <NeonPanel color="#ff003c" className="p-3 sm:p-4 flex-1" style={{ minHeight: 200 }}>
                  <ReplyMonitor replies={replies} />
                </NeonPanel>
              </div>
            </div>
          )}

          {/* ─── STATS TAB ─── */}
          {tab === "stats" && (
            <NeonPanel color="#00ff88" className="p-6 animate-appear">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-px h-6 rounded-full" style={{ background: "#00ff88", boxShadow: "0 0 8px #00ff88" }} />
                <span className="text-[14px] font-bold grad-green">📊 Dashboard Statistik</span>
                <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg,#00ff8820,transparent)" }} />
              </div>
              <Stats />
            </NeonPanel>
          )}
        </main>

        {/* ═══ FOOTER ═══ */}
        <footer className="shrink-0 py-2 text-center" style={{ borderTop: "1px solid #00ff8808" }}>
          <span className="text-[9px] font-mono" style={{ color: "#0a1820" }}>
            ⚡ FIX MERAH v2.0 — WhatsApp Appeal Tool — Dibuat dengan 💚
          </span>
        </footer>
      </div>
    </div>
  );
}
