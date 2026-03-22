import { useState, useEffect, useRef } from 'react';

/** Detects prefers-reduced-motion */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mql.matches);
    const handler = (e) => setReduced(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);
  return reduced;
}

/** Typing effect that cycles through strings */
export function useTypewriter(texts, { typeSpeed = 70, deleteSpeed = 40, pauseTime = 2400 } = {}) {
  const [display, setDisplay] = useState('');
  const [idx, setIdx] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) { setDisplay(texts[0]); return; }
    const cur = texts[idx];
    const speed = deleting ? deleteSpeed : typeSpeed;
    const timer = setTimeout(() => {
      if (!deleting) {
        setDisplay(cur.slice(0, display.length + 1));
        if (display.length === cur.length) setTimeout(() => setDeleting(true), pauseTime);
      } else {
        setDisplay(cur.slice(0, display.length - 1));
        if (display.length === 0) { setDeleting(false); setIdx((idx + 1) % texts.length); }
      }
    }, speed);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [display, deleting, idx, reduced]);

  return display;
}

/** Animated counter triggered by IntersectionObserver */
export function useCounter(target, duration = 1200) {
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);
  const ref = useRef(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setStarted(true); obs.disconnect(); }
    }, { threshold: 0.4 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (!started) return;
    if (reduced) { setCount(target); return; }
    let start = null;
    const step = (ts) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / duration, 1);
      setCount(Math.round((1 - Math.pow(1 - progress, 3)) * target));
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [started, target, duration, reduced]);

  return [ref, count];
}

/** Fade-in wrapper triggered by scroll, respects reduced motion */
export function useFadeIn(threshold = 0.08) {
  const [visible, setVisible] = useState(false);
  const ref = useRef(null);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (reduced) { setVisible(true); return; }
    if (!ref.current) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect(); }
    }, { threshold });
    obs.observe(ref.current);
    return () => obs.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  return [ref, visible, reduced];
}
