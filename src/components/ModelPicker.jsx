// ── Model picker dropdown ─────────────────────────────────────────
// Props: { selectedModel, onSelect, models, t }
// models: Array<{ model_id: string, label: string }>
// Renders nothing if models is empty/undefined.

import React, { useState, useRef, useEffect } from 'react';

const M = "'IBM Plex Mono', monospace";
const F = "'Outfit', sans-serif";

export default function ModelPicker({ selectedModel, onSelect, models, t }) {
  const [open, setOpen] = useState(false);
  const ref             = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!models || models.length === 0) return null;

  const current = models.find(m => m.model_id === selectedModel) ?? models[0];

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: M, fontSize: 10, letterSpacing: '0.06em',
          color: t.accentMuted,
          background: 'none', border: `1px solid ${open ? t.accentBorder : t.border}`,
          borderRadius: 6, padding: '3px 10px', cursor: 'pointer',
          transition: 'border-color 0.15s, color 0.15s',
        }}
        title="Select model"
      >
        <span style={{ color: open ? t.accent : t.accentMuted }}>{current.label}</span>
        <span style={{ fontSize: 8, color: t.text3 }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0,
          minWidth: 180, zIndex: 100,
          background: t.surface, border: `1px solid ${t.border}`,
          borderRadius: 8, padding: '4px 0',
          boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
        }}>
          {models.map(model => {
            const isSelected = model.model_id === (selectedModel ?? models[0].model_id);
            return (
              <button
                key={model.model_id}
                onClick={() => { onSelect(model.model_id); setOpen(false); }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 14px',
                  fontFamily: F, fontSize: 13,
                  color: isSelected ? t.accent : t.text1,
                  background: isSelected ? t.accentDim : 'transparent',
                  border: 'none', cursor: 'pointer',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = t.cardHover; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ fontFamily: F, fontSize: 13, fontWeight: isSelected ? 600 : 400 }}>
                  {model.label}
                </div>
                <div style={{ fontFamily: M, fontSize: 10, color: t.text3, marginTop: 1 }}>
                  {model.model_id}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
