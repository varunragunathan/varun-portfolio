// ── Pixel owl mascot — reacts to chat state ───────────────────────
// Props:
//   state  'idle' | 'thinking' | 'streaming' | 'done'
//   size   px per pixel (default 8 ≈ 96×112 px)

import React, { useState, useEffect } from 'react';
import { useTheme } from '../hooks/useTheme';
import './PixelOwl.css';

// ── Palette — body/wing shift in dark mode for visibility ─────────
function palette(isDark) {
  return {
    '.': null,
    'd': isDark ? '#7B3F12' : '#3B1F0A',   // body: lighter in dark mode (~3:1 vs #11111a)
    'f': '#F5E6C8',                          // face disc cream
    'y': '#FFE030',                          // iris yellow
    'p': isDark ? '#1A1A1A' : '#0A0A0A',    // pupil
    'k': '#E07808',                          // beak orange
    'w': isDark ? '#C47820' : '#9B5C1A',    // wing highlight: brighter in dark mode
  };
}

// ── Pixel frames — 12 cols × 14 rows ─────────────────────────────
// Each string must be exactly 12 characters.
const F = {
  idle: [
    '..dd....dd..',   //  0  ear tufts
    '.dddd..dddd.',   //  1  head
    'dddddddddddd',   //  2  head
    'ddfffddfffdd',   //  3  face disc
    'ddfyyfdfyyfd',   //  4  eyes (top)
    'ddfypfdfypfd',   //  5  pupils centered
    'ddfyyfdfyyfd',   //  6  eyes (bottom)
    'ddddfkkfdddd',   //  7  beak
    'dddddddddddd',   //  8  body
    'dwwddddddwwd',   //  9  wings
    'dwwddddddwwd',   // 10  wings
    '.dddddddddd.',   // 11  body bottom
    '..dd....dd..',   // 12  feet
    '..d......d..',   // 13  feet
  ],
  blink: [
    '..dd....dd..',
    '.dddd..dddd.',
    'dddddddddddd',
    'ddfffddfffdd',
    'dddddddddddd',   //  4  eyes closed
    'dddddddddddd',   //  5  eyes closed
    'dddddddddddd',   //  6  eyes closed
    'ddddfkkfdddd',
    'dddddddddddd',
    'dwwddddddwwd',
    'dwwddddddwwd',
    '.dddddddddd.',
    '..dd....dd..',
    '..d......d..',
  ],
  thinking: [
    '..dd....dd..',
    '.dddd..dddd.',
    'dddddddddddd',
    'ddfffddfffdd',
    'ddfyyfdfyyfd',
    'ddfpyfdfpyfd',   //  5  pupils shifted left — looking
    'ddfyyfdfyyfd',
    'ddddfkkfdddd',
    'dddddddddddd',
    'dwwddddddwwd',
    'dwwddddddwwd',
    '.dddddddddd.',
    '..dd....dd..',
    '..d......d..',
  ],
  done: [
    '..dd....dd..',
    '.dddd..dddd.',
    'dddddddddddd',
    'ddfffddfffdd',
    'dddddddddddd',   //  4  heavy top lid (happy squint)
    'ddfyyfdfyyfd',   //  5  iris showing through lower half
    'ddfyyfdfyyfd',   //  6
    'ddddfkkfdddd',
    'dddddddddddd',
    'dwwddddddwwd',
    'dwwddddddwwd',
    '.dddddddddd.',
    '..dd....dd..',
    '..d......d..',
  ],
  snore: [
    '..dd....dd..',
    '.dddd..dddd.',
    'dddddddddddd',
    'ddfffddfffdd',
    'dddddddddddd',   //  4  eyes closed
    'dddddddddddd',   //  5  eyes closed
    'dddddddddddd',   //  6  eyes closed
    'ddddkdkddddd',   //  7  beak slightly open (snoring)
    'dddddddddddd',
    'dwwddddddwwd',
    'dwwddddddwwd',
    '.dddddddddd.',
    '..dd....dd..',
    '..d......d..',
  ],
};

// ── Render pixel grid ─────────────────────────────────────────────
function OwlPixels({ frame, px, C }) {
  const rects = [];
  frame.forEach((row, ry) => {
    [...row].forEach((ch, rx) => {
      const fill = C[ch];
      if (!fill) return;
      rects.push(<rect key={`${rx}-${ry}`} x={rx * px} y={ry * px} width={px} height={px} fill={fill} />);
    });
  });
  return <>{rects}</>;
}


// ── Component ─────────────────────────────────────────────────────
export default function PixelOwl({ state = 'idle', size = 8 }) {
  const { mode } = useTheme();
  const isDark = mode !== 'light';
  const C = palette(isDark);
  const [blinking, setBlinking] = useState(false);

  // Periodic blink during idle
  useEffect(() => {
    if (state !== 'idle') { setBlinking(false); return; }
    let alive = true;
    (async () => {
      while (alive) {
        await new Promise(r => setTimeout(r, 3000 + Math.random() * 2500));
        if (!alive) break;
        setBlinking(true);
        await new Promise(r => setTimeout(r, 130));
        if (!alive) break;
        setBlinking(false);
      }
    })();
    return () => { alive = false; };
  }, [state]);

  const key   = blinking ? 'blink' : (F[state] ? state : 'idle');
  const frame = F[key];
  const W     = 12 * size;
  const H     = 14 * size;

  return (
    <div className={`pixel-owl pixel-owl--${key}`}>
      <svg
        width={W}
        height={H}
        style={{ display: 'block', imageRendering: 'pixelated' }}
        aria-label="Hoot the owl"
      >
        <OwlPixels frame={frame} px={size} C={C} />
      </svg>
    </div>
  );
}
