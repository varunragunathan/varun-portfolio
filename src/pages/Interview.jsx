import React, { useState, useCallback, useRef } from 'react';
import PixelOwl from '../components/PixelOwl';
import SpeechWaveform from '../components/SpeechWaveform';
import { useVoiceInterview, INTERVIEW_STATES, owlState } from '../hooks/useVoiceInterview';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import './Interview.css';

// ── Avatar wrapper — swap avatarId to change persona later ───────
function InterviewerAvatar({ interviewState, size = 14 }) {
  return (
    <div className="interview-avatar">
      <PixelOwl state={owlState(interviewState)} size={size} />
    </div>
  );
}

// ── Theme cards ───────────────────────────────────────────────────
const THEMES = [
  { id: 'frontend',      label: 'Frontend Eng',   icon: '⚛️',  desc: 'React, JS, CSS, perf' },
  { id: 'backend',       label: 'Backend & Sys',  icon: '⚙️',  desc: 'APIs, databases, infra' },
  { id: 'system-design', label: 'System Design',  icon: '🏗️',  desc: 'Scale, architecture' },
  { id: 'behavioral',    label: 'Behavioral',      icon: '🧠',  desc: 'Leadership, STAR method' },
  { id: 'dsa',           label: 'DSA',             icon: '📊',  desc: 'Algorithms, complexity' },
  { id: 'fullstack',     label: 'Full Stack',      icon: '🔧',  desc: 'End-to-end engineering' },
  { id: 'product',       label: 'Product Mgmt',   icon: '📋',  desc: 'Strategy, metrics, users' },
];

const DURATIONS = [
  { value: 900,  label: '15 min' },
  { value: 1800, label: '30 min' },
  { value: 2700, label: '45 min' },
  { value: 3600, label: '60 min' },
];

function fmtTime(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
function fmtCost(usd) {
  if (usd < 0.001) return '< $0.001';
  return `$${usd.toFixed(4)}`;
}

// ── Setup screen ──────────────────────────────────────────────────
function SetupView({ onStart, isSupported }) {
  const [theme,    setTheme]    = useState('frontend');
  const [duration, setDuration] = useState(1800);

  const randomize = useCallback(() => {
    setTheme(THEMES[Math.floor(Math.random() * THEMES.length)].id);
  }, []);

  return (
    <div className="interview-setup">
      <div className="interview-setup__owl">
        <InterviewerAvatar interviewState={INTERVIEW_STATES.IDLE} size={16} />
      </div>

      <h1 className="interview-setup__title">Ready to interview you</h1>
      <p className="interview-setup__sub">
        Hooty will ask questions and listen over voice — just like a phone screen.
      </p>

      {!isSupported && (
        <div className="interview-setup__warn">
          Voice input needs Chrome or Edge. You can still type your answers.
        </div>
      )}

      <section className="interview-setup__section">
        <div className="interview-setup__section-header">
          <span className="interview-setup__label">Theme</span>
          <button className="interview-setup__random" onClick={randomize}>🎲 random</button>
        </div>
        <div className="interview-setup__themes">
          {THEMES.map(t => (
            <button
              key={t.id}
              className={`interview-theme-card${theme === t.id ? ' interview-theme-card--active' : ''}`}
              onClick={() => setTheme(t.id)}
            >
              <span className="interview-theme-card__icon">{t.icon}</span>
              <span className="interview-theme-card__label">{t.label}</span>
              <span className="interview-theme-card__desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="interview-setup__section">
        <div className="interview-setup__label">Duration</div>
        <div className="interview-setup__durations">
          {DURATIONS.map(d => (
            <button
              key={d.value}
              className={`interview-duration-chip${duration === d.value ? ' interview-duration-chip--active' : ''}`}
              onClick={() => setDuration(d.value)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </section>

      <button className="interview-setup__start" onClick={() => onStart({ theme, duration })}>
        Start Interview
      </button>
    </div>
  );
}

// ── Active interview ──────────────────────────────────────────────
function ActiveView({ state, remaining, lastText, transcript, onEnd, onStopRecording, onInterrupt, onSendText }) {
  const [showText, setShowText] = useState(false);
  const [typed,    setTyped]    = useState('');
  const inputRef = useRef(null);

  const isSpeaking  = state === INTERVIEW_STATES.OPENING || state === INTERVIEW_STATES.RESPONDING;
  const isListening = state === INTERVIEW_STATES.LISTENING;
  const isThinking  = state === INTERVIEW_STATES.PROCESSING;

  const handleTextSubmit = (e) => {
    e.preventDefault();
    if (!typed.trim()) return;
    onSendText(typed);
    setTyped('');
    setShowText(false);
  };

  const handleShowText = () => {
    setShowText(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  return (
    <div className="interview-active">

      {/* Timer */}
      <div className="interview-active__timer">
        <span className={`interview-active__timer-dot${isListening ? ' interview-active__timer-dot--live' : ''}`} />
        {fmtTime(remaining)} remaining
      </div>

      {/* ── Main visual area ──────────────────────────────────── */}
      <div className="interview-active__stage">

        {/* Waveform — shown while Hooty is speaking */}
        {isSpeaking && (
          <div className="interview-active__waveform-wrap">
            <SpeechWaveform mode="speaking" />
            <p className="interview-active__stage-label">Hooty is speaking…</p>
          </div>
        )}

        {/* Avatar — shown while listening or thinking */}
        {!isSpeaking && (
          <div className="interview-active__avatar-wrap">
            <InterviewerAvatar interviewState={state} size={16} />
            <p className="interview-active__stage-label">
              {isListening ? 'Listening — speak now' : isThinking ? 'Thinking…' : ''}
            </p>
          </div>
        )}
      </div>

      {/* Last AI text */}
      {lastText && (
        <div className="interview-active__last-text">
          <p>{lastText}</p>
        </div>
      )}

      {/* Mic waveform when listening */}
      {isListening && (
        <div className="interview-active__mic-wave">
          <SpeechWaveform mode="listening" />
        </div>
      )}

      {/* ── Controls ──────────────────────────────────────────── */}
      <div className="interview-active__controls">

        {/* Interrupt button while Hooty is speaking */}
        {isSpeaking && (
          <button className="interview-ctrl interview-ctrl--interrupt" onClick={onInterrupt}>
            <span className="interview-ctrl__icon">🎙</span> Speak now
          </button>
        )}

        {/* Listening controls */}
        {isListening && !showText && (
          <>
            <button className="interview-ctrl interview-ctrl--stop" onClick={onStopRecording}>
              ⏹ Stop
            </button>
            <button className="interview-ctrl interview-ctrl--text" onClick={handleShowText}>
              ⌨️ Type instead
            </button>
          </>
        )}

        {/* Text input fallback */}
        {showText && (
          <form className="interview-active__text-form" onSubmit={handleTextSubmit}>
            <input
              ref={inputRef}
              className="interview-active__text-input"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              placeholder="Type your answer…"
              autoComplete="off"
            />
            <button
              type="submit"
              className="interview-ctrl interview-ctrl--send"
              disabled={!typed.trim()}
            >
              Send
            </button>
            <button
              type="button"
              className="interview-ctrl interview-ctrl--text"
              onClick={() => setShowText(false)}
            >
              Use mic
            </button>
          </form>
        )}
      </div>

      {/* Recent transcript mini-feed */}
      {transcript.length > 0 && (
        <div className="interview-active__transcript">
          {transcript.slice(-4).map((t, i) => (
            <div key={i} className={`interview-active__turn interview-active__turn--${t.role}`}>
              <span className="interview-active__turn-label">{t.role === 'assistant' ? 'Hooty' : 'You'}</span>
              <span className="interview-active__turn-text">{t.text}</span>
            </div>
          ))}
        </div>
      )}

      <button className="interview-active__end" onClick={onEnd}>
        End Interview
      </button>
    </div>
  );
}

// ── Summary screen ────────────────────────────────────────────────
function SummaryView({ transcript, elapsed, cost, onRestart }) {
  const [showFull, setShowFull] = useState(false);
  const turns = Math.floor(transcript.filter(t => t.role === 'user').length);

  return (
    <div className="interview-summary">
      <div className="interview-summary__owl">
        <InterviewerAvatar interviewState={INTERVIEW_STATES.ENDED} size={14} />
      </div>
      <h2 className="interview-summary__title">Interview Complete</h2>
      <p className="interview-summary__sub">Great session — here's how it went.</p>

      <div className="interview-summary__stats">
        <div className="interview-summary__stat">
          <span className="interview-summary__stat-value">{fmtTime(elapsed)}</span>
          <span className="interview-summary__stat-label">duration</span>
        </div>
        <div className="interview-summary__stat">
          <span className="interview-summary__stat-value">{turns}</span>
          <span className="interview-summary__stat-label">answers</span>
        </div>
        <div className="interview-summary__stat">
          <span className="interview-summary__stat-value">{fmtCost(cost)}</span>
          <span className="interview-summary__stat-label">cost</span>
        </div>
      </div>

      <div className="interview-summary__transcript">
        <div className="interview-summary__transcript-header">
          <span>Transcript</span>
          <button className="interview-summary__transcript-toggle" onClick={() => setShowFull(f => !f)}>
            {showFull ? 'Collapse' : 'Expand'}
          </button>
        </div>
        <div className={`interview-summary__transcript-body${showFull ? ' interview-summary__transcript-body--open' : ''}`}>
          {transcript.map((t, i) => (
            <div key={i} className={`interview-summary__turn interview-summary__turn--${t.role}`}>
              <span className="interview-summary__turn-label">{t.role === 'assistant' ? 'Hooty' : 'You'}</span>
              <p className="interview-summary__turn-text">{t.text}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="interview-summary__actions">
        <button className="interview-summary__restart" onClick={onRestart}>New Interview</button>
        <Link to="/" className="interview-summary__home">← Home</Link>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function InterviewPage() {
  const { user } = useAuth();
  const {
    state, transcript, lastText, error,
    elapsed, remaining, cost,
    start, endInterview, stopRecording, interrupt, sendText, clearError, isSupported,
  } = useVoiceInterview();

  if (!user) {
    return (
      <div className="interview-gate">
        <PixelOwl state="idle" size={12} />
        <p className="interview-gate__text">Sign in to start a voice interview with Hooty.</p>
        <Link to="/auth" className="interview-gate__link">Sign in</Link>
      </div>
    );
  }

  const isActive = state !== INTERVIEW_STATES.IDLE && state !== INTERVIEW_STATES.ENDED;

  return (
    <div className="interview-page">
      {error && (
        <div className="interview-error" role="alert">
          {error}
          <button onClick={clearError} className="interview-error__dismiss">✕</button>
        </div>
      )}

      {state === INTERVIEW_STATES.IDLE && (
        <SetupView onStart={start} isSupported={isSupported} />
      )}

      {isActive && (
        <ActiveView
          state={state}
          remaining={remaining}
          lastText={lastText}
          transcript={transcript}
          onEnd={endInterview}
          onStopRecording={stopRecording}
          onInterrupt={interrupt}
          onSendText={sendText}
        />
      )}

      {state === INTERVIEW_STATES.ENDED && (
        <SummaryView
          transcript={transcript}
          elapsed={elapsed}
          cost={cost}
          onRestart={() => window.location.reload()}
        />
      )}
    </div>
  );
}
