import { useEffect, useRef } from "react";

const CHARS = "アイウエオカキクケコサシスセソ01アイウエ";

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.innerWidth < 1024) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const FONT = 13;
    let drops: number[] = [];

    const dots: { x: number; y: number; r: number; dx: number; dy: number; a: number }[] = [];
    for (let i = 0; i < 30; i++) {
      dots.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        r: Math.random() * 1.2 + 0.3,
        dx: (Math.random() - .5) * .18,
        dy: (Math.random() - .5) * .18,
        a: Math.random() * .35 + .1,
      });
    }

    function resize() {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      drops = Array.from({ length: Math.floor(canvas!.width / FONT) }, () => Math.random() * -60);
    }
    resize();
    window.addEventListener("resize", resize);

    let frame = 0;
    let lastTime = 0;
    let raf: number;

    function draw(now: number) {
      raf = requestAnimationFrame(draw);
      if (now - lastTime < 50) return;
      lastTime = now;
      frame++;

      ctx.fillStyle = "rgba(6,0,15,0.93)";
      ctx.fillRect(0, 0, canvas!.width, canvas!.height);

      const t = now / 5000;
      const orbs: [number, number, number, string][] = [
        [canvas!.width * 0.08 + Math.sin(t) * 25,  canvas!.height * 0.15 + Math.cos(t * .7) * 18, 300, "168,85,247"],
        [canvas!.width * 0.88 + Math.cos(t) * 20,  canvas!.height * 0.75 + Math.sin(t * .8) * 15, 240, "34,211,238"],
        [canvas!.width * 0.5  + Math.sin(t * .5) * 30, canvas!.height * 0.45 + Math.cos(t * .6) * 22, 160, "249,115,22"],
      ];
      for (const [ox, oy, r, c] of orbs) {
        const grd = ctx.createRadialGradient(ox, oy, 0, ox, oy, r);
        grd.addColorStop(0, `rgba(${c},0.04)`);
        grd.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(ox, oy, r, 0, Math.PI * 2); ctx.fill();
      }

      for (const d of dots) {
        ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(168,85,247,${d.a})`; ctx.fill();
        d.x += d.dx; d.y += d.dy;
        if (d.x < 0 || d.x > canvas!.width)  d.dx *= -1;
        if (d.y < 0 || d.y > canvas!.height) d.dy *= -1;
      }

      if (frame % 2 === 0) {
        ctx.font = `${FONT}px 'JetBrains Mono', monospace`;
        for (let i = 0; i < drops.length; i++) {
          if (drops[i] < 0) { drops[i] += .35; continue; }
          const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
          ctx.fillStyle = `rgba(140,60,220,${.04 + Math.random() * .06})`;
          ctx.fillText(ch, i * FONT, drops[i] * FONT);
          if (drops[i] * FONT > canvas!.height && Math.random() > .975) drops[i] = 0;
          else drops[i] += .5;
        }
      }
    }

    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);

  if (typeof window !== "undefined" && window.innerWidth < 1024) return null;
  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none" style={{ zIndex: 0, opacity: 0.85 }} />;
}
