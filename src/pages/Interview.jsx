import React, { useState, useCallback, useRef, useEffect } from 'react';
import PixelOwl from '../components/PixelOwl';
import SpeechWaveform from '../components/SpeechWaveform';
import { useVoiceInterview, INTERVIEW_STATES, owlState } from '../hooks/useVoiceInterview';
import { useAudioDevices } from '../hooks/useAudioDevices';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import './Interview.css';

// ── Prefs persistence (localStorage) ─────────────────────────────
const PREFS_KEY = 'iv_prefs_v1';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } };
const savePrefs = (p) => { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); };

// ── Voice options (OpenAI TTS voices) ────────────────────────────
const TTS_VOICES = [
  { id: 'nova',    label: 'Nova',    desc: 'Warm & natural'       },
  { id: 'alloy',   label: 'Alloy',   desc: 'Neutral & balanced'   },
  { id: 'onyx',    label: 'Onyx',    desc: 'Deep & authoritative' },
  { id: 'echo',    label: 'Echo',    desc: 'Warm, conversational' },
  { id: 'shimmer', label: 'Shimmer', desc: 'Soft & clear'         },
  { id: 'fable',   label: 'Fable',   desc: 'British & expressive' },
];

// ── Voice sample picker ───────────────────────────────────────────
function VoicePicker({ selectedVoice, onSelect, keyConfigured }) {
  const [playing,   setPlaying]   = useState(null);
  const [loading,   setLoading]   = useState(null);
  const [previewErr,setPreviewErr]= useState(null);
  const ctxRef    = useRef(null); // shared AudioContext for previews
  const sourceRef = useRef(null); // current playing BufferSourceNode
  const cacheRef  = useRef({});   // session-level ArrayBuffer cache keyed by voiceId

  const stopCurrent = () => {
    if (sourceRef.current) {
      sourceRef.current.onended = null;
      try { sourceRef.current.stop(); } catch { /* already stopped */ }
      sourceRef.current = null;
    }
    setPlaying(null);
    setLoading(null);
  };

  const previewVoice = async (e, voiceId) => {
    e.stopPropagation();
    setPreviewErr(null);
    if (loading === voiceId || playing === voiceId) { stopCurrent(); return; }
    stopCurrent();

    // ── Create/unlock AudioContext SYNCHRONOUSLY here, while still in the
    //    user-gesture call chain. iOS Safari blocks audio from async callbacks.
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    ctxRef.current.resume().catch(() => {});
    const ctx = ctxRef.current;

    setLoading(voiceId);
    try {
      // Fetch once, cache ArrayBuffer for the session
      if (!cacheRef.current[voiceId]) {
        const res = await fetch(`/api/proxy/voice-sample/${voiceId}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        cacheRef.current[voiceId] = await res.arrayBuffer();
      }

      // decodeAudioData transfers the buffer, so pass a copy from cache
      const audioBuffer = await ctx.decodeAudioData(cacheRef.current[voiceId].slice(0));

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      sourceRef.current = source;

      setLoading(null);
      setPlaying(voiceId);
      source.onended = () => { sourceRef.current = null; setPlaying(null); };
      source.start();
    } catch (err) {
      setLoading(null);
      setPreviewErr(err.message || 'Preview failed');
    }
  };

  useEffect(() => () => {
    stopCurrent();
    ctxRef.current?.close().catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="voice-picker">
      {TTS_VOICES.map(v => (
        <div
          key={v.id}
          className={`voice-card${selectedVoice === v.id ? ' voice-card--selected' : ''}`}
          onClick={() => onSelect(v.id)}
          role="button"
          tabIndex={0}
          onKeyDown={e => e.key === 'Enter' && onSelect(v.id)}
        >
          <button
            className={`voice-card__play${loading === v.id ? ' voice-card__play--loading' : playing === v.id ? ' voice-card__play--playing' : ''}`}
            onClick={e => previewVoice(e, v.id)}
            aria-label={`Preview ${v.label} voice`}
            title="Preview voice"
          >
            {loading === v.id ? '…' : playing === v.id ? '■' : '▶'}
          </button>
          <div className="voice-card__info">
            <span className="voice-card__name">{v.label}</span>
            <span className="voice-card__desc">{v.desc}</span>
          </div>
          {selectedVoice === v.id && <span className="voice-card__check">✓</span>}
        </div>
      ))}
      {previewErr && <p className="voice-picker__error">{previewErr}</p>}
      {!keyConfigured && (
        <p className="voice-picker__hint">
          <a href="/account/settings#api-key">Add an OpenAI key</a> to preview voices.
        </p>
      )}
    </div>
  );
}

// ── Avatar wrapper ────────────────────────────────────────────────
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
  if (!usd || usd === 0) return 'Free';
  if (usd < 0.001) return '< $0.001';
  return `$${usd.toFixed(4)}`;
}

// ── Audio devices panel ───────────────────────────────────────────
function AudioPanel({ audioDevices }) {
  const {
    inputs, outputs, granted, micId, speakerId, micLevel, testingMic,
    requestPermission, selectMic, selectSpeaker, testMic, stopMicTest, testSpeaker,
  } = audioDevices;

  if (!granted && inputs.length === 0) {
    return (
      <div className="audio-panel">
        <button className="audio-panel__permit" onClick={requestPermission}>
          Allow microphone access to configure devices
        </button>
      </div>
    );
  }

  return (
    <div className="audio-panel">
      {/* Microphone row */}
      <div className="audio-panel__row">
        <label htmlFor="ap-mic" className="audio-panel__label">Microphone</label>
        <div className="audio-panel__controls">
          <select
            id="ap-mic"
            className="audio-panel__select"
            value={micId}
            onChange={e => selectMic(e.target.value)}
          >
            <option value="">System default</option>
            {inputs.map(d => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Mic ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
          <button
            className={`audio-panel__test${testingMic ? ' audio-panel__test--stop' : ''}`}
            onClick={testingMic ? stopMicTest : testMic}
          >
            {testingMic ? 'Stop' : 'Test'}
          </button>
        </div>
        {testingMic && (
          <div className="audio-panel__level-wrap">
            <div className="audio-panel__level-bar" style={{ width: `${Math.round(micLevel * 100)}%` }} />
          </div>
        )}
      </div>

      {/* Speaker row */}
      <div className="audio-panel__row">
        <label htmlFor="ap-spk" className="audio-panel__label">Speaker</label>
        <div className="audio-panel__controls">
          <select
            id="ap-spk"
            className="audio-panel__select"
            value={speakerId}
            onChange={e => selectSpeaker(e.target.value)}
          >
            <option value="">System default</option>
            {outputs.map(d => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Speaker ${d.deviceId.slice(0, 8)}`}
              </option>
            ))}
          </select>
          <button className="audio-panel__test" onClick={testSpeaker}>
            Test
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Model + TTS settings panel ────────────────────────────────────
function SettingsPanel({ prefs, onPrefChange, keyConfigured }) {
  const model = prefs.model || 'workers-ai';
  const tts   = prefs.tts   || 'browser';
  const voice = prefs.voice || 'nova';

  return (
    <div className="settings-panel">
      {/* AI Model */}
      <div className="settings-panel__group">
        <div className="settings-panel__label">AI Model</div>
        <div className="settings-panel__toggles">
          <button
            className={`settings-toggle${model === 'workers-ai' ? ' settings-toggle--active' : ''}`}
            onClick={() => onPrefChange('model', 'workers-ai')}
          >
            <span className="settings-toggle__name">Llama 3.3</span>
            <span className="settings-toggle__tag settings-toggle__tag--free">Free</span>
          </button>
          <button
            className={`settings-toggle${model === 'haiku' ? ' settings-toggle--active' : ''}`}
            onClick={() => onPrefChange('model', 'haiku')}
          >
            <span className="settings-toggle__name">Claude Haiku</span>
            <span className="settings-toggle__tag settings-toggle__tag--paid">~$0.006/session</span>
          </button>
        </div>
      </div>

      {/* TTS engine — only shown if key is configured */}
      {keyConfigured && (
        <div className="settings-panel__group">
          <div className="settings-panel__label">Voice Engine</div>
          <div className="settings-panel__toggles">
            <button
              className={`settings-toggle${tts === 'browser' ? ' settings-toggle--active' : ''}`}
              onClick={() => onPrefChange('tts', 'browser')}
            >
              <span className="settings-toggle__name">Browser voice</span>
              <span className="settings-toggle__tag settings-toggle__tag--free">Free</span>
            </button>
            <button
              className={`settings-toggle${tts === 'openai' ? ' settings-toggle--active' : ''}`}
              onClick={() => onPrefChange('tts', 'openai')}
            >
              <span className="settings-toggle__name">OpenAI TTS</span>
              <span className="settings-toggle__tag settings-toggle__tag--paid">Your key</span>
            </button>
          </div>
        </div>
      )}

      {/* Voice picker — always visible; previews require key */}
      <div className="settings-panel__group">
        <div className="settings-panel__label">Voice</div>
        <VoicePicker
          selectedVoice={voice}
          onSelect={v => onPrefChange('voice', v)}
          keyConfigured={keyConfigured}
        />
      </div>
    </div>
  );
}

// ── Setup screen ──────────────────────────────────────────────────
function SetupView({ prefs, onPrefChange, onStart, isSupported, keyConfigured, audioDevices }) {
  const [theme,     setTheme]     = useState(prefs.theme    || 'frontend');
  const [duration,  setDuration]  = useState(prefs.duration || 1800);
  const [showAudio, setShowAudio] = useState(false);

  const handleTheme = (t) => { setTheme(t); onPrefChange('theme', t); };
  const handleDuration = (d) => { setDuration(d); onPrefChange('duration', d); };

  const randomize = () => {
    const t = THEMES[Math.floor(Math.random() * THEMES.length)].id;
    handleTheme(t);
  };

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

      {/* Theme */}
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
              onClick={() => handleTheme(t.id)}
            >
              <span className="interview-theme-card__icon">{t.icon}</span>
              <span className="interview-theme-card__label">{t.label}</span>
              <span className="interview-theme-card__desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Duration */}
      <section className="interview-setup__section">
        <div className="interview-setup__label">Duration</div>
        <div className="interview-setup__durations">
          {DURATIONS.map(d => (
            <button
              key={d.value}
              className={`interview-duration-chip${duration === d.value ? ' interview-duration-chip--active' : ''}`}
              onClick={() => handleDuration(d.value)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </section>

      {/* Model + TTS settings */}
      <section className="interview-setup__section">
        <div className="interview-setup__label">Settings</div>
        <SettingsPanel prefs={prefs} onPrefChange={onPrefChange} keyConfigured={keyConfigured} />
      </section>

      {/* Audio devices */}
      <section className="interview-setup__section">
        <button
          className="interview-setup__audio-toggle"
          onClick={() => setShowAudio(v => !v)}
        >
          🎙 Audio Settings
          <span className="interview-setup__audio-toggle-arrow">{showAudio ? '▲' : '▼'}</span>
        </button>
        {showAudio && <AudioPanel audioDevices={audioDevices} />}
      </section>

      <button className="interview-setup__start" onClick={() => onStart({ theme, duration })}>
        Start Interview
      </button>

      {!keyConfigured && (
        <div className="interview-setup__footer">
          <a href="/account/settings#api-key" className="interview-setup__api-link">
            🔑 Setup OpenAI API Key for better voice
          </a>
        </div>
      )}
    </div>
  );
}

// ── Active interview ──────────────────────────────────────────────
function ActiveView({ state, remaining, lastText, transcript, ttsAnalyserRef, hasOpenAIKey, prefs, audioDevices, onEnd, onStopRecording, onInterrupt, onSendText }) {
  const [showText,  setShowText]  = useState(false);
  const [typed,     setTyped]     = useState('');
  const [showAudio, setShowAudio] = useState(false);
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

  const ttsLabel = prefs?.tts === 'openai' && hasOpenAIKey ? 'OpenAI voice' : null;

  return (
    <div className="interview-active">

      {/* Timer */}
      <div className="interview-active__timer">
        <span className={`interview-active__timer-dot${isListening ? ' interview-active__timer-dot--live' : ''}`} />
        {fmtTime(remaining)} remaining
        {ttsLabel && <span className="interview-active__tts-badge">{ttsLabel}</span>}
      </div>

      {/* ── Main visual area ──────────────────────────────────── */}
      <div className="interview-active__stage">
        {isSpeaking && (
          <div className="interview-active__waveform-wrap">
            <SpeechWaveform mode="speaking" externalAnalyserRef={ttsAnalyserRef} />
            <p className="interview-active__stage-label">Hooty is speaking…</p>
          </div>
        )}
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
        {isSpeaking && (
          <button className="interview-ctrl interview-ctrl--interrupt" onClick={onInterrupt}>
            <span className="interview-ctrl__icon">🎙</span> Speak now
          </button>
        )}
        {isListening && !showText && (
          <>
            <button className="interview-ctrl interview-ctrl--stop" onClick={onStopRecording}>
              ✓ Done
            </button>
            <button className="interview-ctrl interview-ctrl--text" onClick={handleShowText}>
              ⌨️ Type instead
            </button>
          </>
        )}
        {showText && (
          <form className="interview-active__text-form" onSubmit={handleTextSubmit}>
            <textarea
              ref={inputRef}
              className="interview-active__text-input"
              value={typed}
              onChange={e => setTyped(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (typed.trim()) handleTextSubmit(e);
                }
              }}
              placeholder="Type your answer… (Shift+Enter for new line)"
              autoComplete="off"
              rows={3}
            />
            <div className="interview-active__text-actions">
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
            </div>
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

      {/* Audio settings footer */}
      <div className="interview-active__audio-footer">
        <button
          className="interview-active__audio-toggle"
          onClick={() => setShowAudio(v => !v)}
        >
          🎙 Audio Settings {showAudio ? '▲' : '▼'}
        </button>
        {showAudio && <AudioPanel audioDevices={audioDevices} />}
      </div>
    </div>
  );
}

// ── Summary screen ────────────────────────────────────────────────
function SummaryView({ transcript, elapsed, cost, sessionId, onRestart }) {
  const [showFull,          setShowFull]          = useState(false);
  const [assessment,        setAssessment]        = useState('');
  const [assessmentLoading, setAssessmentLoading] = useState(true);
  const [copied,            setCopied]            = useState(false);
  const turns = transcript.filter(t => t.role === 'user').length;

  useEffect(() => {
    if (!sessionId) { setAssessmentLoading(false); return; }
    async function fetchAssessment() {
      try {
        const res = await fetch(`/api/interview/sessions/${sessionId}/assessment`);
        if (!res.ok) { setAssessmentLoading(false); return; }
        const reader = res.body.getReader();
        const dec    = new TextDecoder();
        let buf      = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop();
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            let ev;
            try { ev = JSON.parse(raw); } catch { continue; }
            if (ev.type === 'delta' && ev.text) setAssessment(t => t + ev.text);
          }
        }
      } catch { /* best-effort */ }
      setAssessmentLoading(false);
    }
    fetchAssessment();
  }, [sessionId]);

  const copyTranscript = () => {
    const text = transcript
      .map(t => `${t.role === 'assistant' ? 'Hooty' : 'You'}: ${t.text}`)
      .join('\n\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="interview-summary">
      <div className="interview-summary__owl">
        <InterviewerAvatar interviewState={INTERVIEW_STATES.ENDED} size={14} />
      </div>
      <h2 className="interview-summary__title">Interview Complete</h2>

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

      {/* Assessment */}
      <div className="interview-summary__assessment">
        <h3 className="interview-summary__assessment-title">Hooty&apos;s Feedback</h3>
        {assessmentLoading ? (
          <p className="interview-summary__assessment-loading">Generating feedback…</p>
        ) : assessment ? (
          <p className="interview-summary__assessment-text">{assessment}</p>
        ) : (
          <p className="interview-summary__assessment-text interview-summary__assessment-text--empty">
            Not enough data to generate feedback for this session.
          </p>
        )}
      </div>

      {/* Transcript */}
      <div className="interview-summary__transcript">
        <div className="interview-summary__transcript-header">
          <span>Transcript</span>
          <div className="interview-summary__transcript-actions">
            <button className="interview-summary__copy" onClick={copyTranscript}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button className="interview-summary__transcript-toggle" onClick={() => setShowFull(f => !f)}>
              {showFull ? 'Collapse' : 'Expand'}
            </button>
          </div>
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
  const [prefs,        setPrefs]        = useState(loadPrefs);
  const [keyConfigured, setKeyConfigured] = useState(false);
  const audioDevices = useAudioDevices();

  const {
    state, sessionId, transcript, lastText, error,
    elapsed, remaining, cost, hasOpenAIKey, ttsAnalyserRef,
    start, endInterview, stopRecording, interrupt, sendText, clearError, isSupported,
  } = useVoiceInterview();

  useEffect(() => {
    if (!user) return;
    fetch('/api/user/key/status')
      .then(r => r.json())
      .then(d => setKeyConfigured(d?.configured === true))
      .catch(() => {});
  }, [user]);

  const updatePref = useCallback((key, value) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      savePrefs(next);
      return next;
    });
  }, []);

  const handleStart = ({ theme, duration }) => {
    start({
      theme,
      duration,
      model:          prefs.model     || 'workers-ai',
      ttsMode:        prefs.tts       || 'browser',
      voice:          prefs.voice     || 'nova',
      outputDeviceId: audioDevices.speakerId || null,
    });
  };

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
        <SetupView
          prefs={prefs}
          onPrefChange={updatePref}
          onStart={handleStart}
          isSupported={isSupported}
          keyConfigured={keyConfigured}
          audioDevices={audioDevices}
        />
      )}

      {isActive && (
        <ActiveView
          state={state}
          remaining={remaining}
          lastText={lastText}
          transcript={transcript}
          ttsAnalyserRef={ttsAnalyserRef}
          hasOpenAIKey={hasOpenAIKey}
          prefs={prefs}
          audioDevices={audioDevices}
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
          sessionId={sessionId}
          onRestart={() => window.location.reload()}
        />
      )}
    </div>
  );
}
