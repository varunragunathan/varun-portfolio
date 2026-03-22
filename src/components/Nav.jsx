import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth.jsx';
import './Nav.css';

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

    const R = 300;
    canvas.width = R;
    canvas.height = R;
    const ctx = canvas.getContext('2d');

    const hash = hashStr(email.toLowerCase().trim());
    const rng  = seededRng(hash);
    const hue  = hash % 360;
    const BG   = '#f0f0f0';
    const fgSat = 52;
    const fgL   = ensureContrast(hue, fgSat, 0, 60, 94, 3.0);

    ctx.save();
    ctx.beginPath();
    ctx.arc(R / 2, R / 2, R / 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, R, R);

    ctx.fillStyle = `hsl(${hue}, ${fgSat}%, ${fgL}%)`;
    const cols = 5, rows = 5;
    const pad  = R * 0.08;
    const gridSize = R - pad * 2;
    const cell = gridSize / cols;
    const halfCols = Math.ceil(cols / 2);

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
      className="identicon"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}

// ── Avatar button + dropdown ──────────────────────────────────────
function AvatarMenu({ user, onLogout }) {
  const { setUser } = useAuth();
  const [open, setOpen]           = useState(false);
  const [editingNick, setEditingNick] = useState(false);
  const [nickDraft, setNickDraft] = useState('');
  const [nickBusy, setNickBusy]   = useState(false);
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
    <div ref={ref} className="avatar-menu">
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className={`avatar-menu__trigger${open ? ' avatar-menu__trigger--open' : ''}`}
      >
        <Identicon email={user.maskedEmail || user.nickname || ''} size={28} />
      </button>

      {open && (
        <div className="avatar-menu__dropdown">
          {/* Identity */}
          <div className="avatar-menu__identity">
            {editingNick ? (
              <form onSubmit={saveNick} className="avatar-menu__nick-form">
                {/* eslint-disable jsx-a11y/no-autofocus */}
                <input
                  className="avatar-menu__nick-input"
                  value={nickDraft}
                  onChange={e => setNickDraft(e.target.value)}
                  autoFocus
                  maxLength={32}
                />
                {/* eslint-enable jsx-a11y/no-autofocus */}
                <button type="submit" disabled={nickBusy} className="avatar-menu__nick-save">
                  {nickBusy ? '…' : 'Save'}
                </button>
                <button type="button" onClick={() => setEditingNick(false)} className="avatar-menu__nick-cancel">
                  ✕
                </button>
              </form>
            ) : (
              <div className="avatar-menu__user-info">
                <div className="avatar-menu__user-text">
                  <div className="avatar-menu__user-name">{user.nickname || 'Anonymous'}</div>
                  <div className="avatar-menu__user-email">{user.maskedEmail}</div>
                </div>
                <button onClick={startEdit} title="Edit nickname" className="avatar-menu__edit-btn">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              </div>
            )}
          </div>

          {/* Settings */}
          <Link
            to="/account/settings"
            onClick={() => setOpen(false)}
            className="avatar-menu__link"
          >
            Settings
          </Link>

          {/* Admin — only for admins */}
          {user.role === 'admin' && (
            <Link
              to="/admin"
              onClick={() => setOpen(false)}
              className="avatar-menu__link avatar-menu__link--admin"
            >
              Admin
            </Link>
          )}

          {/* Log out */}
          <button
            onClick={() => { setOpen(false); onLogout(); }}
            className="avatar-menu__logout"
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
  const { t }      = useTheme();
  const prefixRef  = useRef(null);
  const rafRef     = useRef(null);
  const stateRef   = useRef({ hovering: false, startTime: null, leaveTime: null, leaveFrom: '~/', leaveFromY: 0 });
  const baseColorRef = useRef(t.text3);
  useEffect(() => { baseColorRef.current = t.text3; }, [t.text3]);

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
      const env      = Math.sin(phase * Math.PI);
      const y        = (1 - phase) * Math.sin(phase * Math.PI * 2) * -5;

      el.textContent     = SYMBOLS[idx];
      el.style.opacity   = String(0.35 + 0.65 * env);
      el.style.color     = lerpColor(baseColorRef.current, '#6366f1', env);
      el.style.transform = `translateY(${y.toFixed(2)}px)`;
      // eslint-disable-next-line react-hooks/immutability
      rafRef.current = requestAnimationFrame(tick);
    } else {
      const t    = Math.min((ts - s.leaveTime) / SETTLE_MS, 1);
      const ease = 0.5 - 0.5 * Math.cos(t * Math.PI);

      if (t < 1) {
        el.textContent     = s.leaveFrom;
        el.style.opacity   = String(1 - ease);
        el.style.color     = lerpColor(baseColorRef.current, '#6366f1', 1 - ease);
        el.style.transform = `translateY(${(s.leaveFromY * (1 - ease)).toFixed(2)}px)`;
        rafRef.current = requestAnimationFrame(tick);
      } else {
        el.textContent     = '~/';
        el.style.opacity   = '1';
        el.style.color     = baseColorRef.current;
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
    <Link to="/" className="nav__logo" onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <span ref={prefixRef} className="nav__logo-prefix">~/</span>
      <span className="nav__logo-name">varunr</span>
      <span className="nav__logo-tld">.dev</span>
    </Link>
  );
}

// ── Nav ───────────────────────────────────────────────────────────
export default function Nav() {
  const { user, loading, logout, enabled } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <nav id="nav" className="nav" aria-label="Site navigation">
      <div className="nav__inner">
        <div className="nav__spacer" />
        <LogoMark />
        <div className="nav__actions">
          {enabled && !loading && user && (
            <AvatarMenu user={user} onLogout={handleLogout} />
          )}
          {enabled && !loading && !user && (
            <Link to="/auth" className="nav__sign-in">sign in</Link>
          )}
        </div>
      </div>
    </nav>
  );
}
