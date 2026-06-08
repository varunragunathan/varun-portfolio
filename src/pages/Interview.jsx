import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import PixelOwl from '../components/PixelOwl';
import SpeechWaveform from '../components/SpeechWaveform';
import { useVoiceInterview, INTERVIEW_STATES, owlState } from '../hooks/useVoiceInterview';
import { useAudioDevices } from '../hooks/useAudioDevices';
import { useAuth } from '../hooks/useAuth';
import { Link } from 'react-router-dom';
import './Interview.css';

const SPRING      = { type: 'spring', stiffness: 320, damping: 24 };
const SPRING_SOFT = { type: 'spring', stiffness: 240, damping: 22 };

// ── Prefs persistence (localStorage) ─────────────────────────────
const PREFS_KEY = 'iv_prefs_v1';
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; } catch { return {}; } };
const savePrefs = (p) => { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); };

// ── Voice options ─────────────────────────────────────────────────
const OPENAI_VOICES = [
  { id: 'nova',    label: 'Nova',    desc: 'Warm & natural'       },
  { id: 'alloy',   label: 'Alloy',   desc: 'Neutral & balanced'   },
  { id: 'onyx',    label: 'Onyx',    desc: 'Deep & authoritative' },
  { id: 'echo',    label: 'Echo',    desc: 'Warm, conversational' },
  { id: 'shimmer', label: 'Shimmer', desc: 'Soft & clear'         },
  { id: 'fable',   label: 'Fable',   desc: 'British & expressive' },
];

const GEMINI_VOICES = [
  { id: 'Kore',   label: 'Kore',   desc: 'Warm & expressive'     },
  { id: 'Puck',   label: 'Puck',   desc: 'Upbeat & clear'        },
  { id: 'Charon', label: 'Charon', desc: 'Measured & informative' },
  { id: 'Zephyr', label: 'Zephyr', desc: 'Bright & engaging'     },
  { id: 'Aoede',  label: 'Aoede',  desc: 'Natural & breezy'      },
];

// ── Voice sample picker ───────────────────────────────────────────
function VoicePicker({ voices, selectedVoice, onSelect, keyConfigured, sampleEndpointBase, keyHint }) {
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
        const res = await fetch(`${sampleEndpointBase}/${voiceId}`);
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
      {voices.map(v => (
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
          <a href="/account/settings#api-key">Add a {keyHint} key</a> to preview voices.
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
  { id: 'frontend',         label: 'Frontend Eng',    icon: '⚛️',  desc: 'React, JS, CSS, perf' },
  { id: 'backend',          label: 'Backend & Sys',   icon: '⚙️',  desc: 'APIs, databases, infra' },
  { id: 'system-design',    label: 'System Design',   icon: '🏗️',  desc: 'Scale, architecture' },
  { id: 'behavioral',       label: 'Behavioral',       icon: '🧠',  desc: 'Leadership, STAR method' },
  { id: 'dsa',              label: 'DSA',              icon: '📊',  desc: 'Algorithms, complexity' },
  { id: 'fullstack',        label: 'Full Stack',       icon: '🔧',  desc: 'End-to-end engineering' },
  { id: 'product',          label: 'Product Mgmt',    icon: '📋',  desc: 'Strategy, metrics, users' },
  { id: 'data-engineering', label: 'Data Engineering', icon: '🗄️',  desc: 'Pipelines, ETL, Spark, dbt' },
  { id: 'data-fullstack',   label: 'Data Full Stack',  icon: '📈',  desc: 'SQL, analytics, APIs, viz' },
  { id: 'business-finance', label: 'Business Finance', icon: '💼',  desc: 'Valuation, accounting, markets' },
  { id: 'custom',           label: 'Custom',           icon: '✏️',  desc: 'Your own topic' },
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
function SettingsPanel({ prefs, onPrefChange, keyConfigured, geminiKeyConfigured }) {
  const model       = prefs.model       || 'workers-ai';
  const tts         = prefs.tts         || 'browser';
  const voice       = prefs.voice       || 'nova';
  const geminiVoice = prefs.geminiVoice || 'Kore';
  const anyKeyConfigured = keyConfigured || geminiKeyConfigured;

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

      {/* TTS engine — shown when at least one AI key is configured */}
      {anyKeyConfigured && (
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
            {keyConfigured && (
              <button
                className={`settings-toggle${tts === 'openai' ? ' settings-toggle--active' : ''}`}
                onClick={() => onPrefChange('tts', 'openai')}
              >
                <span className="settings-toggle__name">OpenAI TTS</span>
                <span className="settings-toggle__tag settings-toggle__tag--paid">Your key</span>
              </button>
            )}
            {geminiKeyConfigured && (
              <button
                className={`settings-toggle${tts === 'gemini' ? ' settings-toggle--active' : ''}`}
                onClick={() => onPrefChange('tts', 'gemini')}
              >
                <span className="settings-toggle__name">Gemini TTS</span>
                <span className="settings-toggle__tag settings-toggle__tag--paid">Your key</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Voice picker — changes based on selected TTS engine */}
      <div className="settings-panel__group">
        <div className="settings-panel__label">Voice</div>
        {tts === 'gemini' ? (
          <VoicePicker
            voices={GEMINI_VOICES}
            selectedVoice={geminiVoice}
            onSelect={v => onPrefChange('geminiVoice', v)}
            keyConfigured={geminiKeyConfigured}
            sampleEndpointBase="/api/proxy/voice-sample-gemini"
            keyHint="Gemini"
          />
        ) : (
          <VoicePicker
            voices={OPENAI_VOICES}
            selectedVoice={voice}
            onSelect={v => onPrefChange('voice', v)}
            keyConfigured={keyConfigured}
            sampleEndpointBase="/api/proxy/voice-sample"
            keyHint="OpenAI"
          />
        )}
      </div>
    </div>
  );
}

// ── Setup screen ──────────────────────────────────────────────────
function SetupView({ prefs, onPrefChange, onStart, isSupported, keyConfigured, geminiKeyConfigured, audioDevices }) {
  const [theme,       setTheme]       = useState(prefs.theme    || 'frontend');
  const [duration,    setDuration]    = useState(prefs.duration || 1800);
  const [showAudio,   setShowAudio]   = useState(false);
  const [customTopic, setCustomTopic] = useState('');

  const handleTheme = (t) => { setTheme(t); onPrefChange('theme', t); };
  const handleDuration = (d) => { setDuration(d); onPrefChange('duration', d); };

  const PRESET_THEMES = THEMES.filter(t => t.id !== 'custom');
  const randomize = () => {
    const t = PRESET_THEMES[Math.floor(Math.random() * PRESET_THEMES.length)].id;
    handleTheme(t);
  };

  const canStart = theme !== 'custom' || customTopic.trim().length > 0;

  return (
    <motion.div
      className="interview-setup"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.35 }}
    >
      <motion.div
        className="interview-setup__owl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        <InterviewerAvatar interviewState={INTERVIEW_STATES.IDLE} size={16} />
      </motion.div>

      <motion.div
        style={{ textAlign: 'center' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <h1 className="interview-setup__title">Ready to interview you</h1>
        <p className="interview-setup__sub">
          Hooty will ask questions and listen over voice — just like a phone screen.
        </p>
      </motion.div>

      {!isSupported && (
        <div className="interview-setup__warn">
          Voice input needs Chrome or Edge. You can still type your answers.
        </div>
      )}

      {/* Theme */}
      <motion.section
        className="interview-setup__section"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <div className="interview-setup__section-header">
          <span className="interview-setup__label">Theme</span>
          <motion.button
            className="interview-setup__random"
            onClick={randomize}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={SPRING}
          >
            🎲 random
          </motion.button>
        </div>
        <div className="interview-setup__themes">
          {THEMES.map(t => (
            <motion.button
              key={t.id}
              className={`interview-theme-card${theme === t.id ? ' interview-theme-card--active' : ''}`}
              onClick={() => handleTheme(t.id)}
              whileHover={{ y: -3, scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              transition={SPRING}
            >
              <span className="interview-theme-card__icon">{t.icon}</span>
              <span className="interview-theme-card__label">{t.label}</span>
              <span className="interview-theme-card__desc">{t.desc}</span>
            </motion.button>
          ))}
        </div>

        <AnimatePresence>
          {theme === 'custom' && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto', marginTop: 12 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <textarea
                className="interview-setup__custom-input"
                placeholder="Describe the topic, role, or focus area — e.g. &quot;ML engineer at a startup, focus on model deployment&quot;"
                value={customTopic}
                onChange={e => setCustomTopic(e.target.value)}
                rows={3}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      {/* Duration */}
      <motion.section
        className="interview-setup__section"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
      >
        <div className="interview-setup__label">Duration</div>
        <div className="interview-setup__durations">
          {DURATIONS.map(d => (
            <motion.button
              key={d.value}
              className={`interview-duration-chip${duration === d.value ? ' interview-duration-chip--active' : ''}`}
              onClick={() => handleDuration(d.value)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              transition={SPRING}
            >
              {d.label}
            </motion.button>
          ))}
        </div>
      </motion.section>

      {/* Model + TTS settings */}
      <motion.section
        className="interview-setup__section"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.25 }}
      >
        <div className="interview-setup__label">Settings</div>
        <SettingsPanel prefs={prefs} onPrefChange={onPrefChange} keyConfigured={keyConfigured} geminiKeyConfigured={geminiKeyConfigured} />
      </motion.section>

      {/* Audio devices */}
      <motion.section
        className="interview-setup__section"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <motion.button
          className="interview-setup__audio-toggle"
          onClick={() => setShowAudio(v => !v)}
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          transition={SPRING}
        >
          🎙 Audio Settings
          <span className="interview-setup__audio-toggle-arrow">{showAudio ? '▲' : '▼'}</span>
        </motion.button>
        <AnimatePresence>
          {showAudio && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <AudioPanel audioDevices={audioDevices} />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.section>

      <motion.button
        className="interview-setup__start"
        onClick={() => canStart && onStart({ theme, duration, customTopic: customTopic.trim() })}
        disabled={!canStart}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.35 }}
        whileHover={canStart ? { scale: 1.04, boxShadow: '0 8px 32px rgba(99,102,241,0.5)' } : {}}
        whileTap={canStart ? { scale: 0.97 } : {}}
      >
        Start Interview →
      </motion.button>

      {!keyConfigured && !geminiKeyConfigured && (
        <motion.div
          className="interview-setup__footer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
        >
          <a href="/account/settings#api-key" className="interview-setup__api-link">
            🔑 Add an OpenAI or Gemini key for higher-quality voice
          </a>
        </motion.div>
      )}
    </motion.div>
  );
}

// ── Active interview ──────────────────────────────────────────────
function ActiveView({ state, remaining, elapsed, lastText, transcript, ttsAnalyserRef, hasOpenAIKey, hasGeminiKey, prefs, audioDevices, onEnd, onStopRecording, onInterrupt, onSendText }) {
  const [showText,  setShowText]  = useState(false);
  const [typed,     setTyped]     = useState('');
  const [showAudio, setShowAudio] = useState(false);
  const inputRef = useRef(null);

  const isSpeaking  = state === INTERVIEW_STATES.OPENING || state === INTERVIEW_STATES.RESPONDING;
  const isListening = state === INTERVIEW_STATES.LISTENING;
  const isThinking  = state === INTERVIEW_STATES.PROCESSING;

  const total    = (elapsed || 0) + (remaining || 0);
  const progress = total > 0 ? Math.min(1, (elapsed || 0) / total) : 0;
  const isLow    = remaining < 120;

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

  const ttsLabel = prefs?.tts === 'openai' && hasOpenAIKey ? 'OpenAI TTS'
                 : prefs?.tts === 'gemini' && hasGeminiKey ? 'Gemini TTS'
                 : null;

  return (
    <motion.div
      className="interview-active"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.25, 0.4, 0.45, 0.95] }}
    >
      {/* Progress bar */}
      <div className="interview-active__progress-bar">
        <motion.div
          className={`interview-active__progress-fill${isLow ? ' interview-active__progress-fill--low' : ''}`}
          style={{ scaleX: progress, transformOrigin: 'left' }}
          transition={{ duration: 0.8, ease: 'linear' }}
        />
      </div>

      {/* Timer */}
      <div className="interview-active__timer">
        <span className={`interview-active__timer-dot${isListening ? ' interview-active__timer-dot--live' : ''}`} />
        <span className={isLow ? 'interview-active__timer-low' : ''}>{fmtTime(remaining)} remaining</span>
        {ttsLabel && <span className="interview-active__tts-badge">{ttsLabel}</span>}
      </div>

      {/* ── Main stage — AnimatePresence for smooth state transitions ─ */}
      <div className="interview-active__stage">
        <AnimatePresence mode="wait">
          {isSpeaking ? (
            <motion.div
              key="speaking"
              className="interview-active__waveform-wrap"
              initial={{ opacity: 0, scale: 0.93 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.93 }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            >
              <SpeechWaveform mode="speaking" externalAnalyserRef={ttsAnalyserRef} />
              <p className="interview-active__stage-label">Hooty is speaking…</p>
            </motion.div>
          ) : (
            <motion.div
              key={`avatar-${state}`}
              className="interview-active__avatar-wrap"
              initial={{ opacity: 0, scale: 0.93 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.93 }}
              transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
            >
              <InterviewerAvatar interviewState={state} size={16} />
              <p className="interview-active__stage-label">
                {isListening ? 'Listening — speak now' : isThinking ? 'Thinking…' : ''}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Last AI text — speech bubble */}
      <AnimatePresence>
        {lastText && (
          <motion.div
            className="interview-active__last-text"
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <p>{lastText}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mic waveform when listening */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            className="interview-active__mic-wave"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.25 }}
          >
            <SpeechWaveform mode="listening" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Controls ──────────────────────────────────────────── */}
      <div className="interview-active__controls">
        <AnimatePresence mode="wait">
          {isSpeaking && (
            <motion.button
              key="interrupt"
              className="interview-ctrl interview-ctrl--interrupt"
              onClick={onInterrupt}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.96 }}
              transition={SPRING}
            >
              <span className="interview-ctrl__icon">🎙</span> Speak now
            </motion.button>
          )}
          {isListening && !showText && (
            <motion.div
              key="listening"
              className="interview-active__controls-row"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
            >
              <motion.button
                className="interview-ctrl interview-ctrl--stop"
                onClick={onStopRecording}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.96 }}
                transition={SPRING}
              >
                ✓ Done
              </motion.button>
              <motion.button
                className="interview-ctrl interview-ctrl--text"
                onClick={handleShowText}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={SPRING}
              >
                ⌨️ Type instead
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {showText && (
          <motion.form
            className="interview-active__text-form"
            onSubmit={handleTextSubmit}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
          >
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
              <motion.button
                type="submit"
                className="interview-ctrl interview-ctrl--send"
                disabled={!typed.trim()}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                transition={SPRING}
              >
                Send
              </motion.button>
              <button
                type="button"
                className="interview-ctrl interview-ctrl--text"
                onClick={() => setShowText(false)}
              >
                Use mic
              </button>
            </div>
          </motion.form>
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

      <motion.button
        className="interview-active__end"
        onClick={onEnd}
        whileHover={{ scale: 1.03, borderColor: '#ef4444', color: '#ef4444' }}
        whileTap={{ scale: 0.97 }}
        transition={SPRING}
      >
        End Interview
      </motion.button>

      {/* Audio settings footer */}
      <div className="interview-active__audio-footer">
        <motion.button
          className="interview-active__audio-toggle"
          onClick={() => setShowAudio(v => !v)}
          whileHover={{ scale: 1.02 }}
          transition={SPRING}
        >
          🎙 Audio Settings {showAudio ? '▲' : '▼'}
        </motion.button>
        <AnimatePresence>
          {showAudio && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              style={{ overflow: 'hidden' }}
            >
              <AudioPanel audioDevices={audioDevices} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// ── Summary screen ────────────────────────────────────────────────
function SummaryView({ transcript, elapsed, cost, ttsCost, modelChoice, sessionId, onRestart }) {
  const [showFull,          setShowFull]          = useState(false);
  const [showCostBreakdown, setShowCostBreakdown] = useState(false);
  const [assessment,        setAssessment]        = useState('');
  const [assessmentLoading, setAssessmentLoading] = useState(true);
  const [copied,            setCopied]            = useState(false);
  const turns      = transcript.filter(t => t.role === 'user').length;
  const totalCost  = (cost || 0) + (ttsCost || 0);
  const hasTTS     = ttsCost > 0;
  const hasModel   = cost > 0;
  const modelLabel = modelChoice === 'workers-ai' ? 'Llama 3.3 (free)' : 'Claude Haiku';

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
    <motion.div
      className="interview-summary"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.25, 0.4, 0.45, 0.95] }}
    >
      <motion.div
        className="interview-summary__owl"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...SPRING_SOFT, delay: 0.05 }}
      >
        <InterviewerAvatar interviewState={INTERVIEW_STATES.ENDED} size={14} />
      </motion.div>
      <motion.h2
        className="interview-summary__title"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.1 }}
      >
        Interview Complete
      </motion.h2>

      <div className="interview-summary__stats">
        {[
          { value: fmtTime(elapsed), label: 'duration' },
          { value: turns,            label: 'answers'  },
        ].map(({ value, label }, i) => (
          <motion.div
            key={label}
            className="interview-summary__stat"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.15 + i * 0.08 }}
          >
            <span className="interview-summary__stat-value">{value}</span>
            <span className="interview-summary__stat-label">{label}</span>
          </motion.div>
        ))}
        {/* cost stat — keep original markup for the breakdown logic */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.31 }}
        >
        <div className="interview-summary__stat interview-summary__stat--cost">
          <button
            className="interview-summary__cost-btn"
            onClick={() => (hasTTS || hasModel) && setShowCostBreakdown(v => !v)}
            style={{ cursor: (hasTTS || hasModel) ? 'pointer' : 'default' }}
          >
            <span className="interview-summary__stat-value">{fmtCost(totalCost)}</span>
            {(hasTTS || hasModel) && (
              <span className="interview-summary__cost-arrow">{showCostBreakdown ? '▲' : '▼'}</span>
            )}
          </button>
          <span className="interview-summary__stat-label">cost</span>
          {showCostBreakdown && (
            <div className="interview-summary__cost-breakdown">
              <div className="interview-summary__cost-row">
                <span>{modelLabel}</span>
                <span>{fmtCost(cost || 0)}</span>
              </div>
              <div className="interview-summary__cost-row">
                <span>OpenAI TTS</span>
                <span>{fmtCost(ttsCost || 0)}</span>
              </div>
            </div>
          )}
        </div>
        </motion.div>
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

      <motion.div
        className="interview-summary__actions"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.4 }}
      >
        <motion.button
          className="interview-summary__restart"
          onClick={onRestart}
          whileHover={{ scale: 1.04, boxShadow: '0 8px 28px rgba(99,102,241,0.4)' }}
          whileTap={{ scale: 0.97 }}
          transition={SPRING}
        >
          New Interview
        </motion.button>
        <Link to="/" className="interview-summary__home">← Home</Link>
      </motion.div>
    </motion.div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function InterviewPage() {
  const { user } = useAuth();
  const [prefs,        setPrefs]        = useState(loadPrefs);
  const [keyConfigured,       setKeyConfigured]       = useState(false);
  const [geminiKeyConfigured, setGeminiKeyConfigured] = useState(false);
  const audioDevices = useAudioDevices();

  const {
    state, sessionId, transcript, lastText, error,
    elapsed, remaining, cost, ttsCost, hasOpenAIKey, hasGeminiKey, ttsAnalyserRef,
    start, endInterview, stopRecording, interrupt, sendText, clearError, isSupported,
  } = useVoiceInterview();

  useEffect(() => {
    if (!user) return;
    fetch('/api/user/key/status')
      .then(r => r.json())
      .then(d => {
        setKeyConfigured(d?.configured === true);
        setGeminiKeyConfigured(d?.gemini?.configured === true);
      })
      .catch(() => {});
  }, [user]);

  const updatePref = useCallback((key, value) => {
    setPrefs(prev => {
      const next = { ...prev, [key]: value };
      savePrefs(next);
      return next;
    });
  }, []);

  const handleStart = ({ theme, duration, customTopic }) => {
    start({
      theme,
      duration,
      customTopic,
      model:          prefs.model       || 'workers-ai',
      ttsMode:        prefs.tts         || 'browser',
      voice:          prefs.voice       || 'nova',
      geminiVoice:    prefs.geminiVoice || 'Kore',
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
          geminiKeyConfigured={geminiKeyConfigured}
          audioDevices={audioDevices}
        />
      )}

      {isActive && (
        <ActiveView
          state={state}
          remaining={remaining}
          elapsed={elapsed}
          lastText={lastText}
          transcript={transcript}
          ttsAnalyserRef={ttsAnalyserRef}
          hasOpenAIKey={hasOpenAIKey}
          hasGeminiKey={hasGeminiKey}
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
          ttsCost={ttsCost}
          modelChoice={prefs.model || 'workers-ai'}
          sessionId={sessionId}
          onRestart={() => window.location.reload()}
        />
      )}
    </div>
  );
}
