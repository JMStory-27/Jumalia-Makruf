import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  type: "star" | "data" | "pulse";
}

const COLORS = ["#00d4ff", "#9d4edd", "#00ff88", "#ff79c6", "#bd93f9"];

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export default function NeonBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = window.innerWidth;
    let H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;

    const onResize = () => {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = W;
      canvas.height = H;
    };
    window.addEventListener("resize", onResize);

    // Initialize particles
    const initParticles = () => {
      particlesRef.current = [];
      const count = Math.min(60, Math.floor((W * H) / 18000));
      for (let i = 0; i < count; i++) {
        spawnParticle(W, H, true);
      }
    };

    function spawnParticle(w: number, h: number, aged = false) {
      const types: Particle["type"][] = ["star", "star", "star", "data", "pulse"];
      const type = types[Math.floor(Math.random() * types.length)];
      const maxLife = 180 + Math.random() * 240;
      const p: Particle = {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.4,
        vy: (Math.random() - 0.5) * 0.4,
        life: aged ? Math.random() * maxLife : 0,
        maxLife,
        size: type === "pulse" ? 2 + Math.random() * 3 : 0.5 + Math.random() * 1.5,
        color: randomColor(),
        type,
      };
      particlesRef.current.push(p);
    }

    initParticles();

    const DATA_CHARS = "01アイウエオカキクケコ▮▯◈◇◆⬡⬢";

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      // Fade trail
      ctx.fillStyle = "rgba(5,0,20,0.06)";
      ctx.fillRect(0, 0, W, H);

      const now = Date.now();
      const maxCount = Math.min(70, Math.floor((W * H) / 15000));

      // Spawn new particles if needed
      while (particlesRef.current.length < maxCount) {
        spawnParticle(W, H, false);
      }

      particlesRef.current = particlesRef.current.filter((p) => {
        p.life += 1;
        p.x += p.vx;
        p.y += p.vy;

        // Wrap edges
        if (p.x < -10) p.x = W + 10;
        if (p.x > W + 10) p.x = -10;
        if (p.y < -10) p.y = H + 10;
        if (p.y > H + 10) p.y = -10;

        const progress = p.life / p.maxLife;
        const alpha = Math.sin(progress * Math.PI) * 0.7;

        if (alpha <= 0.01) return false;

        ctx.save();
        ctx.globalAlpha = alpha;

        if (p.type === "star") {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.shadowBlur = 8;
          ctx.shadowColor = p.color;
          ctx.fill();
        } else if (p.type === "data") {
          const char = DATA_CHARS[Math.floor(now / 300 + p.x * 13) % DATA_CHARS.length];
          ctx.font = `${8 + p.size * 2}px JetBrains Mono, monospace`;
          ctx.fillStyle = p.color;
          ctx.shadowBlur = 6;
          ctx.shadowColor = p.color;
          ctx.fillText(char, p.x, p.y);
        } else if (p.type === "pulse") {
          const radius = p.size + Math.sin(p.life * 0.1) * 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 0.8;
          ctx.shadowBlur = 12;
          ctx.shadowColor = p.color;
          ctx.stroke();

          // Inner dot
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.fill();
        }

        ctx.restore();
        return true;
      });

      // Draw subtle connecting lines between close particles
      const stars = particlesRef.current.filter((p) => p.type === "star");
      for (let i = 0; i < stars.length; i++) {
        for (let j = i + 1; j < stars.length; j++) {
          const dx = stars[i].x - stars[j].x;
          const dy = stars[i].y - stars[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120) {
            const a = (1 - dist / 120) * 0.12;
            ctx.save();
            ctx.globalAlpha = a;
            ctx.beginPath();
            ctx.moveTo(stars[i].x, stars[i].y);
            ctx.lineTo(stars[j].x, stars[j].y);
            ctx.strokeStyle = stars[i].color;
            ctx.lineWidth = 0.5;
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
          position: "fixed",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
          zIndex: 0,
          opacity: 0.55,
        }}
      />
    </>
  );
}
