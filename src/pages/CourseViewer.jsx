import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { COURSES } from '../data/courses';
import { useVCoins } from '../hooks/useVCoins';
import './Learn.css';

// ── Animated visuals ──────────────────────────────────────────────
function BrainNetwork() {
  return (
    <div className="anim-visual">
      <div className="brain-network">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="brain-node" />
        ))}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em' }}>
        connected intelligence
      </div>
    </div>
  );
}

function NestedCircles() {
  return (
    <div className="anim-visual">
      <div className="nested-circles">
        <div className="nested-circle nested-circle--ai">
          <span className="nested-circle__label">AI</span>
        </div>
        <div className="nested-circle nested-circle--ml">
          <span className="nested-circle__label">ML</span>
        </div>
        <div className="nested-circle nested-circle--dl">
          <span className="nested-circle__label">DL</span>
        </div>
      </div>
    </div>
  );
}

function TrainingLoop() {
  const steps = [
    { icon: '🎯', label: 'Predict' },
    { icon: '⚖️', label: 'Compare' },
    { icon: '🔧', label: 'Adjust' },
    { icon: '🔄', label: 'Repeat' },
  ];
  return (
    <div className="anim-visual">
      <div className="training-loop-vis">
        {steps.map((s, i) => (
          <React.Fragment key={s.label}>
            {i > 0 && <span className="tl-arrow">→</span>}
            <div className="tl-step">
              <span className="tl-step__icon">{s.icon}</span>
              <span className="tl-step__label">{s.label}</span>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function TimelineVis() {
  const events = [
    { year: '1950', label: 'Turing Test' },
    { year: '1956', label: '"AI" coined' },
    { year: '1997', label: 'Deep Blue' },
    { year: '2012', label: 'AlexNet' },
    { year: '2022', label: 'ChatGPT' },
  ];
  return (
    <div className="anim-visual" style={{ flexDirection: 'column', gap: 0 }}>
      {events.map((e, i) => (
        <div
          key={e.year}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0',
            opacity: 0, animation: `tlAppear 0.4s ${i * 0.2}s forwards`,
          }}
        >
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
            color: 'var(--accent)', minWidth: 40,
          }}>
            {e.year}
          </span>
          <span style={{
            width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)',
            flexShrink: 0,
          }} />
          <span style={{
            fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-2)',
          }}>
            {e.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function DataFlowVis() {
  return (
    <div className="anim-visual">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        {['📦 Data', '⚙️ Model', '📊 Predictions'].map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <span style={{ fontSize: 18, color: 'var(--accent-muted)' }}>→</span>}
            <div style={{
              padding: '14px 20px', background: 'var(--surface-alt)',
              border: '1px solid var(--border)', borderRadius: 12,
              fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)',
              opacity: 0, animation: `tlAppear 0.4s ${i * 0.3}s forwards`,
            }}>
              {label}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function TypeIconVis({ icon, labels }) {
  return (
    <div className="anim-visual">
      <div style={{ fontSize: 48, marginBottom: 8 }}>{icon}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {labels.map((l, i) => (
          <span
            key={l}
            style={{
              padding: '6px 14px', background: 'var(--accent-dim)',
              border: '1px solid var(--accent-border)', borderRadius: 8,
              fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-2)',
              opacity: 0, animation: `tlAppear 0.4s ${i * 0.15}s forwards`,
            }}
          >
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Interactive: Gradient Descent ─────────────────────────────────
function GradientDescent() {
  const [weight, setWeight] = useState(0);
  const target = 7;
  const loss = ((weight - target) ** 2).toFixed(2);
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width = canvas.offsetWidth * 2;
    const H = canvas.height = 360;
    ctx.clearRect(0, 0, W, H);

    // Draw parabola
    ctx.strokeStyle = 'rgba(100,255,218,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= W; x++) {
      const w = (x / W) * 14;
      const l = (w - target) ** 2;
      const y = H - (l / 49) * (H - 40) - 20;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw filled area under curve
    ctx.fillStyle = 'rgba(100,255,218,0.04)';
    ctx.beginPath();
    for (let x = 0; x <= W; x++) {
      const w = (x / W) * 14;
      const l = (w - target) ** 2;
      const y = H - (l / 49) * (H - 40) - 20;
      x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.fill();

    // Draw current position
    const px = (weight / 14) * W;
    const py = H - (((weight - target) ** 2) / 49) * (H - 40) - 20;
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'var(--accent)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, 14, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(100,255,218,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [weight, target]);

  return (
    <div className="gd-interactive">
      <div className="gd-chart">
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
      <div className="gd-controls">
        <label>
          Weight:
          <input
            type="range"
            min="0"
            max="14"
            step="0.1"
            value={weight}
            onChange={e => setWeight(Number(e.target.value))}
          />
        </label>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-2)', minWidth: 30 }}>
          {weight.toFixed(1)}
        </span>
      </div>
      <div className="gd-loss">
        Loss: <span>{loss}</span>
        {parseFloat(loss) < 0.5 && (
          <span style={{ marginLeft: 8, color: 'var(--success-color)' }}>🎯 Near optimal!</span>
        )}
      </div>
    </div>
  );
}

// ── Interactive: Neuron Builder ───────────────────────────────────
function NeuronBuilder() {
  const [inputs, setInputs] = useState([
    { label: 'x₁', active: true, weight: 0.5 },
    { label: 'x₂', active: false, weight: 0.3 },
    { label: 'x₃', active: true, weight: -0.2 },
  ]);
  const bias = 0.1;

  const rawOutput = inputs.reduce(
    (sum, inp) => sum + (inp.active ? 1 : 0) * inp.weight,
    bias,
  );
  // ReLU activation
  const activated = Math.max(0, rawOutput);

  return (
    <div className="neuron-builder">
      <div className="neuron-inputs">
        {inputs.map((inp, i) => (
          <button
            key={inp.label}
            className={`neuron-input${inp.active ? ' neuron-input--active' : ''}`}
            onClick={() => {
              setInputs(prev => prev.map((p, j) =>
                j === i ? { ...p, active: !p.active } : p,
              ));
            }}
          >
            <span className="neuron-input__label">{inp.label}</span>
            <span className="neuron-input__value">{inp.active ? '1' : '0'}</span>
            <input
              type="range"
              min="-1"
              max="1"
              step="0.1"
              value={inp.weight}
              onClick={e => e.stopPropagation()}
              onChange={e => {
                const val = Number(e.target.value);
                setInputs(prev => prev.map((p, j) =>
                  j === i ? { ...p, weight: val } : p,
                ));
              }}
            />
            <span className="neuron-input__label">w={inp.weight.toFixed(1)}</span>
          </button>
        ))}
      </div>

      <div style={{ fontSize: 20, color: 'var(--accent-muted)' }}>↓</div>

      <div className="neuron-output">
        <div className="neuron-output__label">Output (ReLU)</div>
        <div className="neuron-output__value">{activated.toFixed(2)}</div>
        <div className="neuron-output__bar">
          <div
            className="neuron-output__bar-fill"
            style={{ width: `${Math.min(activated * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
// ── Reusable flow diagram ────────────────────────────────────────
function FlowVis({ steps }) {
  return (
    <div className="anim-visual">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}>
        {steps.map((label, i) => (
          <React.Fragment key={label}>
            {i > 0 && <span style={{ fontSize: 16, color: 'var(--accent-muted)' }}>→</span>}
            <div style={{
              padding: '12px 16px', background: 'var(--surface-alt)',
              border: '1px solid var(--border)', borderRadius: 10,
              fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)',
              opacity: 0, animation: `tlAppear 0.4s ${i * 0.2}s forwards`,
              textAlign: 'center', minWidth: 80,
            }}>
              {label}
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ── Interactive: Tokenizer ───────────────────────────────────────
function TokenizerInteractive() {
  const [text, setText] = useState('Hello, how are you today?');
  const tokenize = (t) => {
    const parts = [];
    let remaining = t;
    while (remaining.length > 0) {
      // Common words as single tokens
      const common = /^(\s*)(Hello|how|are|you|today|the|is|a|to|of|in|it|for|on|was|at|by|an|be|do|or|if|no|so|up|my|we|he|she|me|us|go|am|as|I)\b/i;
      const cm = remaining.match(common);
      if (cm) {
        if (cm[1]) parts.push(cm[1]);
        parts.push(cm[2]);
        remaining = remaining.slice(cm[0].length);
        continue;
      }
      // Punctuation
      if (/^[.,!?;:'"()-]/.test(remaining)) {
        parts.push(remaining[0]);
        remaining = remaining.slice(1);
        continue;
      }
      // Spaces
      if (remaining[0] === ' ') {
        parts.push(' ');
        remaining = remaining.slice(1);
        continue;
      }
      // Syllable-ish split for longer words
      const word = remaining.match(/^[a-zA-Z]+/);
      if (word) {
        const w = word[0];
        if (w.length <= 4) { parts.push(w); }
        else {
          // Split into rough subwords
          const mid = Math.ceil(w.length / 2);
          parts.push(w.slice(0, mid));
          parts.push(w.slice(mid));
        }
        remaining = remaining.slice(w.length);
        continue;
      }
      // Numbers & other
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    }
    return parts.filter(p => p.length > 0);
  };

  const tokens = tokenize(text);
  const colors = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2', '#7c3aed', '#2563eb'];

  return (
    <div style={{ width: '100%' }}>
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Type text to tokenize..."
        style={{
          width: '100%', padding: '12px 16px', background: 'var(--surface-alt)',
          border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text-1)',
          fontFamily: 'var(--font-mono)', fontSize: 14, marginBottom: 16, outline: 'none',
        }}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 12 }}>
        {tokens.map((tok, i) => (
          <span key={i} style={{
            padding: '4px 8px', borderRadius: 6, fontSize: 13,
            fontFamily: 'var(--font-mono)',
            background: `${colors[i % colors.length]}22`,
            border: `1px solid ${colors[i % colors.length]}44`,
            color: 'var(--text-1)',
          }}>
            {tok === ' ' ? '▁' : tok}
          </span>
        ))}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
        {tokens.length} tokens · ~{Math.round(tokens.length * 4 / 3)} characters
      </div>
    </div>
  );
}

// ── Interactive: Attention Heatmap ───────────────────────────────
function AttentionHeatmap() {
  const words = ['The', 'cat', 'sat', 'on', 'the', 'mat'];
  const [selected, setSelected] = useState(1);
  // Simulated attention weights per selected token
  const patterns = {
    0: [0.4, 0.25, 0.1, 0.05, 0.15, 0.05],
    1: [0.15, 0.3, 0.2, 0.05, 0.05, 0.25],
    2: [0.05, 0.35, 0.2, 0.15, 0.05, 0.2],
    3: [0.05, 0.1, 0.15, 0.2, 0.1, 0.4],
    4: [0.3, 0.05, 0.05, 0.1, 0.3, 0.2],
    5: [0.05, 0.2, 0.15, 0.2, 0.1, 0.3],
  };
  const attn = patterns[selected];

  return (
    <div style={{ width: '100%', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 12, letterSpacing: '0.08em' }}>
        CLICK A TOKEN TO SEE ITS ATTENTION PATTERN
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        {words.map((w, i) => (
          <button key={i} onClick={() => setSelected(i)} style={{
            padding: '10px 16px', borderRadius: 8, cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: i === selected ? 700 : 400,
            background: i === selected ? 'var(--accent)' : 'var(--surface-alt)',
            color: i === selected ? 'var(--text-inverse)' : 'var(--text-2)',
            border: `1.5px solid ${i === selected ? 'var(--accent)' : 'var(--border)'}`,
            transition: 'all 0.2s',
          }}>
            {w}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'flex-end', height: 120, flexWrap: 'wrap' }}>
        {words.map((w, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 40, height: Math.max(8, attn[i] * 200), borderRadius: 6,
              background: `rgba(100,255,218,${0.2 + attn[i] * 0.8})`,
              border: '1px solid rgba(100,255,218,0.3)',
              transition: 'height 0.4s ease, background 0.4s',
            }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>{w}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent-muted)' }}>{(attn[i] * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Interactive: Temperature Slider ──────────────────────────────
function TemperatureSlider() {
  const [temp, setTemp] = useState(0.7);
  const baseProbs = [0.45, 0.25, 0.15, 0.08, 0.04, 0.03];
  const words = ['mat', 'floor', 'couch', 'rug', 'table', 'bed'];

  const adjusted = baseProbs.map(p => Math.pow(p, 1 / Math.max(temp, 0.01)));
  const sum = adjusted.reduce((a, b) => a + b, 0);
  const probs = adjusted.map(p => p / sum);

  const label = temp < 0.3 ? 'Deterministic' : temp < 0.8 ? 'Balanced' : temp < 1.3 ? 'Creative' : 'Chaotic';
  const labelColor = temp < 0.3 ? 'var(--success-color)' : temp < 0.8 ? 'var(--accent)' : temp < 1.3 ? '#fbbf24' : 'var(--error-color)';

  return (
    <div style={{ width: '100%', textAlign: 'center' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 8, letterSpacing: '0.08em' }}>
        "THE CAT SAT ON THE ___"
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'flex-end', height: 140, marginBottom: 16, flexWrap: 'wrap' }}>
        {words.map((w, i) => (
          <div key={w} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--accent-muted)' }}>
              {(probs[i] * 100).toFixed(1)}%
            </span>
            <div style={{
              width: 44, height: Math.max(6, probs[i] * 250), borderRadius: 6,
              background: `rgba(100,255,218,${0.15 + probs[i] * 0.85})`,
              border: '1px solid rgba(100,255,218,0.3)',
              transition: 'height 0.3s ease',
            }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)' }}>{w}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', maxWidth: 360, margin: '0 auto' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>0.0</span>
        <input type="range" min="0.05" max="2.0" step="0.05" value={temp}
          onChange={e => setTemp(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--accent)' }}
        />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>2.0</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: labelColor }}>
          T = {temp.toFixed(2)}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginLeft: 8 }}>
          {label}
        </span>
      </div>
    </div>
  );
}

// ── Interactive: Vector Similarity ───────────────────────────────
function VectorSimilarity() {
  const pairs = [
    { a: 'king', b: 'queen', sim: 0.92 },
    { a: 'cat', b: 'dog', sim: 0.83 },
    { a: 'happy', b: 'joyful', sim: 0.89 },
    { a: 'car', b: 'banana', sim: 0.12 },
    { a: 'python', b: 'snake', sim: 0.68 },
    { a: 'python', b: 'code', sim: 0.57 },
    { a: 'run', b: 'running', sim: 0.95 },
    { a: 'hot', b: 'cold', sim: 0.45 },
  ];
  const [sel, setSel] = useState(0);
  const p = pairs[sel];

  return (
    <div style={{ width: '100%', textAlign: 'center' }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 20 }}>
        {pairs.map((pair, i) => (
          <button key={i} onClick={() => setSel(i)} style={{
            padding: '8px 14px', borderRadius: 8, cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 11,
            background: i === sel ? 'var(--accent-dim)' : 'var(--surface-alt)',
            border: `1px solid ${i === sel ? 'var(--accent-border)' : 'var(--border)'}`,
            color: i === sel ? 'var(--accent)' : 'var(--text-3)',
            transition: 'all 0.2s',
          }}>
            {pair.a} ↔ {pair.b}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: 'var(--text-1)' }}>{p.a}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, color: 'var(--text-3)' }}>↔</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 600, color: 'var(--text-1)' }}>{p.b}</span>
      </div>
      <div style={{ width: '80%', maxWidth: 300, height: 8, background: 'var(--surface-alt)', borderRadius: 4, margin: '0 auto 8px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 4, transition: 'width 0.5s ease',
          width: `${p.sim * 100}%`,
          background: p.sim > 0.7 ? 'var(--accent)' : p.sim > 0.4 ? '#fbbf24' : 'var(--error-color)',
        }} />
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: p.sim > 0.7 ? 'var(--accent)' : p.sim > 0.4 ? '#fbbf24' : 'var(--error-color)' }}>
        {p.sim.toFixed(2)}
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em', marginTop: 4 }}>
        COSINE SIMILARITY
      </div>
    </div>
  );
}

// ── Interactive: Context Budget ──────────────────────────────────
function ContextBudget() {
  const maxCtx = 128000;
  const [system, setSystem] = useState(2000);
  const [history, setHistory] = useState(8000);
  const [userMsg, setUserMsg] = useState(1000);
  const used = system + history + userMsg;
  const remaining = Math.max(0, maxCtx - used);
  const pct = (v) => ((v / maxCtx) * 100).toFixed(1);

  return (
    <div style={{ width: '100%' }}>
      <div style={{ height: 28, borderRadius: 8, overflow: 'hidden', display: 'flex', marginBottom: 16, border: '1px solid var(--border)' }}>
        <div style={{ width: `${pct(system)}%`, background: '#7c3aed', transition: 'width 0.3s' }} title="System" />
        <div style={{ width: `${pct(history)}%`, background: '#2563eb', transition: 'width 0.3s' }} title="History" />
        <div style={{ width: `${pct(userMsg)}%`, background: '#059669', transition: 'width 0.3s' }} title="User" />
        <div style={{ flex: 1, background: 'var(--surface-alt)' }} title="Available" />
      </div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16, justifyContent: 'center' }}>
        {[
          { label: 'System', color: '#7c3aed', val: system, set: setSystem },
          { label: 'History', color: '#2563eb', val: history, set: setHistory },
          { label: 'User msg', color: '#059669', val: userMsg, set: setUserMsg },
        ].map(s => (
          <div key={s.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>{s.label}</span>
            </div>
            <input type="range" min="0" max="60000" step="500" value={s.val}
              onChange={e => s.set(Number(e.target.value))}
              style={{ width: 120, accentColor: s.color }}
            />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)' }}>{(s.val / 1000).toFixed(1)}K</span>
          </div>
        ))}
      </div>
      <div style={{ textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
        <span style={{ color: remaining < 10000 ? 'var(--error-color)' : 'var(--accent)' }}>
          {(remaining / 1000).toFixed(1)}K tokens remaining
        </span>
        <span style={{ color: 'var(--text-3)', fontSize: 10, marginLeft: 8 }}>
          / 128K context
        </span>
      </div>
    </div>
  );
}

// ── Visual router ────────────────────────────────────────────────
function Visual({ type }) {
  switch (type) {
    case 'brain-network':  return <BrainNetwork />;
    case 'nested-circles': return <NestedCircles />;
    case 'timeline':       return <TimelineVis />;
    case 'training-loop':  return <TrainingLoop />;
    case 'data-flow':      return <DataFlowVis />;
    case 'supervised':     return <TypeIconVis icon="🏷️" labels={['Labeled data', 'Input → Output', 'Classification', 'Regression']} />;
    case 'unsupervised':   return <TypeIconVis icon="🔍" labels={['Unlabeled data', 'Clustering', 'Anomaly detection', 'Dimensionality reduction']} />;
    case 'reinforcement':  return <TypeIconVis icon="🎮" labels={['Agent', 'Environment', 'Reward', 'Policy']} />;
    case 'neuron':         return <TypeIconVis icon="⚡" labels={['Inputs', 'Weights', 'Sum', 'Activation']} />;
    case 'layers':         return <TypeIconVis icon="🧱" labels={['Input layer', 'Hidden layers', 'Output layer', 'Backpropagation']} />;
    case 'vision':         return <TypeIconVis icon="👁️" labels={['CNNs', 'Object detection', 'Segmentation', 'Medical imaging']} />;
    case 'nlp':            return <TypeIconVis icon="💬" labels={['Transformers', 'Attention', 'Tokenization', 'Embeddings']} />;
    case 'generative':     return <TypeIconVis icon="✨" labels={['LLMs', 'Diffusion', 'Code gen', 'Multimodal']} />;
    case 'fairness':       return <TypeIconVis icon="⚖️" labels={['Bias', 'Fairness', 'Representation', 'Accountability']} />;
    case 'responsible':    return <TypeIconVis icon="🛡️" labels={['Transparency', 'Privacy', 'Safety', 'Equity']} />;
    case 'frontier':       return <TypeIconVis icon="🚀" labels={['Agents', 'Reasoning', 'Multimodal', 'Infrastructure']} />;
    // ── LLM Deep Dive visuals ──
    case 'token-pipeline':     return <FlowVis steps={['📝 Text', '🔤 Tokenizer', '🔢 Token IDs', '🧠 Model']} />;
    case 'bpe-merge':          return <TypeIconVis icon="🧩" labels={['Characters', 'Frequent pairs', 'Merge', 'Vocabulary']} />;
    case 'token-costs':        return <TypeIconVis icon="💰" labels={['$2.50/M GPT-4o', '$15/M Opus', '$0.075/M Flash', '1 token ≈ ¾ word']} />;
    case 'embedding-space':    return <TypeIconVis icon="📐" labels={['Dense vectors', '768–12K dims', 'Semantic proximity', 'Learned representations']} />;
    case 'vector-arithmetic':  return <TypeIconVis icon="👑" labels={['king − man', '+ woman', '≈ queen', 'Analogy as math']} />;
    case 'positional-encoding':return <TypeIconVis icon="📍" labels={['Sinusoidal', 'RoPE', 'Relative position', 'Order matters']} />;
    case 'transformer-arch':   return <FlowVis steps={['🔤 Input', '📐 Embed', '🔄 Attention', '🧮 FFN', '📊 Output']} />;
    case 'qkv-diagram':        return <TypeIconVis icon="🔑" labels={['Q: Query', 'K: Key', 'V: Value', 'softmax(QKᵀ/√d)·V']} />;
    case 'multi-head':         return <TypeIconVis icon="👁️‍🗨️" labels={['Syntax head', 'Coreference head', 'Semantic head', '32–128 heads']} />;
    case 'ffn-residual':       return <TypeIconVis icon="🧱" labels={['Attention', 'Residual add', 'Layer norm', 'FFN (4x width)']} />;
    case 'context-window':     return <TypeIconVis icon="📏" labels={['128K GPT-4o', '200K Claude', '1M Gemini', 'Input + Output']} />;
    case 'kv-cache':           return <FlowVis steps={['🔑 Keys cached', '📦 Values cached', '⚡ Skip recompute', '💾 GPU memory']} />;
    case 'long-context':       return <TypeIconVis icon="📚" labels={['RAG retrieval', 'Sliding window', 'Summarize chains', 'Lost in the middle']} />;
    case 'pretraining':        return <TypeIconVis icon="🌐" labels={['15T tokens', 'Next-token prediction', '30M GPU-hours', '$100M+ cost']} />;
    case 'scaling-laws':       return <TypeIconVis icon="📈" labels={['N params', 'D data size', 'C compute', 'Chinchilla optimal']} />;
    case 'rlhf-pipeline':      return <FlowVis steps={['📝 SFT', '👤 Human ranks', '🏆 Reward model', '🎯 PPO/DPO']} />;
    case 'distributed-training': return <TypeIconVis icon="🖥️" labels={['Data parallel', 'Tensor parallel', 'Pipeline parallel', 'ZeRO']} />;
    case 'generation-loop':    return <FlowVis steps={['🧠 Forward pass', '🎲 Sample token', '📎 Append', '🔄 Repeat']} />;
    case 'sampling-strategies': return <TypeIconVis icon="🎯" labels={['Top-K', 'Top-P (nucleus)', 'Min-P', 'Beam search']} />;
    case 'structured-output':  return <TypeIconVis icon="📋" labels={['JSON mode', 'Grammar (GBNF)', 'Function calling', 'Typed outputs']} />;
    case 'rag-pipeline':       return <FlowVis steps={['📄 Index docs', '🔍 Retrieve', '💉 Augment prompt', '🧠 Generate']} />;
    case 'vector-db':          return <TypeIconVis icon="🗄️" labels={['Pinecone', 'Weaviate', 'Qdrant', 'pgvector']} />;
    case 'agent-loop':         return <FlowVis steps={['👀 Observe', '🤔 Think', '🔧 Act', '📊 Result']} />;
    case 'benchmarks':         return <TypeIconVis icon="📊" labels={['MMLU', 'HumanEval', 'GSM8K', 'Arena Elo']} />;
    case 'custom-evals':       return <TypeIconVis icon="✅" labels={['Assertions', 'LLM-as-Judge', 'Human eval', 'Regression tests']} />;
    case 'hallucination':      return <TypeIconVis icon="🌫️" labels={['Plausible ≠ true', 'RAG grounding', 'Citations', 'Low temperature']} />;
    case 'safety-alignment':   return <TypeIconVis icon="🛡️" labels={['Constitutional AI', 'Red teaming', 'Guardrails', 'Alignment tax']} />;
    default:                   return null;
  }
}

// ── Interactive router ───────────────────────────────────────────
function Interactive({ type }) {
  switch (type) {
    case 'gradient-descent':   return <GradientDescent />;
    case 'neuron-builder':     return <NeuronBuilder />;
    case 'tokenizer':          return <TokenizerInteractive />;
    case 'attention-heatmap':  return <AttentionHeatmap />;
    case 'temperature-slider': return <TemperatureSlider />;
    case 'vector-similarity':  return <VectorSimilarity />;
    case 'context-budget':     return <ContextBudget />;
    default:                   return null;
  }
}

// ── Coin rain celebration ────────────────────────────────────────
function makeCoinData() {
  return Array.from({ length: 25 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.8,
    duration: 1.5 + Math.random() * 1.5,
    size: 16 + Math.random() * 16,
  }));
}

function CoinRain() {
  const [coins] = useState(() => makeCoinData());

  return (
    <div className="coin-rain">
      {coins.map(c => (
        <span
          key={c.id}
          className="coin-rain__coin"
          style={{
            left: `${c.left}%`,
            fontSize: c.size,
            animationDelay: `${c.delay}s`,
            animationDuration: `${c.duration}s`,
          }}
        >
          🪙
        </span>
      ))}
    </div>
  );
}

// ── Lesson Slide ──────────────────────────────────────────────────
function LessonSlide({ lesson, index, total }) {
  return (
    <div className="cv-lesson" key={`lesson-${index}`}>
      <div className="cv-lesson__eyebrow">
        lesson {index + 1} of {total}
      </div>
      <h2 className="cv-lesson__title">{lesson.title}</h2>

      {lesson.visual && (
        <div className="cv-visual">
          <Visual type={lesson.visual} />
        </div>
      )}

      <div className="cv-lesson__body">{formatBody(lesson.body)}</div>

      {lesson.interactive && (
        <div className="cv-visual">
          <Interactive type={lesson.interactive} />
        </div>
      )}
    </div>
  );
}

// ── Quiz Slide ───────────────────────────────────────────────────
function QuizSlide({ quiz, quizIndex, totalQuiz, onAnswer, answered }) {
  return (
    <div className="cv-quiz" key={`quiz-${quizIndex}`}>
      <div className="cv-quiz__eyebrow">
        quiz · question {quizIndex + 1} of {totalQuiz}
      </div>
      <h2 className="cv-quiz__question">{quiz.question}</h2>
      <div className="cv-quiz__options">
        {quiz.options.map((opt, i) => {
          let cls = 'cv-quiz__option';
          if (answered !== null) {
            if (i === quiz.correct) cls += ' cv-quiz__option--correct';
            else if (i === answered) cls += ' cv-quiz__option--wrong';
          } else if (i === answered) {
            cls += ' cv-quiz__option--selected';
          }
          return (
            <button
              key={i}
              className={cls}
              disabled={answered !== null}
              onClick={() => onAnswer(i)}
            >
              {opt}
            </button>
          );
        })}
      </div>
      {answered !== null && (
        <div className="cv-quiz__explanation">
          {answered === quiz.correct ? '✅ ' : '❌ '}
          <strong>{answered === quiz.correct ? 'Correct!' : 'Not quite.'}</strong>{' '}
          {quiz.explanation}
        </div>
      )}
    </div>
  );
}

// ── Simple markdown-ish body formatter ───────────────────────────
function formatBody(text) {
  return text.split('\n').map((line, i) => {
    // Bold
    const parts = line.split(/(\*\*[^*]+\*\*)/g).map((seg, j) => {
      if (seg.startsWith('**') && seg.endsWith('**')) {
        return <strong key={j}>{seg.slice(2, -2)}</strong>;
      }
      return seg;
    });
    return (
      <React.Fragment key={i}>
        {parts}
        {i < text.split('\n').length - 1 && <br />}
      </React.Fragment>
    );
  });
}

// ── Complete Screen ──────────────────────────────────────────────
function CompleteScreen({ mod, courseId }) {
  const [showRain, setShowRain] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShowRain(false), 3000);
    return () => clearTimeout(t);
  }, []);

  const course = COURSES.find(c => c.id === courseId);
  const modIndex = course?.modules.findIndex(m => m.id === mod.id) ?? -1;
  const nextMod = course?.modules[modIndex + 1];

  return (
    <>
      {showRain && <CoinRain />}
      <div className="cv-complete">
        <div className="cv-complete__icon">🏆</div>
        <h2 className="cv-complete__title">Module Complete!</h2>
        <p className="cv-complete__subtitle">
          You finished <strong>{mod.title}</strong>. Nice work.
        </p>
        <div className="cv-complete__coins">
          <span className="cv-complete__coins-icon">🪙</span>
          <div>
            <div className="cv-complete__coins-text">earned</div>
            <div className="cv-complete__coins-amount">+{mod.vCoins} vCoins</div>
          </div>
        </div>
        <div className="cv-complete__actions">
          {nextMod && (
            <Link
              to={`/learn/${courseId}/${nextMod.id}`}
              className="cv-nav__btn cv-nav__btn--primary"
            >
              Next: {nextMod.title} →
            </Link>
          )}
          <Link to="/learn" className="cv-nav__btn">
            ← Back to courses
          </Link>
        </div>
      </div>
    </>
  );
}

// ── Main CourseViewer ─────────────────────────────────────────────
// ── Module Player ────────────────────────────────────────────────
function ModulePlayer({ course, mod, courseId, awardCoins, isModuleCompleted }) {
  // Slide index: 0..lessons-1 = lessons, lessons..lessons+quiz-1 = quiz, last = complete
  const totalLessons = mod?.lessons.length ?? 0;
  const totalQuiz = mod?.quiz.length ?? 0;
  const totalSlides = totalLessons + totalQuiz;

  const [slideIndex, setSlideIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [completed, setCompleted] = useState(false);

  const handleQuizAnswer = useCallback((answerIndex) => {
    setQuizAnswers(prev => ({ ...prev, [slideIndex]: answerIndex }));
  }, [slideIndex]);

  const handleNext = useCallback(() => {
    if (slideIndex < totalSlides - 1) {
      setSlideIndex(s => s + 1);
    } else {
      // Complete module
      awardCoins(mod.id, mod.vCoins);
      setCompleted(true);
    }
  }, [slideIndex, totalSlides, awardCoins, mod]);

  const handlePrev = useCallback(() => {
    setSlideIndex(s => Math.max(0, s - 1));
  }, []);

  if (completed || (isModuleCompleted(mod.id) && slideIndex === 0)) {
    if (completed) {
      return (
        <div className="course-viewer">
          <CompleteScreen mod={mod} courseId={courseId} />
        </div>
      );
    }
  }

  const isLesson = slideIndex < totalLessons;
  const quizIndex = slideIndex - totalLessons;
  const currentQuizAnswered = !isLesson ? quizAnswers[slideIndex] ?? null : null;
  const isLastSlide = slideIndex === totalSlides - 1;
  const canAdvance = isLesson || currentQuizAnswered !== null;
  const progressPct = ((slideIndex + 1) / totalSlides) * 100;

  return (
    <div className="course-viewer">
      {/* Breadcrumb */}
      <div className="cv-breadcrumb">
        <Link to="/learn">Learn</Link>
        <span>/</span>
        <Link to="/learn">{course.title}</Link>
        <span>/</span>
        <span>{mod.title}</span>
      </div>

      {/* Progress */}
      <div className="cv-progress">
        <div className="cv-progress__bar">
          <div className="cv-progress__fill" style={{ width: `${progressPct}%` }} />
        </div>
        <div className="cv-progress__info">
          <span>{mod.icon} {mod.title}</span>
          <span>{slideIndex + 1} / {totalSlides}</span>
        </div>
      </div>

      {/* Slide */}
      <div className="cv-slide">
        {isLesson ? (
          <LessonSlide
            lesson={mod.lessons[slideIndex]}
            index={slideIndex}
            total={totalLessons}
          />
        ) : (
          <QuizSlide
            quiz={mod.quiz[quizIndex]}
            quizIndex={quizIndex}
            totalQuiz={totalQuiz}
            onAnswer={handleQuizAnswer}
            answered={currentQuizAnswered}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="cv-nav">
        <button
          className="cv-nav__btn"
          onClick={handlePrev}
          disabled={slideIndex === 0}
        >
          ← Previous
        </button>
        <button
          className={`cv-nav__btn${canAdvance ? ' cv-nav__btn--primary' : ''}`}
          onClick={handleNext}
          disabled={!canAdvance}
        >
          {isLastSlide ? `Complete · +${mod.vCoins} 🪙` : 'Next →'}
        </button>
      </div>
    </div>
  );
}

// ── Main CourseViewer ─────────────────────────────────────────────
export default function CourseViewer() {
  const { courseId, moduleId } = useParams();
  const { awardCoins, isModuleCompleted } = useVCoins();

  const course = COURSES.find(c => c.id === courseId);
  const mod = course?.modules.find(m => m.id === moduleId);

  if (!course || !mod) {
    return (
      <div className="course-viewer" style={{ textAlign: 'center', paddingTop: 160 }}>
        <h2 style={{ color: 'var(--text-1)' }}>Module not found</h2>
        <Link to="/learn" className="cv-nav__btn" style={{ marginTop: 20, display: 'inline-block' }}>
          ← Back to courses
        </Link>
      </div>
    );
  }

  return (
    <ModulePlayer
      key={moduleId}
      course={course}
      mod={mod}
      courseId={courseId}
      awardCoins={awardCoins}
      isModuleCompleted={isModuleCompleted}
    />
  );
}
