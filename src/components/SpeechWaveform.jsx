// ── SpeechWaveform ────────────────────────────────────────────────
// Beautiful animated waveform.
//   mode='speaking' — smooth multi-wave animation (Hooty's voice)
//   mode='listening' — real microphone FFT data via Web Audio API

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import './SpeechWaveform.css';

const BARS     = 32;
const GAP      = 3;

// Smooth lerp toward target value
function lerp(a, b, t) { return a + (b - a) * t; }

const SpeechWaveform = forwardRef(function SpeechWaveform({ mode = 'speaking' }, ref) {
  const canvasRef  = useRef(null);
  const rafRef     = useRef(null);
  const analyserRef = useRef(null);
  const streamRef  = useRef(null);
  const smoothRef  = useRef(new Float32Array(BARS).fill(0.05));
  const tRef       = useRef(0);

  // Expose cleanup to parent via ref
  useImperativeHandle(ref, () => ({
    stop() {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      analyserRef.current?.audioCtx.close().catch(() => {});
      analyserRef.current = null;
      streamRef.current   = null;
    },
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // ── Mic setup for listening mode ──────────────────────────────
    if (mode === 'listening') {
      navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => {
          streamRef.current = stream;
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const source   = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 128;
          analyser.smoothingTimeConstant = 0.75;
          source.connect(analyser);
          analyserRef.current = { analyser, audioCtx };
        })
        .catch(() => { /* fall back to animated idle */ });
    }

    // ── Draw loop ─────────────────────────────────────────────────
    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      const barW = Math.floor((W - (BARS - 1) * GAP) / BARS);

      ctx.clearRect(0, 0, W, H);
      tRef.current += 0.022;
      const t = tRef.current;

      const target = new Float32Array(BARS);
      const smooth = smoothRef.current;

      if (mode === 'speaking') {
        // Three overlapping sine waves → natural, speech-like rhythm
        for (let i = 0; i < BARS; i++) {
          const pos = i / (BARS - 1);
          // Bell-curve envelope: edges are quieter, center louder
          const envelope = Math.sin(pos * Math.PI);
          const w1 = Math.sin(t * 1.5  + i * 0.42) * 0.38;
          const w2 = Math.sin(t * 2.7  + i * 0.68 + 1.1) * 0.28;
          const w3 = Math.sin(t * 0.85 + i * 0.28 + 2.3) * 0.34;
          const raw = (0.55 + w1 + w2 + w3) * envelope;
          target[i] = Math.max(0.03, Math.min(0.96, raw));
        }
        for (let i = 0; i < BARS; i++) {
          smooth[i] = lerp(smooth[i], target[i], 0.12);
        }
      } else {
        // Listening: real mic FFT data, or gentle idle if no mic
        if (analyserRef.current) {
          const freq = new Uint8Array(analyserRef.current.analyser.frequencyBinCount);
          analyserRef.current.analyser.getByteFrequencyData(freq);
          for (let i = 0; i < BARS; i++) {
            const idx = Math.floor((i / BARS) * freq.length * 0.7); // use lower freq bands
            target[i] = Math.max(0.03, freq[idx] / 255);
          }
        } else {
          // Idle breathing when mic not available yet
          for (let i = 0; i < BARS; i++) {
            const pos = i / (BARS - 1);
            target[i] = 0.05 + Math.sin(pos * Math.PI) * 0.06 * (0.8 + 0.2 * Math.sin(t * 0.7));
          }
        }
        for (let i = 0; i < BARS; i++) {
          smooth[i] = lerp(smooth[i], target[i], 0.28);
        }
      }

      // ── Render bars ───────────────────────────────────────────
      for (let i = 0; i < BARS; i++) {
        const x    = i * (barW + GAP);
        const amp  = smooth[i];
        const barH = Math.max(4, amp * H);
        const y    = (H - barH) / 2;
        const r    = Math.min(barW / 2, 5);

        // Color gradient along the bar (vertical)
        const grad = ctx.createLinearGradient(x, y, x, y + barH);
        if (mode === 'speaking') {
          // Indigo → violet → indigo
          grad.addColorStop(0,   'rgba(129,140,248, 0.85)');  // indigo-400
          grad.addColorStop(0.5, 'rgba(167,139,250, 1.00)');  // violet-400
          grad.addColorStop(1,   'rgba(129,140,248, 0.85)');
        } else {
          // Green → teal → green
          grad.addColorStop(0,   'rgba(52,211,153, 0.85)');   // emerald-400
          grad.addColorStop(0.5, 'rgba(45,212,191, 1.00)');   // teal-400
          grad.addColorStop(1,   'rgba(52,211,153, 0.85)');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, r);
        ctx.fill();

        // Subtle glow: a softer, wider bar behind
        ctx.globalAlpha = 0.12;
        ctx.fillStyle = mode === 'speaking' ? '#818cf8' : '#34d399';
        ctx.beginPath();
        ctx.roundRect(x - 1, y + barH * 0.15, barW + 2, barH * 0.7, r + 1);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      analyserRef.current?.audioCtx.close().catch(() => {});
      analyserRef.current = null;
      streamRef.current   = null;
    };
  }, [mode]);

  return (
    <div className={`speech-waveform speech-waveform--${mode}`}>
      <canvas
        ref={canvasRef}
        className="speech-waveform__canvas"
        width={320}
        height={140}
        aria-hidden="true"
      />
    </div>
  );
});

export default SpeechWaveform;
