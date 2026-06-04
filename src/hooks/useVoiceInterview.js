// ── useVoiceInterview ─────────────────────────────────────────────
// Orchestrates the full voice interview loop:
//   SpeechRecognition (STT) → API → SSE stream → TTS
//
// TTS priority:
//   1. OpenAI TTS via Worker proxy (/api/proxy/tts) — real audio stream,
//      drives the waveform with actual FFT data (requires stored API key)
//   2. Browser SpeechSynthesis — word-boundary pulse fallback (free, lower quality)

import { useCallback, useEffect, useRef, useState } from 'react';

const FILLERS = [
  'Hmm, let me think about that...',
  'Interesting...',
  'Okay...',
  'Right, let me think...',
  'Mm-hmm...',
  'Got it...',
  'Hmm, thanks for that...',
  "I'm taking notes...",
  'That is helpful, let me note that down...',
  'Good point...',
  'I see, interesting...',
  'Let me jot that down...',
  'Right, noted...',
  'Appreciate that...',
  'Thanks for sharing that...',
  'Noted, give me a moment...',
  'That is great context...',
  'Mm, let me process that...',
  'Very good...',
  'I see what you mean...',
];

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
  const [ttsCost,      setTtsCost]      = useState(0);  // OpenAI TTS cost this session
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
  const hasOpenAIKeyRef    = useRef(false);
  // Explicit TTS mode: 'browser' | 'openai' — set on start()
  const ttsModeRef         = useRef('browser');
  // OpenAI voice name — set on start()
  const ttsVoiceRef        = useRef('nova');
  // Cumulative character count sent to OpenAI TTS this session
  const ttsCharsRef        = useRef(0);
  // Timer that fires a filler phrase while AI is thinking
  const fillerTimerRef     = useRef(null);
  // Promise from the currently-playing filler so we can await it before real speech
  const fillerPromiseRef   = useRef(null);
  // Set to true to abort an in-flight OpenAI filler fetch before it plays
  const fillerCancelledRef = useRef(false);
  // Output device ID for AudioContext.setSinkId (Chrome)
  const outputDeviceIdRef  = useRef(null);
  // Persisted AudioContext (one per session)
  const audioCtxRef        = useRef(null);
  // Current AnalyserNode while OpenAI audio is playing — read by SpeechWaveform
  const ttsAnalyserRef     = useRef(null);
  // Current BufferSourceNode so we can stop it on interrupt
  const ttsSourceRef       = useRef(null);

  // Refs to break circular useCallback dependencies
  const handleUserTurnRef  = useRef(null);
  const endInterviewRef    = useRef(null);
  const startListeningRef  = useRef(null);
  const windDownRef        = useRef(null);

  const setStateSynced = useCallback((s) => {
    stateRef.current = s;
    setState(s);
  }, []);

  // ── TTS step 1: fetch audio bytes from the proxy ─────────────────
  // Called immediately when a chunk is enqueued so the download overlaps
  // with playback of the previous chunk (zero inter-chunk gap).
  const fetchTTSBuffer = useCallback(async (text) => {
    ttsCharsRef.current += text.length;
    setTtsCost(ttsCharsRef.current / 1000 * 0.030);
    const res = await fetch('/api/proxy/tts', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text, voice: ttsVoiceRef.current }),
    });
    if (!res.ok) throw new Error(`TTS ${res.status}`);
    return res.arrayBuffer();
  }, []);

  // ── TTS step 2: decode a pre-fetched ArrayBuffer and play it ──────
  const playTTSBuffer = useCallback(async (arrayBuffer) => {
    // Cancel any browser-synthesis filler that may be running
    synthRef.current.cancel();

    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      if (outputDeviceIdRef.current && audioCtxRef.current.setSinkId) {
        await audioCtxRef.current.setSinkId(outputDeviceIdRef.current).catch(() => {});
      }
    }
    const audioCtx = audioCtxRef.current;
    await audioCtx.resume();

    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

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
      const utt  = new SpeechSynthesisUtterance(text);
      utt.rate   = 0.92;
      utt.pitch  = 1.0;

      let stallTimer;
      utt.onboundary = (e) => {
        if (e.name !== 'word') return;
        const word = text.slice(e.charIndex, e.charIndex + (e.charLength ?? 4));
        const amp  = Math.min(0.92, 0.42 + Math.min(word.replace(/\W/g, '').length, 9) * 0.057);
        window.dispatchEvent(new CustomEvent('iv-voice-pulse', { detail: { amp } }));
      };
      // iOS Safari stalls speech synthesis after ~15 s of speaking.
      // Periodic pause+resume keeps it running on long responses.
      utt.onstart = () => {
        stallTimer = setInterval(() => {
          if (synthRef.current.speaking) {
            synthRef.current.pause();
            synthRef.current.resume();
          }
        }, 12000);
      };
      utt.onend   = () => { clearInterval(stallTimer); resolve(); };
      utt.onerror = () => { clearInterval(stallTimer); resolve(); };

      const assignVoiceAndSpeak = () => {
        const voices = synthRef.current.getVoices();
        const preferred = voices.find(v =>
          /en[-_]US/i.test(v.lang) && /natural|premium|enhanced/i.test(v.name)
        ) || voices.find(v => /en[-_]US/i.test(v.lang));
        if (preferred) utt.voice = preferred;
        synthRef.current.speak(utt);
      };

      // iOS loads voices asynchronously — must wait before calling speak(),
      // otherwise the utterance plays silently with no voice assigned.
      const voices = synthRef.current.getVoices();
      if (voices.length > 0) {
        assignVoiceAndSpeak();
      } else {
        let spoken = false;
        synthRef.current.onvoiceschanged = () => {
          synthRef.current.onvoiceschanged = null;
          if (!spoken) { spoken = true; assignVoiceAndSpeak(); }
        };
        // Fallback: if onvoiceschanged never fires (some iOS versions), speak anyway
        setTimeout(() => {
          if (!spoken) { spoken = true; assignVoiceAndSpeak(); }
        }, 500);
      }
    });
  }, []);

  // ── TTS — dispatch based on explicit ttsMode setting ─────────────
  const speak = useCallback(async (text) => {
    if (ttsModeRef.current === 'openai' && hasOpenAIKeyRef.current) {
      try {
        const buf = await fetchTTSBuffer(text);
        return await playTTSBuffer(buf);
      } catch { /* fall through to browser TTS */ }
    }
    return speakSynthesis(text);
  }, [fetchTTSBuffer, playTTSBuffer, speakSynthesis]);

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
    recog.continuous     = true;  // Don't cut off on brief mid-sentence pauses
    recog.interimResults = true;
    recogRef.current     = recog;

    let accumulated = '';  // confirmed final text across multiple utterances
    let silenceTimer;      // auto-submit after 3 s of silence
    // Chrome fires BOTH onerror AND onend for the same event (e.g. no-speech).
    // Without this flag, both handlers call restart() → two instances fight → mic appears dead.
    let didRestart = false;

    const submit = (text) => {
      if (gotResultRef.current) return;
      clearTimeout(silenceTimer);
      gotResultRef.current  = true;
      partialRef.current    = '';
      handleUserTurnRef.current?.(text);
      manualStopRef.current = true;
      recog.stop();
    };

    const restart = () => {
      if (didRestart) return;
      didRestart = true;
      startListeningRef.current?.();
    };

    recog.onresult = (e) => {
      if (gotResultRef.current) return;
      clearTimeout(silenceTimer);

      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          accumulated += e.results[i][0].transcript + ' ';
        }
      }
      const lastResult = e.results[e.results.length - 1];
      const interim    = lastResult.isFinal ? '' : lastResult[0].transcript;
      partialRef.current = (accumulated + interim).trim();

      // Auto-submit after 5 s of silence — longer than default so thoughtful
      // pauses mid-answer don't cut the user off prematurely.
      if (accumulated.trim()) {
        silenceTimer = setTimeout(() => submit(accumulated.trim()), 5000);
      }
    };

    recog.onend = () => {
      clearTimeout(silenceTimer);
      if (gotResultRef.current) return;
      if (manualStopRef.current) return;
      if (stateRef.current !== INTERVIEW_STATES.LISTENING) return;
      // If we accumulated anything before the unexpected stop, submit it
      if (accumulated.trim()) {
        gotResultRef.current = true;
        handleUserTurnRef.current?.(accumulated.trim());
        return;
      }
      restart();
    };

    recog.onerror = (e) => {
      clearTimeout(silenceTimer);
      if (e.error === 'no-speech') {
        if (stateRef.current === INTERVIEW_STATES.LISTENING && !manualStopRef.current) {
          restart();
        }
      } else if (e.error !== 'aborted') {
        didRestart = true;  // block onend from restarting after a real error
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

  // ── AI response: stream text + pipeline TTS sentence-by-sentence ─
  // Sentences are spoken as soon as they complete in the stream, so
  // audio starts ~1 sentence after generation begins instead of waiting
  // for the full response. Chunks are chained so they play in order.
  const handleAIResponse = useCallback(async (fetchPromise) => {
    const response = await fetchPromise;
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${response.status}`);
    }

    const reader   = response.body.getReader();
    const dec      = new TextDecoder();
    let sseBuf     = '';
    let fullText   = '';
    let textBuf    = '';   // incomplete sentence waiting for more tokens
    let speakChain = Promise.resolve();

    // Enqueue a sentence chunk: chains onto the existing TTS promise so chunks
    // play in order. For OpenAI TTS the fetch starts IMMEDIATELY on enqueue
    // (while the previous chunk is still playing) so audio is buffered by the
    // time it's this chunk's turn — eliminating inter-chunk silence gaps.
    const speakChunk = (text) => {
      if (!text.trim()) return;

      // Kick off the network fetch right now, don't wait for the chain
      const useOpenAI = ttsModeRef.current === 'openai' && hasOpenAIKeyRef.current;
      const bufferPromise = useOpenAI
        ? fetchTTSBuffer(text).catch(() => null)  // null → fallback to browser
        : Promise.resolve(null);

      speakChain = speakChain.then(async () => {
        if (stateRef.current === INTERVIEW_STATES.ENDED   ||
            stateRef.current === INTERVIEW_STATES.LISTENING) return;

        // Cancel the pending filler timer (hasn't fired yet — good, skip it)
        clearTimeout(fillerTimerRef.current);

        if (fillerPromiseRef.current) {
          if (ttsModeRef.current === 'openai' && hasOpenAIKeyRef.current) {
            // OpenAI mode: real audio is pre-fetched and ready — stop the filler
            // immediately so there's no gap between text appearing and audio starting.
            fillerCancelledRef.current = true;
            if (ttsSourceRef.current) {
              ttsSourceRef.current.onended = null;
              ttsSourceRef.current.stop();
              ttsSourceRef.current   = null;
              ttsAnalyserRef.current = null;
            }
          } else {
            // Browser TTS: let the filler finish naturally before real speech starts.
            await Promise.race([
              fillerPromiseRef.current.catch(() => {}),
              new Promise(r => setTimeout(r, 3000)), // safety cap
            ]);
            synthRef.current.cancel();
          }
          fillerPromiseRef.current = null;
        }

        if (stateRef.current === INTERVIEW_STATES.ENDED   ||
            stateRef.current === INTERVIEW_STATES.LISTENING) return;

        if (stateRef.current !== INTERVIEW_STATES.RESPONDING) {
          setStateSynced(INTERVIEW_STATES.RESPONDING);
        }
        const buf = await bufferPromise;  // likely already resolved (pre-fetched)
        if (buf) {
          await playTTSBuffer(buf);
        } else {
          await speakSynthesis(text);
        }
      });
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuf += dec.decode(value, { stream: true });
      const lines = sseBuf.split('\n');
      sseBuf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        let ev;
        try { ev = JSON.parse(raw); } catch { continue; }
        if (ev.type === 'session' && ev.id) {
          setSessionId(ev.id);
          sessionRef.current = ev.id;
        } else if (ev.type === 'delta' && ev.text) {
          fullText += ev.text;
          textBuf  += ev.text;
          setLastText(fullText);

          // Flush sentence endings immediately (.!?) — these are hard breaks.
          let breakIdx = textBuf.search(/[.!?]\s/);
          while (breakIdx !== -1) {
            speakChunk(textBuf.slice(0, breakIdx + 1).trim());
            textBuf  = textBuf.slice(breakIdx + 2);
            breakIdx = textBuf.search(/[.!?]\s/);
          }

          // Flush on commas too, but only when the chunk is long enough (≥ 25 chars).
          // Short comma-separated phrases ("Hello, I'd like to") stay buffered until
          // the comma is far enough in — clubbing adjacent short fragments together.
          const COMMA_MIN = 25;
          const commaRe   = /,\s/g;
          let cm;
          while ((cm = commaRe.exec(textBuf)) !== null) {
            if (cm.index >= COMMA_MIN) {
              speakChunk(textBuf.slice(0, cm.index + 1).trim());
              textBuf = textBuf.slice(cm.index + 2);
              commaRe.lastIndex = 0; // restart search on updated buffer
              break;
            }
          }
        }
      }
    }

    // Speak any remaining text (last sentence may not have trailing punctuation)
    speakChunk(textBuf.trim());

    setTranscript(t => [...t, { role: 'assistant', text: fullText }]);

    // Wait for all enqueued chunks to finish speaking
    await speakChain;

    // Only transition state if not already interrupted or ended
    if (stateRef.current !== INTERVIEW_STATES.ENDED &&
        stateRef.current !== INTERVIEW_STATES.LISTENING) {
      if (windingDownRef.current) {
        endInterviewRef.current?.();
      } else {
        startListening();
      }
    }
  }, [fetchTTSBuffer, playTTSBuffer, speakSynthesis, startListening, setStateSynced]);

  // ── User turn ────────────────────────────────────────────────────
  const handleUserTurn = useCallback(async (text) => {
    if (!sessionRef.current) return;
    setStateSynced(INTERVIEW_STATES.PROCESSING);
    setTranscript(t => [...t, { role: 'user', text }]);

    // After 800 ms of silence, play a short filler to fill dead air.
    // In OpenAI mode, use the same TTS voice for consistency. A cancel flag
    // lets speakChunk abort the filler immediately once real audio is ready.
    clearTimeout(fillerTimerRef.current);
    fillerPromiseRef.current  = null;
    fillerCancelledRef.current = false;
    fillerTimerRef.current = setTimeout(() => {
      if (stateRef.current !== INTERVIEW_STATES.PROCESSING) return;
      const filler    = FILLERS[Math.floor(Math.random() * FILLERS.length)];
      const useOpenAI = ttsModeRef.current === 'openai' && hasOpenAIKeyRef.current;
      if (useOpenAI) {
        fillerPromiseRef.current = fetchTTSBuffer(filler)
          .then(buf => {
            if (fillerCancelledRef.current) return;
            if (stateRef.current !== INTERVIEW_STATES.PROCESSING) return;
            return playTTSBuffer(buf);
          })
          .catch(() => {});
      } else {
        fillerPromiseRef.current = speakSynthesis(filler);
      }
    }, 800);

    try {
      await handleAIResponse(
        fetch(`/api/interview/sessions/${sessionRef.current}/message`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ content: text }),
        })
      );
    } catch (err) {
      clearTimeout(fillerTimerRef.current);
      setError(`Something went wrong: ${err.message}`);
      if (stateRef.current !== INTERVIEW_STATES.ENDED) {
        startListening();
      }
    }
  }, [handleAIResponse, setStateSynced, startListening, speakSynthesis, fetchTTSBuffer, playTTSBuffer]);

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
  const start = useCallback(async ({ theme, duration, model = 'workers-ai', ttsMode = 'browser', voice = 'nova', outputDeviceId = null }) => {
    setError(null);
    setTranscript([]);
    setLastText('');
    setElapsed(0);
    setCost(0);
    setHasOpenAIKey(false);
    setTtsCost(0);
    clearTimeout(fillerTimerRef.current);
    fillerPromiseRef.current   = null;
    windingDownRef.current     = false;
    ttsModeRef.current         = ttsMode;
    ttsVoiceRef.current        = voice;
    ttsCharsRef.current        = 0;
    outputDeviceIdRef.current  = outputDeviceId;
    durationRef.current        = duration;
    setDuration(duration);

    // ── iOS Safari: create and unlock AudioContext NOW, while still in the
    //    synchronous user-gesture call chain. Any await after this point
    //    breaks the gesture context and iOS will block audio playback.
    if (ttsMode === 'openai') {
      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
        if (outputDeviceId && audioCtxRef.current.setSinkId) {
          audioCtxRef.current.setSinkId(outputDeviceId).catch(() => {});
        }
      }
      audioCtxRef.current.resume().catch(() => {});
    }

    // Check whether user has an OpenAI key (needed for TTS even if ttsMode=openai)
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
          body:    JSON.stringify({ theme, duration, model }),
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
      clearTimeout(fillerTimerRef.current);
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
    ttsCost,
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
