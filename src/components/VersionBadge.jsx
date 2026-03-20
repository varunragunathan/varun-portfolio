import React, { useRef, useEffect } from 'react';
import { usePrefersReducedMotion } from '../hooks/useAnimations.js';
import pkg from '../../package.json';
import './VersionBadge.css';

const LINE_H = 13; // px — matches 10px mono with natural leading

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
    <span className="version-badge__digit">
      <span ref={ref} className="version-badge__reel">
        {digits.map((d, i) => (
          <span key={i} className="version-badge__reel-item">{d}</span>
        ))}
      </span>
    </span>
  );
}

// ── VersionBadge ──────────────────────────────────────────────────
// Reads version from package.json. Each digit animates slot-machine
// style on mount. fontSize defaults to 10 (footer size).
export default function VersionBadge({ fontSize = 10, color }) {
  const chars = `v${pkg.version}`.split('');

  return (
    <span
      className="version-badge"
      style={{ fontSize, ...(color ? { color } : {}) }}
    >
      {chars.map((char, i) => (
        /\d/.test(char)
          ? <DigitSlot key={i} digit={parseInt(char)} delay={300 + i * 90} />
          : <span key={i} className="version-badge__char">{char}</span>
      ))}
    </span>
  );
}
