// ── Agentic survey — owl-guided conversational experience ─────────

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';
import { useParams, Link } from 'react-router-dom';
import PixelOwl from '../components/PixelOwl';
import './Survey.css';

const OPTS_DELIMITER = '---SURVEY_OPTS---';

// Strip any suffix of `text` that is a prefix of `delimiter` (partial leak guard)
function stripPartialDelimiter(text, delimiter) {
  for (let len = Math.min(text.length, delimiter.length - 1); len > 0; len--) {
    if (text.endsWith(delimiter.slice(0, len))) return text.slice(0, -len);
  }
  return text;
}

// ── Respondent ID: stable per-browser anonymous token ────────────
function getRespondentId() {
  const KEY = 'survey_respondent_id';
  let id = sessionStorage.getItem(KEY);
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(KEY, id); }
  return id;
}

// ── SSE stream reader ─────────────────────────────────────────────
async function* readSSE(response) {
  const reader = response.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const raw = line.slice(6).trim();
      try { yield JSON.parse(raw); } catch { /* skip */ }
    }
  }
}

// ── Inline markdown: bold + inline code only ─────────────────────
function InlineText({ text }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="survey-inline-code">{p.slice(1, -1)}</code>;
        return p;
      })}
    </>
  );
}

function OwlMessage({ text, streaming }) {
  const lines = text.split('\n').filter(l => l.trim());
  return (
    <div className="survey-msg survey-msg--owl">
      <div className="survey-msg__bubble">
        {lines.map((l, i) => (
          <p key={i} className="survey-msg__para"><InlineText text={l} /></p>
        ))}
        {streaming && <span className="survey-cursor" aria-hidden="true" />}
      </div>
    </div>
  );
}

function UserMessage({ text }) {
  return (
    <div className="survey-msg survey-msg--user">
      <div className="survey-msg__bubble">{text}</div>
    </div>
  );
}

function ResourceCard({ title, url, description }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="survey-resource">
      <span className="survey-resource__title">{title}</span>
      {description && <span className="survey-resource__desc">{description}</span>}
      <span className="survey-resource__arrow" aria-hidden="true">↗</span>
    </a>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function Survey() {
  const { surveyId: paramId, slug } = useParams();

  const [survey,     setSurvey]     = useState(null);
  const [surveyId,   setSurveyId]   = useState(paramId ?? null); // actual UUID for API calls
  const [messages,   setMessages]   = useState([]);       // { role: 'owl'|'user', text }
  const [streaming,  setStreaming]  = useState(false);    // owl is typing
  const [owlState,   setOwlState]   = useState('idle');
  const [opts,       setOpts]       = useState(null);     // { inputType, options, done, resources }
  const [inputText,  setInputText]  = useState('');
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState(null);
  const [started,    setStarted]    = useState(false);

  const messagesRef = useRef(null);
  const inputRef    = useRef(null);
  const sessionRef  = useRef(null); // stable ref for session ID

  // Load survey metadata (by UUID or slug)
  useEffect(() => {
    const url = slug ? `/api/surveys/s/${slug}` : `/api/surveys/${paramId}`;
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        setSurvey(data);
        setSurveyId(data.id); // always use the UUID for session API calls
      })
      .catch(() => setError('Survey not found or no longer active.'));
  }, [paramId, slug]);

  // Scroll the messages panel to bottom (not the window)
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  // Stream owl response for a given user message
  const streamTurn = useCallback(async (sid, userText) => {
    setStreaming(true);
    setOwlState('thinking');
    setOpts(null);

    let buffer = '';
    try {
      const res = await fetch(`/api/surveys/${surveyId}/sessions/${sid}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userText }),
      });

      if (!res.ok) throw new Error('Server error');

      // Stream tokens into a temporary message slot
      setMessages(prev => [...prev, { role: 'owl', text: '', _streaming: true }]);
      setOwlState('streaming');

      for await (const event of readSSE(res)) {
        if (event.type === 'delta') {
          buffer += event.text;
          const display = stripPartialDelimiter(buffer.split(OPTS_DELIMITER)[0], OPTS_DELIMITER).trimEnd();
          flushSync(() => {
            setMessages(prev => {
              const copy = [...prev];
              copy[copy.length - 1] = { role: 'owl', text: display, _streaming: true };
              return copy;
            });
          });
        } else if (event.type === 'opts') {
          setMessages(prev => {
            const copy = [...prev];
            const display = buffer.split(OPTS_DELIMITER)[0].trimEnd();
            copy[copy.length - 1] = { role: 'owl', text: display };
            return copy;
          });
          setOpts(event.opts);
          if (event.opts?.done) {
            setDone(true);
            // Mark session complete
            fetch(`/api/surveys/${surveyId}/sessions/${sid}/complete`, { method: 'PATCH' }).catch(() => {});
          }
        } else if (event.type === 'done') {
          break;
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => {
        const copy = [...prev];
        if (copy.at(-1)?._streaming) copy[copy.length - 1] = { role: 'owl', text: 'Something went wrong. Please refresh and try again.' };
        return copy;
      });
    } finally {
      setStreaming(false);
      setOwlState('done');
      setTimeout(() => setOwlState('idle'), 2000);
    }
  }, [surveyId]);

  // Start the survey
  const startSurvey = useCallback(async () => {
    setStarted(true);
    const respondentId = getRespondentId();

    // Create session
    const res = await fetch(`/api/surveys/${surveyId}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ respondentId }),
    });
    const data = await res.json();

    if (data.error === 'already_completed') {
      setSurvey(prev => ({ ...prev, _alreadyDone: true }));
      return;
    }

    const sid = data.sessionId;
    sessionRef.current = sid;

    // Kick off the first turn with an empty message (owl introduces itself)
    await streamTurn(sid, '');
    inputRef.current?.focus();
  }, [surveyId, streamTurn]);

  const submitChoice = useCallback((choice) => {
    if (streaming || done) return;
    setMessages(prev => [...prev, { role: 'user', text: choice }]);
    setOpts(null);
    streamTurn(sessionRef.current, choice);
  }, [streaming, done, streamTurn]);

  const submitText = useCallback(() => {
    const text = inputText.trim();
    if (!text || streaming || done) return;
    setInputText('');
    setMessages(prev => [...prev, { role: 'user', text }]);
    setOpts(null);
    streamTurn(sessionRef.current, text);
  }, [inputText, streaming, done, streamTurn]);

  // ── Render: error ───────────────────────────────────────────────
  if (error) {
    return (
      <div className="survey-page">
        <div className="survey-error">
          <div className="survey-error__icon">🦉</div>
          <p className="survey-error__text">{error}</p>
          <Link to="/surveys" className="survey-error__link">← All surveys</Link>
        </div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="survey-page">
        <div className="survey-loading">
          <PixelOwl size={6} state="snore" />
        </div>
      </div>
    );
  }

  if (survey._alreadyDone) {
    return (
      <div className="survey-page">
        <div className="survey-done-screen">
          <PixelOwl size={7} state="done" />
          <h2 className="survey-done-screen__title">You've already completed this survey</h2>
          <p className="survey-done-screen__sub">Thanks for taking the time! Your response was already recorded.</p>
          <Link to="/surveys" className="survey-btn survey-btn--primary">← Other surveys</Link>
        </div>
      </div>
    );
  }

  // ── Render: landing ─────────────────────────────────────────────
  if (!started) {
    return (
      <div className="survey-page">
        <div className="survey-landing">
          <div className="survey-landing__owl">
            <PixelOwl size={8} state="idle" />
          </div>
          <div className="survey-landing__eyebrow">survey</div>
          <h1 className="survey-landing__title">{survey.title}</h1>
          {survey.description && (
            <p className="survey-landing__desc">{survey.description}</p>
          )}
          <button className="survey-btn survey-btn--primary survey-btn--large" onClick={startSurvey}>
            Start conversation →
          </button>
          <Link to="/surveys" className="survey-landing__back">← See all surveys</Link>
        </div>
      </div>
    );
  }

  // ── Render: conversation ────────────────────────────────────────
  return (
    <div className="survey-page survey-page--active">

      {/* Owl avatar column */}
      <div className="survey-owl-col" aria-hidden="true">
        <PixelOwl size={6} state={owlState} />
      </div>

      {/* Chat area */}
      <div className="survey-chat">
        <div className="survey-chat__header">
          <span className="survey-chat__title">{survey.title}</span>
        </div>

        <div ref={messagesRef} className="survey-chat__messages" role="log" aria-live="polite" aria-label="Survey conversation">
          {messages.map((m, i) =>
            m.role === 'owl'
              ? <OwlMessage key={i} text={m.text} streaming={!!(m._streaming)} />
              : <UserMessage key={i} text={m.text} />
          )}

          {/* Resources at end */}
          {done && opts?.resources?.length > 0 && (
            <div className="survey-resources">
              <p className="survey-resources__heading">Resources for you</p>
              {opts.resources.map((r, i) => (
                <ResourceCard key={i} title={r.title} url={r.url} description={r.description} />
              ))}
            </div>
          )}

          {/* Done screen */}
          {done && (
            <div className="survey-done">
              <span className="survey-done__icon" aria-hidden="true">🦉</span>
              <span className="survey-done__text">That's a wrap — thanks for sharing!</span>
              <Link to="/surveys" className="survey-btn survey-btn--ghost">← Other surveys</Link>
            </div>
          )}
        </div>

        {/* Input area */}
        {!done && (
          <div className="survey-input-area">
            {/* Choices */}
            {opts?.inputType === 'choice' && opts.options?.length > 0 && (
              <div className="survey-choices" role="group" aria-label="Choose a response">
                {opts.options.map((opt, i) => (
                  <button
                    key={i}
                    className="survey-choice-btn"
                    onClick={() => submitChoice(opt)}
                    disabled={streaming}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* Text input — always available so user can answer freely */}
            {!streaming && (
              <div className="survey-text-input">
                <textarea
                  ref={inputRef}
                  className="survey-textarea"
                  placeholder="Type your response…"
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitText(); }
                  }}
                  rows={2}
                  aria-label="Your response"
                />
                <button
                  className="survey-send-btn"
                  onClick={submitText}
                  disabled={!inputText.trim() || streaming}
                  aria-label="Send"
                >
                  ↵
                </button>
              </div>
            )}

            {/* Thinking indicator */}
            {streaming && (
              <div className="survey-thinking" aria-live="polite">
                <span className="survey-thinking__dot" />
                <span className="survey-thinking__dot" />
                <span className="survey-thinking__dot" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
