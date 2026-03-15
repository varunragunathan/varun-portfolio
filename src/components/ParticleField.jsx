import { useRef, useEffect } from 'react';
import { useTheme } from '../hooks/useTheme';
import { usePrefersReducedMotion } from '../hooks/useAnimations';

export default function ParticleField() {
  const { t } = useTheme();
  const ref = useRef(null);
  const colorRef = useRef(t.particle);
  colorRef.current = t.particle;
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const c = ref.current;
    if (!c || reduced) return;

    const ctx = c.getContext('2d');
    let raf;
    const particles = [];
    const N = 40;
    let mouse = { x: -999, y: -999 };

    const resize = () => {
      const dpr = devicePixelRatio || 1;
      const rect = c.getBoundingClientRect();
      c.width = rect.width * dpr;
      c.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const rect = c.getBoundingClientRect();
    for (let i = 0; i < N; i++) {
      particles.push({
        x: Math.random() * rect.width,
        y: Math.random() * rect.height,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        rad: Math.random() * 1.1 + 0.4,
        a: Math.random() * 0.28 + 0.05,
      });
    }

    const onMove = (e) => {
      const b = c.getBoundingClientRect();
      mouse = { x: e.clientX - b.left, y: e.clientY - b.top };
    };
    const onLeave = () => { mouse = { x: -999, y: -999 }; };
    c.addEventListener('mousemove', onMove);
    c.addEventListener('mouseleave', onLeave);

    const draw = () => {
      const w = c.getBoundingClientRect().width;
      const h = c.getBoundingClientRect().height;
      const col = colorRef.current;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const dx = p.x - mouse.x, dy = p.y - mouse.y;
        const dm = Math.sqrt(dx * dx + dy * dy);
        if (dm < 85) {
          const f = (85 - dm) / 85;
          p.vx += (dx / dm) * f * 0.12;
          p.vy += (dy / dm) * f * 0.12;
        }
        p.vx *= 0.992; p.vy *= 0.992;
        p.x += p.vx; p.y += p.vy;
        if (p.x < -5) p.x = w + 5;
        if (p.x > w + 5) p.x = -5;
        if (p.y < -5) p.y = h + 5;
        if (p.y > h + 5) p.y = -5;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.rad, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${col},${p.a})`;
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const cx = p.x - q.x, cy = p.y - q.y;
          const d = Math.sqrt(cx * cx + cy * cy);
          if (d < 105) {
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(${col},${0.035 * (1 - d / 105)})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      c.removeEventListener('mousemove', onMove);
      c.removeEventListener('mouseleave', onLeave);
    };
  }, [reduced]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.5 }}
    />
  );
}
