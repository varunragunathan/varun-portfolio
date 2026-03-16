// ── Floating chat widget ─────────────────────────────────────────
// Shows on every page for signed-in users.
// Floating button → slide-up panel with a single conversation.
// For full history + multi-conversation view, links to /chat.
// Pro/admin users see a ModelPicker; regular users see an upgrade prompt.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import StreamingStatus from './StreamingStatus';
import ModelPicker from './ModelPicker';
import UpgradeModal from './UpgradeModal';

const F = "'Outfit', sans-serif";
const M = "'IBM Plex Mono', monospace";

// ── Message bubble ───────────────────────────────────────────────
function MessageBubble({ message, t }) {
  const isUser = message.role === 'user';
  return (
    <div style={{
      display:        'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom:   12,
    }}>
      <div style={{
        maxWidth:     '84%',
        padding:      '10px 14px',
        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
        background:   isUser ? t.accentDim : t.surface,
        border:       `1px solid ${isUser ? t.accentBorder : t.border}`,
        fontFamily:   F,
        fontSize:     14,
        lineHeight:   1.6,
        color:        t.text1,
        whiteSpace:   'pre-wrap',
        wordBreak:    'break-word',
      }}>
        {message.content || (
          <span style={{ color: t.text3, fontFamily: M, fontSize: 12 }}>
            ▋
          </span>
        )}
      </div>
    </div>
  );
}

// ── Chat panel ───────────────────────────────────────────────────
function ChatPanel({ onClose, t }) {
  const { messages, streaming, error, send, reset } = useChat();
  const { isPro, isAdmin, user }  = useAuth();
  const [input, setInput]         = useState('');
  const [selectedModel, setSelectedModel] = useState(null);
  const [models, setModels]       = useState([]);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const bottomRef                 = useRef(null);
  const textareaRef               = useRef(null);

  const canPickModel = isPro || isAdmin;

  // Fetch available models for pro/admin users
  useEffect(() => {
    if (!canPickModel) return;
    fetch('/api/chat/models', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        const list = data.models ?? data;
        if (Array.isArray(list) && list.length > 0) {
          setModels(list);
          // Default to first model
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

  return (
    <>
      <div style={{
        position:      'fixed',
        bottom:        80,
        right:         24,
        width:         'min(420px, calc(100vw - 48px))',
        height:        'min(560px, calc(100vh - 120px))',
        borderRadius:  20,
        background:    t.surface,
        border:        `1px solid ${t.border}`,
        boxShadow:     '0 24px 80px rgba(0,0,0,0.35)',
        display:       'flex',
        flexDirection: 'column',
        zIndex:        999,
        overflow:      'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding:        '14px 18px',
          borderBottom:   `1px solid ${t.border}`,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          flexShrink:     0,
        }}>
          <div>
            <div style={{ fontFamily: F, fontSize: 15, fontWeight: 600, color: t.text1 }}>
              Ask anything
            </div>
            <div style={{ fontFamily: M, fontSize: 10, color: t.accentMuted, marginTop: 2 }}>
              RAG · llama-3.3-70b
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link to="/chat" onClick={onClose} style={{
              fontFamily: M, fontSize: 10, color: t.text3, textDecoration: 'none',
              padding: '4px 8px', borderRadius: 6, border: `1px solid ${t.border}`,
            }}>
              full view
            </Link>
            <button
              onClick={reset}
              title="New conversation"
              style={{
                background: 'none', border: `1px solid ${t.border}`, borderRadius: 6,
                padding: '4px 8px', cursor: 'pointer', color: t.text3,
                fontFamily: M, fontSize: 10,
              }}
            >
              new
            </button>
            <button
              onClick={onClose}
              aria-label="Close chat"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: t.text3, fontSize: 18, lineHeight: 1, padding: '2px 4px',
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Model picker bar (pro/admin only) */}
        {canPickModel && models.length > 0 && (
          <div style={{
            padding: '8px 18px',
            borderBottom: `1px solid ${t.border}`,
            display: 'flex', alignItems: 'center', gap: 8,
            flexShrink: 0,
          }}>
            <span style={{ fontFamily: M, fontSize: 10, color: t.text3, letterSpacing: '0.06em' }}>
              model
            </span>
            <ModelPicker
              selectedModel={selectedModel}
              onSelect={setSelectedModel}
              models={models}
              t={t}
            />
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', marginTop: 48 }}>
              <div style={{ fontFamily: M, fontSize: 11, color: t.text3, letterSpacing: '0.1em' }}>
                ASK ABOUT THE SITE
              </div>
              <div style={{ fontFamily: F, fontSize: 13, color: t.text3, marginTop: 8, lineHeight: 1.6 }}>
                Architecture, auth system,<br />passkeys, RAG pipeline…
              </div>

              {/* Upgrade nudge / status for regular users */}
              {!canPickModel && user && (() => {
                const status = user.upgradeRequest?.status;
                if (status === 'pending') {
                  return (
                    <div style={{
                      marginTop: 20,
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontFamily: M, fontSize: 10, letterSpacing: '0.06em',
                      padding: '5px 14px', borderRadius: 20,
                      background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)',
                      color: '#f5a623',
                    }}>
                      <span>⏳</span> Pro request under review
                    </div>
                  );
                }
                if (!status || status === 'rejected') {
                  return (
                    <button
                      onClick={() => setShowUpgrade(true)}
                      style={{
                        marginTop: 24,
                        fontFamily: M, fontSize: 10, letterSpacing: '0.06em',
                        padding: '6px 16px', borderRadius: 20, cursor: 'pointer',
                        background: t.accentDim, border: `1px solid ${t.accentBorder}`,
                        color: t.accent,
                      }}
                    >
                      ✦ Upgrade to Pro
                    </button>
                  );
                }
                return null;
              })()}
            </div>
          )}
          {messages.map((m, i) => {
            const isWaiting = streaming && i === messages.length - 1 && m.role === 'assistant' && !m.content;
            return isWaiting
              ? <StreamingStatus key={m.id} t={t} />
              : <MessageBubble key={m.id} message={m} t={t} />;
          })}
          {error && (
            <div style={{
              fontFamily: M, fontSize: 11, color: '#ff6b6b', textAlign: 'center',
              padding: '8px 12px', background: 'rgba(255,107,107,0.08)',
              borderRadius: 8, marginTop: 8,
            }}>
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          padding:    '12px 14px',
          borderTop:  `1px solid ${t.border}`,
          display:    'flex',
          gap:        8,
          alignItems: 'flex-end',
          flexShrink: 0,
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask a question…"
            rows={1}
            style={{
              flex:         1,
              resize:       'none',
              background:   t.surfaceAlt,
              border:       `1px solid ${t.border}`,
              borderRadius: 12,
              padding:      '10px 14px',
              fontFamily:   F,
              fontSize:     14,
              color:        t.text1,
              outline:      'none',
              lineHeight:   1.5,
              maxHeight:    120,
              overflowY:    'auto',
            }}
            onInput={e => {
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            style={{
              background:    input.trim() && !streaming ? t.accentDim : 'transparent',
              border:        `1px solid ${input.trim() && !streaming ? t.accentBorder : t.border}`,
              borderRadius:  12,
              padding:       '10px 16px',
              cursor:        input.trim() && !streaming ? 'pointer' : 'default',
              color:         input.trim() && !streaming ? t.accent : t.text3,
              fontFamily:    M,
              fontSize:      13,
              transition:    'all 0.2s',
              flexShrink:    0,
            }}
          >
            {streaming ? '…' : '↑'}
          </button>
        </div>
      </div>

      {/* Upgrade modal */}
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
  const { t }           = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && <ChatPanel onClose={() => setOpen(false)} t={t} />}

      {/* FAB */}
      <button
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close chat' : 'Open chat'}
        style={{
          position:       'fixed',
          bottom:         24,
          right:          24,
          width:          48,
          height:         48,
          borderRadius:   '50%',
          background:     open ? t.surface : t.accentDim,
          border:         `1px solid ${open ? t.border : t.accentBorder}`,
          cursor:         'pointer',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          boxShadow:      '0 4px 20px rgba(0,0,0,0.25)',
          transition:     'all 0.2s',
          zIndex:         1000,
          color:          open ? t.text3 : t.accent,
          fontSize:       open ? 20 : 18,
        }}
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
