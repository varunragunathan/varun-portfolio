// ── SpeechWaveform ────────────────────────────────────────────────
// Reactive animated waveform.
//   mode='speaking' — driven by iv-voice-pulse word-boundary events
//                     from useVoiceInterview; decays naturally between words
//   mode='listening' — real microphone FFT data via Web Audio API

import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import './SpeechWaveform.css';

const BARS = 32;
const GAP  = 3;

function lerp(a, b, t) { return a + (b - a) * t; }

const SpeechWaveform = forwardRef(function SpeechWaveform({ mode = 'speaking' }, ref) {
  const canvasRef   = useRef(null);
  const rafRef      = useRef(null);
  const analyserRef = useRef(null);
  const streamRef   = useRef(null);
  const smoothRef   = useRef(new Float32Array(BARS).fill(0.05));
  const tRef        = useRef(0);
  // Tracks the last word-boundary pulse: { amp, time }
  const pulseRef    = useRef({ amp: 0.6, time: 0 });

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

    // ── Speaking: listen for word-boundary pulses ─────────────────
    const onPulse = (e) => {
      pulseRef.current = { amp: e.detail.amp, time: performance.now() };
    };
    if (mode === 'speaking') {
      // Seed so the waveform starts "alive" before first word fires
      pulseRef.current = { amp: 0.6, time: performance.now() }; // safe inside effect
      window.addEventListener('iv-voice-pulse', onPulse);
    }

    // ── Listening: real mic FFT via Web Audio API ─────────────────
    if (mode === 'listening') {
      navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(stream => {
          streamRef.current = stream;
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          // Resume in case browser suspended context outside user-gesture
          audioCtx.resume().catch(() => {});
          const source   = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize               = 128;
          analyser.smoothingTimeConstant = 0.78;
          source.connect(analyser);
          analyserRef.current = { analyser, audioCtx };
        })
        .catch(() => { /* permission denied — falls back to idle breathing */ });
    }

    // ── Draw loop ─────────────────────────────────────────────────
    const draw = () => {
      const W    = canvas.width;
      const H    = canvas.height;
      const barW = Math.floor((W - (BARS - 1) * GAP) / BARS);

      ctx.clearRect(0, 0, W, H);
      tRef.current += 0.022;
      const t = tRef.current;

      const target = new Float32Array(BARS);
      const smooth = smoothRef.current;

      if (mode === 'speaking') {
        // Decay the last pulse amplitude over ~220 ms
        const age      = performance.now() - pulseRef.current.time;
        const pDecay   = Math.exp(-age / 220);
        const pAmp     = pulseRef.current.amp * pDecay;

        for (let i = 0; i < BARS; i++) {
          const pos      = i / (BARS - 1);
          const envelope = Math.sin(pos * Math.PI); // quieter at edges
          // Low-amplitude base movement so it never looks completely frozen
          const w1 = Math.sin(t * 1.6  + i * 0.44) * 0.14;
          const w2 = Math.sin(t * 2.9  + i * 0.71 + 1.2) * 0.10;
          const w3 = Math.sin(t * 0.9  + i * 0.30 + 2.4) * 0.09;
          // pAmp drives the main height; base sines ride on top
          const raw = (0.18 + pAmp * 0.72 + w1 + w2 + w3) * envelope;
          target[i] = Math.max(0.03, Math.min(0.96, raw));
        }
        for (let i = 0; i < BARS; i++) {
          smooth[i] = lerp(smooth[i], target[i], 0.14);
        }
      } else {
        // Listening: real mic FFT data, or gentle idle if mic unavailable
        if (analyserRef.current) {
          const freq = new Uint8Array(analyserRef.current.analyser.frequencyBinCount);
          analyserRef.current.analyser.getByteFrequencyData(freq);
          for (let i = 0; i < BARS; i++) {
            // Use lower 70% of freq bands (voice fundamentals)
            const idx  = Math.floor((i / BARS) * freq.length * 0.70);
            target[i]  = Math.max(0.03, freq[idx] / 255);
          }
        } else {
          // Idle breathing until mic ready
          for (let i = 0; i < BARS; i++) {
            const pos  = i / (BARS - 1);
            target[i]  = 0.05 + Math.sin(pos * Math.PI) * 0.06 * (0.8 + 0.2 * Math.sin(t * 0.7));
          }
        }
        for (let i = 0; i < BARS; i++) {
          smooth[i] = lerp(smooth[i], target[i], 0.30);
        }
      }

      // ── Render bars ───────────────────────────────────────────
      for (let i = 0; i < BARS; i++) {
        const x    = i * (barW + GAP);
        const amp  = smooth[i];
        const barH = Math.max(4, amp * H);
        const y    = (H - barH) / 2;
        const r    = Math.min(barW / 2, 5);

        const grad = ctx.createLinearGradient(x, y, x, y + barH);
        if (mode === 'speaking') {
          grad.addColorStop(0,   'rgba(129,140,248, 0.85)');
          grad.addColorStop(0.5, 'rgba(167,139,250, 1.00)');
          grad.addColorStop(1,   'rgba(129,140,248, 0.85)');
        } else {
          grad.addColorStop(0,   'rgba(52,211,153, 0.85)');
          grad.addColorStop(0.5, 'rgba(45,212,191, 1.00)');
          grad.addColorStop(1,   'rgba(52,211,153, 0.85)');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, r);
        ctx.fill();

        // Glow: wider softer bar behind
        ctx.globalAlpha = 0.13;
        ctx.fillStyle   = mode === 'speaking' ? '#818cf8' : '#34d399';
        ctx.beginPath();
        ctx.roundRect(x - 1, y + barH * 0.15, barW + 2, barH * 0.70, r + 1);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      if (mode === 'speaking') window.removeEventListener('iv-voice-pulse', onPulse);
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
