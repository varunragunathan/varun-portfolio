import { useRegisterSW } from 'virtual:pwa-register/react';
import { useTheme } from '../hooks/useTheme';

const M = "'IBM Plex Mono', monospace";

export default function UpdatePrompt() {
  const { t } = useTheme();
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999,
      background: t.surface ?? t.bg,
      border: `1px solid ${t.accentBorder}`,
      borderRadius: 10,
      padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 16,
      boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
      whiteSpace: 'nowrap',
    }}>
      <span style={{ fontFamily: M, fontSize: 11, color: t.text2, letterSpacing: '0.04em' }}>
        new version available
      </span>
      <button
        onClick={() => updateServiceWorker(true)}
        style={{
          fontFamily: M, fontSize: 11, letterSpacing: '0.06em',
          padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
          background: t.accent, color: t.textInverse,
          border: 'none',
        }}
      >
        reload
      </button>
    </div>
  );
}
