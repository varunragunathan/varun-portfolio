// ── useVoiceInterview ─────────────────────────────────────────────
// Orchestrates the full voice interview loop:
//   SpeechRecognition (STT) → API → SSE stream → SpeechSynthesis (TTS)
//
// Phase-1: browser-native voice, site's Anthropic key (free for user).

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
      utt.rate  = 0.95;
      utt.pitch = 1.0;
      const voices = synthRef.current.getVoices();
      const preferred = voices.find(v =>
        /en[-_]US/i.test(v.lang) && /natural|premium|enhanced/i.test(v.name)
      ) || voices.find(v => /en[-_]US/i.test(v.lang));
      if (preferred) utt.voice = preferred;
      utt.onend  = resolve;
      utt.onerror = resolve;
      synthRef.current.speak(utt);
    });
  }, []);

  // ── STT — uses handleUserTurnRef to avoid circular dep ──────────
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError('Voice input requires Chrome or Edge.');
      return;
    }

    const recog = new SR();
    recog.lang           = 'en-US';
    recog.continuous     = false;
    recog.interimResults = false;
    recogRef.current     = recog;
    setStateSynced(INTERVIEW_STATES.LISTENING);

    recog.onresult = (e) => {
      const text = e.results[e.results.length - 1][0].transcript.trim();
      if (text) handleUserTurnRef.current?.(text);
    };

    recog.onend = () => {
      if (stateRef.current === INTERVIEW_STATES.LISTENING) startListeningRef.current?.();
    };

    recog.onerror = (e) => {
      if (e.error === 'no-speech') {
        if (stateRef.current === INTERVIEW_STATES.LISTENING) startListeningRef.current?.();
      } else {
        setError(`Microphone error: ${e.error}`);
      }
    };

    recog.start();
  }, [setStateSynced]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Read SSE stream ──────────────────────────────────────────────
  const readStream = useCallback(async (response, onText) => {
    const reader = response.body.getReader();
    const dec    = new TextDecoder();
    let buf = '';
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
    if (!response.ok) throw new Error('API error');

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
    } catch {
      setError('Connection lost. Please try again.');
    }
  }, [handleAIResponse, setStateSynced]);

  // Keep refs current so callbacks can call each other without dep cycles
  useEffect(() => { handleUserTurnRef.current = handleUserTurn; }, [handleUserTurn]);
  useEffect(() => { startListeningRef.current = startListening; }, [startListening]);

  // ── End interview ────────────────────────────────────────────────
  const endInterview = useCallback(async () => {
    clearInterval(timerRef.current);
    synthRef.current.cancel();
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

  // ── Start interview — uses endInterviewRef to avoid circular dep ─
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
    } catch {
      setError('Could not start interview. Please check your connection.');
      setStateSynced(INTERVIEW_STATES.IDLE);
    }
  }, [handleAIResponse, setStateSynced]);

  // Cleanup on unmount
  useEffect(() => {
    const synth = synthRef.current;
    return () => {
      clearInterval(timerRef.current);
      synth?.cancel();
      recogRef.current?.stop();
    };
  }, []);

  const remaining = Math.max(0, duration - elapsed);

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
    isSupported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  };
}
