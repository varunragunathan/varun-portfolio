// ── /chat — full chat page ────────────────────────────────────────
// Left sidebar: conversation list.
// Right panel: active conversation with streaming messages.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import StreamingStatus from '../components/StreamingStatus';
import ModelPicker from '../components/ModelPicker';
import UpgradeModal from '../components/UpgradeModal';

const F = "'Outfit', sans-serif";
const M = "'IBM Plex Mono', monospace";

// ── Markdown-lite renderer ────────────────────────────────────────
// Handles inline code, code blocks, and bold — nothing more.
function renderContent(text, t) {
  if (!text) return null;
  const lines = text.split('\n');
  const out   = [];
  let inCode  = false;
  let codeBuf = [];
  let lang    = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('```')) {
      if (!inCode) {
        inCode = true;
        lang   = line.slice(3).trim();
      } else {
        out.push(
          <pre key={i} style={{
            background:   t.surfaceAlt,
            border:       `1px solid ${t.border}`,
            borderRadius: 8,
            padding:      '12px 16px',
            overflowX:    'auto',
            margin:       '8px 0',
          }}>
            <code style={{ fontFamily: M, fontSize: 12, color: t.text1, whiteSpace: 'pre' }}>
              {codeBuf.join('\n')}
            </code>
          </pre>
        );
        inCode  = false;
        codeBuf = [];
        lang    = '';
      }
      continue;
    }
    if (inCode) { codeBuf.push(line); continue; }

    // Inline code + bold
    const parts = line.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
    const spans = parts.map((p, j) => {
      if (p.startsWith('`') && p.endsWith('`'))
        return <code key={j} style={{ fontFamily: M, fontSize: 12, background: t.surfaceAlt, padding: '1px 5px', borderRadius: 4 }}>{p.slice(1, -1)}</code>;
      if (p.startsWith('**') && p.endsWith('**'))
        return <strong key={j}>{p.slice(2, -2)}</strong>;
      return p;
    });

    out.push(<p key={i} style={{ margin: '0 0 6px', lineHeight: 1.65 }}>{spans}</p>);
  }

  return out;
}

// ── Message bubble ────────────────────────────────────────────────
function MessageBubble({ message, t }) {
  const isUser = message.role === 'user';
  return (
    <div style={{
      display:        'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom:   16,
    }}>
      {!isUser && (
        <div style={{
          width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
          background: t.accentDim, border: `1px solid ${t.accentBorder}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginRight: 10, marginTop: 2,
          fontFamily: M, fontSize: 10, color: t.accent,
        }}>
          ai
        </div>
      )}
      <div style={{
        maxWidth:     isUser ? '72%' : '80%',
        padding:      '12px 16px',
        borderRadius: isUser ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
        background:   isUser ? t.accentDim : t.surface,
        border:       `1px solid ${isUser ? t.accentBorder : t.border}`,
        fontFamily:   F,
        fontSize:     14,
        color:        t.text1,
      }}>
        {message.content
          ? renderContent(message.content, t)
          : <span style={{ color: t.text3, fontFamily: M, fontSize: 13 }}>▋</span>
        }
      </div>
    </div>
  );
}

// ── Conversation list item ────────────────────────────────────────
function ConvItem({ conv, active, onClick, onDelete, t }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        padding:      '10px 14px',
        borderRadius: 10,
        background:   active ? t.accentDim : hover ? t.surfaceAlt : 'transparent',
        border:       `1px solid ${active ? t.accentBorder : 'transparent'}`,
        cursor:       'pointer',
        display:      'flex',
        alignItems:   'center',
        justifyContent: 'space-between',
        gap:          8,
        transition:   'all 0.15s',
      }}
    >
      <span style={{
        fontFamily:   F, fontSize: 13, color: active ? t.accent : t.text1,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
      }}>
        {conv.title || 'Untitled'}
      </span>
      {(hover || active) && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: t.text3, fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0,
          }}
          title="Delete conversation"
        >
          ×
        </button>
      )}
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────
function Sidebar({ conversations, activeId, onSelect, onDelete, onNew, t }) {
  return (
    <div style={{
      width:          260,
      flexShrink:     0,
      borderRight:    `1px solid ${t.border}`,
      display:        'flex',
      flexDirection:  'column',
      height:         '100%',
      overflow:       'hidden',
    }}>
      <div style={{ padding: '20px 16px 12px', flexShrink: 0 }}>
        <div style={{ fontFamily: M, fontSize: 11, letterSpacing: '0.15em', color: t.text3, textTransform: 'uppercase', marginBottom: 12 }}>
          Conversations
        </div>
        <button
          onClick={onNew}
          style={{
            width: '100%', padding: '9px 14px', borderRadius: 10,
            background: t.accentDim, border: `1px solid ${t.accentBorder}`,
            cursor: 'pointer', fontFamily: F, fontSize: 13, color: t.accent,
            textAlign: 'left',
          }}
        >
          + New conversation
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
        {conversations.length === 0 && (
          <div style={{ fontFamily: F, fontSize: 13, color: t.text3, textAlign: 'center', marginTop: 40 }}>
            No conversations yet
          </div>
        )}
        {conversations.map(conv => (
          <ConvItem
            key={conv.id}
            conv={conv}
            active={conv.id === activeId}
            onClick={() => onSelect(conv.id)}
            onDelete={onDelete}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main chat area ────────────────────────────────────────────────
function ChatArea({ t }) {
  const { messages, streaming, error, send } = useChat();
  const { isPro, isAdmin, user }             = useAuth();
  const [input,          setInput]          = useState('');
  const [selectedModel,  setSelectedModel]  = useState(null);
  const [models,         setModels]         = useState([]);
  const [showUpgrade,    setShowUpgrade]    = useState(false);
  const bottomRef = useRef(null);

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

  const upgradeStatus = user?.upgradeRequest?.status;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Model picker bar (pro/admin only) */}
      {canPickModel && models.length > 0 && (
        <div style={{
          padding: '8px 24px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: M, fontSize: 10, color: t.text3, letterSpacing: '0.06em' }}>model</span>
          <ModelPicker selectedModel={selectedModel} onSelect={setSelectedModel} models={models} t={t} />
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 80 }}>
            <div style={{ fontFamily: M, fontSize: 12, letterSpacing: '0.15em', color: t.accentMuted, textTransform: 'uppercase' }}>
              RAG · llama-3.3-70b · multi-turn
            </div>
            <h2 style={{ fontFamily: F, fontWeight: 300, fontSize: 28, color: t.text1, marginTop: 16, marginBottom: 8 }}>
              Ask me anything
            </h2>
            <p style={{ fontFamily: F, fontSize: 15, color: t.text3, lineHeight: 1.6 }}>
              About the site's architecture, auth, passkeys,<br />
              deployment, or anything in the docs.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 28, flexWrap: 'wrap' }}>
              {[
                'How does passkey auth work?',
                'What is the RAG pipeline?',
                'Explain the session flow',
                'How are recovery codes stored?',
              ].map(q => (
                <button
                  key={q}
                  onClick={() => send(q, selectedModel)}
                  style={{
                    fontFamily: F, fontSize: 13, color: t.text2,
                    background: t.surfaceAlt, border: `1px solid ${t.border}`,
                    borderRadius: 20, padding: '8px 16px', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {q}
                </button>
              ))}
            </div>

            {/* Upgrade nudge / status for regular users */}
            {!canPickModel && user && (
              <div style={{ marginTop: 28 }}>
                {upgradeStatus === 'pending' ? (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    fontFamily: M, fontSize: 11, letterSpacing: '0.06em',
                    padding: '6px 16px', borderRadius: 20,
                    background: 'rgba(245,166,35,0.08)', border: '1px solid rgba(245,166,35,0.3)',
                    color: '#f5a623',
                  }}>
                    <span>⏳</span> Pro request under review
                  </div>
                ) : upgradeStatus !== 'approved' && (
                  <button
                    onClick={() => setShowUpgrade(true)}
                    style={{
                      fontFamily: M, fontSize: 10, letterSpacing: '0.06em',
                      padding: '6px 16px', borderRadius: 20, cursor: 'pointer',
                      background: t.accentDim, border: `1px solid ${t.accentBorder}`,
                      color: t.accent,
                    }}
                  >
                    ✦ Upgrade to Pro
                  </button>
                )}
              </div>
            )}
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
            fontFamily: M, fontSize: 11, color: '#ff6b6b',
            background: 'rgba(255,107,107,0.08)', borderRadius: 8,
            padding: '10px 14px', marginTop: 8,
          }}>
            {error}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div style={{
        padding:    '16px 24px',
        borderTop:  `1px solid ${t.border}`,
        display:    'flex',
        gap:        10,
        alignItems: 'flex-end',
        flexShrink: 0,
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Ask a question… (Enter to send, Shift+Enter for newline)"
          rows={1}
          style={{
            flex:         1,
            resize:       'none',
            background:   t.surfaceAlt,
            border:       `1px solid ${t.border}`,
            borderRadius: 14,
            padding:      '13px 18px',
            fontFamily:   F,
            fontSize:     14,
            color:        t.text1,
            outline:      'none',
            lineHeight:   1.5,
            maxHeight:    160,
            overflowY:    'auto',
          }}
          onInput={e => {
            e.target.style.height = 'auto';
            e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`;
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || streaming}
          style={{
            background:   input.trim() && !streaming ? t.accentDim : 'transparent',
            border:       `1px solid ${input.trim() && !streaming ? t.accentBorder : t.border}`,
            borderRadius: 14,
            padding:      '13px 20px',
            cursor:       input.trim() && !streaming ? 'pointer' : 'default',
            color:        input.trim() && !streaming ? t.accent : t.text3,
            fontFamily:   M,
            fontSize:     14,
            transition:   'all 0.2s',
            flexShrink:   0,
          }}
        >
          {streaming ? '…' : '↑'}
        </button>
      </div>

      {showUpgrade && (
        <UpgradeModal onClose={() => setShowUpgrade(false)} onSuccess={() => setShowUpgrade(false)} />
      )}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function ChatPage() {
  const { t }           = useTheme();
  const { user, loading } = useAuth();
  const navigate        = useNavigate();

  const [conversations, setConversations] = useState([]);
  const [activeConvId,  setActiveConvId]  = useState(null);

  // Redirect if not signed in
  useEffect(() => {
    if (!loading && !user) navigate('/auth');
  }, [user, loading, navigate]);

  // Load conversation list
  useEffect(() => {
    if (!user) return;
    fetch('/api/chat/conversations', { credentials: 'include' })
      .then(r => r.json())
      .then(({ conversations: convs }) => setConversations(convs ?? []))
      .catch(() => {});
  }, [user]);

  const handleDelete = useCallback(async (id) => {
    await fetch(`/api/chat/conversations/${id}`, { method: 'DELETE', credentials: 'include' });
    setConversations(prev => prev.filter(c => c.id !== id));
    if (activeConvId === id) setActiveConvId(null);
  }, [activeConvId]);

  if (loading || !user) return null;

  return (
    <div style={{
      display:    'flex',
      height:     'calc(100vh - 53px)',
      marginTop:  53,
      overflow:   'hidden',
      background: t.bg,
    }}>
      <Sidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={setActiveConvId}
        onDelete={handleDelete}
        onNew={() => setActiveConvId(null)}
        t={t}
      />
      <ChatArea key={activeConvId ?? 'new'} t={t} />
    </div>
  );
}
