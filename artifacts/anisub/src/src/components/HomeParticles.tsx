import { useEffect, useRef } from "react";

/* ── Tiny random sparkle text (✦ ✧ ★ ✵ ·) scattered on home ── */
const SPARKLE_GLYPHS = ["✦", "✧", "★", "✵", "·", "⋆", "✴", "✷"];
const SPARKLE_COLORS = [
  "#60A5FA", "#A78BFA", "#F472B6", "#34D399",
  "#FBBF24", "#22D3EE", "#FB923C", "#ffffff",
];

const SPARKLES = Array.from({ length: 22 }, (_, i) => ({
  id: i,
  glyph: SPARKLE_GLYPHS[i % SPARKLE_GLYPHS.length],
  color: SPARKLE_COLORS[i % SPARKLE_COLORS.length],
  left: `${(i * 17 + 5) % 96}%`,
  top: `${(i * 23 + 8) % 88}%`,
  fontSize: 6 + (i % 5) * 2,          // 6–14 px
  duration: 2.2 + (i % 7) * 0.6,      // 2.2–6.4 s
  delay: -(i * 0.45),                  // stagger
  blur: i % 4 === 0 ? "blur(0.5px)" : "none",
}));

/* ── Canvas: falling micro-stars + shooting stars ── */
interface Particle { x: number; y: number; vy: number; vx: number; r: number; alpha: number; color: string; }
interface Shooter { x: number; y: number; vx: number; vy: number; len: number; alpha: number; color: string; life: number; }

const STAR_COLORS = ["rgba(96,165,250,", "rgba(167,139,250,", "rgba(244,114,182,", "rgba(255,255,255,", "rgba(52,211,153,", "rgba(251,191,36,"];

function randomStarColor() { return STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)]; }

export default function HomeParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0, H = 0;
    const resize = () => {
      W = canvas.width  = window.innerWidth;
      H = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    /* Create falling star particles */
    const particles: Particle[] = Array.from({ length: 38 }, () => ({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      vy: 0.18 + Math.random() * 0.32,
      vx: (Math.random() - 0.5) * 0.12,
      r: 0.5 + Math.random() * 1.2,
      alpha: 0.12 + Math.random() * 0.35,
      color: randomStarColor(),
    }));

    const shooters: Shooter[] = [];
    let shootTimer = 0;

    const spawnShooter = () => {
      shooters.push({
        x: Math.random() * W * 0.7,
        y: Math.random() * H * 0.4,
        vx: 3 + Math.random() * 4,
        vy: 1.5 + Math.random() * 2.5,
        len: 40 + Math.random() * 60,
        alpha: 0.7,
        color: STAR_COLORS[Math.floor(Math.random() * STAR_COLORS.length)],
        life: 1,
      });
    };

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      /* Falling stars */
      for (const p of particles) {
        p.y += p.vy;
        p.x += p.vx;
        if (p.y > H) { p.y = -4; p.x = Math.random() * W; }
        if (p.x > W || p.x < 0) { p.x = Math.random() * W; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color + p.alpha + ")";
        ctx.fill();
      }

      /* Shooting stars */
      shootTimer++;
      if (shootTimer > 220 + Math.random() * 180) { spawnShooter(); shootTimer = 0; }
      for (let i = shooters.length - 1; i >= 0; i--) {
        const s = shooters[i];
        s.x += s.vx; s.y += s.vy; s.alpha -= 0.018; s.life -= 0.018;
        if (s.alpha <= 0) { shooters.splice(i, 1); continue; }
        const grad = ctx.createLinearGradient(s.x - s.vx * 8, s.y - s.vy * 8, s.x, s.y);
        grad.addColorStop(0, s.color + "0)");
        grad.addColorStop(1, s.color + s.alpha + ")");
        ctx.beginPath();
        ctx.moveTo(s.x - s.vx * 8, s.y - s.vy * 8);
        ctx.lineTo(s.x, s.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        /* tip dot */
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = s.color + s.alpha + ")";
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <>
      {/* Canvas: falling stars + shooting stars */}
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed", inset: 0, width: "100%", height: "100%",
          pointerEvents: "none", zIndex: 0, opacity: 0.85,
        }}
      />

      {/* Floating text sparkles scattered everywhere */}
      {SPARKLES.map((s) => (
        <span
          key={s.id}
          style={{
            position: "fixed",
            left: s.left,
            top: s.top,
            fontSize: s.fontSize,
            color: s.color,
            pointerEvents: "none",
            zIndex: 0,
            userSelect: "none",
            filter: `drop-shadow(0 0 4px ${s.color}) ${s.blur}`,
            animation: `sparkle-float ${s.duration}s ${s.delay}s ease-in-out infinite`,
            willChange: "opacity, transform",
          }}
        >
          {s.glyph}
        </span>
      ))}

      {/* Injected keyframes */}
      <style>{`
        @keyframes sparkle-float {
          0%,100% { opacity:0; transform:scale(0.6) translateY(0px) rotate(0deg); }
          25%      { opacity:0.85; transform:scale(1.1) translateY(-6px) rotate(8deg); }
          50%      { opacity:0.55; transform:scale(0.9) translateY(-10px) rotate(-4deg); }
          75%      { opacity:0.9; transform:scale(1.2) translateY(-4px) rotate(12deg); }
        }
      `}</style>
    </>
  );
}
