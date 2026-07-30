import { useState } from "react";
import { Bell, Camera, Mic, CheckCircle, X } from "lucide-react";

interface Props {
  onDone: () => void;
}

type PermState = "idle" | "granted" | "denied";

interface PermItem {
  icon: React.ReactNode;
  label: string;
  desc: string;
  key: "notification" | "camera" | "mic";
  color: string;
}

const ITEMS: PermItem[] = [
  {
    key: "notification",
    icon: <Bell size={22} />,
    label: "Notifikasi",
    desc: "Dapat info episode baru, jadwal tayang & pembaruan aplikasi",
    color: "#FF6B00",
  },
  {
    key: "camera",
    icon: <Camera size={22} />,
    label: "Kamera",
    desc: "Diperlukan untuk fitur Nobar (nonton bareng dengan webcam)",
    color: "#667eea",
  },
  {
    key: "mic",
    icon: <Mic size={22} />,
    label: "Mikrofon",
    desc: "Untuk komunikasi suara saat sesi Nobar bareng teman",
    color: "#00C9FF",
  },
];

async function requestPerm(key: PermItem["key"]): Promise<PermState> {
  try {
    if (key === "notification") {
      if (!("Notification" in window)) return "denied";
      const r = await Notification.requestPermission();
      return r === "granted" ? "granted" : "denied";
    }
    if (key === "camera") {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());
      return "granted";
    }
    if (key === "mic") {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
      return "granted";
    }
  } catch { /* permission denied or unsupported */ }
  return "denied";
}

export default function PermissionRequest({ onDone }: Props) {
  const [states, setStates] = useState<Record<string, PermState>>({});
  const [loading, setLoading] = useState<string | null>(null);

  const handleRequest = async (key: PermItem["key"]) => {
    setLoading(key);
    const result = await requestPerm(key);
    setStates(p => ({ ...p, [key]: result }));
    setLoading(null);
  };

  const handleRequestAll = async () => {
    for (const item of ITEMS) {
      if (states[item.key]) continue;
      setLoading(item.key);
      const result = await requestPerm(item.key);
      setStates(p => ({ ...p, [item.key]: result }));
      setLoading(null);
      await new Promise(r => setTimeout(r, 300));
    }
  };

  const allHandled = ITEMS.every(i => states[i.key]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)" }}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl pb-safe"
        style={{
          background: "linear-gradient(180deg,#0f0f1b 0%,#07070e 100%)",
          border: "1px solid rgba(255,255,255,0.07)",
          borderBottom: "none",
          paddingBottom: "env(safe-area-inset-bottom, 24px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <div>
            <h2 className="text-lg font-black text-white">Izinkan Akses</h2>
            <p className="text-xs mt-0.5" style={{ color: "#6E6E90" }}>
              Untuk pengalaman Lawnime yang terbaik
            </p>
          </div>
          <button
            onClick={onDone}
            className="w-8 h-8 flex items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.07)" }}
          >
            <X size={15} color="#6E6E90" />
          </button>
        </div>

        {/* Permission list */}
        <div className="px-5 py-3 space-y-3">
          {ITEMS.map(item => {
            const st = states[item.key];
            const isLoading = loading === item.key;
            return (
              <div
                key={item.key}
                className="flex items-center gap-3 p-3.5 rounded-2xl"
                style={{
                  background: st === "granted"
                    ? `${item.color}14`
                    : "rgba(255,255,255,0.04)",
                  border: `1px solid ${st === "granted" ? `${item.color}30` : "rgba(255,255,255,0.07)"}`,
                }}
              >
                <div
                  className="w-11 h-11 flex items-center justify-center rounded-xl flex-shrink-0"
                  style={{ background: `${item.color}18`, color: item.color }}
                >
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">{item.label}</p>
                  <p className="text-[11px] leading-tight mt-0.5" style={{ color: "#6E6E90" }}>
                    {item.desc}
                  </p>
                </div>
                {st === "granted" ? (
                  <CheckCircle size={20} style={{ color: "#00FF9C", flexShrink: 0 }} />
                ) : st === "denied" ? (
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0"
                    style={{ background: "rgba(255,68,68,0.15)", color: "#FF4444" }}>
                    Ditolak
                  </span>
                ) : (
                  <button
                    onClick={() => handleRequest(item.key)}
                    disabled={!!loading}
                    className="text-xs font-bold px-3 py-1.5 rounded-xl flex-shrink-0 transition-all active:scale-95"
                    style={{
                      background: `${item.color}22`,
                      color: item.color,
                      border: `1px solid ${item.color}44`,
                      opacity: loading && loading !== item.key ? 0.5 : 1,
                    }}
                  >
                    {isLoading ? "..." : "Izinkan"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* CTA Buttons */}
        <div className="px-5 pb-6 pt-1 flex gap-2">
          <button
            onClick={handleRequestAll}
            disabled={!!loading || allHandled}
            className="flex-1 py-3.5 rounded-2xl font-black text-sm transition-all active:scale-[0.98]"
            style={{
              background: allHandled
                ? "rgba(0,255,156,0.12)"
                : "linear-gradient(135deg,#FF6B00,#FF4444)",
              color: allHandled ? "#00FF9C" : "#fff",
              boxShadow: allHandled ? "none" : "0 4px 20px rgba(255,107,0,0.35)",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {allHandled ? "✅ Semua Izin Diberikan!" : loading ? "Meminta izin..." : "Izinkan Semua Sekarang"}
          </button>
          {!allHandled && (
            <button
              onClick={onDone}
              className="px-4 py-3.5 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98]"
              style={{
                background: "rgba(255,255,255,0.06)",
                color: "#6E6E90",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              Nanti
            </button>
          )}
          {allHandled && (
            <button
              onClick={onDone}
              className="px-4 py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-[0.98]"
              style={{
                background: "rgba(0,255,156,0.1)",
                color: "#00FF9C",
                border: "1px solid rgba(0,255,156,0.25)",
              }}
            >
              Lanjut
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
