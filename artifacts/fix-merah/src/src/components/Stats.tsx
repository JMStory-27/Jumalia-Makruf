import { useEffect, useState } from "react";
import { getStats, getHistory } from "../lib/api";
import { AppealRecord } from "../types";

interface StatsData {
  totalSent: number;
  totalReplied: number;
  successRate: number;
  avgReplyTime: number;
  activeMonitors?: number;
}

const STATUS_STYLE = {
  sent:    { bg: "#00ff8818", text: "#00ff88", border: "#00ff8830" },
  partial: { bg: "#ffcc0018", text: "#ffcc00", border: "#ffcc0030" },
  failed:  { bg: "#ff003c18", text: "#ff003c", border: "#ff003c30" },
};

export function Stats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [history, setHistory] = useState<AppealRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getStats(), getHistory()])
      .then(([s, h]) => { setStats(s); setHistory(h); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3">
        <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: "#00ff88", borderTopColor: "transparent" }} />
        <span className="text-[12px] font-mono" style={{ color: "#00ff8860" }}>Loading stats...</span>
      </div>
    );
  }

  const cards = [
    { label: "Total Terkirim",  value: stats?.totalSent ?? 0,    color: "#00ff88", icon: "📤", sub: "appeal emails" },
    { label: "Mendapat Reply",  value: stats?.totalReplied ?? 0, color: "#00e5ff", icon: "📬", sub: "balasan masuk" },
    { label: "Success Rate",    value: `${stats?.successRate ?? 0}%`, color: "#ffcc00", icon: "📊", sub: "tingkat keberhasilan" },
    { label: "Monitor Aktif",   value: stats?.activeMonitors ?? 0, color: "#b44bff", icon: "📡", sub: "IMAP aktif" },
  ];

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((c) => (
          <div
            key={c.label}
            className="relative rounded-xl p-4 overflow-hidden transition-all hover:scale-[1.02]"
            style={{ background: "rgba(6,16,30,0.9)", border: `1px solid ${c.color}20`, boxShadow: `0 0 20px ${c.color}08` }}
          >
            {/* Corner decorators */}
            <span className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 rounded-tl-xl pointer-events-none" style={{ borderColor: c.color }} />
            <span className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 rounded-br-xl pointer-events-none" style={{ borderColor: c.color }} />

            {/* Scan line */}
            <div className="absolute left-0 right-0 pointer-events-none" style={{ height: 1, background: `linear-gradient(90deg,transparent,${c.color}30,transparent)`, animation: "scanHoriz 2.5s linear infinite", top: "45%" }} />

            <div className="text-2xl mb-2">{c.icon}</div>
            <div className="text-[26px] font-black font-mono" style={{ color: c.color, textShadow: `0 0 16px ${c.color}60` }}>
              {c.value}
            </div>
            <div className="text-[10px] font-bold mt-0.5" style={{ color: `${c.color}90` }}>{c.label}</div>
            <div className="text-[9px] mt-0.5" style={{ color: "#1a2a30" }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* History table */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[13px] font-bold grad-green">📋 Riwayat Appeal</span>
          <span
            className="neon-badge"
            style={{ background: "#00ff8812", border: "1px solid #00ff8830", color: "#00ff8870" }}
          >
            {history.length} records
          </span>
          <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg,#00ff8820,transparent)" }} />
        </div>

        {history.length === 0 ? (
          <div
            className="text-center py-10 rounded-xl text-[12px] font-mono"
            style={{ border: "1px dashed #0a1a2a", color: "#1a2a30" }}
          >
            Belum ada riwayat appeal tersimpan.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid #00ff8812" }}>
            <table className="w-full text-[11px] font-mono border-collapse">
              <thead>
                <tr style={{ borderBottom: "1px solid #0a1a2a", background: "rgba(0,10,20,0.6)" }}>
                  {["Nomor", "Template", "Akun Gmail", "Waktu", "Status", "Balasan"].map((h) => (
                    <th key={h} className="text-left py-2.5 px-4 font-bold uppercase tracking-wider text-[9px]" style={{ color: "#1a3a4a" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((rec, i) => {
                  const s = STATUS_STYLE[rec.status] ?? STATUS_STYLE.failed;
                  return (
                    <tr
                      key={rec.id}
                      className="transition-colors hover:bg-white/[0.02]"
                      style={{ borderBottom: "1px solid #060f1a" }}
                    >
                      <td className="py-2.5 px-4 font-bold" style={{ color: "#00ff88" }}>{rec.targetNumber}</td>
                      <td className="py-2.5 px-4" style={{ color: "#7a9080" }}>{rec.templateName}</td>
                      <td className="py-2.5 px-4" style={{ color: "#4a6070" }}>{rec.gmailAccounts.length} akun</td>
                      <td className="py-2.5 px-4 text-[10px]" style={{ color: "#2a4050" }}>
                        {new Date(rec.sentAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="py-2.5 px-4">
                        <span
                          className="px-2 py-0.5 rounded text-[9px] font-bold"
                          style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
                        >
                          {rec.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-2.5 px-4">
                        {rec.replies?.length > 0 ? (
                          <span className="font-bold" style={{ color: "#ff003c" }}>{rec.replies.length} 📬</span>
                        ) : (
                          <span style={{ color: "#1a2a30" }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
