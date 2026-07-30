import { useEffect, useState, useRef, useCallback } from "react";
import { Confetti } from "./Confetti";
import { Fireworks } from "./Fireworks";

interface Props {
  visible: boolean;
  accounts: Array<{ email: string; label?: string }>;
  target: string;
  templateName?: string;
  onFinish: () => void;
  apiDone: boolean;
  apiSuccess: boolean;
}

const STAGES = [
  { icon: "⚡", label: "INIT",     color: "#00e5ff", msg: "Menginisialisasi mesin banding darurat...",           dur: 550,  shake: "shakeH" },
  { icon: "🔒", label: "ENCRYPT",  color: "#b44bff", msg: "Enkripsi payload AES-256-GCM aktif...",              dur: 850,  shake: "shakeV" },
  { icon: "🌐", label: "TUNNEL",   color: "#00ff88", msg: "Membangun tunnel SMTP terenkripsi...",               dur: 950,  shake: "jitter" },
  { icon: "🔑", label: "AUTH",     color: "#ffcc00", msg: "Autentikasi OAuth2 akun Gmail...",                   dur: 700,  shake: "shakeD" },
  { icon: "📡", label: "INJECT",   color: "#ff6b35", msg: "Menyuntikkan header prioritas darurat...",           dur: 600,  shake: "pulse3d" },
  { icon: "📤", label: "TRANSMIT", color: "#ff003c", msg: "Transmisi → 1021801597561775@support.whatsapp.com...",        dur: 1300, shake: "shakeH" },
  { icon: "📊", label: "VERIFY",   color: "#00e5ff", msg: "Verifikasi delivery receipt SMTP...",                dur: 750,  shake: "jitter" },
  { icon: "✅", label: "DONE",     color: "#00ff88", msg: "Transmisi selesai! IMAP monitor aktif.",             dur: 700,  shake: "none" },
];

const TOTAL_DUR = STAGES.reduce((s, x) => s + x.dur, 0);

function HexStream() {
  const hex = "0123456789ABCDEF";
  const chars = Array.from({ length: 60 }, () =>
    Array.from({ length: 2 }, () => hex[Math.floor(Math.random() * 16)]).join("")
  );
  return (
    <div className="flex flex-wrap gap-1 opacity-20 font-mono text-[8px] select-none pointer-events-none" style={{ color: "#00ff88" }}>
      {chars.map((c, i) => <span key={i}>{c}</span>)}
    </div>
  );
}

function DataPacket({ delay }: { delay: number }) {
  return (
    <div
      className="absolute text-[9px] font-mono whitespace-nowrap pointer-events-none"
      style={{
        color: "#00ff8850",
        top: `${20 + Math.random() * 60}%`,
        animation: `packetFlow 2.5s ${delay}s linear infinite`,
      }}
    >
      {">>>"} PKT #{Math.floor(Math.random() * 9999).toString().padStart(4, "0")} ENC
    </div>
  );
}

export function SendingOverlay({ visible, accounts, target, templateName, onFinish, apiDone, apiSuccess }: Props) {
  const [stageIdx, setStageIdx] = useState(0);
  const [stageProgress, setStageProgress] = useState(0);
  const [totalProgress, setTotalProgress] = useState(0);
  const [blinkDots, setBlinkDots] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const [stageKey, setStageKey] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [showFireworks, setShowFireworks] = useState(false);
  const started = useRef(false);
  const startTime = useRef(0);
  const prevStageIdx = useRef(-1);

  useEffect(() => {
    if (!visible) {
      setStageIdx(0); setStageProgress(0); setTotalProgress(0);
      setShowResult(false); setAnimDone(false); setStageKey(0);
      setShowConfetti(false); setShowFireworks(false);
      started.current = false; prevStageIdx.current = -1;
      return;
    }

    started.current = true;
    startTime.current = Date.now();
    prevStageIdx.current = 0;

    const tick = () => {
      if (!started.current) return;
      const elapsed = Date.now() - startTime.current;
      const total = Math.min(elapsed / TOTAL_DUR, 1);
      setTotalProgress(total * 100);

      let cum = 0, si = 0;
      for (let i = 0; i < STAGES.length; i++) {
        if (elapsed < cum + STAGES[i].dur) { si = i; break; }
        cum += STAGES[i].dur;
        si = i;
      }

      if (si !== prevStageIdx.current) {
        prevStageIdx.current = si;
        setStageKey(k => k + 1);
      }

      setStageIdx(si);
      const stagePct = Math.min((elapsed - cum) / STAGES[si].dur, 1) * 100;
      setStageProgress(stagePct);

      if (elapsed >= TOTAL_DUR) {
        setAnimDone(true); setTotalProgress(100);
        setStageIdx(STAGES.length - 1); setStageProgress(100);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    return () => { started.current = false; };
  }, [visible]);

  useEffect(() => {
    if (animDone && apiDone) {
      setShowResult(true);
      if (apiSuccess) {
        setShowConfetti(true);
        setTimeout(() => setShowFireworks(true), 400);
        setTimeout(() => { setShowConfetti(false); setShowFireworks(false); }, 4000);
      }
      setTimeout(onFinish, 2200);
    }
  }, [animDone, apiDone, onFinish, apiSuccess]);

  useEffect(() => {
    const iv = setInterval(() => setBlinkDots(p => (p + 1) % 4), 300);
    return () => clearInterval(iv);
  }, []);

  if (!visible) return null;

  const stage = STAGES[stageIdx];

  const shakeAnim = stage.shake === "none" ? undefined : `${stage.shake} 0.4s ease-in-out`;

  return (
    <>
      <Confetti active={showConfetti} />
      <Fireworks active={showFireworks} />

      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(2,5,14,0.96)", backdropFilter: "blur(12px)" }}
      >
        <style>{`
          @keyframes packetFlow { 0%{left:-20%} 100%{left:110%} }
          @keyframes stageAppear { from{opacity:0;transform:translateX(-12px) scale(0.96)} to{opacity:1;transform:translateX(0) scale(1)} }
          @keyframes resultPop { from{opacity:0;transform:scale(0.82)} to{opacity:1;transform:scale(1)} }
          @keyframes scanV { 0%{top:-2px} 100%{top:100%} }
          @keyframes glitch1 { 0%,85%,100%{transform:translate(0)} 86%{transform:translate(-2px,1px)} 88%{transform:translate(2px,-1px)} 90%{transform:translate(-1px,2px)} }
          @keyframes shakeH { 0%,100%{transform:translateX(0)} 15%{transform:translateX(-6px)} 30%{transform:translateX(6px)} 45%{transform:translateX(-4px)} 60%{transform:translateX(4px)} 75%{transform:translateX(-2px)} }
          @keyframes shakeV { 0%,100%{transform:translateY(0)} 15%{transform:translateY(-5px)} 35%{transform:translateY(5px)} 55%{transform:translateY(-3px)} 75%{transform:translateY(3px)} }
          @keyframes jitter { 0%,100%{transform:translate(0,0)} 20%{transform:translate(-3px,2px)} 40%{transform:translate(3px,-3px)} 60%{transform:translate(-2px,3px)} 80%{transform:translate(2px,-2px)} }
          @keyframes shakeD { 0%,100%{transform:rotate(0deg)} 20%{transform:rotate(-1.5deg)} 40%{transform:rotate(1.5deg)} 60%{transform:rotate(-1deg)} 80%{transform:rotate(1deg)} }
          @keyframes pulse3d { 0%,100%{transform:scale(1)} 30%{transform:scale(1.02) rotateX(1deg)} 60%{transform:scale(0.99) rotateX(-1deg)} }
          @keyframes iconPop { 0%{transform:scale(0.7) rotate(-10deg);opacity:0} 60%{transform:scale(1.15) rotate(5deg);opacity:1} 100%{transform:scale(1) rotate(0deg);opacity:1} }
          @keyframes scanHoriz { 0%{left:-20%} 100%{left:110%} }
          @keyframes successGlow { 0%,100%{box-shadow:0 0 30px #00ff8840} 50%{box-shadow:0 0 80px #00ff8880,0 0 160px #00ff8830} }
        `}</style>

        {/* BG hex grid */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-10">
          <div className="p-4 space-y-1">
            {Array.from({ length: 8 }, (_, i) => <HexStream key={i} />)}
          </div>
        </div>

        {/* Floating packets */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {Array.from({ length: 5 }, (_, i) => <DataPacket key={i} delay={i * 0.5} />)}
        </div>

        {/* Scan line */}
        <div
          className="absolute left-0 right-0 pointer-events-none"
          style={{ height: 1, background: `linear-gradient(90deg,transparent,${stage.color}30,transparent)`, animation: "scanV 2s linear infinite", zIndex: 2 }}
        />

        {/* Main card */}
        <div
          className="relative mx-4 w-full max-w-md rounded-2xl overflow-hidden"
          style={{
            background: "rgba(4,10,22,0.97)",
            border: `1px solid ${stage.color}40`,
            boxShadow: `0 0 60px ${stage.color}20, 0 0 120px ${stage.color}08`,
            animation: showResult && apiSuccess
              ? "successGlow 1s ease-in-out infinite"
              : "glitch1 6s ease-in-out infinite",
          }}
        >
          {/* Corner deco */}
          {["tl","tr","bl","br"].map((pos) => (
            <span key={pos} className={`absolute ${pos.includes("t") ? "top-0" : "bottom-0"} ${pos.includes("l") ? "left-0" : "right-0"} w-5 h-5 pointer-events-none`}
              style={{
                borderTop:    pos.includes("t") ? `2px solid ${stage.color}` : undefined,
                borderBottom: pos.includes("b") ? `2px solid ${stage.color}` : undefined,
                borderLeft:   pos.includes("l") ? `2px solid ${stage.color}` : undefined,
                borderRight:  pos.includes("r") ? `2px solid ${stage.color}` : undefined,
                borderTopLeftRadius:     pos === "tl" ? "1rem" : undefined,
                borderTopRightRadius:    pos === "tr" ? "1rem" : undefined,
                borderBottomLeftRadius:  pos === "bl" ? "1rem" : undefined,
                borderBottomRightRadius: pos === "br" ? "1rem" : undefined,
                transition: "border-color 0.3s ease",
              }}
            />
          ))}

          <div className="p-6 space-y-5">

            {/* Title bar */}
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full" style={{ background: "#ff5f56", boxShadow: "0 0 6px #ff5f5680" }} />
                <div className="w-3 h-3 rounded-full" style={{ background: "#ffbd2e", boxShadow: "0 0 6px #ffbd2e80" }} />
                <div className="w-3 h-3 rounded-full" style={{ background: "#27c93f", boxShadow: "0 0 6px #27c93f80" }} />
              </div>
              <span className="text-[11px] font-mono font-bold ml-2" style={{ color: "#00e5ff" }}>FIX-MERAH TRANSMITTER v2.0</span>
              <div className="ml-auto flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#ff003c", boxShadow: "0 0 8px #ff003c" }} />
                <span className="text-[9px] font-mono font-bold" style={{ color: "#ff003c" }}>LIVE TX</span>
              </div>
            </div>

            {!showResult ? (
              <>
                {/* Stage hero — animated per stage */}
                <div
                  key={stageKey}
                  className="text-center space-y-2"
                  style={{ animation: `stageAppear 0.35s cubic-bezier(0.34,1.56,0.64,1)` }}
                >
                  <div
                    className="text-5xl mb-1"
                    style={{
                      filter: `drop-shadow(0 0 14px ${stage.color}) drop-shadow(0 0 28px ${stage.color}60)`,
                      animation: `iconPop 0.4s cubic-bezier(0.34,1.56,0.64,1), ${stage.shake !== "none" ? stage.shake + " 0.5s ease-in-out 0.4s" : ""}`,
                    }}
                  >
                    {stage.icon}
                  </div>
                  <div
                    className="text-[22px] font-black tracking-widest font-mono"
                    style={{
                      color: stage.color,
                      textShadow: `0 0 20px ${stage.color}80, 0 0 40px ${stage.color}40`,
                      animation: shakeAnim ? `${stage.shake} 0.45s ease-in-out 0.2s` : undefined,
                    }}
                  >
                    {stage.label}
                  </div>
                  <div className="text-[12px] font-mono min-h-[18px]" style={{ color: "#6a8a9a" }}>
                    {stage.msg}{".".repeat(blinkDots)}
                  </div>
                </div>

                {/* Stage mini progress */}
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px] font-mono" style={{ color: "#2a4050" }}>
                    <span>STAGE {stageIdx + 1}/{STAGES.length}</span>
                    <span>{Math.round(stageProgress)}%</span>
                  </div>
                  <div className="h-1 rounded-full overflow-hidden" style={{ background: "#0a1628" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${stageProgress}%`,
                        background: `linear-gradient(90deg, ${stage.color}80, ${stage.color})`,
                        boxShadow: `0 0 8px ${stage.color}`,
                        transition: "width 0.1s linear",
                      }}
                    />
                  </div>
                </div>

                {/* Overall progress */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] font-mono" style={{ color: "#3a5060" }}>
                    <span>📊 TOTAL PROGRESS</span>
                    <span style={{ color: "#00ff88" }}>{Math.round(totalProgress)}%</span>
                  </div>
                  <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "#050e1e" }}>
                    <div
                      className="h-full rounded-full relative overflow-hidden"
                      style={{
                        width: `${totalProgress}%`,
                        background: "linear-gradient(90deg, #00ff8830, #00ff88, #00e5ff)",
                        boxShadow: "0 0 12px #00ff8860",
                        transition: "width 0.1s linear",
                      }}
                    >
                      <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.3) 50%,transparent 100%)", animation: "scanHoriz 1.2s linear infinite" }} />
                    </div>
                  </div>
                </div>

                {/* Stage stepper */}
                <div className="grid grid-cols-4 gap-1">
                  {STAGES.map((s, i) => (
                    <div
                      key={i}
                      className="text-center py-1.5 rounded-lg text-[8px] font-mono font-bold transition-all"
                      style={{
                        background: i < stageIdx ? `${s.color}15` : i === stageIdx ? `${s.color}25` : "#050e1e",
                        border: `1px solid ${i <= stageIdx ? s.color + "40" : "#0a1628"}`,
                        color: i < stageIdx ? "#2a5040" : i === stageIdx ? s.color : "#0a2030",
                        transform: i === stageIdx ? "scale(1.05)" : "scale(1)",
                        transition: "all 0.3s ease",
                      }}
                    >
                      {i < stageIdx ? "✓" : s.icon}<br />
                      <span className="text-[7px]">{s.label}</span>
                    </div>
                  ))}
                </div>

                {/* Target info */}
                <div className="rounded-xl p-3 font-mono text-[10px] space-y-1.5" style={{ background: "#050e1e", border: "1px solid #0a1e30" }}>
                  <div className="flex justify-between">
                    <span style={{ color: "#1a3040" }}>🎯 TARGET</span>
                    <span className="font-bold" style={{ color: "#00ff88" }}>{target}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "#1a3040" }}>📋 TEMPLATE</span>
                    <span style={{ color: "#e0ffe0" }}>{templateName ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "#1a3040" }}>📧 PENGIRIM</span>
                    <span style={{ color: "#00e5ff" }}>{accounts.length} akun Gmail</span>
                  </div>
                  {accounts.slice(0, 2).map((a, i) => (
                    <div key={i} className="flex gap-2 pl-2">
                      <span style={{ color: "#0a2030" }}>↳</span>
                      <span className="truncate" style={{ color: "#2a4060" }}>{a.email}</span>
                      {a.label && <span style={{ color: "#00e5ff40" }}>({a.label})</span>}
                    </div>
                  ))}
                  {accounts.length > 2 && (
                    <div className="pl-2 text-[9px]" style={{ color: "#0a2030" }}>↳ +{accounts.length - 2} akun lainnya</div>
                  )}
                </div>
              </>
            ) : (
              /* Result screen */
              <div className="text-center py-4 space-y-4" style={{ animation: "resultPop 0.5s cubic-bezier(0.34,1.56,0.64,1)" }}>
                <div className="text-7xl" style={{ filter: apiSuccess ? "drop-shadow(0 0 24px #00ff88) drop-shadow(0 0 60px #00ff8860)" : "drop-shadow(0 0 20px #ff003c)", animation: "iconPop 0.5s cubic-bezier(0.34,1.56,0.64,1)" }}>
                  {apiSuccess ? "🎉" : "⚠️"}
                </div>
                <div
                  className="text-[24px] font-black tracking-widest font-mono"
                  style={{
                    color: apiSuccess ? "#00ff88" : "#ff003c",
                    textShadow: apiSuccess ? "0 0 24px #00ff8880, 0 0 60px #00ff8830" : "0 0 24px #ff003c80",
                    animation: apiSuccess ? "shakeH 0.5s ease-in-out 0.3s" : undefined,
                  }}
                >
                  {apiSuccess ? "TERKIRIM!" : "PARTIAL"}
                </div>
                <div className="text-[12px] font-mono whitespace-pre-line" style={{ color: "#6a8a9a" }}>
                  {apiSuccess
                    ? `✅ Banding dikirim dari ${accounts.length} akun Gmail\n📡 IMAP monitor aktif menunggu balasan...`
                    : "Beberapa email mungkin gagal. Cek terminal untuk detail."}
                </div>
                <div className="text-[10px] font-mono animate-pulse" style={{ color: "#00ff8840" }}>
                  Menutup otomatis...
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
