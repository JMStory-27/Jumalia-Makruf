import { useState, useEffect, useCallback, useId, useRef } from "react";
import { Terminal } from "./components/Terminal";
import { GmailManager } from "./components/GmailManager";
import { TemplateSelector } from "./components/TemplateSelector";
import { ReplyMonitor } from "./components/ReplyMonitor";
import { Stats } from "./components/Stats";
import { SendingOverlay } from "./components/SendingOverlay";
import { BombingModal } from "./components/BombingModal";
import type { BombAccountStatus } from "./components/BombingModal";
import { useSound } from "./hooks/useSound";
import { createSSE, listGmailAccounts, sendAppeal, pollNow, waitForApi } from "./lib/api";
import { EMAIL_TEMPLATES } from "./data/templates";
import { pickName, INDONESIAN_NAMES } from "./data/names";
import { EmailPreview } from "./components/EmailPreview";
import { smartFormatPhone } from "./lib/countryPhone";
import type { CountryInfo } from "./lib/countryPhone";
import { useHealthCheck } from "./hooks/useHealthCheck";
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
void formatPhone;

function fillTemplate(text: string, nomor: string, email: string, namaPengirim?: string): string {
  const tanggal = new Date().toLocaleDateString("id-ID", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const nama = namaPengirim ?? "Pengguna WhatsApp";
  return text
    .replace(/\{nomor\}/g, nomor)
    .replace(/\{tanggal\}/g, tanggal)
    .replace(/\{emailPengirim\}/g, email)
    .replace(/\{namaPengirim\}/g, nama);
}

let logCounter = 0;
function makeLog(type: TerminalLog["type"], message: string): TerminalLog {
  return { id: `${++logCounter}`, timestamp: new Date().toLocaleTimeString("en-US", { hour12: false }), type, message };
}

/* ─── Aurora background ─────────────────────────────────────────── */
function AuroraBg() {
  return (
    <div className="orb-container fixed inset-0 overflow-hidden pointer-events-none" style={{ zIndex: 0 }}>
      <div style={{
        position: "absolute", width: 700, height: 700, top: -220, left: -120,
        background: "radial-gradient(circle at center, rgba(244,63,94,0.17) 0%, rgba(190,18,60,0.08) 45%, transparent 72%)",
        animation: "orbA 28s ease-in-out infinite",
        willChange: "transform",
      }} />
      <div style={{
        position: "absolute", width: 800, height: 800, top: -150, right: -250,
        background: "radial-gradient(circle at center, rgba(139,92,246,0.13) 0%, rgba(109,40,217,0.06) 50%, transparent 72%)",
        animation: "orbB 34s ease-in-out infinite",
        willChange: "transform",
      }} />
      <div style={{
        position: "absolute", width: 600, height: 600, bottom: -80, left: "25%",
        background: "radial-gradient(circle at center, rgba(34,211,238,0.09) 0%, rgba(6,182,212,0.04) 50%, transparent 70%)",
        animation: "orbC 40s ease-in-out infinite",
        willChange: "transform",
      }} />
      <div style={{
        position: "absolute", width: 500, height: 500, bottom: "20%", right: "5%",
        background: "radial-gradient(circle at center, rgba(244,63,94,0.08) 0%, transparent 65%)",
        animation: "orbD 32s ease-in-out infinite",
        willChange: "transform",
      }} />
      <div style={{
        position: "absolute", inset: 0,
        backgroundImage: `radial-gradient(ellipse at 20% 50%, rgba(244,63,94,0.04) 0%, transparent 50%),
          radial-gradient(ellipse at 80% 20%, rgba(139,92,246,0.04) 0%, transparent 50%)`,
      }} />
    </div>
  );
}

/* ─── Glass card (replaces NeonPanel) ───────────────────────────── */
function GlassCard({ children, className = "", accent, style }: {
  children: React.ReactNode;
  className?: string;
  accent?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div className={`glass-card ${className}`} style={style}>
      {accent && (
        <div style={{
          position: "absolute", top: 0, left: "8%", right: "8%", height: 1,
          background: `linear-gradient(90deg, transparent, ${accent}55, transparent)`,
          pointerEvents: "none", zIndex: 2,
        }} />
      )}
      {children}
    </div>
  );
}

/* ─── Live clock ────────────────────────────────────────────────── */
function LiveClock() {
  const [t, setT] = useState(() => new Date().toLocaleTimeString("en-US", { hour12: false }));
  useEffect(() => {
    const iv = setInterval(() => setT(new Date().toLocaleTimeString("en-US", { hour12: false })), 1000);
    return () => clearInterval(iv);
  }, []);
  return (
    <span className="hidden sm:block mono text-[11px] tabular-nums" style={{ color: "rgba(34,211,238,0.5)" }}>{t}</span>
  );
}

/* ─── Stat chip ─────────────────────────────────────────────────── */
function StatChip({ label, value, color, icon }: { label: string; value: string; color: string; icon: string }) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-1.5 rounded-xl shrink-0 transition-all hover:scale-105 cursor-default"
      style={{ background: `${color}0d`, border: `1px solid ${color}22` }}
    >
      <span className="text-sm">{icon}</span>
      <div>
        <div className="text-[13px] font-black mono leading-none" style={{ color, textShadow: `0 0 12px ${color}60` }}>{value}</div>
        <div className="text-[8px] uppercase tracking-widest mt-0.5" style={{ color: `${color}55`, fontFamily: "inherit" }}>{label}</div>
      </div>
    </div>
  );
}

/* ─── Step header label ─────────────────────────────────────────── */
function StepLabel({ icon, text, color = "#f43f5e" }: { icon: string; text: string; color?: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-5">
      <div style={{ width: 3, height: 22, borderRadius: 2, background: `linear-gradient(180deg, ${color}, ${color}44)`, flexShrink: 0 }} />
      <div className="flex items-center gap-2">
        <span>{icon}</span>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color, opacity: 0.9 }}>{text}</span>
      </div>
    </div>
  );
}

/* ─── Info row ──────────────────────────────────────────────────── */
function InfoRow({ icon, text, color }: { icon: string; text: string; color: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[11px] shrink-0">{icon}</span>
      <span className="text-[10px] truncate mono" style={{ color }}>{text}</span>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
export default function App() {
  const uid = useId();
  const [tab, setTab] = useState<Tab>("appeal");
  const [step, setStep] = useState(0);
  const wizardTopRef = useRef<HTMLDivElement>(null);
  const [countryInfo, setCountryInfo] = useState<CountryInfo | null>(null);
  const health = useHealthCheck();
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [phoneRaw, setPhoneRaw] = useState("");
  const [phoneFormatted, setPhoneFormatted] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [accounts, setAccounts] = useState<GmailAccount[]>([]);
  const [logs, setLogs] = useState<TerminalLog[]>([
    makeLog("system", "⚡ Fix Merah v2.0 initialized — sistem siap"),
    makeLog("system", "📡 IMAP IDLE: standby"),
    makeLog("info",   "⏳ Menunggu input pengguna..."),
  ]);
  const [replies, setReplies] = useState<ReplyRecord[]>([]);
  const [sending, setSending] = useState(false);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [apiDone, setApiDone] = useState(false);
  const [apiSuccess, setApiSuccess] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [lightMode, setLightMode] = useState(false);
  const [bombVisible, setBombVisible] = useState(false);
  const [bombStatuses, setBombStatuses] = useState<BombAccountStatus[]>([]);
  const [bombIsDone, setBombIsDone] = useState(false);
  const [notifGranted, setNotifGranted] = useState(typeof Notification !== "undefined" && Notification.permission === "granted");
  const [totalSent, setTotalSent] = useState(0);

  const { playSuccess, playError, playNotification, playSend, playKeypress, playStep, playClick, toggle } = useSound();

  const addLog = useCallback((type: TerminalLog["type"], message: string) => {
    setLogs((prev) => [...prev.slice(-299), makeLog(type, message)]);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function initApi() {
      addLog("info", "🔌 Menghubungkan ke API server...");
      const ready = await waitForApi((msg) => { if (!cancelled) addLog("warn", msg); });
      if (cancelled) return;
      if (!ready) { addLog("error", "❌ API server tidak merespons. Coba refresh halaman."); return; }
      try {
        const data: GmailAccount[] = await listGmailAccounts();
        if (cancelled) return;
        setAccounts(data.map((a: GmailAccount) => ({ ...a, selected: true, status: "idle" })));
        addLog("info", data.length > 0
          ? `✅ Loaded ${data.length} Gmail account(s) — siap kirim`
          : "✅ API server ready. Belum ada akun Gmail."
        );
      } catch { if (!cancelled) addLog("warn", "⚠️ Gagal load akun Gmail."); }
    }
    initApi();
    return () => { cancelled = true; };
  }, [addLog]);

  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);

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
    const result = smartFormatPhone(phoneRaw);
    setPhoneFormatted(result.formatted);
    setCountryInfo(result.country);
  }, [phoneRaw]);

  async function requestNotifPermission() {
    if (typeof Notification === "undefined") { addLog("warn", "🔔 Notifikasi tidak didukung di browser ini"); return; }
    const perm = await Notification.requestPermission();
    setNotifGranted(perm === "granted");
    addLog("info", `🔔 Push notification: ${perm}`);
  }

  function handlePhoneChange(val: string) { setPhoneRaw(val); playKeypress(); }
  function handleSoundToggle() { const on = toggle(); setSoundOn(on); addLog("info", `🔊 Sound: ${on ? "ON" : "OFF"}`); }
  function handleLightModeToggle() {
    setLightMode(m => { const next = !m; addLog("info", `🌗 Theme: ${next ? "LIGHT" : "DARK"}`); return next; });
  }

  const rippleRef = useRef<((e: React.MouseEvent<HTMLElement>) => void) | null>(null);
  if (!rippleRef.current) {
    rippleRef.current = (e: React.MouseEvent<HTMLElement>) => {
      const el = e.currentTarget as HTMLElement;
      const rect = el.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 1.4;
      const span = document.createElement("span");
      span.style.cssText = [
        `position:absolute`,
        `left:${e.clientX - rect.left - size / 2}px`,
        `top:${e.clientY - rect.top - size / 2}px`,
        `width:${size}px`, `height:${size}px`,
        `border-radius:50%`,
        `background:rgba(244,63,94,0.2)`,
        `pointer-events:none`,
        `animation:rippleAnim 0.55s ease-out forwards`,
        `z-index:9999`,
      ].join(";");
      el.style.position = "relative";
      el.style.overflow = "hidden";
      el.appendChild(span);
      setTimeout(() => span.remove(), 600);
    };
  }
  const addRipple = rippleRef.current;

  const selectedAccounts = accounts.filter((a) => a.selected);
  const canSend = phoneFormatted && selectedTemplate && selectedAccounts.length > 0;

  async function handleSend() {
    if (!canSend || sending) return;
    setSending(true); setApiDone(false); setApiSuccess(false); setOverlayVisible(true); playSend();
    addLog("system", `⚡ Memulai pengiriman appeal → 1021801597561775@support.whatsapp.com`);
    addLog("info",   `🎯 Target: ${phoneFormatted} | 📋 Template: ${selectedTemplate!.name}`);
    addLog("info",   `📧 Pengirim: ${selectedAccounts.length} akun Gmail`);
    addLog("packet", `🔒 Mengenkripsi koneksi SMTP...`);
    setAccounts((prev) => prev.map((a) => (a.selected ? { ...a, status: "sending" } : a)));
    try {
      const senderName = pickName();
      const firstEmail = selectedAccounts[0]?.email ?? "";
      const filledSubject = fillTemplate(selectedTemplate!.subject, phoneFormatted, firstEmail, senderName);
      const filledHtml = fillTemplate(selectedTemplate!.htmlBody, phoneFormatted, firstEmail, senderName);
      addLog("info", `👤 Nama pengirim: ${senderName}`);
      const result = await sendAppeal({
        targetNumber: phoneFormatted, templateId: selectedTemplate!.id,
        accountIds: selectedAccounts.map((a) => a.id),
        templateSubject: filledSubject,
        templateHtml: filledHtml,
        templateName: selectedTemplate!.name,
      });
      let successCount = 0;
      for (const r of result.results ?? []) {
        if (r.success) { addLog("success", `✅ Terkirim via ${r.email} → 1021801597561775@support.whatsapp.com`); successCount++; }
        else addLog("error", `❌ Gagal via ${r.email}: ${r.error}`);
      }
      setAccounts((prev) => prev.map((a) => {
        if (!a.selected) return a;
        const res = result.results?.find((r: { email: string; success: boolean; error?: string }) => r.email === a.email);
        return { ...a, status: res?.success ? "sent" : "error", error: res?.error };
      }));
      setTotalSent(p => p + successCount);
      setApiSuccess(successCount > 0);
      addLog("system", `📡 IMAP IDLE aktif — notifikasi balasan instan`);
      if (successCount > 0) playSuccess(); else playError();
    } catch (err) {
      addLog("error", `❌ Gagal: ${err instanceof Error ? err.message : String(err)}`);
      setAccounts((prev) => prev.map((a) => (a.selected ? { ...a, status: "error" } : a)));
      setApiSuccess(false); playError();
    } finally { setApiDone(true); }
  }

  function handleOverlayFinish() { setOverlayVisible(false); setSending(false); }

  async function handleBomb() {
    if (sending || !selectedTemplate || !phoneFormatted) return;
    const allAccounts = accounts.map((a) => ({ ...a, selected: true }));
    setAccounts(allAccounts);
    const initial: BombAccountStatus[] = allAccounts.map((a) => ({ id: a.id, email: a.email, label: a.label, status: "idle" }));
    setBombStatuses(initial); setBombIsDone(false); setBombVisible(true); setSending(true); playSend();
    addLog("system", `💣 BOMBING MODE — ${allAccounts.length} akun Gmail disiapkan`);
    addLog("info",   `🎯 Target: ${phoneFormatted} | Template: ${selectedTemplate!.name}`);
    const MIN_DISPLAY_MS = 2200;
    const BETWEEN_DELAY_MS = 400;
    let successCount = 0;
    for (let idx = 0; idx < allAccounts.length; idx++) {
      const account = allAccounts[idx];
      const sendStart = Date.now();
      setBombStatuses((prev) => prev.map((s) => (s.id === account.id ? { ...s, status: "sending" } : s)));
      addLog("packet", `📡 [${idx + 1}/${allAccounts.length}] Mengirim via ${account.email}...`);
      try {
        const senderName = pickName();
        const filledSubjectB = fillTemplate(selectedTemplate!.subject, phoneFormatted, account.email, senderName);
        const filledHtmlB = fillTemplate(selectedTemplate!.htmlBody, phoneFormatted, account.email, senderName);
        addLog("info", `👤 [${idx + 1}] Nama pengirim: ${senderName}`);
      const result = await sendAppeal({
          targetNumber: phoneFormatted, templateId: selectedTemplate!.id,
          accountIds: [account.id], templateSubject: filledSubjectB,
          templateHtml: filledHtmlB, templateName: selectedTemplate!.name,
        });
        const elapsed = Date.now() - sendStart;
        if (elapsed < MIN_DISPLAY_MS) await new Promise<void>((r) => setTimeout(r, MIN_DISPLAY_MS - elapsed));
        const r = result.results?.[0];
        if (r?.success) {
          setBombStatuses((prev) => prev.map((s) => (s.id === account.id ? { ...s, status: "sent" } : s)));
          setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, status: "sent" } : a)));
          addLog("success", `✅ [${idx + 1}/${allAccounts.length}] Terkirim via ${account.email}`);
          successCount++; setTotalSent((p) => p + 1); playSuccess();
        } else {
          setBombStatuses((prev) => prev.map((s) => s.id === account.id ? { ...s, status: "error", error: r?.error } : s));
          setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, status: "error" } : a)));
          addLog("error", `❌ [${idx + 1}/${allAccounts.length}] Gagal via ${account.email}: ${r?.error ?? "unknown"}`);
          playError();
        }
      } catch (err) {
        const elapsed = Date.now() - sendStart;
        if (elapsed < MIN_DISPLAY_MS) await new Promise<void>((r) => setTimeout(r, MIN_DISPLAY_MS - elapsed));
        const msg = err instanceof Error ? err.message : String(err);
        setBombStatuses((prev) => prev.map((s) => s.id === account.id ? { ...s, status: "error", error: msg } : s));
        setAccounts((prev) => prev.map((a) => (a.id === account.id ? { ...a, status: "error" } : a)));
        addLog("error", `❌ [${idx + 1}/${allAccounts.length}] Error: ${msg.slice(0, 80)}`);
        playError();
      }
      if (idx < allAccounts.length - 1) await new Promise<void>((r) => setTimeout(r, BETWEEN_DELAY_MS));
    }
    setBombIsDone(true); setSending(false);
    addLog("system", `💣 Bombing selesai — ${successCount}/${allAccounts.length} email terkirim`);
  }

  function handleBombClose() { setBombVisible(false); }

  function goStep(n: number) {
    setStep(n); playStep();
    addLog("info", `📍 Step ${n + 1}: ${STEP_LABELS[n]}`);
  }

  const stepValid = [!!phoneFormatted, !!selectedTemplate, selectedAccounts.length > 0, !!(canSend)];

  /* ─── Accent colors ─────────────────────────────────────────────── */
  const ROSE   = "#f43f5e";
  const CYAN   = "#22d3ee";
  const VIOLET = "#8b5cf6";

  /* ─── Light mode bg ─────────────────────────────────────────────── */
  const bg = lightMode ? "#f1f5f9" : "#04070e";
  const textBase = lightMode ? "#0f172a" : "#edf2ff";

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      id={uid}
      style={{ background: bg, color: textBase, transition: "background 0.5s, color 0.5s" }}
    >
      {!lightMode && <AuroraBg />}

      <SendingOverlay
        visible={overlayVisible} accounts={selectedAccounts} target={phoneFormatted}
        templateName={selectedTemplate?.name} onFinish={handleOverlayFinish}
        apiDone={apiDone} apiSuccess={apiSuccess}
      />
      <BombingModal
        visible={bombVisible} target={phoneFormatted}
        templateName={selectedTemplate?.name ?? ""} accountStatuses={bombStatuses}
        onClose={handleBombClose} isDone={bombIsDone}
      />

      <div className="relative flex flex-col min-h-screen" style={{ zIndex: 2 }}>

        {/* ════════════ HEADER ════════════ */}
        <header
          className="sticky top-0 z-20 shrink-0"
          style={{
            background: lightMode ? "rgba(241,245,249,0.94)" : "rgba(4,7,14,0.86)",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            boxShadow: "0 1px 0 0 rgba(244,63,94,0.07), 0 4px 24px rgba(0,0,0,0.35)",
            transition: "background 0.5s",
          }}
        >
          <div className="max-w-[1440px] mx-auto px-3 sm:px-5 py-2.5 sm:py-3 flex items-center gap-2 sm:gap-4 flex-wrap">

            {/* Logo */}
            <div className="flex items-center gap-2.5 shrink-0" style={{ animation: "floatLogo 6s ease-in-out infinite" }}>
              <div className="relative shrink-0">
                <svg width="36" height="36" viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <defs>
                    <linearGradient id="fmBg2" x1="0" y1="0" x2="46" y2="46" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#1a0510"/>
                      <stop offset="40%" stopColor="#7f0f27"/>
                      <stop offset="100%" stopColor="#c81440"/>
                    </linearGradient>
                    <linearGradient id="fmShine2" x1="0" y1="0" x2="46" y2="22" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.18"/>
                      <stop offset="100%" stopColor="#ffffff" stopOpacity="0"/>
                    </linearGradient>
                    <filter id="fmShadow2" x="-30%" y="-30%" width="160%" height="160%">
                      <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#f43f5e" floodOpacity="0.6"/>
                    </filter>
                    <filter id="fmGlow2">
                      <feGaussianBlur stdDeviation="1" result="blur"/>
                      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                    </filter>
                  </defs>
                  <rect width="46" height="46" rx="14" fill="url(#fmBg2)" filter="url(#fmShadow2)"/>
                  <rect width="46" height="46" rx="14" fill="url(#fmShine2)"/>
                  <rect x="0.75" y="0.75" width="44.5" height="44.5" rx="13.5" stroke="white" strokeOpacity="0.14" strokeWidth="1.5"/>
                  <path d="M23 10.5C16.1 10.5 10.5 16.1 10.5 23C10.5 25.55 11.27 27.92 12.6 29.9L10.5 36L16.6 33.9C18.58 35.23 20.95 36 23 36C29.9 36 35.5 30.4 35.5 23C35.5 16.1 29.9 10.5 23 10.5Z"
                    fill="white" fillOpacity="0.97" filter="url(#fmGlow2)"/>
                  <path d="M17.5 23L21 26.5L28.5 19" stroke="#8b0020" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div className="absolute -inset-1.5 rounded-2xl pointer-events-none" style={{
                  border: "1px solid rgba(244,63,94,0.3)",
                  boxShadow: "0 0 18px rgba(244,63,94,0.25), 0 0 40px rgba(244,63,94,0.08)",
                  animation: "redPulse 3.5s ease-in-out infinite",
                }} />
              </div>
              <div>
                <div
                  className="text-[18px] sm:text-[22px] font-black leading-none tracking-wide"
                  style={{ color: "#fff", letterSpacing: "0.06em", animation: "glitchText 14s ease-in-out infinite",
                    textShadow: "0 0 20px rgba(244,63,94,0.5), 0 1px 4px rgba(0,0,0,0.7)" }}
                >
                  FIX MERAH
                </div>
                <div className="hidden sm:block text-[8px] tracking-[0.3em] uppercase mt-[3px]" style={{ color: "rgba(255,255,255,0.22)" }}>
                  WhatsApp Appeal System v2.0
                </div>
              </div>
            </div>

            {/* Nav tabs */}
            <div className="flex gap-1 ml-1 sm:ml-3">
              {(["appeal", "stats"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => { setTab(t); playClick(); }}
                  className="px-3 sm:px-4 py-1.5 rounded-xl text-[10px] sm:text-[11px] font-bold tracking-wide transition-all"
                  style={tab === t
                    ? { background: "linear-gradient(135deg, #be123c, #f43f5e)", color: "#fff", boxShadow: "0 0 20px rgba(244,63,94,0.4), 0 2px 8px rgba(244,63,94,0.2)" }
                    : { color: "rgba(244,63,94,0.5)", border: "1px solid rgba(244,63,94,0.15)", background: "transparent" }
                  }
                >
                  {t === "appeal" ? "🚀 APPEAL" : "📊 STATS"}
                </button>
              ))}
            </div>

            {/* Stat chips (desktop) */}
            <div className="hidden lg:flex items-center gap-2 ml-2">
              <StatChip label="Gmail" value={String(accounts.length)} color={VIOLET} icon="📧" />
              <StatChip label="Terkirim" value={String(totalSent)} color={CYAN} icon="📤" />
              <StatChip label="Reply" value={String(replies.length)} color={ROSE} icon="📬" />
              <StatChip
                label="SMTP" icon={health.smtp === "ok" ? "📤" : health.smtp === "checking" ? "⏳" : "⚠️"}
                value={health.smtp === "ok" ? "OK" : health.smtp === "checking" ? "..." : "ERR"}
                color={health.smtp === "ok" ? CYAN : health.smtp === "checking" ? "#f59e0b" : ROSE}
              />
              <StatChip
                label="IMAP" icon={health.imap === "ok" ? "📬" : health.imap === "checking" ? "⏳" : "⚠️"}
                value={health.imap === "ok" ? "IDLE" : health.imap === "checking" ? "..." : "ERR"}
                color={health.imap === "ok" ? "#10b981" : health.imap === "checking" ? "#f59e0b" : ROSE}
              />
            </div>

            {/* Right controls */}
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              {replies.length > 0 && (
                <div
                  onClick={() => setTab("appeal")}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-full cursor-pointer transition-all hover:scale-105"
                  style={{ background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.35)", animation: "redPulse 2s ease-in-out infinite" }}
                >
                  <div className="w-1.5 h-1.5 rounded-full animate-dot" style={{ background: ROSE, boxShadow: "0 0 6px #f43f5e" }} />
                  <span className="text-[10px] font-bold mono" style={{ color: ROSE }}>📬 {replies.length}</span>
                </div>
              )}
              {!notifGranted && (
                <button onClick={requestNotifPermission} className="hidden sm:block text-[10px] px-2 py-1 rounded-lg transition-colors" style={{ color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)" }}>
                  🔔 Notif
                </button>
              )}
              <button onClick={(e) => { addRipple(e as React.MouseEvent<HTMLElement>); handleLightModeToggle(); }}
                className="text-[16px] transition-all hover:scale-125 relative" title="Toggle theme">
                {lightMode ? "☀️" : "🌙"}
              </button>
              <button onClick={handleSoundToggle} className="text-[16px] transition-all hover:scale-125">
                {soundOn ? "🔊" : "🔇"}
              </button>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full animate-dot" style={{ background: ROSE, boxShadow: "0 0 8px #f43f5e" }} />
                <span className="hidden sm:block text-[9px] mono" style={{ color: "rgba(244,63,94,0.55)" }}>LIVE</span>
              </div>
              <LiveClock />
            </div>
          </div>
        </header>

        {/* ════════════ MAIN ════════════ */}
        <main className="flex-1 max-w-[1440px] mx-auto w-full px-2 sm:px-5 py-4 sm:py-6">

          {/* ─── APPEAL TAB ─── */}
          {tab === "appeal" && (
            <div className="grid gap-4 sm:gap-5 grid-cols-1 lg:grid-cols-2">

              {/* LEFT: Wizard */}
              <div ref={wizardTopRef} className="flex flex-col gap-4 min-w-0">

                {/* Step indicator */}
                <GlassCard accent={ROSE}>
                  <div className="px-4 py-4">
                    <div className="flex items-center">
                      {STEP_LABELS.map((label, i) => (
                        <div key={i} className="flex items-center flex-1">
                          <button onClick={() => goStep(i)} className="flex flex-col items-center gap-1.5 shrink-0 transition-all group">
                            <div style={{
                              width: 38, height: 38, borderRadius: "50%",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              fontSize: 14, fontWeight: 800, transition: "all 0.3s",
                              background: step === i
                                ? "linear-gradient(135deg, #be123c, #f43f5e, #fb7185)"
                                : stepValid[i] && step !== i
                                  ? "rgba(244,63,94,0.12)"
                                  : "rgba(255,255,255,0.04)",
                              border: step === i
                                ? "none"
                                : stepValid[i]
                                  ? "1.5px solid rgba(244,63,94,0.4)"
                                  : "1.5px solid rgba(255,255,255,0.08)",
                              boxShadow: step === i
                                ? "0 0 22px rgba(244,63,94,0.6), 0 0 44px rgba(244,63,94,0.25)"
                                : stepValid[i] ? "0 0 10px rgba(244,63,94,0.2)" : undefined,
                              color: step === i ? "#fff" : stepValid[i] ? ROSE : "rgba(255,255,255,0.25)",
                              animation: step === i ? "stepCircleGlow 2.5s ease-in-out infinite" : undefined,
                            }}>
                              {stepValid[i] && step !== i ? "✓" : STEP_ICONS[i]}
                            </div>
                            <span style={{
                              fontSize: 9, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase",
                              color: step === i ? ROSE : stepValid[i] ? "rgba(244,63,94,0.65)" : "rgba(255,255,255,0.22)",
                              whiteSpace: "nowrap", transition: "color 0.3s",
                            }}>
                              {label}
                            </span>
                          </button>
                          {i < STEP_LABELS.length - 1 && (
                            <div className={`step-connector${stepValid[i] ? " done" : ""}`} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </GlassCard>

                {/* Step content */}
                <GlassCard accent={step === 3 ? ROSE : VIOLET} className="flex-1 p-4 sm:p-5">

                  {/* STEP 0 — Phone */}
                  {step === 0 && (
                    <div className="space-y-4 animate-appear">
                      <StepLabel icon="📱" text="Step 1 — Nomor WhatsApp Target" />

                      <div className="relative">
                        <input
                          type="tel" value={phoneRaw}
                          onChange={(e) => handlePhoneChange(e.target.value)}
                          placeholder="08xxxxxxxxxx / +62xxx / +31xxx"
                          autoFocus className="neon-input text-[15px]"
                          style={{ paddingLeft: countryInfo ? "42px" : undefined }}
                        />
                        {countryInfo && (
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[18px] pointer-events-none leading-none">
                            {countryInfo.flag}
                          </span>
                        )}
                        {phoneFormatted && (
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[14px]" style={{ color: "#10b981" }}>✅</span>
                        )}
                      </div>

                      {phoneFormatted ? (
                        <div className="flex items-center gap-3 px-4 py-3 rounded-2xl animate-appear" style={{
                          background: "rgba(244,63,94,0.06)",
                          border: "1px solid rgba(244,63,94,0.2)",
                        }}>
                          {countryInfo && <span className="text-[26px] leading-none shrink-0">{countryInfo.flag}</span>}
                          <div className="flex flex-col min-w-0">
                            <span className="text-[17px] font-black mono leading-tight" style={{ color: ROSE, textShadow: "0 0 12px rgba(244,63,94,0.5)" }}>
                              {phoneFormatted}
                            </span>
                            {countryInfo && (
                              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>{countryInfo.name} (+{countryInfo.code})</span>
                            )}
                          </div>
                          <div className="ml-auto flex items-center gap-1.5 px-2 py-1 rounded-lg" style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)" }}>
                            <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#10b981" }} />
                            <span className="text-[9px] font-bold" style={{ color: "#10b981" }}>VALID</span>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {([["🇮🇩","08/+62"],["🇲🇾","+60"],["🇸🇬","+65"],["🇺🇸","+1"],["🇬🇧","+44"],["🇳🇱","+31"],["🇦🇺","+61"]] as [string,string][]).map(([f,c])=>(
                            <span key={c} className="px-2 py-1 rounded-full text-[9px] mono" style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", color:"rgba(255,255,255,0.4)" }}>
                              {f} {c}
                            </span>
                          ))}
                          <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.2)" }}>+100 negara</span>
                        </div>
                      )}

                      <div className="p-4 rounded-2xl" style={{ background: "rgba(4,7,18,0.7)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="text-[10px] font-semibold mb-3 uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.35)" }}>
                          Info Sistem
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
                          <InfoRow icon="📧" text="1021801597561775@support.whatsapp.com" color={CYAN} />
                          <InfoRow icon="🔒" text="SMTP + App Password" color="rgba(139,92,246,0.8)" />
                          <InfoRow icon="📡" text="IMAP IDLE (instan)" color="#10b981" />
                          <InfoRow icon="🔔" text="Browser notification" color="rgba(245,158,11,0.8)" />
                        </div>
                      </div>

                      <button
                        disabled={!phoneFormatted}
                        onClick={() => goStep(1)}
                        className="btn-rose w-full py-4 rounded-2xl text-[13px] tracking-widest"
                        style={{
                          boxShadow: phoneFormatted ? "0 4px 24px rgba(244,63,94,0.35)" : undefined,
                        }}
                      >
                        LANJUT → 📝 PILIH TEMPLATE
                      </button>
                    </div>
                  )}

                  {/* STEP 1 — Template */}
                  {step === 1 && (
                    <div className="space-y-4 animate-appear">
                      <StepLabel icon="📝" text="Step 2 — Pilih Template Email" />
                      <TemplateSelector
                        selected={selectedTemplate}
                        onSelect={(t) => { setSelectedTemplate(t); addLog("info", `📋 Template dipilih: ${t.name}`); playClick(); }}
                        targetNumber={phoneFormatted}
                        senderEmail={selectedAccounts[0]?.email}
                      />
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => goStep(0)} className="btn-ghost flex-1 py-2.5 rounded-xl text-[12px]">← Kembali</button>
                        <button disabled={!selectedTemplate} onClick={() => goStep(2)} className="btn-rose flex-1 py-2.5 rounded-xl text-[12px] tracking-wide">
                          Lanjut → 📧 Gmail
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 2 — Gmail */}
                  {step === 2 && (
                    <div className="space-y-4 animate-appear">
                      <StepLabel icon="📧" text="Step 3 — Pilih Akun Gmail" />
                      <GmailManager accounts={accounts} onAccountsChange={setAccounts} onLog={addLog} />
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => goStep(1)} className="btn-ghost flex-1 py-2.5 rounded-xl text-[12px]">← Kembali</button>
                        <button disabled={selectedAccounts.length === 0} onClick={() => goStep(3)} className="btn-rose flex-1 py-2.5 rounded-xl text-[12px] tracking-wide">
                          Lanjut → 🚀 Kirim
                        </button>
                      </div>
                    </div>
                  )}

                  {/* STEP 3 — Send */}
                  {step === 3 && (
                    <div className="space-y-4 animate-appear">
                      <StepLabel icon="🚀" text="Step 4 — Konfirmasi & Kirim" color={ROSE} />

                      {/* Summary card */}
                      <div className="rounded-2xl overflow-hidden" style={{ background: "rgba(4,7,18,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                          <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.3)" }}>Ringkasan Pengiriman</span>
                        </div>
                        <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                          {[
                            ["🎯 Target",   phoneFormatted,                               ROSE],
                            ["📝 Template", `${selectedTemplate?.icon ?? ""} ${selectedTemplate?.name ?? ""}`, "#edf2ff"],
                            ["📧 Dari",     `${selectedAccounts.length} akun Gmail`,      CYAN],
                            ["📬 Tujuan",   "1021801597561775@support.whatsapp.com",               "#f59e0b"],
                          ].map(([k, v, c]) => (
                            <div key={k as string} className="flex items-center justify-between px-4 py-2.5 gap-3">
                              <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>{k as string}</span>
                              <span className="text-[11px] font-bold mono text-right truncate max-w-[60%]" style={{ color: c as string }}>{v as string}</span>
                            </div>
                          ))}
                        </div>
                        {selectedAccounts.length > 0 && (
                          <div className="px-4 pb-3 pt-1">
                            <div className="text-[9px] uppercase tracking-widest mb-2" style={{ color: "rgba(255,255,255,0.2)" }}>Akun Pengirim</div>
                            <div className="space-y-1.5">
                              {selectedAccounts.map((a) => (
                                <div key={a.id} className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full shrink-0 ${a.status === "sending" ? "animate-pulse" : ""}`} style={{
                                    background: a.status === "sent" ? "#10b981" : a.status === "sending" ? "#f59e0b" : a.status === "error" ? ROSE : "rgba(255,255,255,0.12)",
                                    boxShadow: a.status === "sent" ? "0 0 6px #10b981" : a.status === "sending" ? "0 0 6px #f59e0b" : undefined,
                                  }} />
                                  <span className="text-[11px] mono truncate flex-1" style={{ color: "rgba(255,255,255,0.5)" }}>{a.email}</span>
                                  {a.label && <span className="text-[9px]" style={{ color: "rgba(34,211,238,0.4)" }}>({a.label})</span>}
                                  {a.status === "sent"    && <span className="text-[10px]" style={{ color: "#10b981" }}>✅</span>}
                                  {a.status === "sending" && <span className="text-[10px] animate-pulse" style={{ color: "#f59e0b" }}>⏳</span>}
                                  {a.status === "error"   && <span className="text-[10px]" style={{ color: ROSE }}>❌</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Email preview */}
                      {selectedTemplate && phoneFormatted && selectedAccounts.length > 0 && (
                        <EmailPreview
                          fromEmail={selectedAccounts[0].email}
                          subject={fillTemplate(selectedTemplate.subject, phoneFormatted, selectedAccounts[0].email, INDONESIAN_NAMES[0])}
                          htmlBody={fillTemplate(selectedTemplate.htmlBody, phoneFormatted, selectedAccounts[0].email, INDONESIAN_NAMES[0])}
                          accountCount={selectedAccounts.length}
                        />
                      )}

                      {/* BOMB button */}
                      <button
                        disabled={!phoneFormatted || !selectedTemplate || sending || accounts.length === 0}
                        onClick={(e) => { addRipple(e as React.MouseEvent<HTMLElement>); void handleBomb(); }}
                        className="w-full rounded-2xl relative overflow-hidden transition-all"
                        style={{
                          padding: "18px 24px",
                          background: sending
                            ? "rgba(190,18,60,0.28)"
                            : "linear-gradient(135deg, #7f0023 0%, #be123c 35%, #f43f5e 68%, #fb7185 100%)",
                          color: "#fff",
                          border: "1px solid rgba(244,63,94,0.35)",
                          fontSize: 15, fontWeight: 900, letterSpacing: "0.1em",
                          cursor: !phoneFormatted || !selectedTemplate || sending || accounts.length === 0 ? "not-allowed" : "pointer",
                          opacity: !phoneFormatted || !selectedTemplate || accounts.length === 0 ? 0.38 : 1,
                          boxShadow: !sending && phoneFormatted && selectedTemplate
                            ? "0 0 36px rgba(244,63,94,0.55), 0 8px 48px rgba(244,63,94,0.3), inset 0 1px 0 rgba(255,255,255,0.15)"
                            : undefined,
                          animation: !sending && phoneFormatted && selectedTemplate
                            ? "rosePulse 2s ease-in-out infinite" : undefined,
                        }}
                      >
                        {!sending && phoneFormatted && selectedTemplate && (
                          <div style={{
                            position: "absolute", inset: 0, width: "55%",
                            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.11), transparent)",
                            animation: "scanHoriz 2.5s linear infinite",
                            pointerEvents: "none",
                          }} />
                        )}
                        <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
                          {sending ? (
                            <>
                              <span className="animate-spin" style={{ width: 20, height: 20, border: "2.5px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block" }} />
                              BOMBING...
                            </>
                          ) : (
                            <>
                              <span>💣</span>
                              <span className="hidden sm:inline">BOMB MODE — KIRIM {accounts.length} AKUN SEKALIGUS</span>
                              <span className="sm:hidden">BOMB {accounts.length} AKUN</span>
                            </>
                          )}
                        </span>
                      </button>

                      {/* Divider */}
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                        <span className="text-[9px] uppercase tracking-widest" style={{ color: "rgba(255,255,255,0.2)" }}>atau kirim akun terpilih</span>
                        <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
                      </div>

                      {/* Normal send button */}
                      <button
                        disabled={!canSend || sending}
                        onClick={(e) => { addRipple(e as React.MouseEvent<HTMLElement>); void handleSend(); }}
                        className="w-full py-3.5 rounded-2xl relative overflow-hidden transition-all"
                        style={{
                          background: sending ? "rgba(139,92,246,0.25)" : "linear-gradient(135deg, #5b21b6, #7c3aed, #8b5cf6)",
                          color: "#fff", border: "1px solid rgba(139,92,246,0.35)",
                          fontSize: 13, fontWeight: 800, letterSpacing: "0.07em",
                          boxShadow: !sending && canSend ? "0 4px 24px rgba(139,92,246,0.35)" : undefined,
                          opacity: !canSend || sending ? 0.4 : 1,
                        }}
                      >
                        <span style={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                          {sending ? (
                            <>
                              <span className="animate-spin" style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block" }} />
                              ⚡ MENGIRIM...
                            </>
                          ) : `🚀 Kirim Akun Terpilih (${selectedAccounts.length})`}
                        </span>
                      </button>

                      {totalSent > 0 && (
                        <div className="flex items-center justify-center gap-2 py-1">
                          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>Total terkirim sesi ini:</span>
                          <span className="text-[13px] font-black mono" style={{ color: ROSE }}>{totalSent}</span>
                          <span className="text-[11px]" style={{ color: "rgba(255,255,255,0.3)" }}>email</span>
                        </div>
                      )}

                      <button onClick={() => goStep(2)} className="btn-ghost w-full py-2.5 rounded-xl text-[12px]">
                        ← Kembali
                      </button>
                    </div>
                  )}
                </GlassCard>
              </div>

              {/* RIGHT: Terminal + Reply */}
              <div className="flex flex-col gap-3 sm:gap-4 min-w-0">

                {/* Mobile terminal (collapsible) */}
                <div className="lg:hidden glass-card overflow-hidden">
                  <button
                    onClick={() => setTerminalOpen(v => !v)}
                    className="w-full flex items-center gap-2 px-3 py-2.5"
                    style={{ borderBottom: terminalOpen ? "1px solid rgba(34,211,238,0.1)" : undefined }}
                  >
                    <div className="flex gap-1 shrink-0">
                      <div className="w-2 h-2 rounded-full" style={{ background: "#ff5f57" }} />
                      <div className="w-2 h-2 rounded-full" style={{ background: "#febc2e" }} />
                      <div className="w-2 h-2 rounded-full" style={{ background: "#28c840" }} />
                    </div>
                    <span className="text-[10px] font-bold mono" style={{ color: CYAN }}>📟 TERMINAL</span>
                    <div className="w-1.5 h-1.5 rounded-full animate-dot ml-0.5 shrink-0" style={{ background: ROSE, boxShadow: "0 0 6px #f43f5e" }} />
                    <span className="ml-auto text-[9px] mono flex items-center gap-1.5" style={{ color: "rgba(34,211,238,0.4)" }}>
                      {logs.length} events <span>{terminalOpen ? "▲" : "▼"}</span>
                    </span>
                  </button>
                  {!terminalOpen && logs.length > 0 && (
                    <div className="px-3 py-1.5 text-[9px] mono truncate" style={{ color: "rgba(148,163,184,0.4)" }}>
                      › {logs[logs.length - 1]?.message}
                    </div>
                  )}
                  {terminalOpen && (
                    <div className="h-[220px]"><Terminal logs={logs} /></div>
                  )}
                </div>

                {/* Desktop terminal */}
                <GlassCard accent={CYAN} className="hidden lg:block lg:h-[420px]">
                  <Terminal logs={logs} />
                </GlassCard>

                {step === 3 && (
                  <GlassCard accent={ROSE} className="p-3 sm:p-4 flex-1" style={{ minHeight: 200 }}>
                    <ReplyMonitor replies={replies} onPollNow={() => pollNow().catch(console.error)} />
                  </GlassCard>
                )}
              </div>
            </div>
          )}

          {/* ─── STATS TAB ─── */}
          {tab === "stats" && (
            <GlassCard accent={VIOLET} className="p-6 animate-appear">
              <div className="flex items-center gap-3 mb-6">
                <div style={{ width: 3, height: 24, borderRadius: 2, background: `linear-gradient(180deg, ${VIOLET}, ${ROSE})` }} />
                <span className="text-[15px] font-bold grad-brand">📊 Dashboard Statistik</span>
              </div>
              <Stats />
            </GlassCard>
          )}
        </main>

        {/* Footer */}
        <footer className="shrink-0 text-center py-3 px-4" style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
          <span className="text-[9px] mono" style={{ color: "rgba(255,255,255,0.15)", letterSpacing: "0.06em" }}>
            ✦ FIX MERAH v2.0 — WhatsApp Appeal Tool — Dibuat dengan ♥
          </span>
        </footer>
      </div>
    </div>
  );
}
