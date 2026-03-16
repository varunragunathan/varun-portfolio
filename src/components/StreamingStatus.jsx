// ── Streaming status indicator ────────────────────────────────────
// Cycles through geeky loading messages while waiting for first token.
// Disappears as soon as content starts arriving.

import React, { useState, useEffect } from 'react';

const MESSAGES = [
  'vectorizing your query…',
  'cosine similarity intensifies…',
  'retrieving chunks from the void…',
  'bribing the embeddings…',
  'warming up attention heads…',
  'doing math you don\'t want to know about…',
  'running inference at the edge…',
  'asking llama-70b nicely…',
  'whispering to the transformer…',
  'computing dot products at light speed…',
  'hallucination filters engaged…',
  'context window loading…',
  'tokens incoming…',
  'gradient descent complete, probably…',
];

export default function StreamingStatus({ t }) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * MESSAGES.length));

  useEffect(() => {
    const id = setInterval(() => {
      setIdx(i => (i + 1) % MESSAGES.length);
    }, 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      display:    'flex',
      alignItems: 'center',
      gap:        10,
      padding:    '10px 14px',
    }}>
      {/* Pulsing dot */}
      <span style={{
        width:        7,
        height:       7,
        borderRadius: '50%',
        background:   t.accent,
        flexShrink:   0,
        animation:    'rag-pulse 1s ease-in-out infinite',
      }} />
      <span style={{
        fontFamily:  "'IBM Plex Mono', monospace",
        fontSize:    12,
        color:       t.accentMuted,
        letterSpacing: '0.02em',
      }}>
        {MESSAGES[idx]}
      </span>
      <style>{`
        @keyframes rag-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.3; transform: scale(0.7); }
        }
      `}</style>
    </div>
  );
}
