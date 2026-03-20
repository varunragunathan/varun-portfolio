// ── Model picker dropdown ─────────────────────────────────────────
// Props: { selectedModel, onSelect, models }
// models: Array<{ model_id: string, label: string }>
// Renders nothing if models is empty/undefined.

import React, { useState, useRef, useEffect } from 'react';
import './ModelPicker.css';

export default function ModelPicker({ selectedModel, onSelect, models }) {
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
    <div ref={ref} className="model-picker">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`model-picker__trigger${open ? ' model-picker__trigger--open' : ''}`}
        title="Select model"
      >
        <span className="model-picker__label">{current.label}</span>
        <span className="model-picker__arrow">{open ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="model-picker__dropdown">
          {models.map(model => {
            const isSelected = model.model_id === (selectedModel ?? models[0].model_id);
            return (
              <button
                key={model.model_id}
                onClick={() => { onSelect(model.model_id); setOpen(false); }}
                className={`model-picker__option${isSelected ? ' model-picker__option--selected' : ''}`}
              >
                <div className="model-picker__option-name">{model.label}</div>
                <div className="model-picker__option-id">{model.model_id}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
