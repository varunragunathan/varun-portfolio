# Chapter 29 — Voice Interview with Hooty

## What You'll Learn

This chapter documents the voice interview feature end to end. It explains the user experience, the full-stack architecture, the streaming TTS pipeline and why it is built the way it is, the SpeechRecognition quirks that had to be tamed, how OpenAI API keys are stored encrypted per-user, the session lifecycle from setup through post-session assessment, and every non-obvious design decision along the way.

---

## 29.1 What It Is

The Voice Interview is a mock phone screen conducted by Hooty, the site's pixel-art owl. The user picks a topic area and a duration, then talks. Hooty listens, asks follow-up questions, and at the end produces a short written assessment. The whole exchange is voice-first: the user speaks into their microphone, Hooty's responses are read aloud, and the screen exists mainly to show a transcript and the waveform.

The feature was designed to answer a concrete question: *can a personal portfolio site host a credible, low-latency, end-to-end voice AI loop that a user might actually practice with?*

The answer is yes, with some constraints — browser STT only works in Chrome/Edge, and the real-time audio quality depends on whether the user has an OpenAI key stored.

---

## 29.2 Feature Overview

| Capability | Detail |
|---|---|
| Interview topics | 11 presets + freeform custom topic |
| Session lengths | 15 / 30 / 45 / 60 minutes |
| STT | Browser `SpeechRecognition` API (Chrome / Edge only) |
| TTS — primary | OpenAI TTS-1 via `/api/proxy/tts` Worker proxy (requires user-stored key) |
| TTS — fallback | Browser `SpeechSynthesis` |
| AI model — default | Claude Haiku (`claude-haiku-4-5-20251001`) |
| AI model — budget | Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) |
| Waveform | Canvas `AnalyserNode` FFT (speaking) / word-boundary pulses (browser TTS) |
| Assessment | Claude Sonnet post-session, streamed to summary screen |
| Cost tracking | D1 token accumulation → USD displayed on summary screen |

---

## 29.3 System Architecture

A complete request lifecycle looks like this:

```
Browser                            Cloudflare Worker                  Anthropic API
──────                             ─────────────────                  ─────────────
POST /api/interview/sessions ────► createInterviewSession()
  { theme, duration, model }          ├─ Insert interview_sessions row
                                      ├─ Build system prompt
                                      └─ callClaude() → stream ──────────────────►
                          ◄── SSE ──────────────────────────────────────────────
 { type:'session', id }              (session ID emitted first so client can track)
 { type:'delta', text }              (tokens stream in real time)
 { type:'done' }

[User speaks → STT → text]

POST /api/interview/sessions/:id/message
  { content, isLastTurn }   ────► sendInterviewMessage()
                                      ├─ Append user message to interview_messages
                                      ├─ Load full history
                                      ├─ If isLastTurn: append closing instruction
                                      └─ callClaude(messages) → stream ──────────►
                          ◄── SSE ──────────────────────────────────────────────

PATCH /api/interview/sessions/:id/end
  { duration_actual }       ────► endInterviewSession()
                                      └─ Set ended_at, store duration

GET /api/interview/sessions/:id/assessment
                            ────► getInterviewAssessment()
                                      └─ callClaude(transcript) → stream ────────►
                          ◄── SSE ──────────────────────────────────────────────
```

For the OpenAI TTS path, the browser makes a separate fetch to the Worker for each spoken chunk:

```
Browser (hook)              Cloudflare Worker            OpenAI API
──────────────              ─────────────────            ──────────
fetchTTSBuffer(text) ─────► handleProxyTTS()
                                ├─ getSession() — auth guard
                                ├─ Decrypt user's OpenAI key from D1
                                └─ fetch('api.openai.com/v1/audio/speech') ──────►
                   ◄────────────────────────────────────────────────────────────
   ArrayBuffer (MP3)
```

The raw OpenAI key never touches the browser. Every TTS request goes through the Worker, which decrypts the per-user key on demand.

---

## 29.4 Database Schema

Interview data lives in three tables, all in the main D1 database (`varun_portfolio_auth`), added in migration `005-interview.sql`.

```sql
CREATE TABLE IF NOT EXISTS interview_sessions (
  id              TEXT    PRIMARY KEY,
  user_id         TEXT    NOT NULL,
  theme           TEXT    NOT NULL,            -- preset id or custom text
  avatar_id       TEXT    NOT NULL DEFAULT 'hooty',
  duration_target INTEGER NOT NULL DEFAULT 1800,
  duration_actual INTEGER,                     -- filled on PATCH /end
  model           TEXT    NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cost_usd        REAL    NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  ended_at        INTEGER                      -- NULL while active
);

CREATE TABLE IF NOT EXISTS interview_messages (
  id          TEXT    PRIMARY KEY,
  session_id  TEXT    NOT NULL REFERENCES interview_sessions(id),
  role        TEXT    NOT NULL,                -- 'user' | 'assistant'
  content     TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS user_encrypted_keys (
  user_id        TEXT    PRIMARY KEY,
  encrypted_blob TEXT    NOT NULL,             -- AES-256-GCM ciphertext, base64
  key_hint       TEXT,                         -- last 4 chars of key, shown in UI
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);
```

**Why separate message rows instead of a JSON column?** Interview sessions can be long (up to 60 minutes, dozens of turns). Storing history as a flat JSON blob in a single column means loading and reserialising the entire transcript on every turn. Individual rows allow `ORDER BY created_at ASC` fetches that scale linearly, and individual messages can later be individually deleted or analysed.

**The `theme` column** stores either a preset key (`'frontend'`, `'system-design'`, etc.) or the user's freeform topic text directly. When a custom topic is entered, the worker stores the text verbatim (truncated to 200 characters). The `systemPrompt()` function resolves unknown keys via `THEMES[theme] || theme`, so both paths work without branching.

---

## 29.5 The Conversation Loop

### 29.5.1 Session creation

When the user hits **Start Interview**, `handleStart` in `Interview.jsx` calls `start()` from `useVoiceInterview`. The hook immediately creates an `AudioContext` if the TTS mode is OpenAI — this must happen synchronously inside the user-gesture handler, because iOS Safari refuses audio playback from contexts created after `await` breaks the gesture chain.

After the audio context is unlocked, the hook fetches the user's key status (`/api/user/key/status`) and then POSTs to `/api/interview/sessions`. The worker creates the session row, calls Claude with an empty message list and a `Begin.` seed, and streams the opening sentence back via SSE.

The SSE stream emits three event shapes:

```
data: {"type":"session","id":"<uuid>"}
data: {"type":"delta","text":"Hi there, I'm Hooty..."}
data: {"type":"done"}
```

The hook reads these events as they arrive. The session ID is captured into `sessionRef` on the first event. Delta tokens accumulate into `fullText` and update the `lastText` state (shown as the speech bubble). Each completed sentence is passed to `speakChunk()`.

### 29.5.2 Sentence-level TTS pipelining

The central optimisation in the TTS path is **pre-fetching**. When `speakChunk(text)` is called for a sentence, it immediately fires `fetchTTSBuffer(text)` — a network request to the Worker for the audio bytes — and stores the resulting promise as `bufferPromise`. That fetch runs *concurrently* with the audio playback of the previous sentence.

```
sentence 1 ──► fetch starts ──► plays ──────────────────────────────►
sentence 2 ──────────────► fetch starts ──► waits ──► plays ────────►
sentence 3 ──────────────────────────► fetch starts ──► waits ──────►
```

By the time sentence 2 finishes playing, sentence 3's audio is already downloaded. Inter-sentence silence is eliminated.

The chain is maintained by `speakChain`, a Promise that each new `speakChunk` appends to:

```js
speakChain = speakChain.then(async () => {
  const buf = await bufferPromise;  // likely already resolved
  if (buf) await playTTSBuffer(buf);
  else     await speakSynthesis(text);  // fallback
});
```

### 29.5.3 Filler phrases

When the user finishes speaking, there is a processing gap (STT → network → AI stream → first sentence ready). To fill this silence, a 800 ms timer fires a filler phrase ("Hmm, let me think about that…", "Interesting…", etc.).

In OpenAI TTS mode, the filler uses the same voice: `fetchTTSBuffer(filler)` starts immediately, then plays if not cancelled. A `fillerCancelledRef` flag lets `speakChunk` abort the filler the moment the first real sentence is ready, so there is no artificial wait:

```js
if (ttsModeRef.current === 'openai' && hasOpenAIKeyRef.current) {
  fillerCancelledRef.current = true;      // abort if still fetching
  if (ttsSourceRef.current) {             // stop if already playing
    ttsSourceRef.current.onended = null;
    ttsSourceRef.current.stop();
  }
}
```

In browser synthesis mode the filler runs to completion before real speech starts — a deliberate choice, because cutting off mid-word with browser TTS sounds jarring.

### 29.5.4 User turn

The browser's `SpeechRecognition` API runs continuously (`continuous: true`) with interim results enabled. Interim results update `partialRef` so the UI can show a live transcript and so the **Done** button can submit whatever was captured if the user presses it before the silence timer fires.

Final results accumulate into `accumulated`. After 5 seconds of silence with confirmed text, the answer is auto-submitted. Longer silence tolerance was chosen specifically to allow thoughtful pauses mid-sentence.

`handleUserTurn` is called with the final text. It POSTs to `/api/interview/sessions/:id/message`. If the wind-down timer has fired (`windingDownRef.current === true`), the request carries `isLastTurn: true`.

### 29.5.5 Wind-down and graceful close

When elapsed time reaches the target duration, `windingDownRef` is set. The subsequent behaviour depends on what the user is doing at that moment:

| State at expiry | Behaviour |
|---|---|
| LISTENING — user is speaking | Let them finish. STT auto-submits; `isLastTurn:true` tells Hooty to react and close. |
| LISTENING — nothing said yet | Stop the mic immediately. Hooty delivers a generic closing monologue. |
| RESPONDING / PROCESSING | Let the current response finish. `handleAIResponse` sees `windingDownRef` after `speakChain` resolves and calls `endInterview` instead of restarting listening. |

When `isLastTurn: true` reaches the worker, the system prompt is extended:

```
TIME IS UP — this is the candidate's final answer.
Respond with exactly two spoken sentences: first, a genuine one-sentence
reaction to their answer; second, a warm closing that thanks them and
wishes them luck. Do not ask another question.
```

This keeps Hooty in character rather than emitting a formulaic sign-off.

---

## 29.6 Speech Recognition Quirks

The `SpeechRecognition` implementation is non-trivial because of several browser-specific behaviours.

**Chrome fires both `onerror` and `onend` for the same event.** If `no-speech` triggers `onerror` and `onend` simultaneously, both handlers would call `restart()`. A `didRestart` flag blocks the second call:

```js
const restart = () => {
  if (didRestart) return;
  didRestart = true;
  startListeningRef.current?.();
};
```

**`manualStopRef` vs `gotResultRef`.** Two separate flags track distinct stop reasons. `manualStopRef` is set when code explicitly stops the microphone (user pressed Done, timer fired, or an interrupt occurred). `gotResultRef` is set when a valid transcript was collected and submitted. Both gate the `onend` restart logic:

```js
recog.onend = () => {
  if (gotResultRef.current) return;   // submitted — don't restart
  if (manualStopRef.current) return;  // intentional stop — don't restart
  if (stateRef.current !== INTERVIEW_STATES.LISTENING) return;
  if (accumulated.trim()) { submit(accumulated.trim()); return; }
  restart();
};
```

Without both flags, race conditions produce double microphone instances, which manifests as the mic appearing to go dead.

**iOS Safari has no `SpeechRecognition`.** The UI degrades gracefully: the listening state remains active but no STT runs, and a text input appears for typed answers. The submit flow is identical.

**iOS Safari stalls `SpeechSynthesis` after ~15 seconds.** A 12-second `pause()`/`resume()` heartbeat inside `speakSynthesis` keeps the synthesiser running on long responses.

---

## 29.7 Waveform Visualisation

`SpeechWaveform.jsx` renders an animated bar graph on a `<canvas>` element. It operates in two modes.

**Speaking mode (OpenAI TTS):** When `ttsAnalyserRef.current` is set, the component reads real FFT data from the `AnalyserNode` attached to the `BufferSourceNode` playing the audio. Each animation frame calls `analyser.getByteFrequencyData(dataArray)`, maps the lower 40 frequency bins to bar heights, and draws them in an indigo/violet gradient. This is a true visualisation of the audio being played.

**Listening mode:** An `iv-voice-pulse` custom event carries an amplitude value derived from the recognised word length. The canvas renders emerald/teal bars that pulse with each spoken word.

**Browser synthesis speaking mode:** Word-boundary events from `SpeechSynthesisUtterance.onboundary` fire `iv-voice-pulse` events, driving the same animation as the listening mode but at a different colour.

```js
utt.onboundary = (e) => {
  if (e.name !== 'word') return;
  const word = text.slice(e.charIndex, e.charIndex + (e.charLength ?? 4));
  const amp  = Math.min(0.92, 0.42 + Math.min(word.replace(/\W/g, '').length, 9) * 0.057);
  window.dispatchEvent(new CustomEvent('iv-voice-pulse', { detail: { amp } }));
};
```

Longer words produce higher amplitude, giving a plausible visual rhythm.

---

## 29.8 OpenAI API Key Storage

A user can save their OpenAI key in Settings → Account → API Keys. The key is encrypted before it reaches D1 and never stored in plaintext.

### 29.8.1 Encryption

The encryption uses AES-256-GCM via the Web Crypto API. The per-user encryption key is derived deterministically:

```
user_key = HMAC-SHA256( ENCRYPTION_SECRET,  userId )
```

`ENCRYPTION_SECRET` is a Cloudflare Worker secret (32 random bytes set once, never committed). Each user gets a unique derived key, so a compromise of one user's D1 row does not expose other users' keys.

The ciphertext stored in `user_encrypted_keys.encrypted_blob` is `base64(iv || ciphertext)` where `iv` is 12 random bytes prepended to the GCM ciphertext.

### 29.8.2 The proxy pattern

When the user starts an interview with OpenAI TTS, the browser calls `/api/proxy/tts` for each spoken chunk. The Worker:

1. Validates the session cookie
2. Looks up the user's `encrypted_blob`
3. Derives the per-user key from `HMAC-SHA256(ENCRYPTION_SECRET, userId)`
4. Decrypts the blob to get the raw API key
5. Forwards the request to `api.openai.com/v1/audio/speech`
6. Streams the MP3 bytes back to the browser

The CSP header `connect-src 'self'` in the Worker enforces this at the browser level — the browser cannot call `api.openai.com` directly even if a script tried to. All TTS traffic goes through the authenticated Worker proxy.

### 29.8.3 Cost tracking

TTS cost is estimated client-side:

```js
ttsCharsRef.current += text.length;
setTtsCost(ttsCharsRef.current / 1000 * 0.030);  // OpenAI TTS-1: $0.030 / 1K chars
```

Claude Haiku tokens are tracked server-side. The SSE stream emits `message_start` (input tokens) and `message_delta` (output tokens) events from the Anthropic API. The Worker accumulates these into `input_tokens` and `output_tokens` on the session row:

```js
await env.varun_portfolio_auth
  .prepare('UPDATE interview_sessions SET input_tokens = input_tokens + ?, output_tokens = output_tokens + ? WHERE id = ?')
  .bind(usage.input_tokens, usage.output_tokens, sessionId)
  .run();
```

Cost in USD is computed as:

```
cost_usd = (input_tokens / 1_000_000 * 0.80) + (output_tokens / 1_000_000 * 4.00)
```

These figures reflect Claude Haiku pricing at the time of writing (August 2025).

---

## 29.9 Interview Themes and Custom Topics

Ten preset themes map a short identifier to a natural-language label used in the system prompt:

| ID | System prompt label |
|---|---|
| `frontend` | Frontend Engineering |
| `backend` | Backend & Systems Engineering |
| `system-design` | System Design |
| `behavioral` | Behavioral & Leadership |
| `dsa` | Data Structures & Algorithms |
| `fullstack` | Full Stack Engineering |
| `product` | Product Management |
| `data-engineering` | Data Engineering |
| `data-fullstack` | Data & Full Stack Development |
| `business-finance` | Business Finance |

When the user selects **Custom**, a textarea expands below the theme grid. The text they enter is sent as `customTopic` alongside `theme: 'custom'`. The Worker stores the custom text directly as the `theme` column value:

```js
if (body.theme === 'custom' && body.customTopic?.trim()) {
  theme = body.customTopic.trim().slice(0, 200);
}
```

The system prompt function resolves it via `THEMES[theme] || theme` — if the stored value is not a known key, the raw string is used as the topic label. This means the same `systemPrompt()` function and `getInterviewAssessment()` code path handles custom topics without any branching.

---

## 29.10 System Prompt Design

```
You are Hooty, a warm but rigorous interviewer conducting a <topic> interview
over the phone.

RULES — follow strictly:
- Ask ONE focused question per turn, never multiple questions
- Keep every response to 2–4 short spoken sentences — this is voice, not text
- After the candidate answers, give a brief natural reaction (one sentence),
  then ask the next question
- Adapt difficulty based on the quality of their answer
- Use plain conversational speech only — no markdown, bullets, headers,
  lists, or code blocks
- Do not mention being an AI or break the interviewer persona
- If the candidate asks you to repeat, simply restate the last question
- Progress naturally through different aspects of the theme over the conversation

OPENING: Introduce yourself as Hooty in one warm sentence, say the interview
topic, and ask your first question.
```

Three constraints are particularly important for voice:

1. **One question per turn.** Multiple questions in a single response produce awkward audio — the user either answers the last one or tries to hold all of them in memory.
2. **2–4 sentences.** Longer responses cause noticeable latency before the final sentence plays, and the user will often interrupt before the end.
3. **No markdown.** Bullets, headers, and code blocks read as garbage over TTS — "asterisk asterisk heading asterisk asterisk" is not useful feedback.

The `max_tokens: 512` cap on the API call enforces the length constraint at the model level as a backstop.

---

## 29.11 Post-Session Assessment

After the interview ends, the summary screen automatically triggers `GET /api/interview/sessions/:id/assessment`. The Worker loads up to 40 messages from the session transcript, builds a reviewer prompt, and calls Claude Sonnet (the same model that powers RAG chat) rather than Haiku. Sonnet produces better analytical prose.

The assessment prompt:

```
You are reviewing a <themeLabel> technical interview.
Provide a concise, honest, and encouraging performance assessment.

TRANSCRIPT:
Interviewer: …
Candidate: …
…

INSTRUCTIONS:
- 3–5 sentences overall
- Mention 1–2 specific strengths you observed
- Mention 1 area to develop, with a concrete suggestion
- Keep the tone warm and constructive — this is a practice tool, not a judgment
- Plain prose only — no markdown, no headers, no bullet points
```

The response streams as SSE deltas to the browser, which displays them progressively in the assessment card on the summary screen.

---

## 29.12 State Machine

`useVoiceInterview` manages the session through six named states:

```
IDLE ──► OPENING ──► LISTENING ──► PROCESSING ──► RESPONDING ──► LISTENING
                                                        │
                                                  (windingDown)
                                                        │
                                                      ENDED
```

| State | What is happening |
|---|---|
| `IDLE` | No session running. Setup screen visible. |
| `OPENING` | Session created. Waiting for / playing Hooty's intro message. |
| `LISTENING` | Mic active. `SpeechRecognition` running. STT accumulated text shown. |
| `PROCESSING` | User turn submitted. Waiting for AI stream to begin. Filler timer active. |
| `RESPONDING` | Hooty is speaking. `speakChain` playing through buffered chunks. |
| `ENDED` | Session ended. Summary screen visible. |

`PixelOwl` maps these states to animation variants: idle pose, beak-flapping talking loop, and "tilted listening" pose.

---

## 29.13 AudioContext Lifecycle

A single `AudioContext` is created at session start and reused for the duration. Creating a new context per TTS chunk would incur startup latency (~50 ms) for every sentence.

```js
if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
  audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
}
```

The context is closed in `endInterview()` to release the audio hardware. On iOS Safari, the context must be created and `resume()`d synchronously inside the start-button click handler before any `await` — any async gap after the button press breaks the user-gesture context and iOS blocks all audio.

For each chunk, `playTTSBuffer` decodes the MP3 `ArrayBuffer`, creates a `BufferSourceNode`, connects it through an `AnalyserNode` to the destination, and starts playback. The analyser's `fftSize: 128` and `smoothingTimeConstant: 0.78` are tuned for a visually smooth but reactive waveform without excessive CPU use.

---

## 29.14 Output Device Selection

Chrome supports `AudioContext.setSinkId()` to route audio to a specific output device. The audio panel in the setup screen enumerates `audiooutput` devices. If the user picks a non-default speaker:

```js
if (outputDeviceId && audioCtxRef.current.setSinkId) {
  await audioCtxRef.current.setSinkId(outputDeviceId).catch(() => {});
}
```

The `.catch(() => {})` silently ignores the call on browsers that do not support it, falling back to the default output. Browser synthesis ignores this setting (it has no `setSinkId` equivalent).

---

## 29.15 Security Considerations

**API key confidentiality.** The user's OpenAI key is never sent to or stored in the browser. It exists in plaintext only ephemerally inside the Worker during a proxy request. The `encrypted_blob` in D1 is only as secure as the `ENCRYPTION_SECRET` Worker secret — if that secret is compromised, all user keys are compromised.

**Auth on every TTS request.** `handleProxyTTS` calls `getSession()` on every request. A logged-out user cannot use another user's stored key.

**Rate limiting.** The `/api/proxy/tts` endpoint is not rate-limited beyond session authentication. A malicious authenticated user could use a victim's stored key for arbitrary TTS requests. Mitigation: the key is per-user, so they would be using their own key if authenticated.

**`isLastTurn` flag is client-supplied.** The client tells the Worker when the interview time has expired. The Worker trusts this flag. A malicious client could send `isLastTurn: true` on any turn to force a closing response. The worst outcome is a shorter interview than intended, not a security breach.

**Interview history is user-scoped.** Every session query includes a `user_id` check. One user cannot access or modify another user's sessions.

---

## 29.16 Known Limitations

**STT browser support.** The Web Speech API is implemented in Chrome and Edge. Firefox and Safari do not support it. On unsupported browsers, the UI degrades to typed input. A future iteration could use the Whisper API via the Worker proxy for cross-browser STT.

**Session context grows with duration.** For a 60-minute session, the full message history is loaded on every turn. With approximately 2–4 sentences per turn at 60 words each, a 60-minute session might accumulate 60–80 messages and ~4 000–6 000 tokens of history. Claude Haiku's 200 K context window is nowhere near the limit, but the D1 query and JSON serialisation grows with every turn. A sliding-window approach (e.g. keep the last 30 messages) could cap the cost.

**Filler phrases delay in OpenAI mode.** The filler TTS fetch (800 ms after user turn) takes a network round trip. If the AI responds faster than the filler audio arrives, the filler is silently cancelled. If it arrives and plays first, there may be an audible gap between the filler and the real response. This is acceptable for the current use case.

**No interruption recovery.** If the user interrupts Hooty mid-speech via the interrupt button, the current AI response is abandoned. Hooty's next response starts from scratch without knowledge of what it was going to say. A smarter design would inject the interrupted content as context.

**assessment is not stored.** The assessment text is generated on demand from the transcript and is not persisted in D1. Reloading the summary page regenerates it, which costs tokens and takes a few seconds. Caching it in a column on `interview_sessions` would eliminate this.

---

## 29.17 File Map

| File | Role |
|---|---|
| `src/hooks/useVoiceInterview.js` | All interview state, STT, TTS pipeline, session lifecycle |
| `src/pages/Interview.jsx` | UI: setup screen, active interview, summary screen |
| `src/pages/Interview.css` | All interview styles |
| `src/components/SpeechWaveform.jsx` | Canvas waveform (FFT + pulse modes) |
| `worker/interview.js` | API handlers, system prompt, SSE transform, assessment |
| `worker/keys.js` | AES-256-GCM key storage, TTS proxy |
| `worker/migrations/005-interview.sql` | D1 schema for sessions, messages, encrypted keys |

---

## 29.18 Deep Dive: The SSE Transform Pipeline

The Worker streams Anthropic's response to the browser using a `ReadableStream` adapter. Anthropic sends its own SSE format; the Worker translates it to the simpler three-event protocol the browser hook expects.

The relevant Anthropic events and what the Worker does with them:

| Anthropic event | Worker action |
|---|---|
| `message_start` | Extract `input_tokens` into local `usage` object |
| `content_block_delta` (text_delta) | Append to `fullText`, emit `{type:'delta', text}` to client |
| `message_delta` | Extract `output_tokens` from `usage` |
| `message_stop` | Call `onDone(fullText, usage)` to persist message + tokens, emit `{type:'done'}` |

The `onDone` callback is passed in at call site, keeping the streaming transform pure and testable:

```js
const upstream = await callClaude(env.ANTHROPIC_API_KEY, sysPrompt, messages);
return sse(transformStream(upstream, async (fullText, usage) => {
  await env.varun_portfolio_auth
    .prepare('INSERT INTO interview_messages …')
    .bind(asstMsgId, sessionId, 'assistant', fullText, now).run();
  await accumulateUsage(env, sessionId, usage);
}));
```

The entire response is buffered in `fullText` inside the stream. The D1 write happens in the `message_stop` handler while the stream is still open — but the browser receives `{type:'done'}` after the write completes, so it knows persistence succeeded before the round trip ends.

---

*Prev: [Chapter 28 — Agentic Surveys](./28-agentic-surveys.md)*
