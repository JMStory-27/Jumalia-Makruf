export interface BombAccountStatus {
  id: string;
  email: string;
  label?: string;
  status: "idle" | "sending" | "sent" | "error";
  error?: string;
}

interface Props {
  visible: boolean;
  target: string;
  templateName: string;
  accountStatuses: BombAccountStatus[];
  onClose: () => void;
  isDone: boolean;
}

function RadarIcon({ active }: { active: boolean }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
      {active && (
        <>
          <div className="absolute rounded-full" style={{
            width: 72, height: 72, border: "2px solid #ff205025",
            animation: "bombRing 2s ease-out infinite",
          }} />
          <div className="absolute rounded-full" style={{
            width: 72, height: 72, border: "2px solid #ff205035",
            animation: "bombRing 2s ease-out infinite 0.65s",
          }} />
          <div className="absolute rounded-full" style={{
            width: 72, height: 72, border: "2px solid #ff205045",
            animation: "bombRing 2s ease-out infinite 1.3s",
          }} />
        </>
      )}
      <div className="relative z-10 flex items-center justify-center rounded-full" style={{
        width: 52, height: 52,
        background: active
          ? "radial-gradient(circle at 35% 35%, #ff4070, #cc0028)"
          : "radial-gradient(circle at 35% 35%, #3a1020, #1a0010)",
        boxShadow: active ? "0 0 28px #ff205070, 0 0 60px #ff205030" : "0 0 8px #ff205020",
        border: `2px solid ${active ? "#ff205080" : "#ff205025"}`,
        fontSize: 26,
        animation: active ? "bombBounce 0.8s ease-in-out infinite alternate" : undefined,
        transition: "all 0.5s ease",
      }}>
        {active ? "💣" : "✅"}
      </div>
    </div>
  );
}

function AccountRow({ acc, idx }: { acc: BombAccountStatus; idx: number }) {
  const colors = {
    idle: "#6b5fa0",
    sending: "#fbbf24",
    sent: "#a855f7",
    error: "#ff2050",
  };
  const icons = {
    idle: <span className="text-[10px] font-mono" style={{ color: "#6b5fa0" }}>STANDBY</span>,
    sending: (
      <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color: "#fbbf24" }}>
        <span className="w-2.5 h-2.5 border border-yellow-400 border-t-transparent rounded-full animate-spin inline-block" />
        SENDING
      </span>
    ),
    sent: <span className="text-[10px] font-mono font-bold" style={{ color: "#a855f7" }}>✅ SENT</span>,
    error: <span className="text-[10px] font-mono font-bold" style={{ color: "#ff2050" }}>❌ FAIL</span>,
  };

  const color = colors[acc.status];

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
      style={{
        background: acc.status === "sent"
          ? "rgba(168,85,247,0.07)"
          : acc.status === "error"
          ? "rgba(255,32,80,0.06)"
          : acc.status === "sending"
          ? "rgba(251,191,36,0.06)"
          : "rgba(13,5,32,0.6)",
        border: `1px solid ${color}${acc.status === "idle" ? "18" : "35"}`,
        animation: `bombRowIn 0.35s ease-out ${idx * 0.05}s both`,
      }}
    >
      {/* Status dot */}
      <div
        className={`w-2 h-2 rounded-full shrink-0 ${acc.status === "sending" ? "animate-pulse" : ""}`}
        style={{
          background: color,
          boxShadow: acc.status !== "idle" ? `0 0 8px ${color}` : undefined,
        }}
      />

      {/* Email + label */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[12px] font-mono truncate" style={{ color: acc.status === "idle" ? "#6b5fa0" : "#e2d9ff" }}>
            {acc.email}
          </span>
          {acc.label && (
            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded font-mono" style={{ background: "#22d3ee12", color: "#22d3ee80", border: "1px solid #22d3ee20" }}>
              {acc.label}
            </span>
          )}
        </div>
        {acc.status === "error" && acc.error && (
          <div className="text-[9px] font-mono mt-0.5 truncate" style={{ color: "#ff205070" }}>{acc.error.slice(0, 60)}</div>
        )}
      </div>

      {/* Status badge */}
      <div className="shrink-0">{icons[acc.status]}</div>

      {/* Progress bar */}
      <div className="shrink-0 w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "#160830" }}>
        {acc.status === "sending" && (
          <div className="h-full rounded-full" style={{
            background: "linear-gradient(90deg, transparent, #fbbf24, transparent)",
            backgroundSize: "200% 100%",
            animation: "bombShimmer 1.2s linear infinite",
            width: "100%",
          }} />
        )}
        {acc.status === "sent" && (
          <div className="h-full rounded-full" style={{
            background: "linear-gradient(90deg, #7c3aed, #a855f7)",
            width: "100%",
            transition: "width 0.5s ease",
          }} />
        )}
        {acc.status === "error" && (
          <div className="h-full rounded-full" style={{
            background: "linear-gradient(90deg, #cc0028, #ff2050)",
            width: "100%",
          }} />
        )}
      </div>
    </div>
  );
}

export function BombingModal({ visible, target, templateName, accountStatuses, onClose, isDone }: Props) {
  const total = accountStatuses.length;
  const sent = accountStatuses.filter((a) => a.status === "sent").length;
  const failed = accountStatuses.filter((a) => a.status === "error").length;
  const sending = accountStatuses.filter((a) => a.status === "sending").length;
  const done = sent + failed;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const active = !isDone;

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5"
      style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(20px)" }}
    >
      <style>{`
        @keyframes bombRing       { 0%{transform:scale(0.8);opacity:0.7} 100%{transform:scale(2.2);opacity:0} }
        @keyframes bombBounce     { from{transform:translateY(0) rotate(-5deg)} to{transform:translateY(-5px) rotate(5deg)} }
        @keyframes bombPanelPulse { 0%,100%{box-shadow:0 0 60px #ff205025,inset 0 0 30px #ff205008} 50%{box-shadow:0 0 120px #ff205055,inset 0 0 60px #ff205018} }
        @keyframes bombShimmer    { 0%{background-position:200% 0} 100%{background-position:-200% 0} }
        @keyframes bombRowIn      { from{opacity:0;transform:translateX(-12px)} to{opacity:1;transform:translateX(0)} }
        @keyframes bombBarFill    { from{width:0%} to{width:var(--bar-w)} }
        @keyframes bombScanH      { 0%{left:-30%} 100%{left:110%} }
        @keyframes bombSuccessIn  { 0%{opacity:0;transform:scale(0.85)} 100%{opacity:1;transform:scale(1)} }
        @keyframes bombCountUp    { 0%{opacity:0;transform:translateY(6px)} 100%{opacity:1;transform:translateY(0)} }
      `}</style>

      <div
        className="relative w-full rounded-3xl overflow-hidden flex flex-col"
        style={{
          maxWidth: 520,
          maxHeight: "92vh",
          background: "rgba(10,2,22,0.99)",
          border: "1px solid #ff205040",
          boxShadow: "0 0 80px #ff205028, 0 0 200px #ff205010, inset 0 0 60px #ff205008",
          animation: active ? "bombPanelPulse 2.5s ease-in-out infinite" : undefined,
        }}
      >
        {/* Scan sweep */}
        {active && (
          <div className="absolute pointer-events-none" style={{
            height: 2, left: 0, right: 0, top: "30%",
            background: "linear-gradient(90deg,transparent,#ff205035,#ff205060,#ff205035,transparent)",
            animation: "bombScanH 2.5s linear infinite", zIndex: 1,
          }} />
        )}

        {/* Corner accents */}
        {[["top-0 left-0 border-t-2 border-l-2 rounded-tl-3xl", 0],
          ["top-0 right-0 border-t-2 border-r-2 rounded-tr-3xl", 0.5],
          ["bottom-0 left-0 border-b-2 border-l-2 rounded-bl-3xl", 1],
          ["bottom-0 right-0 border-b-2 border-r-2 rounded-br-3xl", 1.5],
        ].map(([cls, delay], i) => (
          <span key={i} className={`absolute w-5 h-5 pointer-events-none ${cls}`}
            style={{ borderColor: "#ff205060", zIndex: 10, animation: `cornerPulse 2s ease-in-out ${delay}s infinite` }} />
        ))}

        {/* ─── HEADER ─── */}
        <div className="relative z-10 px-5 pt-5 pb-4 shrink-0" style={{ borderBottom: "1px solid #ff205018" }}>
          <div className="flex items-center gap-4">
            <RadarIcon active={active} />
            <div className="flex-1 min-w-0">
              <div className="text-[20px] sm:text-[24px] font-black font-mono tracking-wider leading-none" style={{
                color: active ? "#ff2050" : "#a855f7",
                textShadow: active ? "0 0 20px #ff205080, 0 0 40px #ff205040" : "0 0 20px #a855f780",
                transition: "all 0.8s ease",
              }}>
                💣 BOMBING MODE
              </div>
              <div className="text-[11px] font-mono mt-1.5" style={{ color: "#6b5fa0" }}>
                {active ? `Mengirim dari ${sending} akun secara simultan...` : isDone ? "Bombing selesai!" : "Siap"}
              </div>
            </div>
          </div>

          {/* Target info */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            {[
              { label: "TARGET", value: target, color: "#ff2050" },
              { label: "TEMPLATE", value: templateName || "—", color: "#a855f7" },
            ].map(({ label, value, color }) => (
              <div key={label} className="px-3 py-2 rounded-xl" style={{ background: `${color}10`, border: `1px solid ${color}25` }}>
                <div className="text-[8px] uppercase tracking-widest font-mono mb-0.5" style={{ color: `${color}80` }}>{label}</div>
                <div className="text-[12px] font-bold font-mono truncate" style={{ color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Overall progress bar */}
          <div className="mt-4">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-[10px] font-mono uppercase tracking-widest" style={{ color: "#6b5fa0" }}>PROGRESS</span>
              <span className="text-[12px] font-bold font-mono" style={{ color: done === total && isDone ? "#a855f7" : "#ff2050" }}>
                {done} / {total} ({progress}%)
              </span>
            </div>
            <div className="h-3 rounded-full overflow-hidden" style={{ background: "#160830", border: "1px solid #ff205018" }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: isDone && failed === 0
                    ? "linear-gradient(90deg, #7c3aed, #a855f7)"
                    : "linear-gradient(90deg, #cc0028, #ff2050, #ff4070)",
                  boxShadow: `0 0 12px ${isDone && failed === 0 ? "#a855f780" : "#ff205060"}`,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {active && (
                  <div className="absolute inset-0" style={{
                    background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.3),transparent)",
                    animation: "bombScanH 1.2s linear infinite",
                  }} />
                )}
              </div>
            </div>

            {/* Counters */}
            <div className="flex gap-3 mt-2">
              {[
                { label: "Terkirim", count: sent, color: "#a855f7" },
                { label: "Gagal", count: failed, color: "#ff2050" },
                { label: "Proses", count: sending, color: "#fbbf24" },
                { label: "Standby", count: total - done - sending, color: "#6b5fa0" },
              ].map(({ label, count, color }) => (
                <div key={label} className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
                  <span className="text-[9px] font-mono" style={{ color: "#6b5fa0" }}>{label}:</span>
                  <span className="text-[10px] font-bold font-mono" style={{ color }}>{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ─── ACCOUNT LIST ─── */}
        <div className="relative z-10 flex-1 overflow-y-auto px-4 py-3 space-y-2 scrollbar-thin" style={{ scrollbarColor: "#ff205020 transparent" }}>
          {accountStatuses.map((acc, idx) => (
            <AccountRow key={acc.id} acc={acc} idx={idx} />
          ))}
        </div>

        {/* ─── FOOTER ─── */}
        <div className="relative z-10 px-5 py-4 shrink-0" style={{ borderTop: "1px solid #ff205018" }}>
          {isDone ? (
            <div style={{ animation: "bombSuccessIn 0.5s ease-out both" }}>
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-2xl mb-3"
                style={{
                  background: failed === 0 ? "#a855f710" : sent === 0 ? "#ff205010" : "#fbbf2410",
                  border: `1px solid ${failed === 0 ? "#a855f740" : sent === 0 ? "#ff205040" : "#fbbf2440"}`,
                }}
              >
                <span className="text-2xl">{failed === 0 ? "🎯" : sent === 0 ? "💀" : "⚠️"}</span>
                <div>
                  <div className="text-[13px] font-bold font-mono" style={{ color: failed === 0 ? "#a855f7" : sent === 0 ? "#ff2050" : "#fbbf24" }}>
                    {failed === 0
                      ? `BOMBING SUKSES — ${sent} email terkirim!`
                      : sent === 0
                      ? "BOMBING GAGAL — 0 email terkirim"
                      : `PARTIAL — ${sent} berhasil, ${failed} gagal`}
                  </div>
                  <div className="text-[10px] font-mono mt-0.5" style={{ color: "#6b5fa0" }}>
                    IMAP monitor aktif — memantau balasan setiap 2 menit
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full py-3 rounded-2xl text-[14px] font-black font-mono tracking-widest transition-all hover:brightness-110"
                style={{
                  background: failed === 0
                    ? "linear-gradient(135deg, #7c3aed, #a855f7)"
                    : "linear-gradient(135deg, #cc0028, #ff2050)",
                  color: "#fff",
                  boxShadow: `0 0 20px ${failed === 0 ? "#a855f750" : "#ff205050"}`,
                }}
              >
                ✓ TUTUP
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 py-1">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" style={{ boxShadow: "0 0 8px #ff2050" }} />
              <span className="text-[11px] font-mono" style={{ color: "#ff205080" }}>
                Jangan tutup halaman saat bombing berlangsung...
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
