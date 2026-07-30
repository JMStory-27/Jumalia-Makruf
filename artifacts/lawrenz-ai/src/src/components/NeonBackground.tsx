import { useEffect, useRef } from "react";

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number; color: string;
  type: "star" | "data" | "pulse" | "orb";
  opacity: number;
}

const STAR_COLORS  = ["#00D4FF", "#8B5CF6", "#00FF94", "#38BDF8", "#A78BFA"];
const DATA_COLORS  = ["#00D4FF", "#8B5CF6", "#00FF94"];
const ORB_COLORS   = ["#00D4FF", "#8B5CF6", "#00FF94", "#0EA5E9"];

function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

export default function NeonBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef   = useRef<number>(0);
  const psRef     = useRef<Particle[]>([]);
  const timeRef   = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W; canvas.height = H;
    };
    window.addEventListener("resize", onResize);

    function spawn(w: number, h: number, aged = false) {
      const roll = Math.random();
      const type: Particle["type"] = roll < 0.58 ? "star" : roll < 0.76 ? "data" : roll < 0.90 ? "pulse" : "orb";
      const maxLife = type === "orb" ? 700 + Math.random() * 900 : 220 + Math.random() * 320;
      const orbColor = pick(ORB_COLORS);
      psRef.current.push({
        x: Math.random() * w, y: Math.random() * h,
        vx: (Math.random() - 0.5) * (type === "orb" ? 0.10 : 0.3),
        vy: (Math.random() - 0.5) * (type === "orb" ? 0.07 : 0.28),
        life: aged ? Math.random() * maxLife : 0,
        maxLife,
        size: type === "orb"
          ? 50 + Math.random() * 80
          : type === "pulse"
            ? 2 + Math.random() * 3.5
            : 0.5 + Math.random() * 2,
        color: type === "orb" ? orbColor : pick(type === "data" ? DATA_COLORS : STAR_COLORS),
        type,
        opacity: 0,
      });
    }

    const baseCount = Math.min(90, Math.floor((W * H) / 13000));
    for (let i = 0; i < baseCount; i++) spawn(W, H, true);
    for (let i = 0; i < 6; i++) spawn(W, H, true);

    const DATA_CHARS = "01アカキクケコ▮▯◈◇◆⬡⬢∞≈∑ΩΨΦ";

    const draw = () => {
      timeRef.current += 0.004;
      const t = timeRef.current;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = "rgba(1,8,18,0.042)";
      ctx.fillRect(0, 0, W, H);

      /* ── Orbs ── */
      const orbs = psRef.current.filter(p => p.type === "orb");
      orbs.forEach(p => {
        const prog = p.life / p.maxLife;
        const a = Math.sin(prog * Math.PI) * 0.14;
        if (a <= 0.005) return;
        const [r, g, b] = hexToRgb(p.color);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        grad.addColorStop(0,   `rgba(${r},${g},${b},${a * 0.7})`);
        grad.addColorStop(0.35,`rgba(${r},${g},${b},${a * 0.35})`);
        grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      /* ── Aurora ribbons — top ── */
      for (let i = 0; i < 3; i++) {
        const offset = i * 240;
        const wave   = Math.sin(t * 0.65 + i * 1.3) * 35;
        const grad   = ctx.createLinearGradient(0, H * 0.07 + wave - 70, 0, H * 0.07 + wave + 70);
        const alpha  = 0.022 + Math.sin(t * 0.45 + i) * 0.01;
        const cols   = ["0,212,255", "139,92,246", "0,255,148"];
        grad.addColorStop(0,   `rgba(${cols[i]},0)`);
        grad.addColorStop(0.5, `rgba(${cols[i]},${alpha})`);
        grad.addColorStop(1,   `rgba(${cols[i]},0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(offset + Math.sin(t + i) * 90, H * 0.07 + wave - 70, W * 0.7, 140);
      }

      /* ── Aurora ribbon — bottom right ── */
      {
        const wave = Math.sin(t * 0.55 + 2.5) * 22;
        const grad = ctx.createLinearGradient(W * 0.35, H * 0.88 + wave - 55, W, H * 0.88 + wave + 55);
        grad.addColorStop(0,   "rgba(139,92,246,0)");
        grad.addColorStop(0.5, `rgba(139,92,246,${0.02 + Math.sin(t * 0.38) * 0.008})`);
        grad.addColorStop(1,   "rgba(0,212,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(W * 0.35, H * 0.88 + wave - 55, W * 0.65, 110);
      }

      /* ── Particles ── */
      const maxCount = Math.min(100, Math.floor((W * H) / 11000));
      while (psRef.current.length < maxCount) spawn(W, H, false);

      psRef.current = psRef.current.filter(p => {
        p.life += 1;
        p.x    += p.vx;
        p.y    += p.vy;

        if (p.x < -p.size * 2)  p.x = W + p.size * 2;
        if (p.x > W + p.size * 2) p.x = -p.size * 2;
        if (p.y < -p.size * 2)  p.y = H + p.size * 2;
        if (p.y > H + p.size * 2) p.y = -p.size * 2;

        const prog  = p.life / p.maxLife;
        const alpha = Math.sin(prog * Math.PI) * (p.type === "orb" ? 1 : 0.8);
        if (alpha <= 0.008) return false;

        ctx.save();
        ctx.globalAlpha = alpha;

        if (p.type === "star") {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.shadowBlur  = p.size > 1.2 ? 14 : 7;
          ctx.shadowColor = p.color;
          ctx.fill();

        } else if (p.type === "data") {
          const now  = performance.now();
          const char = DATA_CHARS[Math.floor(now / 260 + p.x * 13) % DATA_CHARS.length];
          ctx.font        = `${7 + p.size * 2.2}px "JetBrains Mono", monospace`;
          ctx.fillStyle   = p.color;
          ctx.shadowBlur  = 8;
          ctx.shadowColor = p.color;
          ctx.fillText(char, p.x, p.y);

        } else if (p.type === "pulse") {
          const r = Math.max(0.1, p.size + Math.sin(p.life * 0.13) * 3);
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth   = 0.8;
          ctx.shadowBlur  = 16;
          ctx.shadowColor = p.color;
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
        }

        ctx.restore();
        return true;
      });

      /* ── Constellation lines ── */
      const stars = psRef.current.filter(p => p.type === "star" && p.size > 0.7);
      for (let i = 0; i < Math.min(stars.length, 45); i++) {
        for (let j = i + 1; j < Math.min(stars.length, 45); j++) {
          const dx = stars[i].x - stars[j].x;
          const dy = stars[i].y - stars[j].y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < 140) {
            ctx.save();
            ctx.globalAlpha = (1 - d / 140) * 0.1;
            ctx.beginPath();
            ctx.moveTo(stars[i].x, stars[i].y);
            ctx.lineTo(stars[j].x, stars[j].y);
            ctx.strokeStyle = stars[i].color;
            ctx.lineWidth   = 0.45;
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return (
    <>
      <div className="neon-grid-bg" />
      <div className="scan-line" />
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed", inset: 0,
          width: "100%", height: "100%",
          pointerEvents: "none", zIndex: 0,
          opacity: 0.75,
        }}
      />
    </>
  );
}
