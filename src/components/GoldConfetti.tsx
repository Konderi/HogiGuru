import { useEffect, useRef } from 'react';

/** Kultainen konfettisade + ilotulitusräjähdykset koko näytön päälle (canvas, ei riippuvuuksia). */
export default function GoldConfetti({ duration = 10000 }: { duration?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext('2d')!;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => { cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); addEventListener('resize', resize);
    const golds = ['#facc15', '#fde047', '#eab308', '#fbbf24', '#fff7d6', '#d4a017'];
    type P = { x: number; y: number; vx: number; vy: number; r: number; rot: number; vr: number; c: string; life: number; spark?: boolean };
    const ps: P[] = [];
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const start = performance.now();
    const burst = () => {
      const x = rnd(innerWidth * 0.15, innerWidth * 0.85), y = rnd(innerHeight * 0.1, innerHeight * 0.45);
      for (let i = 0; i < 70; i++) { const a = rnd(0, Math.PI * 2), s = rnd(2, 7); ps.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: rnd(1.5, 3), rot: 0, vr: 0, c: golds[i % golds.length], life: rnd(50, 90), spark: true }); }
    };
    let raf = 0, lastBurst = 0;
    const tick = (t: number) => {
      const el = t - start, active = el < duration;
      if (active) {
        for (let i = 0; i < 6; i++) ps.push({ x: rnd(0, innerWidth), y: -10, vx: rnd(-1, 1), vy: rnd(2, 4.5), r: rnd(4, 9), rot: rnd(0, 6), vr: rnd(-0.2, 0.2), c: golds[(Math.random() * golds.length) | 0], life: 600 });
        if (t - lastBurst > 900) { burst(); lastBurst = t; }
      }
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life--;
        if (p.spark) { p.vy += 0.06; p.vx *= 0.98; } else { p.vx += Math.sin((t + i) / 300) * 0.03; }
        if (p.life <= 0 || p.y > innerHeight + 20) { ps.splice(i, 1); continue; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.c;
        if (p.spark) { ctx.globalAlpha = Math.min(1, p.life / 40); ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2 * (0.4 + Math.abs(Math.sin(p.rot)))); }
        ctx.restore();
      }
      if (active || ps.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', resize); };
  }, [duration]);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-[60]" aria-hidden />;
}
