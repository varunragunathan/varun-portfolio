// ── Floating chat widget ─────────────────────────────────────────
// Shows on every page for signed-in users.
// Floating button → slide-up panel with a single conversation.
// For full history + multi-conversation view, links to /chat.
// Pro/admin users see a ModelPicker; regular users see an upgrade prompt.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import StreamingStatus from './StreamingStatus';
import ModelPicker from './ModelPicker';
import UpgradeModal from './UpgradeModal';
import './ChatWidget.css';

// ── Message bubble ───────────────────────────────────────────────
function MessageBubble({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`message-bubble message-bubble--${isUser ? 'user' : 'assistant'}`}>
      <div className="message-bubble__inner">
        {message.content || <span className="message-bubble__cursor">▋</span>}
      </div>
    </div>
  );
}

// ── Chat panel ───────────────────────────────────────────────────
function ChatPanel({ onClose }) {
  const { messages, streaming, error, send, reset } = useChat();
  const { isPro, isAdmin, user }  = useAuth();
  const [input, setInput]         = useState('');
  const [selectedModel, setSelectedModel] = useState(null);
  const [models, setModels]       = useState([]);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const bottomRef   = useRef(null);
  const textareaRef = useRef(null);

  const canPickModel = isPro || isAdmin;

  useEffect(() => {
    if (!canPickModel) return;
    fetch('/api/chat/models', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const list = data.models ?? data;
        if (Array.isArray(list) && list.length > 0) {
          setModels(list);
          setSelectedModel(list[0].model_id);
        }
      })
      .catch(() => {});
  }, [canPickModel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setInput('');
    await send(text, selectedModel);
  }, [input, streaming, send, selectedModel]);

  const handleKey = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const sendActive = input.trim() && !streaming;

  return (
    <>
      <div className="chat-panel" role="dialog" aria-label="Chat assistant">
        {/* Header */}
        <div className="chat-panel__header">
          <div className="chat-panel__title-group">
            <div className="chat-panel__title">Ask anything</div>
            <div className="chat-panel__subtitle">RAG · llama-3.3-70b</div>
          </div>
          <div className="chat-panel__header-actions">
            <Link to="/chat" onClick={onClose} className="chat-panel__full-link">full view</Link>
            <button onClick={reset} title="New conversation" className="chat-panel__new-btn">new</button>
            <button onClick={onClose} aria-label="Close chat" className="chat-panel__close-btn">×</button>
          </div>
        </div>

        {/* Model picker bar (pro/admin only) */}
        {canPickModel && models.length > 0 && (
          <div className="chat-panel__model-bar">
            <span className="chat-panel__model-label">model</span>
            <ModelPicker
              selectedModel={selectedModel}
              onSelect={setSelectedModel}
              models={models}
            />
          </div>
        )}

        {/* Messages */}
        <div className="chat-panel__messages">
          {messages.length === 0 && (
            <div className="chat-panel__empty">
              <div className="chat-panel__empty-label">ASK ABOUT THE SITE</div>
              <div className="chat-panel__empty-text">
                Architecture, auth system,<br />passkeys, RAG pipeline…
              </div>

              {/* Upgrade nudge / status for regular users */}
              {!canPickModel && user && (() => {
                const status = user.upgradeRequest?.status;
                if (status === 'pending') {
                  return (
                    <div className="chat-panel__upgrade-pending">
                      <span>⏳</span> Pro request under review
                    </div>
                  );
                }
                if (!status || status === 'rejected') {
                  return (
                    <div className="chat-panel__upgrade-cta">
                      <button onClick={() => setShowUpgrade(true)} className="chat-panel__upgrade-btn">
                        ✦ Upgrade to Pro
                      </button>
                      <span className="chat-panel__upgrade-hint">More models · higher rate limits</span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          )}

          {messages.map((m, i) => {
            const isWaiting = streaming && i === messages.length - 1 && m.role === 'assistant' && !m.content;
            return isWaiting
              ? <StreamingStatus key={m.id} />
              : <MessageBubble key={m.id} message={m} />;
          })}

          {error && <div className="chat-panel__error">{error}</div>}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="chat-panel__input-row">
          <textarea
            ref={textareaRef}
            className="chat-panel__input"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask a question…"
            rows={1}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
          />
          <button
            onClick={handleSend}
            disabled={!sendActive}
            className={`chat-panel__send-btn${sendActive ? ' chat-panel__send-btn--active' : ' chat-panel__send-btn--idle'}`}
          >
            {streaming ? '…' : '↑'}
          </button>
        </div>
      </div>

      {showUpgrade && (
        <UpgradeModal
          onClose={() => setShowUpgrade(false)}
          onSuccess={() => setShowUpgrade(false)}
        />
      )}
    </>
  );
}

// ── Floating button ──────────────────────────────────────────────
export default function ChatWidget() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && <ChatPanel onClose={() => setOpen(false)} />}

      <button
        id="chat-widget"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        className={`chat-widget__fab chat-widget__fab--${open ? 'open' : 'closed'}`}
      >
        {open ? '×' : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        )}
      </button>
    </>
  );
}
