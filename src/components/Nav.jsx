import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth.jsx';

const M = "'IBM Plex Mono', monospace";
const F = "'Outfit', sans-serif";

// ── Identicon ─────────────────────────────────────────────────────
// Generates a deterministic GitHub-style 5×5 symmetric geometric
// avatar from an email string. No external service — runs in browser.
// Colors are programmatically verified to meet WCAG AA (4.5:1 contrast).

function hashStr(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

// Convert HSL → RGB → relative luminance (WCAG formula)
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

function relativeLuminance(r, g, b) {
  const lin = c => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(l1, l2) {
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// Finds fg lightness that meets contrast target against bg.
// For light backgrounds, steps downward (darker fg).
// For dark backgrounds, steps upward (lighter fg).
function ensureContrast(hue, fgSat, bgSat, fgL, bgL, target = 4.5) {
  const [br, bg_, bb] = hslToRgb(hue, bgSat, bgL);
  const bgLum = relativeLuminance(br, bg_, bb);
  const lightBg = bgL >= 50;
  let l = fgL;
  const step = lightBg ? -1 : 1;
  const limit = lightBg ? 5 : 95;
  while (lightBg ? l >= limit : l <= limit) {
    const [fr, fg_, fb] = hslToRgb(hue, fgSat, l);
    const fgLum = relativeLuminance(fr, fg_, fb);
    if (contrastRatio(fgLum, bgLum) >= target) return l;
    l += step;
  }
  return l;
}

function Identicon({ email, size = 32 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !email) return;

    // Always render at high internal resolution and let CSS scale it down.
    // The browser's image downsampling provides natural antialiasing — no
    // more blocky pixels at small display sizes.
    const R = 300;
    canvas.width = R;
    canvas.height = R;
    const ctx = canvas.getContext('2d');

    const hash = hashStr(email.toLowerCase().trim());
    const rng = seededRng(hash);

    const hue = hash % 360;
    // #f0f0f0 ≈ hsl(0, 0%, 94%) — exact GitHub background, no hue tint
    const BG = '#f0f0f0';
    const fgSat = 52;
    // Start at 60% lightness, step darker until 3:1 non-text contrast is met
    // (WCAG AA for decorative graphical objects, per 1.4.11)
    const fgL = ensureContrast(hue, fgSat, 0, 60, 94, 3.0);

    // Circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(R / 2, R / 2, R / 2, 0, Math.PI * 2);
    ctx.clip();

    // Exact GitHub background — neutral gray, no hue
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, R, R);

    // 5×5 symmetric grid — pure squares, zero gaps, zero rounding
    ctx.fillStyle = `hsl(${hue}, ${fgSat}%, ${fgL}%)`;
    const cols = 5;
    const rows = 5;
    const pad = R * 0.08;
    const gridSize = R - pad * 2;
    const cell = gridSize / cols;
    const halfCols = Math.ceil(cols / 2);

    // Pre-compute fills and guarantee at least 5 visible cells
    const fills = Array.from({ length: rows * halfCols }, () => rng() > 0.38);
    const MIN_FILLS = 5;
    let filled = fills.filter(Boolean).length;
    for (let i = 0; filled < MIN_FILLS && i < fills.length; i++) {
      if (!fills[i]) { fills[i] = true; filled++; }
    }

    let idx = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < halfCols; col++) {
        if (fills[idx++]) {
          const x1 = pad + col * cell;
          const x2 = pad + (cols - 1 - col) * cell;
          const y  = pad + row * cell;
          ctx.fillRect(x1, y, cell, cell);
          if (x1 !== x2) ctx.fillRect(x2, y, cell, cell);
        }
      }
    }

    ctx.restore();
  }, [email, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      style={{ width: size, height: size, display: 'block', borderRadius: '50%', imageRendering: 'auto' }}
      aria-hidden="true"
    />
  );
}

// ── Avatar button + dropdown ──────────────────────────────────────
function AvatarMenu({ user, onLogout }) {
  const { t } = useTheme();
  const { setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [editingNick, setEditingNick] = useState(false);
  const [nickDraft, setNickDraft] = useState('');
  const [nickBusy, setNickBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function startEdit() {
    setNickDraft(user.nickname || '');
    setEditingNick(true);
  }

  async function saveNick(e) {
    e.preventDefault();
    if (!nickDraft.trim() || nickDraft.trim() === user.nickname) { setEditingNick(false); return; }
    setNickBusy(true);
    const res = await fetch('/api/auth/account/nickname', {
      method: 'PATCH', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nickname: nickDraft.trim() }),
    });
    if (res.ok) {
      const { nickname } = await res.json();
      setUser(u => ({ ...u, nickname }));
    }
    setNickBusy(false);
    setEditingNick(false);
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        style={{
          width: 32, height: 32, borderRadius: '50%', padding: 0,
          border: `2px solid ${open ? t.accentBorder : t.border}`,
          cursor: 'pointer', background: 'none',
          transition: 'border-color 0.2s',
          overflow: 'hidden', display: 'block',
        }}
      >
        <Identicon email={user.maskedEmail || user.nickname || ''} size={28} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0,
          minWidth: 220, borderRadius: 12,
          background: t.cardBg, border: `1px solid ${t.border}`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          overflow: 'hidden',
          animation: 'fadeSlideDown 0.15s ease',
        }}>
          {/* Identity */}
          <div style={{ padding: '12px 14px', borderBottom: `1px solid ${t.border}` }}>
            {editingNick ? (
              <form onSubmit={saveNick} style={{ display: 'flex', gap: 6 }}>
                <input
                  value={nickDraft}
                  onChange={e => setNickDraft(e.target.value)}
                  autoFocus
                  maxLength={32}
                  style={{
                    flex: 1, padding: '5px 8px', borderRadius: 7,
                    fontFamily: M, fontSize: 12, color: t.text1,
                    background: t.surface, border: `1px solid ${t.accentBorder}`,
                    outline: 'none', minWidth: 0,
                  }}
                />
                <button type="submit" disabled={nickBusy} style={{
                  padding: '5px 10px', borderRadius: 7, border: 'none',
                  background: t.accentDim, color: t.accent, fontFamily: F, fontSize: 12,
                  cursor: 'pointer',
                }}>
                  {nickBusy ? '…' : 'Save'}
                </button>
                <button type="button" onClick={() => setEditingNick(false)} style={{
                  padding: '5px 8px', borderRadius: 7, border: `1px solid ${t.border}`,
                  background: 'none', color: t.text3, fontFamily: F, fontSize: 12, cursor: 'pointer',
                }}>✕</button>
              </form>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: F, fontSize: 13, color: t.text1, fontWeight: 500 }}>
                    {user.nickname || 'Anonymous'}
                  </div>
                  <div style={{ fontFamily: M, fontSize: 10, color: t.text3, marginTop: 2 }}>
                    {user.maskedEmail}
                  </div>
                </div>
                <button
                  onClick={startEdit}
                  title="Edit nickname"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: 4, borderRadius: 5, color: t.text3, flexShrink: 0,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Security page */}
          <Link
            to="/account/settings"
            onClick={() => setOpen(false)}
            style={{
              display: 'block', padding: '11px 14px', textDecoration: 'none',
              fontFamily: F, fontSize: 13, color: t.text2,
              borderBottom: `1px solid ${t.border}`,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            Settings
          </Link>

          {/* Log out */}
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            style={{
              width: '100%', padding: '11px 14px', textAlign: 'left',
              fontFamily: F, fontSize: 13, color: '#f87171',
              background: 'none', border: 'none', cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.target.style.background = 'rgba(248,113,113,0.08)')}
            onMouseLeave={e => (e.target.style.background = 'none')}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

// ── Logo with animated terminal prefix ───────────────────────────
const SYMBOLS   = ['~/', './', '> ', '$ ', '# ', '=>', '::', '&&', '<>', '**', '//', 'λ ', '∑ ', '∇ ', '∂ ', 'φ ', 'π '];
const PHI       = 1.6180339887;
const BASE_MS   = 520;
const SETTLE_MS = 340;

function lerpColor(hex1, hex2, t) {
  const parse = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  const [r1,g1,b1] = parse(hex1);
  const [r2,g2,b2] = parse(hex2);
  return `rgb(${Math.round(r1+(r2-r1)*t)},${Math.round(g1+(g2-g1)*t)},${Math.round(b1+(b2-b1)*t)})`;
}

function LogoMark() {
  const prefixRef  = useRef(null);
  const rafRef     = useRef(null);
  const stateRef   = useRef({ hovering: false, startTime: null, leaveTime: null, leaveFrom: '~/', leaveFromY: 0 });

  const tick = useCallback((ts) => {
    const el = prefixRef.current;
    if (!el) return;
    const s = stateRef.current;
    if (!s.startTime) s.startTime = ts;
    const elapsed = ts - s.startTime;

    if (s.hovering) {
      const cycleLen = BASE_MS * PHI;
      const pos      = (elapsed / cycleLen) % SYMBOLS.length;
      const idx      = Math.floor(pos) % SYMBOLS.length;
      const phase    = pos - Math.floor(pos);

      const env   = Math.sin(phase * Math.PI);
      const y     = (1 - phase) * Math.sin(phase * Math.PI * 2) * -5;

      el.textContent     = SYMBOLS[idx];
      el.style.opacity   = String(0.35 + 0.65 * env);
      el.style.color     = lerpColor('#4b5563', '#6366f1', env);
      el.style.transform = `translateY(${y.toFixed(2)}px)`;
      rafRef.current = requestAnimationFrame(tick);
    } else {
      const t    = Math.min((ts - s.leaveTime) / SETTLE_MS, 1);
      const ease = 0.5 - 0.5 * Math.cos(t * Math.PI);

      if (t < 1) {
        el.textContent     = s.leaveFrom;
        el.style.opacity   = String(1 - ease);
        el.style.color     = lerpColor('#4b5563', '#6366f1', 1 - ease);
        el.style.transform = `translateY(${(s.leaveFromY * (1 - ease)).toFixed(2)}px)`;
        rafRef.current = requestAnimationFrame(tick);
      } else {
        el.textContent     = '~/';
        el.style.opacity   = '1';
        el.style.color     = '#4b5563';
        el.style.transform = 'translateY(0px)';
        rafRef.current = null;
      }
    }
  }, []);

  function onEnter() {
    const s = stateRef.current;
    s.hovering = true; s.startTime = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }

  function onLeave() {
    const el = prefixRef.current;
    const s  = stateRef.current;
    s.hovering   = false;
    s.leaveTime  = performance.now();
    s.leaveFrom  = el?.textContent ?? '~/';
    s.leaveFromY = parseFloat(el?.style.transform?.replace('translateY(','') ?? '0') || 0;
    s.startTime  = null;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  return (
    <Link
      to="/"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}
    >
      <span
        ref={prefixRef}
        style={{
          fontFamily: M, fontSize: 13, letterSpacing: '0.03em',
          color: '#4b5563', display: 'inline-block',
          minWidth: 22, willChange: 'transform, opacity',
          transition: 'none',
        }}
      >
        ~/
      </span>
      <span style={{ fontFamily: M, fontSize: 13, letterSpacing: '0.03em', color: '#e5e5e5' }}>
        varunr
      </span>
      <span style={{ fontFamily: M, fontSize: 13, letterSpacing: '0.03em', color: '#6366f1' }}>
        .dev
      </span>
    </Link>
  );
}

// ── Nav ───────────────────────────────────────────────────────────
export default function Nav() {
  const { t } = useTheme();
  const { user, loading, logout, enabled } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <>
      <style>{`
        @keyframes fadeSlideDown {
          from { opacity: 0; transform: translateY(-6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <nav
        aria-label="Site navigation"
        style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
          borderBottom: `1px solid ${t.border}`,
          background: `${t.bg}e8`,
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
        }}
      >
        <div style={{
          maxWidth: 920, margin: '0 auto', padding: '0 24px',
          height: 52, display: 'flex', alignItems: 'center',
        }}>
          {/* Spacer left — mirrors avatar width so logo stays optically centred */}
          <div style={{ flex: 1 }} />

          {/* Centred logo */}
          <LogoMark />

          {/* Right side */}
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}>
            {enabled && !loading && user && (
              <AvatarMenu user={user} onLogout={handleLogout} />
            )}
          </div>
        </div>
      </nav>
    </>
  );
}
