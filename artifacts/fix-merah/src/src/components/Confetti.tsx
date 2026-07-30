import { useEffect, useRef } from "react";

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  color: string;
  size: number;
  rot: number; rotV: number;
  life: number; maxLife: number;
  shape: "rect" | "circle";
}

const COLORS = ["#ff003c","#00ff88","#00e5ff","#b44bff","#ffcc00","#ff6b35","#ffffff","#ff69b4"];

export function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);
  const particles = useRef<Particle[]>([]);

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(rafRef.current);
      particles.current = [];
      const c = canvasRef.current;
      if (c) { const ctx = c.getContext("2d"); ctx?.clearRect(0, 0, c.width, c.height); }
      return;
    }

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    // Burst from center-top
    const cx = canvas.width / 2;
    for (let i = 0; i < 180; i++) {
      const angle = (Math.random() * Math.PI * 2);
      const speed = 4 + Math.random() * 14;
      particles.current.push({
        x: cx + (Math.random() - 0.5) * 200,
        y: canvas.height * 0.35,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - Math.random() * 8,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 5 + Math.random() * 9,
        rot: Math.random() * Math.PI * 2,
        rotV: (Math.random() - 0.5) * 0.25,
        life: 0,
        maxLife: 90 + Math.random() * 80,
        shape: Math.random() > 0.4 ? "rect" : "circle",
      });
    }

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      for (const p of particles.current) {
        p.life++;
        if (p.life > p.maxLife) continue;
        alive = true;
        p.vy += 0.32; // gravity
        p.vx *= 0.99;
        p.x += p.vx; p.y += p.vy;
        p.rot += p.rotV;
        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === "circle") {
          ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      }
      if (alive) rafRef.current = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    draw();

    return () => { cancelAnimationFrame(rafRef.current); };
  }, [active]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 100 }}
    />
  );
}
