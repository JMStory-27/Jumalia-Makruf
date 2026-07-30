import { useState } from "react";
import { X } from "lucide-react";
import { markOnboardingSeen } from "@/lib/storage";

const BASE = import.meta.env.BASE_URL;

const SLIDES = [
  {
    img: `${BASE}guide/home2.jpg`,
    color: "#FF6B00",
    title: "Selamat Datang di Lawnime! 🎌",
    desc: "Nonton anime sub Indo gratis, tanpa iklan. Di halaman utama kamu bisa lihat update terbaru, banner anime, dan akses cepat ke semua fitur.",
    highlights: ["🔥 Update Terbaru — anime yang baru rilis episode", "⭐ Top Rating — anime terbaik minggu ini", "🎭 Genre — temukan anime favoritmu"],
  },
  {
    img: `${BASE}guide/home.jpg`,
    color: "#60A5FA",
    title: "Tombol di Pojok Kanan Atas 🔔",
    desc: "Di pojok kanan atas ada tiga tombol penting yang bisa kamu gunakan kapan saja.",
    highlights: ["🔍 Cari anime — pencarian by judul atau genre", "🔔 Notifikasi — episode baru & pesan dari admin", "👤 Profil — lihat rank, XP, dan ganti avatar"],
  },
  {
    img: `${BASE}guide/detail.jpg`,
    color: "#A78BFA",
    title: "Halaman Detail Anime 📖",
    desc: "Klik anime mana saja untuk melihat info lengkap. Di sini ada sinopsis, daftar episode, status watchlist, dan banyak lagi.",
    highlights: ["▶️ Mulai Tonton — langsung ke episode pertama", "📌 Tambah Daftar — simpan untuk ditonton nanti", "🍿 Nobar Anime Ini — nonton bareng teman"],
  },
  {
    img: `${BASE}guide/watch.jpg`,
    color: "#34D399",
    title: "Halaman Nonton 🎬",
    desc: "Pilih server terbaik untuk streaming. Ada fitur Skip OP otomatis dan Auto Next ke episode berikutnya.",
    highlights: ["⏭️ Skip OP — lewati opening secara otomatis", "▶️ Auto Next — lanjut episode tanpa klik", "🖥️ Ganti Server — jika video tidak bisa diputar"],
  },
  {
    img: `${BASE}guide/nobar.jpg`,
    color: "#F472B6",
    title: "NOBAR — Nonton Bareng! 🍿",
    desc: "Buat atau gabung room untuk nonton bareng hingga 5 orang. Bagikan kode 4 angka ke temanmu dan nikmati bersama!",
    highlights: ["🏠 Buat Room — kamu jadi host, pilih animenya", "🔗 Gabung Room — masukkan kode dari temanmu", "📲 Max 5 orang — satu room, satu sesi nonton"],
  },
];

export default function OnboardingGuide({ onDone }: { onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const [imgErr, setImgErr] = useState(false);
  const isLast = idx === SLIDES.length - 1;
  const slide = SLIDES[idx];

  const handleDone = () => { markOnboardingSeen(); onDone(); };
  const handleNext = () => { setImgErr(false); setIdx(i => i + 1); };
  const handlePrev = () => { setImgErr(false); setIdx(i => Math.max(0, i - 1)); };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center"
      style={{ background: "rgba(0,0,0,0.88)", backdropFilter: "blur(10px)" }}
    >
      <div
        className="w-full max-w-md mx-auto rounded-t-3xl overflow-hidden"
        style={{
          background: "linear-gradient(160deg, #0e0e22 0%, #07070e 100%)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderBottom: "none",
          maxHeight: "92vh",
          animation: "slide-up-fade 0.4s ease both",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Top bar with X */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 16px 0" }}>
          <div style={{ display: "flex", gap: 5 }}>
            {SLIDES.map((_, i) => (
              <button key={i} onClick={() => { setImgErr(false); setIdx(i); }}
                style={{
                  height: 4, width: i === idx ? 22 : 6, borderRadius: 999,
                  background: i === idx
                    ? `linear-gradient(90deg, ${slide.color}, ${slide.color}aa)`
                    : "rgba(255,255,255,0.15)",
                  transition: "all 0.3s ease",
                  boxShadow: i === idx ? `0 0 6px ${slide.color}66` : "none",
                }}
              />
            ))}
          </div>
          <button
            onClick={handleDone}
            style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer",
            }}
            title="Lewati panduan"
          >
            <X size={15} color="#94A3B8" />
          </button>
        </div>

        {/* Screenshot */}
        <div style={{ padding: "12px 16px 0", flex: "0 0 auto" }}>
          <div style={{
            borderRadius: 16, overflow: "hidden", border: `1.5px solid ${slide.color}44`,
            boxShadow: `0 0 24px ${slide.color}22`,
            aspectRatio: "9/16", maxHeight: "38vh",
            background: "rgba(255,255,255,0.03)",
            position: "relative",
          }}>
            {!imgErr ? (
              <img
                src={slide.img}
                alt={slide.title}
                onError={() => setImgErr(true)}
                style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }}
              />
            ) : (
              <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>
                🎌
              </div>
            )}
            {/* Color frame glow */}
            <div style={{
              position: "absolute", inset: 0, borderRadius: 16,
              boxShadow: `inset 0 0 0 1.5px ${slide.color}55`,
              pointerEvents: "none",
            }} />
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "16px 20px 0", flex: 1, overflowY: "auto" }}>
          <h2 style={{ fontSize: 17, fontWeight: 900, color: "#F8FAFC", marginBottom: 6, lineHeight: 1.3 }}>
            {slide.title}
          </h2>
          <p style={{ fontSize: 12, color: "#94A3B8", lineHeight: 1.6, marginBottom: 12 }}>
            {slide.desc}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {slide.highlights.map((h, i) => (
              <div key={i} style={{
                fontSize: 11, color: "#CBD5E1", padding: "6px 10px", borderRadius: 10,
                background: `${slide.color}0d`, border: `1px solid ${slide.color}22`,
              }}>
                {h}
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div style={{ padding: "16px 20px 32px", display: "flex", gap: 10, flexShrink: 0 }}>
          {idx > 0 ? (
            <button onClick={handlePrev}
              style={{
                flex: 1, padding: "12px 0", borderRadius: 14, fontSize: 13, fontWeight: 800,
                background: "rgba(255,255,255,0.06)", color: "#94A3B8", border: "none", cursor: "pointer",
              }}>
              ← Kembali
            </button>
          ) : (
            <button onClick={handleDone}
              style={{
                flex: 1, padding: "12px 0", borderRadius: 14, fontSize: 13, fontWeight: 800,
                background: "rgba(255,255,255,0.06)", color: "#64748B", border: "none", cursor: "pointer",
              }}>
              Lewati
            </button>
          )}
          {isLast ? (
            <button onClick={handleDone}
              style={{
                flex: 2, padding: "12px 0", borderRadius: 14, fontSize: 13, fontWeight: 900, color: "#fff",
                background: `linear-gradient(135deg, ${slide.color}, ${slide.color}cc)`,
                boxShadow: `0 4px 20px ${slide.color}44`, border: "none", cursor: "pointer",
              }}>
              Mulai Nonton! 🎉
            </button>
          ) : (
            <button onClick={handleNext}
              style={{
                flex: 2, padding: "12px 0", borderRadius: 14, fontSize: 13, fontWeight: 900, color: "#fff",
                background: `linear-gradient(135deg, ${slide.color}, ${slide.color}cc)`,
                boxShadow: `0 4px 20px ${slide.color}44`, border: "none", cursor: "pointer",
              }}>
              Lanjut →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
