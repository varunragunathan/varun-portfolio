import React, { useRef, useEffect } from 'react';
import { useTheme } from '../hooks/useTheme';
import { usePrefersReducedMotion } from '../hooks/useAnimations.js';
import pkg from '../../package.json';

const LINE_H = 13; // px — matches 10px mono with natural leading
const M      = "'IBM Plex Mono', monospace";

function DigitSlot({ digit, delay }) {
  const ref     = useRef(null);
  const reduced = usePrefersReducedMotion();

  // Full 0–9 spin, then count up to the target digit
  const digits = [
    ...Array.from({ length: 10 }, (_, i) => i),
    ...Array.from({ length: digit + 1 }, (_, i) => i),
  ];
  const finalY = -(10 + digit) * LINE_H;

  useEffect(() => {
    if (reduced) {
      if (ref.current) ref.current.style.transform = `translateY(${finalY}px)`;
      return;
    }
    const timer = setTimeout(() => {
      if (!ref.current) return;
      let start = null;
      function step(ts) {
        if (!start) start = ts;
        const p    = Math.min((ts - start) / 800, 1);
        const ease = 1 - Math.pow(1 - p, 4); // quartic ease-out
        ref.current.style.transform = `translateY(${ease * finalY}px)`;
        if (p < 1) requestAnimationFrame(step);
        else ref.current.style.transform = `translateY(${finalY}px)`;
      }
      requestAnimationFrame(step);
    }, delay);
    return () => clearTimeout(timer);
  }, [digit, delay, reduced, finalY]);

  return (
    <span style={{ display: 'inline-block', height: LINE_H, overflow: 'hidden', verticalAlign: 'top' }}>
      <span ref={ref} style={{ display: 'flex', flexDirection: 'column' }}>
        {digits.map((d, i) => (
          <span key={i} style={{ display: 'block', height: LINE_H, lineHeight: `${LINE_H}px` }}>{d}</span>
        ))}
      </span>
    </span>
  );
}

// ── VersionBadge ──────────────────────────────────────────────────
// Reads version from package.json. Each digit animates slot-machine
// style on mount. fontSize defaults to 10 (footer size).
export default function VersionBadge({ fontSize = 10, color }) {
  const { t }  = useTheme();
  const chars  = `v${pkg.version}`.split('');

  return (
    <span style={{
      fontFamily: M, fontSize,
      letterSpacing: '0.08em',
      color: color ?? t.text3,
      display: 'inline-flex',
      alignItems: 'flex-start',
    }}>
      {chars.map((char, i) => (
        /\d/.test(char)
          ? <DigitSlot key={i} digit={parseInt(char)} delay={300 + i * 90} />
          : <span key={i} style={{ lineHeight: `${LINE_H}px` }}>{char}</span>
      ))}
    </span>
  );
}
