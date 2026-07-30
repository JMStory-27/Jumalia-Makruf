import { useState, useRef, useCallback } from "react";
import { User, Edit2, Check, Sun, Moon, Zap, Upload, Camera, Terminal } from "lucide-react";
import { useLocation } from "wouter";
import {
  getProfile, saveProfile, getRank, getLevel,
  getWatchlist, getHistory, getFavorites,
  getTheme, saveTheme, applyTheme,
  addXp, getLastRank, saveLastRank, RANK_ORDER,
  getWatchStats,
} from "@/lib/storage";
import RankUpOverlay from "@/components/RankUpOverlay";

const CHIBI_AVATARS = ["🦊", "🐉", "🌸", "⚡", "🌙", "🔥", "💫", "👁️", "🐺", "🦁", "🐼", "🦋", "🌊", "⚔️", "🎭", "🌟"];

const RANK_COLORS: Record<string, string> = {
  F: "#6E6E90", E: "#94A3B8", D: "#5865F2", C: "#57F287",
  B: "#FEE75C", A: "#EB459E", S: "#FF6B00", SS: "#FF4444", SSS: "#FF0000",
};

const RANK_BORDERS: Record<string, { border: string; shadow: string; label: string }> = {
  F: { border: "2px solid #6E6E9044", shadow: "none", label: "Pemula" },
  E: { border: "2px solid #94A3B855", shadow: "0 0 8px rgba(148,163,184,0.2)", label: "Newbie" },
  D: { border: "2px solid #5865F288", shadow: "0 0 12px rgba(88,101,242,0.35)", label: "Penonton" },
  C: { border: "2px solid #57F28788", shadow: "0 0 14px rgba(87,242,135,0.4)", label: "Regular" },
  B: { border: "2px solid #FEE75C88", shadow: "0 0 16px rgba(254,231,92,0.45)", label: "Aktif" },
  A: { border: "2px solid #EB459Ecc", shadow: "0 0 20px rgba(235,69,158,0.55)", label: "Hardcore" },
  S: { border: "2px solid #FF6B00", shadow: "0 0 22px rgba(255,107,0,0.6), inset 0 0 12px rgba(255,107,0,0.08)", label: "Elite" },
  SS: { border: "2px solid #FF4444", shadow: "0 0 28px rgba(255,68,68,0.7), inset 0 0 16px rgba(255,68,68,0.1)", label: "Master" },
  SSS: { border: "2px solid #FF0000", shadow: "0 0 36px rgba(255,0,0,0.8), 0 0 60px rgba(255,107,0,0.4), inset 0 0 24px rgba(255,0,0,0.15)", label: "Legendaris" },
};

function RankBorderDemo({ rank, isActive }: { rank: string; isActive: boolean }) {
  const b = RANK_BORDERS[rank];
  const c = RANK_COLORS[rank];
  return (
    <div style={{
      width: 44, height: 44, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
      background: isActive ? `${c}20` : "rgba(255,255,255,0.03)",
      border: isActive ? b.border : "1.5px solid rgba(255,255,255,0.07)",
      boxShadow: isActive ? b.shadow : "none",
      fontSize: 10, fontWeight: 900, color: isActive ? c : "#475569",
      transition: "all 0.3s ease",
      cursor: "pointer",
      flexDirection: "column",
      gap: 1,
    }}>
      <span>{rank}</span>
    </div>
  );
}

export default function Profile() {
  const [, setLocation] = useLocation();
  const [profile, setProfile] = useState(getProfile);
  const [editingName, setEditingName] = useState(false);
  const [tempName, setTempName] = useState(profile.username);
  const [theme, setTheme] = useState(getTheme);
  const [rankUp, setRankUp] = useState<{ from: string; to: string } | null>(null);
  const [customAvatar, setCustomAvatar] = useState<string | null>(() => {
    try { return localStorage.getItem("lawnime_custom_avatar") || null; } catch { return null; }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const watchlist = getWatchlist();
  const history = getHistory();
  const favorites = getFavorites();
  const rank = getRank(profile.xp);
  const level = getLevel(profile.xp);
  const rankBorder = RANK_BORDERS[rank] ?? RANK_BORDERS.F;

  const completedCount = watchlist.filter((w) => w.status === "completed").length;
  const watchingCount = watchlist.filter((w) => w.status === "watching").length;
  const watchStats = getWatchStats();

  const handleSaveName = () => {
    if (tempName.trim()) {
      saveProfile({ username: tempName.trim() });
      setProfile({ ...profile, username: tempName.trim() });
    }
    setEditingName(false);
  };

  const handleAvatarChange = (idx: number) => {
    saveProfile({ avatarId: idx });
    setProfile({ ...profile, avatarId: idx });
    setCustomAvatar(null);
    localStorage.removeItem("lawnime_custom_avatar");
  };

  const handleUploadAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setCustomAvatar(url);
      localStorage.setItem("lawnime_custom_avatar", url);
      saveProfile({ avatarId: 99 });
      setProfile(getProfile());
    };
    reader.readAsDataURL(file);
  };

  const handleThemeToggle = () => {
    const next: "dark" | "light" = theme === "dark" ? "light" : "dark";
    saveTheme(next);
    applyTheme(next);
    setTheme(next);
  };

  const handleAddXp = () => {
    const before = getRank(profile.xp);
    addXp(50);
    const updated = getProfile();
    const after = getRank(updated.xp);
    setProfile(updated);
    if (RANK_ORDER.indexOf(after) > RANK_ORDER.indexOf(before)) {
      setRankUp({ from: before, to: after });
      saveLastRank(after);
    }
  };

  const handleRankDone = useCallback(() => setRankUp(null), []);

  const xpToNextRank = (() => {
    const thresholds: Record<string, number> = {
      F: 20, E: 80, D: 300, C: 1000, B: 3000, A: 8000, S: 20000, SS: 50000, SSS: 999999,
    };
    const prevThresholds: Record<string, number> = {
      F: 0, E: 20, D: 80, C: 300, B: 1000, A: 3000, S: 8000, SS: 20000, SSS: 50000,
    };
    const max = thresholds[rank] ?? 999999;
    const min = prevThresholds[rank] ?? 0;
    const pct = rank === "SSS" ? 100 : Math.min(100, ((profile.xp - min) / (max - min)) * 100);
    return { pct, remaining: Math.max(0, max - profile.xp) };
  })();

  return (
    <div className="min-h-screen pb-24" style={{ background: "#07070e" }}>
      <div className="sticky top-0 z-40 px-4 py-3 flex items-center justify-between"
        style={{ background: "rgba(7,7,14,0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <h1 className="text-lg font-bold text-white">Profil</h1>
        <button
          onClick={handleThemeToggle}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full transition-all active:scale-95"
          style={{
            background: theme === "light" ? "rgba(255,200,0,0.15)" : "rgba(96,165,250,0.1)",
            border: theme === "light" ? "1px solid rgba(255,200,0,0.4)" : "1px solid rgba(96,165,250,0.25)",
          }}
          data-testid="btn-theme-toggle"
        >
          {theme === "light"
            ? <><Sun size={14} style={{ color: "#FBBF24" }} /><span className="text-xs font-bold" style={{ color: "#FBBF24" }}>Terang</span></>
            : <><Moon size={14} style={{ color: "#93C5FD" }} /><span className="text-xs font-bold" style={{ color: "#93C5FD" }}>Gelap</span></>
          }
        </button>
      </div>

      <div className="px-4 py-6 space-y-6">
        {/* Profile card with rank border */}
        <div className="flex items-center gap-4 p-4 rounded-2xl"
          style={{
            background: "rgba(15,15,27,0.6)",
            backdropFilter: "blur(24px) saturate(160%)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
          }}>
          {/* Avatar with rank border */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden"
              style={{
                background: `${RANK_COLORS[rank]}18`,
                border: rankBorder.border,
                boxShadow: rankBorder.shadow,
                fontSize: customAvatar ? 0 : 28,
              }}
            >
              {customAvatar ? (
                <img src={customAvatar} alt="avatar" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                CHIBI_AVATARS[profile.avatarId % CHIBI_AVATARS.length] ?? "🦊"
              )}
            </div>
            {/* Rank label badge */}
            <div style={{
              position: "absolute", bottom: -6, left: "50%", transform: "translateX(-50%)",
              fontSize: 9, fontWeight: 900, padding: "1px 7px", borderRadius: 999, whiteSpace: "nowrap",
              background: `linear-gradient(135deg, ${RANK_COLORS[rank]}, ${RANK_COLORS[rank]}cc)`,
              color: ["S","SS","SSS"].includes(rank) ? "#fff" : "#000",
              boxShadow: `0 0 8px ${RANK_COLORS[rank]}66`,
            }}>
              {rank} · {rankBorder.label}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input value={tempName} onChange={(e) => setTempName(e.target.value)}
                  className="flex-1 bg-transparent text-white font-bold text-base outline-none border-b"
                  style={{ borderColor: "#FF6B00" }}
                  autoFocus onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                  data-testid="input-username" />
                <button onClick={handleSaveName} data-testid="btn-save-name">
                  <Check size={18} style={{ color: "#FF6B00" }} />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <p className="text-white font-bold text-base truncate">{profile.username}</p>
                <button onClick={() => setEditingName(true)} data-testid="btn-edit-name">
                  <Edit2 size={14} style={{ color: "#6E6E90" }} />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: `${RANK_COLORS[rank]}22`,
                  color: RANK_COLORS[rank],
                  border: `1px solid ${RANK_COLORS[rank]}44`,
                  boxShadow: `0 0 8px ${RANK_COLORS[rank]}33`,
                }}>
                {rank}-Rank
              </span>
              <span className="text-xs" style={{ color: "#6E6E90" }}>Lv.{level}</span>
              <span className="text-xs" style={{ color: "#6E6E90" }}>{profile.xp} XP</span>
            </div>
          </div>
        </div>

        {/* XP Progress */}
        <div className="p-4 rounded-2xl space-y-3"
          style={{
            background: "rgba(15,15,27,0.6)",
            backdropFilter: "blur(20px) saturate(160%)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">XP & Rank Progress</h3>
            <button
              onClick={handleAddXp}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold active:scale-95 transition-all"
              style={{ background: "rgba(255,107,0,0.15)", color: "#FF6B00", border: "1px solid rgba(255,107,0,0.3)" }}
              data-testid="btn-add-xp"
            >
              <Zap size={11} /> +50 XP
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center font-black text-lg flex-shrink-0"
              style={{
                background: `${RANK_COLORS[rank]}22`,
                border: `2px solid ${RANK_COLORS[rank]}66`,
                color: RANK_COLORS[rank],
                boxShadow: `0 0 16px ${RANK_COLORS[rank]}33`,
              }}>
              {rank}
            </div>
            <div className="flex-1">
              <div className="flex justify-between text-xs mb-1.5">
                <span style={{ color: "#6E6E90" }}>Level {level}</span>
                <span style={{ color: RANK_COLORS[rank] }}>
                  {rank === "SSS" ? "MAX" : `${xpToNextRank.remaining} XP ke rank berikutnya`}
                </span>
              </div>
              <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.07)" }}>
                <div className="h-full rounded-full transition-all duration-500" style={{
                  width: `${xpToNextRank.pct}%`,
                  background: `linear-gradient(90deg, ${RANK_COLORS[rank]}, ${RANK_COLORS[rank]}88)`,
                  boxShadow: `0 0 8px ${RANK_COLORS[rank]}66`,
                }} />
              </div>
            </div>
          </div>

          {/* Rank ladder */}
          <div className="flex items-center justify-between mt-2">
            {RANK_ORDER.map((r) => (
              <div key={r} className="flex flex-col items-center gap-0.5">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black"
                  style={{
                    background: r === rank ? `${RANK_COLORS[r]}33` : "rgba(255,255,255,0.04)",
                    border: `1px solid ${r === rank ? RANK_COLORS[r] : "transparent"}`,
                    color: r === rank ? RANK_COLORS[r] : RANK_ORDER.indexOf(r) < RANK_ORDER.indexOf(rank) ? RANK_COLORS[r] + "88" : "rgba(255,255,255,0.2)",
                  }}>
                  {r}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Premium Border showcase */}
        <div className="p-4 rounded-2xl space-y-3"
          style={{ background: "rgba(15,15,27,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">🏆 Premium Border</h3>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${RANK_COLORS[rank]}20`, color: RANK_COLORS[rank], border: `1px solid ${RANK_COLORS[rank]}44` }}>
              Aktif: {rank} · {rankBorder.label}
            </span>
          </div>
          <p className="text-[11px]" style={{ color: "#64748B" }}>Border otomatis naik seiring rank kamu meningkat. Semakin tinggi rank, border makin premium!</p>
          <div className="flex gap-2 flex-wrap">
            {RANK_ORDER.map((r) => (
              <div key={r} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <RankBorderDemo rank={r} isActive={RANK_ORDER.indexOf(r) <= RANK_ORDER.indexOf(rank)} />
                <span style={{ fontSize: 8, color: RANK_ORDER.indexOf(r) <= RANK_ORDER.indexOf(rank) ? RANK_COLORS[r] : "#334155", fontWeight: 700 }}>{r}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Avatar picker */}
        <div className="p-4 rounded-2xl space-y-3"
          style={{ background: "rgba(15,15,27,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-white">🎭 Pilih Avatar</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold active:scale-95 transition-all"
              style={{ background: "rgba(96,165,250,0.12)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.25)" }}
            >
              <Upload size={12} /> Upload Foto
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleUploadAvatar} />
          </div>

          {/* Custom uploaded avatar preview */}
          {customAvatar && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 12, background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, overflow: "hidden", flexShrink: 0 }}>
                <img src={customAvatar} alt="custom" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#F1F5F9" }}>Foto dari Galeri</p>
                <p style={{ fontSize: 10, color: "#475569" }}>Avatar kustom aktif ✓</p>
              </div>
              <button onClick={() => handleAvatarChange(0)} style={{ marginLeft: "auto", fontSize: 10, color: "#64748B" }}>Hapus</button>
            </div>
          )}

          {/* Chibi avatars */}
          <div className="flex gap-2.5 flex-wrap">
            {CHIBI_AVATARS.map((a, i) => (
              <button key={i} onClick={() => handleAvatarChange(i)}
                className="w-11 h-11 rounded-xl flex items-center justify-center text-xl transition-all active:scale-90"
                style={{
                  background: !customAvatar && profile.avatarId === i ? "rgba(255,107,0,0.2)" : "rgba(255,255,255,0.05)",
                  border: !customAvatar && profile.avatarId === i ? "2px solid #FF6B00" : "2px solid transparent",
                  boxShadow: !customAvatar && profile.avatarId === i ? "0 0 12px rgba(255,107,0,0.3)" : "none",
                  backdropFilter: "blur(8px)",
                }}
                data-testid={`avatar-${i}`}>
                {a}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Selesai", value: completedCount, color: "#00FF9C" },
            { label: "Sedang Nonton", value: watchingCount, color: "#00C9FF" },
            { label: "Riwayat", value: history.length, color: "#FF6B00" },
          ].map((stat) => (
            <div key={stat.label} className="p-3 rounded-xl text-center"
              style={{
                background: "rgba(15,15,27,0.6)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
              <p className="text-2xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
              <p className="text-[10px] mt-0.5 leading-tight" style={{ color: "#6E6E90" }}>{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Panel admin scrape — pantau & jalankan ⚡ langsung dari web */}
        <button
          onClick={() => setLocation("/admin/scrape")}
          className="w-full flex items-center justify-between p-4 rounded-2xl"
          style={{ background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.25)" }}
        >
          <div className="flex items-center gap-2">
            <Terminal size={16} style={{ color: "#FB923C" }} />
            <span className="text-sm font-bold text-white">Panel Admin Scrape</span>
          </div>
          <span className="text-xs" style={{ color: "#FB923C" }}>Buka →</span>
        </button>

        {/* Statistik pribadi mendalam */}
        <div className="p-4 rounded-2xl space-y-3"
          style={{ background: "rgba(15,15,27,0.6)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-sm font-bold text-white">📊 Statistik Pribadi</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl" style={{ background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.18)" }}>
              <p className="text-xl font-bold" style={{ color: "#60A5FA" }}>{watchStats.totalWatchHours}<span className="text-xs ml-1" style={{ color: "#6E6E90" }}>jam</span></p>
              <p className="text-[10px] mt-0.5" style={{ color: "#6E6E90" }}>Total waktu nonton</p>
            </div>
            <div className="p-3 rounded-xl" style={{ background: "rgba(167,139,250,0.08)", border: "1px solid rgba(167,139,250,0.18)" }}>
              <p className="text-sm font-bold truncate" style={{ color: "#A78BFA" }}>
                {watchStats.longestFollowed ? watchStats.longestFollowed.title : "—"}
              </p>
              <p className="text-[10px] mt-0.5" style={{ color: "#6E6E90" }}>
                {watchStats.longestFollowed ? `Diikuti ${watchStats.longestFollowed.days} hari — anime paling lama` : "Belum ada anime diikuti"}
              </p>
            </div>
          </div>
        </div>

        {favorites.length > 0 && (
          <div className="p-3 rounded-xl"
            style={{ background: "rgba(15,15,27,0.6)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-sm font-bold text-white mb-1">Favorit</p>
            <p className="text-xs" style={{ color: "#6E6E90" }}>{favorites.length} anime ditandai favorit</p>
          </div>
        )}
      </div>

      {rankUp && <RankUpOverlay fromRank={rankUp.from} toRank={rankUp.to} onDone={handleRankDone} />}
    </div>
  );
}
