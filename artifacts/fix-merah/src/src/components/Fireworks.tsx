import { useEffect, useRef } from "react";

interface Spark {
  x: number; y: number;
  vx: number; vy: number;
  color: string; alpha: number;
  life: number; maxLife: number; tail: [number,number][];
}
interface Shell { x: number; y: number; vy: number; color: string; launched: boolean; }

const FW_COLORS = ["#ff003c","#00ff88","#00e5ff","#ffcc00","#b44bff","#ff6b35","#ff69b4","#ffffff"];

export function Fireworks({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    if (!active) {
      cancelAnimationFrame(rafRef.current);
      const c = canvasRef.current;
      if (c) { const ctx = c.getContext("2d"); ctx?.clearRect(0, 0, c.width, c.height); }
      return;
    }

    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const sparks: Spark[] = [];
    let frameCount = 0;

    function burst(bx: number, by: number, color: string) {
      const count = 60 + Math.floor(Math.random() * 50);
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.3;
        const speed = 2 + Math.random() * 6;
        sparks.push({
          x: bx, y: by,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color,
          alpha: 1,
          life: 0, maxLife: 45 + Math.floor(Math.random() * 35),
          tail: [],
        });
      }
    }

    // Schedule 5 bursts
    const bursts = [
      [0.25, 0.4], [0.75, 0.3], [0.5, 0.25], [0.2, 0.55], [0.8, 0.45],
    ] as [number,number][];
    bursts.forEach(([fx, fy], i) => {
      setTimeout(() => {
        burst(canvas.width * fx, canvas.height * fy, FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)]);
      }, i * 300);
    });

    function draw() {
      frameCount++;
      ctx.fillStyle = "rgba(0,0,0,0.18)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let alive = false;
      for (const s of sparks) {
        s.life++;
        if (s.life > s.maxLife) continue;
        alive = true;
        s.tail.push([s.x, s.y]);
        if (s.tail.length > 5) s.tail.shift();
        s.vy += 0.12;
        s.vx *= 0.97;
        s.x += s.vx; s.y += s.vy;
        s.alpha = Math.max(0, 1 - s.life / s.maxLife);

        // Trail
        for (let t = 1; t < s.tail.length; t++) {
          ctx.save();
          ctx.globalAlpha = (t / s.tail.length) * s.alpha * 0.4;
          ctx.strokeStyle = s.color;
          ctx.lineWidth   = 1;
          ctx.beginPath();
          ctx.moveTo(s.tail[t-1][0], s.tail[t-1][1]);
          ctx.lineTo(s.tail[t][0], s.tail[t][1]);
          ctx.stroke();
          ctx.restore();
        }

        // Spark dot
        ctx.save();
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle   = s.color;
        ctx.shadowColor = s.color;
        ctx.shadowBlur  = 4;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      if (alive || frameCount < 200) rafRef.current = requestAnimationFrame(draw);
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
