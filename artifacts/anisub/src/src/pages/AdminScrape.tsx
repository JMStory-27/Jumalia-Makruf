import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Zap, RefreshCw, Github, Clock, Search, Sparkles, Loader2, Wand2 } from "lucide-react";
import {
  fetchScrapeStatus, triggerScrapeRun, triggerFullSweep, openSweepStream,
  type ScrapeResult, type ScrapeStatus, type FullSweepProgress,
} from "@/lib/scrapeApi";
import { adminAIAssist } from "@/lib/aiApi";
import { useQuery } from "@tanstack/react-query";

type LogLine = { t: number; text: string; kind: "info" | "ok" | "warn" | "err" };

// ── Panel admin: pantau & jalankan scrape ⚡ langsung dari web, dengan
// tampilan terminal live + laporan detail per-fitur (lebih lengkap dari Telegram
// karena ada layar penuh untuk menampilkan semuanya sekaligus). ──────────────
export default function AdminScrape() {
  const [, setLocation] = useLocation();
  const [log, setLog] = useState<LogLine[]>([]);
  const [triggering, setTriggering] = useState(false);
  const lastSeenId = useRef<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // ── Full sweep state ──
  const [sweepProgress, setSweepProgress] = useState<FullSweepProgress | null>(null);
  const [sweepRunning, setSweepRunning] = useState(false);
  const [sweepTriggering, setSweepTriggering] = useState(false);
  const sweepCleanupRef = useRef<(() => void) | null>(null);

  // ── AI Assist state ──
  const [aiLoading, setAiLoading] = useState<"synopsis" | "report" | "custom" | null>(null);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiProvider, setAiProvider] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [synopsisTitle, setSynopsisTitle] = useState("");
  const [customPrompt, setCustomPrompt] = useState("");

  const { data: status } = useQuery<ScrapeStatus>({
    queryKey: ["scrape-status-admin"],
    queryFn: fetchScrapeStatus,
    refetchInterval: 2000,
  });

  const pushLog = (text: string, kind: LogLine["kind"] = "info") => {
    setLog((prev) => [...prev.slice(-400), { t: Date.now(), text, kind }]);
  };

  useEffect(() => {
    if (!status) return;
    if (status.running) {
      pushLog("⏳ Scrape sedang berjalan di server...", "info");
    }
  }, [status?.running]);

  useEffect(() => {
    const result = status?.lastResult;
    if (!result || result.id === lastSeenId.current) return;
    lastSeenId.current = result.id;
    printReport(result);
  }, [status?.lastResult?.id]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.length]);

  // Saat panel dibuka (termasuk BALIK LAGI setelah pindah halaman), langsung
  // sambung ke stream progress sweep. Sweep berjalan independen di server, jadi
  // kalau ternyata masih berjalan, ini bikin progress bar & tombol langsung
  // menampilkan status sebenarnya — bukan kelihatan "berhenti" cuma karena
  // halaman ini baru dibuka lagi dan belum tahu progressnya.
  useEffect(() => {
    let attachedRunningLog = false;
    const cleanup = openSweepStream((p) => {
      if (p.running && !attachedRunningLog) {
        attachedRunningLog = true;
        setSweepRunning(true);
        pushLog(`↻ Full sweep masih berjalan di server (${p.current}/${p.total}) — menyambung ulang progress...`, "info");
      }
      if (!p.running && p.current === 0 && p.total === 0) return; // belum pernah jalan
      setSweepProgress(p);
      if (p.done) setSweepRunning(false);
    });
    sweepCleanupRef.current = cleanup;
    // Selalu tutup stream yang AKTIF SEKARANG (bisa sudah diganti oleh handleFullSweep),
    // bukan cuma stream yang dibuat effect ini, biar tidak ada koneksi SSE bocor.
    return () => { sweepCleanupRef.current?.(); };
  }, []);

  function printReport(r: ScrapeResult) {
    const d = r.detail;
    pushLog(`══ SCRAPE ${r.trigger === "manual" ? "MANUAL" : "OTOMATIS"} SELESAI (${new Date(r.finishedAt).toLocaleTimeString("id-ID")}) ══`, r.ok ? "ok" : "err");
    pushLog(`[cakupan] Ongoing: ${r.totalOngoing} · Completed: ${r.totalCompleted} · Total: ${r.totalAnime}`, "info");
    pushLog(`[#1] Anime baru di jadwal ongoing: ${r.newAnimeCount}`, r.newAnimeCount ? "ok" : "info");
    r.newAnimeTitles.forEach((t) => pushLog(`      + ${t}`, "ok"));
    pushLog(`[#2,#3] Anime tamat, auto-dihapus dari ongoing: ${r.removedCount}`, r.removedCount ? "warn" : "info");
    r.removedTitles.forEach((t) => pushLog(`      - ${t}`, "warn"));
    pushLog(`[completed] Baru masuk daftar tamat: ${r.newCompletedCount}`, r.newCompletedCount ? "ok" : "info");
    r.newCompletedTitles.forEach((t) => pushLog(`      ✓ ${t}`, "ok"));
    pushLog(`[#17] Episode naik terdeteksi: ${r.episodeBumpCount}`, "info");
    r.episodeBumpTitles.forEach((t) => pushLog(`      ~ ${t}`, "info"));
    pushLog(`[enrich] Antrian detail run ini: ${d.processed}/${d.queued} (retry queue: ${d.retryQueueSize})`, "info");
    pushLog(`[#4] Banner terisi: ${d.bannerFilled.length}`, "info");
    pushLog(`[#5] Banner auto-optimize (CSS object-fit, semua anime)`, "info");
    pushLog(`[#6] Sinopsis terisi: ${d.synopsisFilled.length}`, "info");
    pushLog(`[#8] Studio/staff terisi: ${d.studioFilled.length}`, "info");
    pushLog(`[#9,#10] Karakter & seiyuu: TIDAK TERSEDIA dari sumber`, "warn");
    pushLog(`[#11] Genre terisi: ${d.genreFilled.length}`, "info");
    pushLog(`[#12] Skor terisi: ${d.scoreFilled.length}`, "info");
    pushLog(`[#14] Musim rilis terdeteksi: ${d.seasonDetected.length}`, "info");
    pushLog(`[#33] Gagal & masuk retry queue: ${d.failed}`, d.failed ? "warn" : "info");
    d.failedTitles.forEach((t) => pushLog(`      ! ${t}`, "warn"));
    pushLog(`[GitHub] Sync snapshot: ${r.githubSynced ? "berhasil" : "dilewati/gagal"}`, r.githubSynced ? "ok" : "warn");
    if (r.errors.length) r.errors.forEach((e) => pushLog(`[error] ${e}`, "err"));
    pushLog(`══ Total ongoing sekarang: ${r.totalOngoing} anime ══`, "ok");
  }

  const handleTrigger = async () => {
    if (triggering || status?.running) return;
    setTriggering(true);
    pushLog("▶ Trigger manual scrape dari panel web...", "info");
    try {
      const res = await triggerScrapeRun();
      if ("error" in res) pushLog(`✗ ${res.error}`, "err");
      else pushLog("✓ Diterima server, menunggu hasil...", "ok");
    } catch (e) {
      pushLog(`✗ Gagal trigger: ${e instanceof Error ? e.message : String(e)}`, "err");
    } finally {
      setTriggering(false);
    }
  };

  // ── Full Sweep: cek SEMUA 1854 anime satu per satu ──────────────────────────
  const handleFullSweep = async () => {
    if (sweepTriggering || sweepRunning) return;
    setSweepTriggering(true);
    setSweepProgress(null);
    pushLog("", "info");
    pushLog("╔══════════════════════════════════════════════╗", "ok");
    pushLog("║   🔍 MEMULAI CEK MENYELURUH SEMUA ANIME      ║", "ok");
    pushLog("╚══════════════════════════════════════════════╝", "ok");
    pushLog("Menghitung daftar semua anime (ongoing + completed)...", "info");

    try {
      const res = await triggerFullSweep();
      if ("error" in res) {
        pushLog(`✗ ${res.error}`, "err");
        setSweepTriggering(false);
        return;
      }
      pushLog("✓ Server menerima perintah sweep. Memulai stream progress...", "ok");

      // Cleanup stream lama kalau ada
      sweepCleanupRef.current?.();

      let lastLoggedPercent = -1;
      setSweepRunning(true);

      const cleanup = openSweepStream((p: FullSweepProgress) => {
        setSweepProgress(p);

        if (p.done) {
          // ── SELESAI 1854/1854 ──
          pushLog("", "ok");
          pushLog("╔══════════════════════════════════════════════╗", "ok");
          pushLog("║   ✅ CEK MENYELURUH SELESAI — LAPORAN AKHIR  ║", "ok");
          pushLog("╚══════════════════════════════════════════════╝", "ok");
          pushLog(`✅ Total diperiksa  : ${p.total}/${p.total} anime`, "ok");
          pushLog(`   ✓ Berhasil        : ${p.okCount} anime`, "ok");
          pushLog(`   ⚡ Dari cache      : ${p.skippedCached} anime (langsung, tanpa fetch)`, "info");
          pushLog(`   ✗ Gagal fetch      : ${p.failedCount} anime`, p.failedCount ? "warn" : "info");
          pushLog("", "info");
          pushLog("📊 Laporan kelengkapan data:", "info");
          pushLog(`   🖼  Banner kosong  : ${p.missingBanner} anime`, p.missingBanner ? "warn" : "ok");
          pushLog(`   📝 Sinopsis kosong : ${p.missingSynopsis} anime`, p.missingSynopsis ? "warn" : "ok");
          pushLog(`   🏷  Genre kosong   : ${p.missingGenre} anime`, p.missingGenre ? "warn" : "ok");
          pushLog(`   ⭐ Skor kosong     : ${p.missingScore} anime`, p.missingScore ? "warn" : "ok");
          const complete = p.total - Math.max(p.missingBanner, p.missingSynopsis, p.missingGenre, p.missingScore);
          pushLog(`   ✨ Data lengkap    : ≈${complete}/${p.total} anime`, "ok");
          pushLog("", "ok");
          setSweepRunning(false);
          cleanup();
          return;
        }

        if (p.total === 0) return;

        // Log tiap kelipatan 10% atau tiap 100 anime (mana yang lebih sering)
        const pct = Math.floor((p.current / p.total) * 10); // 0-10
        const shouldLog = pct !== lastLoggedPercent || p.current % 100 === 0;
        if (shouldLog) {
          lastLoggedPercent = pct;
          const bar = "█".repeat(pct) + "░".repeat(10 - pct);
          pushLog(
            `[${bar}] ${p.current}/${p.total} — ${p.lastTitle.slice(0, 45)}`,
            "info",
          );
        }
      });

      sweepCleanupRef.current = cleanup;
    } catch (e) {
      pushLog(`✗ Error: ${e instanceof Error ? e.message : String(e)}`, "err");
      setSweepRunning(false);
    } finally {
      setSweepTriggering(false);
    }
  };

  // ── AI Assist handlers — pakai semua token AI di secret (Groq/Gemini/HF/OpenRouter)
  // dengan fallback otomatis kalau satu provider gagal/limit. ──────────────────────
  const handleAIFixSynopsis = async () => {
    if (!synopsisTitle.trim() || aiLoading) return;
    setAiLoading("synopsis"); setAiError(null); setAiResult(null);
    try {
      const { result, provider } = await adminAIAssist("fix-synopsis", { title: synopsisTitle.trim() });
      setAiResult(result); setAiProvider(provider);
      pushLog(`🤖 AI (${provider}) selesai bikin sinopsis untuk "${synopsisTitle.trim()}"`, "ok");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(msg);
      pushLog(`✗ AI gagal: ${msg}`, "err");
    } finally {
      setAiLoading(null);
    }
  };

  const handleAIAnalyzeReport = async () => {
    if (!status?.lastResult || aiLoading) return;
    setAiLoading("report"); setAiError(null); setAiResult(null);
    try {
      const { result, provider } = await adminAIAssist("analyze-report", { report: status.lastResult });
      setAiResult(result); setAiProvider(provider);
      pushLog(`🤖 AI (${provider}) selesai menganalisa laporan scrape terakhir`, "ok");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(msg);
      pushLog(`✗ AI gagal: ${msg}`, "err");
    } finally {
      setAiLoading(null);
    }
  };

  const handleAICustom = async () => {
    if (!customPrompt.trim() || aiLoading) return;
    setAiLoading("custom"); setAiError(null); setAiResult(null);
    try {
      const { result, provider } = await adminAIAssist("custom", { prompt: customPrompt.trim() });
      setAiResult(result); setAiProvider(provider);
      pushLog(`🤖 AI (${provider}) menjawab pertanyaan admin`, "ok");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(msg);
      pushLog(`✗ AI gagal: ${msg}`, "err");
    } finally {
      setAiLoading(null);
    }
  };

  const now = Date.now();
  const nextRunAt = (status?.nextRunAt && isFinite(status.nextRunAt)) ? status.nextRunAt : now + 3_600_000;
  const countdown = Math.max(0, Math.round((nextRunAt - now) / 1000));
  const cdMins = Math.floor(countdown / 60).toString().padStart(2, "0");
  const cdSecs = (countdown % 60).toString().padStart(2, "0");

  const colorFor = (k: LogLine["kind"]) =>
    k === "ok" ? "#4ADE80" : k === "warn" ? "#FBBF24" : k === "err" ? "#F87171" : "#8B93A8";

  // Progress bar untuk full sweep
  const sweepPct = sweepProgress && sweepProgress.total > 0
    ? Math.round((sweepProgress.current / sweepProgress.total) * 100) : 0;

  return (
    <div style={{ minHeight: "100dvh", background: "#05050f", color: "#fff", paddingBottom: 24 }}>
      {/* Header */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(5,5,15,0.9)", backdropFilter: "blur(10px)", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={() => setLocation("/profile")} style={{ background: "none", border: "none", color: "#fff" }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 28, height: 28, borderRadius: 9,
            background: "linear-gradient(135deg,#FB923C,#F97316)",
            boxShadow: "0 0 14px rgba(251,146,60,0.5)",
            animation: "adminZapPulse 2.2s ease-in-out infinite",
          }}>
            <Zap size={16} color="#fff" fill="#fff" />
          </span>
          <span style={{ fontWeight: 700 }}>Panel Admin Scrape</span>
          <style>{`@keyframes adminZapPulse { 0%,100%{ box-shadow:0 0 14px rgba(251,146,60,0.5);} 50%{ box-shadow:0 0 22px rgba(251,146,60,0.85);} }`}</style>
        </div>
      </div>

      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        {/* Status cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ padding: 14, borderRadius: 14, background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#60A5FA", fontSize: 12, marginBottom: 6 }}>
              <Clock size={13} /> Auto-scrape berikutnya
            </div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{status?.running ? "Berjalan..." : `${cdMins}:${cdSecs}`}</div>
          </div>
          <div style={{ padding: 14, borderRadius: 14, background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#4ADE80", fontSize: 12, marginBottom: 6 }}>
              <Github size={13} /> GitHub sync terakhir
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>
              {status?.lastResult ? (status.lastResult.githubSynced ? "✅ Berhasil" : "⚠️ Dilewati/gagal") : "—"}
            </div>
          </div>
        </div>

        {/* Cakupan total */}
        {status?.lastResult && (
          <div style={{ padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>📚 Total anime terdaftar</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, fontSize: 12 }}>
              <div><div style={{ color: "#8B93A8" }}>Ongoing</div><div style={{ fontWeight: 700, fontSize: 16 }}>{status.lastResult.totalOngoing}</div></div>
              <div><div style={{ color: "#8B93A8" }}>Completed</div><div style={{ fontWeight: 700, fontSize: 16 }}>{status.lastResult.totalCompleted}</div></div>
              <div><div style={{ color: "#8B93A8" }}>Total</div><div style={{ fontWeight: 700, fontSize: 16 }}>{status.lastResult.totalAnime}</div></div>
            </div>
          </div>
        )}

        {/* ── Full Sweep Section ─────────────────────────────────────── */}
        <div style={{ padding: 14, borderRadius: 14, background: "rgba(139,92,246,0.08)", border: `1px solid ${sweepRunning ? "rgba(139,92,246,0.5)" : "rgba(139,92,246,0.25)"}` }}>
          <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13, color: "#A78BFA" }}>
            🔍 Cek Menyeluruh Semua Anime
          </div>
          <div style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 10 }}>
            Verifikasi data setiap anime (banner, sinopsis, genre, skor) satu per satu sampai semua {status?.lastResult?.totalAnime ?? 1854} selesai diperiksa. Progress tampil live di terminal.
          </div>

          {/* Progress bar — tampil saat sweep berjalan */}
          {sweepRunning && sweepProgress && sweepProgress.total > 0 && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                <span style={{ color: "#A78BFA", fontWeight: 700 }}>
                  Mengecek {sweepProgress.current.toLocaleString()}/{sweepProgress.total.toLocaleString()} anime
                </span>
                <span style={{ color: "#8B93A8" }}>{sweepPct}%</span>
              </div>
              {/* Progress bar */}
              <div style={{ height: 8, borderRadius: 999, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 999,
                  background: "linear-gradient(90deg,#8B5CF6,#A78BFA)",
                  width: `${sweepPct}%`,
                  transition: "width 0.4s ease",
                }} />
              </div>
              <div style={{ marginTop: 5, fontSize: 11, color: "#6B7280", display: "flex", gap: 12 }}>
                <span>✓ {sweepProgress.okCount.toLocaleString()}</span>
                <span>⚡ {sweepProgress.skippedCached.toLocaleString()} dari cache</span>
                {sweepProgress.failedCount > 0 && <span style={{ color: "#F87171" }}>✗ {sweepProgress.failedCount}</span>}
              </div>
              {sweepProgress.lastTitle && (
                <div style={{ marginTop: 4, fontSize: 11, color: "#6B7280", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  Sedang: {sweepProgress.lastTitle}
                </div>
              )}
            </div>
          )}

          {/* Tombol Full Sweep */}
          <button
            onClick={handleFullSweep}
            disabled={sweepTriggering || sweepRunning}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              width: "100%", padding: "11px 16px", borderRadius: 12, border: "none",
              background: sweepRunning
                ? "rgba(139,92,246,0.15)"
                : "linear-gradient(135deg,#7C3AED,#8B5CF6)",
              color: "#fff", fontWeight: 700, fontSize: 13,
              opacity: sweepTriggering ? 0.6 : 1,
              cursor: sweepRunning ? "default" : "pointer",
            }}
          >
            <Search size={15} className={sweepRunning ? "animate-pulse" : ""} />
            {sweepRunning
              ? `Mengecek ${sweepProgress?.current ?? 0}/${sweepProgress?.total ?? "..."} anime...`
              : sweepTriggering
                ? "Memulai..."
                : `🔍 Cek Semua ${status?.lastResult?.totalAnime ?? 1854} Anime Sekarang`}
          </button>
        </div>
        {/* ─────────────────────────────────────────────────────────── */}

        {/* ── AI Assist Section — pakai semua token AI (Groq/Gemini/HF/OpenRouter) ── */}
        <div style={{ padding: 14, borderRadius: 14, background: "rgba(255,107,0,0.08)", border: "1px solid rgba(255,107,0,0.25)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, fontSize: 13, fontWeight: 700, color: "#FFB800" }}>
            <Sparkles size={15} /> AI Assist <span style={{ fontSize: 10, fontWeight: 500, color: "#8B93A8" }}>(Groq → Gemini → HF → OpenRouter, auto-fallback)</span>
          </div>

          {/* Fix sinopsis kosong */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              value={synopsisTitle}
              onChange={(e) => setSynopsisTitle(e.target.value)}
              placeholder="Judul anime yang sinopsisnya kosong/kurang..."
              data-testid="input-ai-synopsis-title"
              style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 12 }}
            />
            <button
              onClick={handleAIFixSynopsis}
              disabled={!synopsisTitle.trim() || aiLoading !== null}
              data-testid="button-ai-fix-synopsis"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#FF6B00,#FFB800)", color: "#fff", fontWeight: 700, fontSize: 12, opacity: aiLoading && aiLoading !== "synopsis" ? 0.5 : 1, whiteSpace: "nowrap" }}
            >
              {aiLoading === "synopsis" ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              Fix Sinopsis
            </button>
          </div>

          {/* Analisa laporan terakhir */}
          <button
            onClick={handleAIAnalyzeReport}
            disabled={!status?.lastResult || aiLoading !== null}
            data-testid="button-ai-analyze-report"
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#fff", fontWeight: 700, fontSize: 12, marginBottom: 8, opacity: !status?.lastResult ? 0.5 : (aiLoading && aiLoading !== "report" ? 0.5 : 1) }}
          >
            {aiLoading === "report" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            Analisa Laporan Scrape Terakhir
          </button>

          {/* Custom prompt */}
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Tanya apa saja ke AI soal data anime..."
              data-testid="input-ai-custom-prompt"
              onKeyDown={(e) => { if (e.key === "Enter") handleAICustom(); }}
              style={{ flex: 1, padding: "9px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 12 }}
            />
            <button
              onClick={handleAICustom}
              disabled={!customPrompt.trim() || aiLoading !== null}
              data-testid="button-ai-custom"
              style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "#fff", fontWeight: 700, fontSize: 12, opacity: aiLoading && aiLoading !== "custom" ? 0.5 : 1 }}
            >
              {aiLoading === "custom" ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              Tanya
            </button>
          </div>

          {/* Hasil AI */}
          {aiError && (
            <div style={{ padding: 10, borderRadius: 10, background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", fontSize: 12, color: "#FCA5A5" }}>
              ✗ {aiError}
            </div>
          )}
          {aiResult && !aiError && (
            <div data-testid="text-ai-result" style={{ padding: 12, borderRadius: 10, background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.08)", fontSize: 12.5, color: "#E5E7EB", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
              {aiResult}
              {aiProvider && <div style={{ marginTop: 8, fontSize: 10, color: "#6B7280" }}>— dijawab oleh {aiProvider}</div>}
            </div>
          )}
        </div>
        {/* ─────────────────────────────────────────────────────────── */}

        {/* Tombol scrape cepat */}
        <button
          onClick={handleTrigger}
          disabled={triggering || status?.running}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "12px 16px", borderRadius: 14, border: "none",
            background: status?.running ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#FB923C,#F97316)",
            color: "#fff", fontWeight: 700, fontSize: 14,
            opacity: status?.running ? 0.6 : 1,
          }}
        >
          <RefreshCw size={16} className={status?.running ? "animate-spin" : ""} />
          {status?.running ? "Scrape sedang berjalan..." : "⚡ Jalankan Scrape Sekarang"}
        </button>
        <div style={{ fontSize: 11, color: "#5B6478", textAlign: "center", marginTop: -8 }}>
          Scrape cepat: cek anime baru/episode naik + verifikasi batch kecil. Untuk cek 1854 anime lengkap, gunakan tombol ungu di atas.
        </div>

        {/* Terminal log */}
        <div style={{
          borderRadius: 14, background: "#0A0A14", border: "1px solid rgba(255,255,255,0.1)",
          fontFamily: "monospace", fontSize: 12, lineHeight: 1.6,
          height: "55vh", overflowY: "auto", padding: 12,
        }}>
          {log.length === 0 && (
            <div style={{ color: "#5B6478" }}>
              Menunggu event scrape... (jalankan scrape cepat atau cek semua anime di atas)
            </div>
          )}
          {log.map((l, i) => (
            <div key={i} style={{ color: colorFor(l.kind), whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {l.text ? <><span style={{ color: "#3E4459" }}>[{new Date(l.t).toLocaleTimeString("id-ID")}]</span> {l.text}</> : ""}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>

        {/* Riwayat */}
        {status?.history && status.history.length > 0 && (
          <div style={{ padding: 14, borderRadius: 14, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13 }}>📜 Riwayat run terakhir</div>
            <div style={{ display: "grid", gap: 6 }}>
              {status.history.slice(0, 8).map((h) => (
                <div key={h.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9CA3AF" }}>
                  <span>{new Date(h.finishedAt).toLocaleTimeString("id-ID")} · {h.trigger}</span>
                  <span>{h.newAnimeCount} baru · {h.episodeBumpCount} eps · {h.removedCount} tamat</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
