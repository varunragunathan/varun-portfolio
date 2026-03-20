// ── Streaming status indicator ────────────────────────────────────
// Cycles through geeky loading messages while waiting for first token.
// Disappears as soon as content starts arriving.

import React, { useState, useEffect } from 'react';
import './StreamingStatus.css';

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

export default function StreamingStatus() {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * MESSAGES.length));

  useEffect(() => {
    const id = setInterval(() => {
      setIdx(i => (i + 1) % MESSAGES.length);
    }, 1800);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="streaming-status">
      <span className="streaming-status__dot" />
      <span className="streaming-status__text">{MESSAGES[idx]}</span>
    </div>
  );
}
