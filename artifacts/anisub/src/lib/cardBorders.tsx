import type { CSSProperties } from "react";

// ── Luxury flowing gradient border system (shared by AnimeCard + Seasons) ─────
// Border "milik" anime itu sendiri, bukan acak per render.

const VARIANTS: { glow: string }[] = [
  { glow: "#FFD700" }, // 0: Golden Crown
  { glow: "#42A5F5" }, // 1: Royal Sapphire
  { glow: "#F48FB1" }, // 2: Rose Gold Elite
  { glow: "#00C853" }, // 3: Emerald Prestige
  { glow: "#B3E5FC" }, // 4: Frost Diamond
  { glow: "#FF1744" }, // 5: Blood Crimson
  { glow: "#CE93D8" }, // 6: Amethyst Mystic
  { glow: "#FF006E" }, // 7: Aurora Spectrum
  { glow: "#CFD8DC" }, // 8: Platinum Elite
  { glow: "#00E5FF" }, // 9: Neon Hologram
];

const BORDER_CSS = `
/* === Luxury flowing gradient border + accents — dipakai AnimeCard & Seasons === */
@keyframes lux-flow{0%,100%{background-position:0% 50%}33%{background-position:66% 0%}66%{background-position:100% 50%}}
@keyframes lux-glow-pulse{0%,100%{opacity:1}50%{opacity:.72}}
.lux-wrap{border-radius:14px;padding:2.5px;background-size:400% 400%;position:relative}
.lux-v0{background:linear-gradient(135deg,#8B6914,#FFD700,#FFA500,#FFEC00,#FFF8B2,#FFA500,#B8860B,#FFD700);box-shadow:0 0 16px rgba(255,215,0,.7),0 0 36px rgba(255,165,0,.45),0 0 64px rgba(255,100,0,.22),0 0 90px rgba(255,200,0,.1);animation:lux-flow 4s ease-in-out infinite}
.lux-v1{background:linear-gradient(135deg,#0D47A1,#1E88E5,#42A5F5,#E3F2FD,#90CAF9,#1565C0,#0D47A1,#42A5F5);box-shadow:0 0 16px rgba(30,136,229,.72),0 0 36px rgba(13,71,161,.48),0 0 64px rgba(30,136,229,.22),0 0 90px rgba(66,165,245,.1);animation:lux-flow 3s ease-in-out infinite}
.lux-v2{background:linear-gradient(135deg,#880E4F,#F48FB1,#FCE4EC,#FFD54F,#F8BBD0,#AD1457,#F48FB1,#FFD54F);box-shadow:0 0 16px rgba(244,143,177,.68),0 0 34px rgba(255,213,79,.42),0 0 60px rgba(233,30,99,.2),0 0 88px rgba(255,213,79,.1);animation:lux-flow 4.5s ease-in-out infinite}
.lux-v3{background:linear-gradient(135deg,#1B5E20,#00C853,#69F0AE,#00E5FF,#80CBC4,#00695C,#00C853,#69F0AE);box-shadow:0 0 16px rgba(0,200,83,.68),0 0 34px rgba(0,229,255,.42),0 0 60px rgba(0,150,60,.22),0 0 88px rgba(0,229,255,.1);animation:lux-flow 3.5s ease-in-out infinite}
.lux-v4{background:linear-gradient(135deg,#90CAF9,#E3F2FD,#FFFFFF,#B3E5FC,#FFFFFF,#BBDEFB,#E3F2FD,#FFFFFF);box-shadow:0 0 12px rgba(179,229,252,.65),0 0 28px rgba(255,255,255,.45),0 0 52px rgba(144,202,249,.22),0 0 80px rgba(179,229,252,.1);animation:lux-flow 5.5s ease-in-out infinite}
.lux-v5{background:linear-gradient(135deg,#7F0000,#FF1744,#FF6D00,#FF8F00,#FF1744,#B71C1C,#FF1744,#FF6D00);box-shadow:0 0 18px rgba(255,23,68,.78),0 0 40px rgba(255,109,0,.52),0 0 70px rgba(183,28,28,.3),0 0 100px rgba(255,23,68,.12);animation:lux-flow 2.5s ease-in-out infinite}
.lux-v6{background:linear-gradient(135deg,#4A148C,#7B1FA2,#CE93D8,#E040FB,#BA68C8,#6A1B9A,#CE93D8,#E040FB);box-shadow:0 0 16px rgba(171,71,188,.7),0 0 36px rgba(206,147,216,.45),0 0 64px rgba(74,20,140,.25),0 0 90px rgba(206,147,216,.1);animation:lux-flow 4s ease-in-out infinite}
.lux-v7{background:linear-gradient(135deg,#FF006E,#FF6B00,#FFD700,#00E676,#00E5FF,#7C4DFF,#FF006E,#FF6B00);box-shadow:0 0 16px rgba(255,0,110,.65);box-shadow:0 0 34px rgba(0,229,255,.42),0 0 60px rgba(124,77,255,.25),0 0 88px rgba(255,0,110,.1);animation:lux-flow 2.8s linear infinite}
.lux-v8{background:linear-gradient(135deg,#546E7A,#CFD8DC,#FFFFFF,#ECEFF1,#FFFFFF,#90A4AE,#CFD8DC,#FFFFFF);box-shadow:0 0 12px rgba(207,216,220,.6),0 0 28px rgba(255,255,255,.38),0 0 52px rgba(176,190,197,.2),0 0 80px rgba(236,239,241,.08);animation:lux-flow 5.5s ease-in-out infinite}
.lux-v9{background:linear-gradient(135deg,#00E5FF,#00FFAA,#FF00FF,#00E5FF,#7C4DFF,#00FF88,#FF00FF,#00E5FF);box-shadow:0 0 18px rgba(0,229,255,.78),0 0 40px rgba(255,0,255,.52),0 0 70px rgba(0,255,136,.3),0 0 100px rgba(0,229,255,.12);animation:lux-flow 2s linear infinite}
@keyframes corner-spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
@keyframes corner-spin-rev { 0%{transform:rotate(0deg)} 100%{transform:rotate(-360deg)} }
@keyframes tamat-shimmer { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
@keyframes tamat-seal-glow { 0%,100%{filter:drop-shadow(0 0 4px rgba(255,215,0,0.7))} 50%{filter:drop-shadow(0 0 9px rgba(255,215,0,0.95))} }
@keyframes neweps-pulse { 0%,100%{box-shadow:0 0 6px rgba(124,58,237,.55),0 0 14px rgba(139,92,246,.35)} 50%{box-shadow:0 0 12px rgba(167,139,250,.85),0 0 26px rgba(139,92,246,.55)} }
@keyframes neweps-live-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.35;transform:scale(.7)} }
@keyframes newrilis-shimmer { 0%{background-position:0% 50%} 100%{background-position:200% 50%} }
@keyframes newrilis-flare { 0%,100%{box-shadow:0 0 7px rgba(255,107,0,.6),0 0 16px rgba(255,61,0,.4)} 50%{box-shadow:0 0 13px rgba(255,159,0,.9),0 0 28px rgba(255,61,0,.6)} }
@keyframes countdown-glow { 0%,100%{box-shadow:0 0 6px rgba(96,165,250,.25),inset 0 0 0 1px rgba(96,165,250,.3)} 50%{box-shadow:0 0 12px rgba(96,165,250,.45),inset 0 0 0 1px rgba(96,165,250,.5)} }
@keyframes countdown-blink { 0%,49%{opacity:1} 50%,100%{opacity:.25} }
@keyframes season-glow {
  0%,100% { box-shadow: 0 0 6px rgba(96,165,250,.25), inset 0 0 0 1px rgba(96,165,250,.3); }
  50%      { box-shadow: 0 0 16px rgba(96,165,250,.5), inset 0 0 0 1px rgba(96,165,250,.55); }
}
@keyframes season-pulse { 0%,100%{opacity:1} 50%{opacity:.6} }
@keyframes shimmer-gold { 0%{background-position: 0% 50%} 100%{background-position: 200% 50%} }
`;

let _styleInjected = false;
function injectBorderStyles() {
  if (_styleInjected || typeof document === "undefined") return;
  _styleInjected = true;
  const el = document.createElement("style");
  el.textContent = BORDER_CSS;
  document.head.appendChild(el);
}

function hashId(s: string | number): number {
  const key = String(s);
  let h = 5381;
  for (let i = 0; i < key.length; i++) h = ((h << 5) + h) ^ key.charCodeAt(i);
  return Math.abs(h) % 10;
}

/** Dua titik cahaya di pojok (top-left + bottom-right) — muncul hanya di variant 0/2/5/6/8. */
function CornerAccents({ color, variant }: { color: string; variant: number }) {
  const spinDir = variant % 2 === 0 ? "corner-spin" : "corner-spin-rev";
  const dur = (3 + (variant % 5) * 0.8).toFixed(1) + "s";
  const dotSize = 4 + (variant % 3);
  const style: CSSProperties = {
    position: "absolute", width: dotSize, height: dotSize, borderRadius: "50%",
    background: color, boxShadow: `0 0 6px ${color}, 0 0 12px ${color}`,
    pointerEvents: "none", zIndex: 5,
  };
  if (variant % 3 !== 0) return null;
  return (
    <>
      <span style={{ ...style, top: -dotSize / 2, left: -dotSize / 2, animation: `${spinDir} ${dur} linear infinite` }} />
      <span style={{ ...style, bottom: -dotSize / 2, right: -dotSize / 2, animation: `${spinDir} ${dur} linear infinite reverse` }} />
    </>
  );
}

export { BORDER_CSS, VARIANTS, hashId, injectBorderStyles, CornerAccents };
