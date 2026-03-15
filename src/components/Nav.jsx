import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth.jsx';
import { ThemeToggle } from './UI';

const M = "'IBM Plex Mono', monospace";
const F = "'Outfit', sans-serif";

function truncateEmail(email, max = 24) {
  if (!email || email.length <= max) return email;
  const [local, domain] = email.split('@');
  return `${local.slice(0, max - domain.length - 4)}…@${domain}`;
}

export default function Nav() {
  const { t } = useTheme();
  const { user, loading, logout, enabled } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
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
        height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <Link
          to="/"
          style={{ fontFamily: M, fontSize: 13, color: t.text1, textDecoration: 'none', letterSpacing: '0.05em' }}
        >
          varunr.dev
        </Link>

        {/* Right side */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {enabled && !loading && (
            user ? (
              <>
                <span style={{ fontFamily: M, fontSize: 11, color: t.text3 }}>
                  {truncateEmail(user.email)}
                </span>
                <button
                  onClick={handleLogout}
                  style={{
                    fontFamily: M, fontSize: 11, letterSpacing: '0.1em',
                    color: t.text2, background: 'none', border: `1px solid ${t.border}`,
                    borderRadius: 7, padding: '5px 12px', cursor: 'pointer',
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <Link
                to="/auth"
                style={{
                  fontFamily: M, fontSize: 11, letterSpacing: '0.1em',
                  color: t.accent, background: t.accentDim, border: `1px solid ${t.accentBorder}`,
                  borderRadius: 7, padding: '5px 12px', textDecoration: 'none',
                }}
              >
                Sign in / Register
              </Link>
            )
          )}
          <ThemeToggle inline />
        </div>
      </div>
    </nav>
  );
}
