// ── useVoiceInterview ─────────────────────────────────────────────
// Orchestrates the full voice interview loop:
//   SpeechRecognition (STT) → API → SSE stream → SpeechSynthesis (TTS)

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
  const [state,      setState]      = useState(INTERVIEW_STATES.IDLE);
  const [sessionId,  setSessionId]  = useState(null);
  const [transcript, setTranscript] = useState([]);
  const [lastText,   setLastText]   = useState('');
  const [error,      setError]      = useState(null);
  const [elapsed,    setElapsed]    = useState(0);
  const [cost,       setCost]       = useState(0);
  const [duration,   setDuration]   = useState(1800);

  const sessionRef   = useRef(null);
  const timerRef     = useRef(null);
  const recogRef     = useRef(null);
  const synthRef     = useRef(window.speechSynthesis);
  const durationRef  = useRef(1800);
  const startTimeRef = useRef(null);
  const stateRef     = useRef(INTERVIEW_STATES.IDLE);
  // Set when onresult fires so onend doesn't restart listening unnecessarily
  const gotResultRef = useRef(false);
  // Set when user explicitly stops recording so onend doesn't restart
  const manualStopRef = useRef(false);

  // Refs to break circular useCallback dependencies
  const handleUserTurnRef  = useRef(null);
  const endInterviewRef    = useRef(null);
  const startListeningRef  = useRef(null);

  const setStateSynced = useCallback((s) => {
    stateRef.current = s;
    setState(s);
  }, []);

  // ── TTS ─────────────────────────────────────────────────────────
  const speak = useCallback((text) => {
    return new Promise((resolve) => {
      synthRef.current.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate  = 0.92;
      utt.pitch = 1.0;
      const voices = synthRef.current.getVoices();
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

  // ── STT ──────────────────────────────────────────────────────────
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError('Voice input requires Chrome or Edge. Use the text input below instead.');
      return;
    }

    gotResultRef.current  = false;
    manualStopRef.current = false;

    const recog = new SR();
    recog.lang           = 'en-US';
    recog.continuous     = false;
    recog.interimResults = false;
    recogRef.current     = recog;
    setStateSynced(INTERVIEW_STATES.LISTENING);

    recog.onresult = (e) => {
      const text = e.results[e.results.length - 1][0].transcript.trim();
      if (text) {
        gotResultRef.current = true;
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
  }, [setStateSynced]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stop recording (user explicitly stops, optionally sending partial) ─
  const stopRecording = useCallback(() => {
    manualStopRef.current = true;
    recogRef.current?.stop();
    // Stay in listening state — user can re-tap mic or type
    // If they stopped without speaking, don't process an empty turn
  }, []);

  // ── Interrupt Hooty mid-speech ───────────────────────────────────
  const interrupt = useCallback(() => {
    synthRef.current.cancel();
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
      startListening();
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

  useEffect(() => { handleUserTurnRef.current = handleUserTurn; }, [handleUserTurn]);
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  // ── End interview ────────────────────────────────────────────────
  const endInterview = useCallback(async () => {
    clearInterval(timerRef.current);
    synthRef.current.cancel();
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
    durationRef.current = duration;
    setDuration(duration);
    setStateSynced(INTERVIEW_STATES.OPENING);

    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const secs = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsed(secs);
      if (secs >= durationRef.current) endInterviewRef.current?.();
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
    start,
    endInterview,
    stopRecording,
    interrupt,
    sendText,
    clearError,
    isSupported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
}
