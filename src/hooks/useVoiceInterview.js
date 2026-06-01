// ── useVoiceInterview ─────────────────────────────────────────────
// Orchestrates the full voice interview loop:
//   SpeechRecognition (STT) → API → SSE stream → TTS
//
// TTS priority:
//   1. OpenAI TTS via Worker proxy (/api/proxy/tts) — real audio stream,
//      drives the waveform with actual FFT data (requires stored API key)
//   2. Browser SpeechSynthesis — word-boundary pulse fallback (free, lower quality)

import { useCallback, useEffect, useRef, useState } from 'react';

export const INTERVIEW_STATES = {
  IDLE:        'idle',
  OPENING:     'opening',
  LISTENING:   'listening',
  PROCESSING:  'processing',
  RESPONDING:  'responding',
  ENDED:       'ended',
};

export function owlState(iState) {
  switch (iState) {
    case INTERVIEW_STATES.OPENING:    return 'talking';
    case INTERVIEW_STATES.LISTENING:  return 'listening';
    case INTERVIEW_STATES.PROCESSING: return 'thinking';
    case INTERVIEW_STATES.RESPONDING: return 'talking';
    case INTERVIEW_STATES.ENDED:      return 'done';
    default:                          return 'idle';
  }
}

export function useVoiceInterview() {
  const [state,        setState]        = useState(INTERVIEW_STATES.IDLE);
  const [sessionId,    setSessionId]    = useState(null);
  const [transcript,   setTranscript]   = useState([]);
  const [lastText,     setLastText]     = useState('');
  const [error,        setError]        = useState(null);
  const [elapsed,      setElapsed]      = useState(0);
  const [cost,         setCost]         = useState(0);
  const [duration,     setDuration]     = useState(1800);
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);

  const sessionRef     = useRef(null);
  const timerRef       = useRef(null);
  const recogRef       = useRef(null);
  const synthRef       = useRef(window.speechSynthesis);
  const durationRef    = useRef(1800);
  const startTimeRef   = useRef(null);
  const stateRef       = useRef(INTERVIEW_STATES.IDLE);
  // Set when onresult fires so onend doesn't restart listening unnecessarily
  const gotResultRef   = useRef(false);
  // Set when user explicitly stops recording so onend doesn't restart
  const manualStopRef  = useRef(false);
  // Accumulates interim speech text so Stop can submit whatever was said
  const partialRef     = useRef('');
  // Set when the timer expires — lets the current turn finish before ending
  const windingDownRef = useRef(false);

  // OpenAI TTS — set on start() if user has a stored key
  const hasOpenAIKeyRef  = useRef(false);
  // Persisted AudioContext (one per session)
  const audioCtxRef      = useRef(null);
  // Current AnalyserNode while OpenAI audio is playing — read by SpeechWaveform
  const ttsAnalyserRef   = useRef(null);
  // Current BufferSourceNode so we can stop it on interrupt
  const ttsSourceRef     = useRef(null);

  // Refs to break circular useCallback dependencies
  const handleUserTurnRef  = useRef(null);
  const endInterviewRef    = useRef(null);
  const startListeningRef  = useRef(null);
  const windDownRef        = useRef(null);

  const setStateSynced = useCallback((s) => {
    stateRef.current = s;
    setState(s);
  }, []);

  // ── TTS — OpenAI proxy (real audio) ──────────────────────────────
  const speakOpenAI = useCallback(async (text) => {
    const res = await fetch('/api/proxy/tts', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text, voice: 'fable' }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);

    const arrayBuffer = await res.arrayBuffer();

    // Lazily create one AudioContext per session
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    const audioCtx = audioCtxRef.current;
    await audioCtx.resume();

    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    // Wire up analyser so SpeechWaveform gets real FFT data
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize               = 128;
    analyser.smoothingTimeConstant = 0.78;
    ttsAnalyserRef.current = analyser;

    return new Promise((resolve) => {
      const source = audioCtx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyser);
      analyser.connect(audioCtx.destination);
      ttsSourceRef.current = source;
      source.onended = () => {
        ttsAnalyserRef.current = null;
        ttsSourceRef.current   = null;
        resolve();
      };
      source.start();
    });
  }, []);

  // ── TTS — browser SpeechSynthesis fallback (word-boundary pulses) ─
  const speakSynthesis = useCallback((text) => {
    return new Promise((resolve) => {
      synthRef.current.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate  = 0.92;
      utt.pitch = 1.0;
      // On iOS, voices may not be loaded immediately — wait if needed
      let voices = synthRef.current.getVoices();
      if (voices.length === 0) {
        // iOS workaround: voices load asynchronously
        synthRef.current.onvoiceschanged = () => {
          voices = synthRef.current.getVoices();
          if (voices.length > 0) synthRef.current.onvoiceschanged = null;
        };
      }
      const preferred = voices.find(v =>
        /en[-_]US/i.test(v.lang) && /natural|premium|enhanced/i.test(v.name)
      ) || voices.find(v => /en[-_]US/i.test(v.lang));
      if (preferred) utt.voice = preferred;
      utt.onboundary = (e) => {
        if (e.name !== 'word') return;
        const word = text.slice(e.charIndex, e.charIndex + (e.charLength ?? 4));
        const amp  = Math.min(0.92, 0.42 + Math.min(word.replace(/\W/g, '').length, 9) * 0.057);
        window.dispatchEvent(new CustomEvent('iv-voice-pulse', { detail: { amp } }));
      };
      utt.onend   = resolve;
      utt.onerror = resolve;
      synthRef.current.speak(utt);
    });
  }, []);

  // ── TTS — dispatch to whichever engine is available ──────────────
  const speak = useCallback(async (text) => {
    if (hasOpenAIKeyRef.current) {
      try {
        return await speakOpenAI(text);
      } catch {
        // Fall through to SpeechSynthesis if proxy fails
      }
    }
    return speakSynthesis(text);
  }, [speakOpenAI, speakSynthesis]);

  // ── STT ──────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    gotResultRef.current  = false;
    manualStopRef.current = false;
    partialRef.current    = '';

    setStateSynced(INTERVIEW_STATES.LISTENING);

    if (!SR) {
      // Voice not available (e.g., iPhone Safari) — user will type instead
      return;
    }

    const recog = new SR();
    recog.lang           = 'en-US';
    recog.continuous     = false;
    recog.interimResults = true;  // track partial so Stop can submit them
    recogRef.current     = recog;

    recog.onresult = (e) => {
      if (gotResultRef.current) return; // already submitted (e.g. via Stop)
      const result = e.results[e.results.length - 1];
      const text   = result[0].transcript.trim();
      partialRef.current = text;
      if (result.isFinal && text) {
        gotResultRef.current = true;
        partialRef.current   = '';
        handleUserTurnRef.current?.(text);
      }
    };

    recog.onend = () => {
      // Don't restart if: we already got a result, user manually stopped, or session ended
      if (gotResultRef.current) return;
      if (manualStopRef.current) return;
      if (stateRef.current !== INTERVIEW_STATES.LISTENING) return;
      startListeningRef.current?.();
    };

    recog.onerror = (e) => {
      if (e.error === 'no-speech') {
        if (stateRef.current === INTERVIEW_STATES.LISTENING && !manualStopRef.current) {
          startListeningRef.current?.();
        }
      } else if (e.error !== 'aborted') {
        // Mark as manual stop so onend doesn't restart into another error loop
        manualStopRef.current = true;
        setError(
          e.error === 'not-allowed'
            ? 'Microphone access denied. Allow mic access in your browser, or type your answer below.'
            : `Microphone error: ${e.error}`
        );
      }
    };

    recog.start();
  }, [setStateSynced]);

  // ── Stop recording — submits whatever was said, or leaves mic dead
  //    so the user can type. Renamed "Done" in the UI to signal intent.
  const stopRecording = useCallback(() => {
    const partial = partialRef.current.trim();
    if (partial) {
      // Submit what was captured before the user pressed Done
      gotResultRef.current = true;
      partialRef.current   = '';
      handleUserTurnRef.current?.(partial);
    }
    manualStopRef.current = true;
    recogRef.current?.stop();
    // If nothing was captured, state stays LISTENING — user sees text input
  }, []);

  // ── Interrupt Hooty mid-speech ───────────────────────────────────
  const interrupt = useCallback(() => {
    synthRef.current.cancel();
    if (ttsSourceRef.current) {
      ttsSourceRef.current.onended = null;
      ttsSourceRef.current.stop();
      ttsSourceRef.current   = null;
      ttsAnalyserRef.current = null;
    }
    startListeningRef.current?.();
  }, []);

  // ── Send a text turn (fallback for no-mic / typed input) ─────────
  const sendText = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    manualStopRef.current = true;
    recogRef.current?.stop();
    handleUserTurnRef.current?.(trimmed);
  }, []);

  // ── Read SSE stream ──────────────────────────────────────────────
  const readStream = useCallback(async (response, onText) => {
    const reader = response.body.getReader();
    const dec    = new TextDecoder();
    let buf  = '';
    let full = '';

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
        if (ev.type === 'session' && ev.id) {
          setSessionId(ev.id);
          sessionRef.current = ev.id;
        } else if (ev.type === 'delta' && ev.text) {
          full += ev.text;
          onText?.(full);
        }
      }
    }
    return full;
  }, []);

  // ── AI response: stream → accumulate → TTS → listen ─────────────
  const handleAIResponse = useCallback(async (fetchPromise) => {
    const response = await fetchPromise;
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${response.status}`);
    }

    const fullText = await readStream(response, (partial) => setLastText(partial));
    if (!fullText) return;

    setTranscript(t => [...t, { role: 'assistant', text: fullText }]);
    setStateSynced(INTERVIEW_STATES.RESPONDING);
    await speak(fullText);

    if (stateRef.current !== INTERVIEW_STATES.ENDED) {
      if (windingDownRef.current) {
        endInterviewRef.current?.();
      } else {
        startListening();
      }
    }
  }, [readStream, speak, startListening, setStateSynced]);

  // ── User turn ────────────────────────────────────────────────────
  const handleUserTurn = useCallback(async (text) => {
    if (!sessionRef.current) return;
    setStateSynced(INTERVIEW_STATES.PROCESSING);
    setTranscript(t => [...t, { role: 'user', text }]);

    try {
      await handleAIResponse(
        fetch(`/api/interview/sessions/${sessionRef.current}/message`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ content: text }),
        })
      );
    } catch (err) {
      setError(`Something went wrong: ${err.message}`);
      // Return to listening so user can try again
      if (stateRef.current !== INTERVIEW_STATES.ENDED) {
        startListening();
      }
    }
  }, [handleAIResponse, setStateSynced, startListening]);

  // ── Wind-down: speak a closing statement then end gracefully ─────
  const windDownInterview = useCallback(async () => {
    const closing = "That's all the time we have for today. You did great — thanks so much for your time, and good luck with your upcoming interviews!";
    setStateSynced(INTERVIEW_STATES.RESPONDING);
    setLastText(closing);
    await speak(closing);
    endInterviewRef.current?.();
  }, [speak, setStateSynced]);

  useEffect(() => { handleUserTurnRef.current = handleUserTurn; }, [handleUserTurn]);
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);
  useEffect(() => { windDownRef.current = windDownInterview; }, [windDownInterview]);

  // ── End interview ────────────────────────────────────────────────
  const endInterview = useCallback(async () => {
    clearInterval(timerRef.current);
    synthRef.current.cancel();
    if (ttsSourceRef.current) {
      ttsSourceRef.current.onended = null;
      ttsSourceRef.current.stop();
      ttsSourceRef.current   = null;
      ttsAnalyserRef.current = null;
    }
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    manualStopRef.current = true;
    recogRef.current?.stop();
    setStateSynced(INTERVIEW_STATES.ENDED);

    const durationActual = startTimeRef.current
      ? Math.floor((Date.now() - startTimeRef.current) / 1000)
      : null;

    if (sessionRef.current) {
      try {
        const res = await fetch(`/api/interview/sessions/${sessionRef.current}/end`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ duration_actual: durationActual }),
        });
        const data = await res.json();
        if (data.session?.cost_usd) setCost(data.session.cost_usd);
      } catch { /* best-effort */ }
    }
  }, [setStateSynced]);

  useEffect(() => { endInterviewRef.current = endInterview; }, [endInterview]);

  // ── Start interview ───────────────────────────────────────────────
  const start = useCallback(async ({ theme, duration }) => {
    setError(null);
    setTranscript([]);
    setLastText('');
    setElapsed(0);
    setCost(0);
    setHasOpenAIKey(false);
    windingDownRef.current = false;
    durationRef.current = duration;
    setDuration(duration);

    // Check once whether user has an OpenAI key stored
    try {
      const ks = await fetch('/api/user/key/status').then(r => r.json());
      hasOpenAIKeyRef.current = ks?.configured === true;
      setHasOpenAIKey(ks?.configured === true);
    } catch {
      hasOpenAIKeyRef.current = false;
    }

    setStateSynced(INTERVIEW_STATES.OPENING);

    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsed(secs);
      if (secs >= durationRef.current && !windingDownRef.current) {
        windingDownRef.current = true;
        clearInterval(timerRef.current);
        // If currently listening: stop mic and trigger closing statement
        if (stateRef.current === INTERVIEW_STATES.LISTENING) {
          manualStopRef.current = true;
          recogRef.current?.stop();
          windDownRef.current?.();
        }
        // If responding/processing: handleAIResponse checks windingDownRef after speak()
      }
    }, 1000);

    try {
      await handleAIResponse(
        fetch('/api/interview/sessions', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ theme, duration }),
        })
      );
    } catch (err) {
      setError(`Could not start: ${err.message}`);
      clearInterval(timerRef.current);
      setStateSynced(INTERVIEW_STATES.IDLE);
    }
  }, [handleAIResponse, setStateSynced]);

  // Cleanup on unmount
  useEffect(() => {
    const synth = synthRef.current;
    return () => {
      clearInterval(timerRef.current);
      synth?.cancel();
      if (ttsSourceRef.current) {
        ttsSourceRef.current.onended = null;
        ttsSourceRef.current.stop();
      }
      audioCtxRef.current?.close().catch(() => {});
      manualStopRef.current = true;
      recogRef.current?.stop();
    };
  }, []);

  const remaining = Math.max(0, duration - elapsed);

  const clearError = useCallback(() => setError(null), []);

  return {
    state,
    sessionId,
    transcript,
    lastText,
    error,
    elapsed,
    remaining,
    cost,
    hasOpenAIKey,
    ttsAnalyserRef,
    start,
    endInterview,
    stopRecording,
    interrupt,
    sendText,
    clearError,
    isSupported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
}
