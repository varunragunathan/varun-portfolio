// ── /chat — full chat page ────────────────────────────────────────
// Left sidebar: conversation list.
// Right panel: active conversation with streaming messages.

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTheme } from '../hooks/useTheme';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { useResponsive } from '../hooks/useResponsive';
import PixelOwl from '../components/PixelOwl';
import FrozenChat from '../components/FrozenChat';
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

// ── Owl thinking indicator ────────────────────────────────────────
const THINK_MSGS = [
  'vectorizing your query…',
  'cosine similarity intensifies…',
  'retrieving chunks from the void…',
  'bribing the embeddings…',
  'warming up attention heads…',
  'doing math you don\'t want to know about…',
  'running inference at the edge…',
  'asking llama-70b nicely…',
  'whispering to the transformer…',
  'computing dot products at light speed…',
  'hallucination filters engaged…',
  'context window loading…',
  'tokens incoming…',
  'gradient descent complete, probably…',
];

function OwlWaiting({ t }) {
  const [idx, setIdx] = useState(() => Math.floor(Math.random() * THINK_MSGS.length));
  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % THINK_MSGS.length), 1800);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16, padding: '4px 0' }}>
      <PixelOwl size={4} state="thinking" />
      <span style={{ fontFamily: M, fontSize: 12, color: t.accentMuted, letterSpacing: '0.02em' }}>
        {THINK_MSGS[idx]}
      </span>
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────
function MessageBubble({ message, t, isStreaming, showAvatar }) {
  const isUser = message.role === 'user';
  return (
    <div style={{
      display:        'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom:   16,
    }}>
      {!isUser && (
        <div style={{ flexShrink: 0, marginRight: 10, marginTop: 2, width: 16 }}>
          {showAvatar && <PixelOwl size={2} state={isStreaming ? 'streaming' : 'idle'} />}
        </div>
      )}
      <div style={{
        maxWidth:     isUser ? '88%' : '88%',
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
function Sidebar({ conversations, activeId, onSelect, onDelete, onNew, open, onClose, t, isMobile }) {
  if (isMobile && !open) return null;

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isMobile && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 10,
            background: 'rgba(0,0,0,0.5)',
          }}
        />
      )}
      <div style={{
        width:          260,
        flexShrink:     0,
        borderRight:    `1px solid ${t.border}`,
        display:        'flex',
        flexDirection:  'column',
        height:         '100%',
        overflow:       'hidden',
        ...(isMobile ? {
          position: 'absolute', left: 0, top: 0, bottom: 0, zIndex: 11,
          background: t.bg,
        } : {}),
      }}>
        <div style={{ padding: '20px 16px 12px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: M, fontSize: 11, letterSpacing: '0.15em', color: t.text3, textTransform: 'uppercase' }}>
              Conversations
            </div>
            {isMobile && (
              <button
                onClick={onClose}
                aria-label="Close sidebar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: t.text3, fontSize: 20, lineHeight: 1, padding: 4 }}
              >
                ×
              </button>
            )}
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
              onClick={() => { onSelect(conv.id); if (isMobile) onClose(); }}
              onDelete={onDelete}
              t={t}
            />
          ))}
        </div>
      </div>
    </>
  );
}

// ── Main chat area ────────────────────────────────────────────────
function ChatArea({ t, onNewConversation, onOpenSidebar, isMobile, initialConversationId }) {
  const { messages, streaming, error, send, conversationId, loadConversation } = useChat();
  const { isPro, isAdmin, user }             = useAuth();
  const [input,          setInput]          = useState('');
  const [selectedModel,  setSelectedModel]  = useState(null);
  const [models,         setModels]         = useState([]);
  const [showUpgrade,    setShowUpgrade]    = useState(false);
  const [upgradeTier,    setUpgradeTier]    = useState('pro');
  const bottomRef     = useRef(null);
  const prevConvIdRef = useRef(null);
  const firstMsgRef   = useRef('');

  const canPickModel = isPro || isAdmin;

  // Load existing conversation messages on mount (when selecting from sidebar)
  useEffect(() => {
    if (initialConversationId) loadConversation(initialConversationId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Notify parent when a brand-new conversation is created (null → id)
  useEffect(() => {
    if (conversationId && prevConvIdRef.current === null) {
      const title = firstMsgRef.current.slice(0, 60).replace(/\s+/g, ' ').trim() || 'New conversation';
      onNewConversation?.({ id: conversationId, title, created_at: Date.now(), updated_at: Date.now() });
    }
    prevConvIdRef.current = conversationId;
  }, [conversationId, onNewConversation]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;
    if (!conversationId) firstMsgRef.current = text; // cache for sidebar title
    setInput('');
    await send(text, selectedModel);
  }, [input, streaming, send, selectedModel, conversationId]);

  const handleKey = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const upgradeStatus = user?.upgradeRequest?.status;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Top bar: mobile menu toggle + optional model picker */}
      {(isMobile || (canPickModel && models.length > 0)) && (
        <div style={{
          padding: '8px 16px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex', alignItems: 'center', gap: 8,
          flexShrink: 0,
        }}>
          {isMobile && (
            <button
              onClick={onOpenSidebar}
              aria-label="Open conversations"
              style={{
                background: 'none', border: `1px solid ${t.border}`, borderRadius: 8,
                cursor: 'pointer', color: t.text2, padding: '5px 10px',
                fontFamily: M, fontSize: 14, lineHeight: 1,
              }}
            >
              ☰
            </button>
          )}
          {canPickModel && models.length > 0 && (
            <>
              <span style={{ fontFamily: M, fontSize: 10, color: t.text3, letterSpacing: '0.06em' }}>model</span>
              <ModelPicker selectedModel={selectedModel} onSelect={setSelectedModel} models={models} t={t} />
            </>
          )}
        </div>
      )}

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px 12px' : '24px 28px' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: 60 }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <PixelOwl size={8} state="idle" />
            </div>
            <div style={{ fontFamily: M, fontSize: 11, letterSpacing: '0.15em', color: t.accentMuted, textTransform: 'uppercase' }}>
              RAG · llama-3.3-70b · multi-turn
            </div>
            <h2 style={{ fontFamily: F, fontWeight: 300, fontSize: 26, color: t.text1, marginTop: 14, marginBottom: 8 }}>
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
                    <span>⏳</span> Request under review
                  </div>
                ) : upgradeStatus === 'rejected' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                    <div style={{
                      fontFamily: M, fontSize: 11, letterSpacing: '0.06em',
                      padding: '5px 14px', borderRadius: 20,
                      background: 'rgba(255,59,48,0.08)', border: '1px solid rgba(255,59,48,0.25)',
                      color: '#ff3b30',
                    }}>
                      ✕ Previous request not approved
                    </div>
                    <span style={{ fontFamily: F, fontSize: 12, color: t.text3 }}>
                      You can submit a new request
                    </span>
                    <button
                      onClick={() => { setUpgradeTier('pro'); setShowUpgrade(true); }}
                      style={{
                        fontFamily: M, fontSize: 10, letterSpacing: '0.06em',
                        padding: '6px 16px', borderRadius: 20, cursor: 'pointer',
                        background: t.accentDim, border: `1px solid ${t.accentBorder}`,
                        color: t.accent,
                      }}
                    >
                      ✦ Re-submit for Pro
                    </button>
                    <button
                      onClick={() => { setUpgradeTier('student'); setShowUpgrade(true); }}
                      style={{
                        fontFamily: M, fontSize: 10, letterSpacing: '0.06em',
                        padding: '4px 14px', borderRadius: 20, cursor: 'pointer',
                        background: 'transparent',
                        border: '1px solid rgba(52,199,89,0.3)',
                        color: '#34c759',
                      }}
                    >
                      Request student access
                    </button>
                  </div>
                ) : upgradeStatus !== 'approved' && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => { setUpgradeTier('pro'); setShowUpgrade(true); }}
                      style={{
                        fontFamily: M, fontSize: 10, letterSpacing: '0.06em',
                        padding: '6px 16px', borderRadius: 20, cursor: 'pointer',
                        background: t.accentDim, border: `1px solid ${t.accentBorder}`,
                        color: t.accent,
                      }}
                    >
                      ✦ Upgrade to Pro
                    </button>
                    <span style={{ fontFamily: F, fontSize: 12, color: t.text3 }}>
                      More models · higher rate limits
                    </span>
                    <button
                      onClick={() => { setUpgradeTier('student'); setShowUpgrade(true); }}
                      style={{
                        fontFamily: M, fontSize: 10, letterSpacing: '0.06em',
                        padding: '4px 14px', borderRadius: 20, cursor: 'pointer',
                        background: 'transparent',
                        border: '1px solid rgba(52,199,89,0.3)',
                        color: '#34c759',
                      }}
                    >
                      Student access
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {messages.map((m, i) => {
          const isLast      = i === messages.length - 1;
          const isWaiting   = streaming && isLast && m.role === 'assistant' && !m.content;
          const isStreaming  = streaming && isLast && m.role === 'assistant' && !!m.content;
          const showAvatar  = m.role === 'assistant' && messages[i - 1]?.role !== 'assistant';
          return isWaiting
            ? <OwlWaiting key={m.id} t={t} />
            : <MessageBubble key={m.id} message={m} t={t} isStreaming={isStreaming} showAvatar={showAvatar} />;
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
        padding:    isMobile ? '12px' : '16px 24px',
        borderTop:  `1px solid ${t.border}`,
        display:    'flex',
        gap:        8,
        alignItems: 'flex-end',
        flexShrink: 0,
        paddingBottom: isMobile ? 'max(12px, env(safe-area-inset-bottom))' : 16,
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
        <UpgradeModal tier={upgradeTier} onClose={() => setShowUpgrade(false)} onSuccess={() => setShowUpgrade(false)} />
      )}
    </div>
  );
}

// ── Chat gate (unauthenticated) ───────────────────────────────────
function ChatGate() {
  const { t } = useTheme();
  return (
    <main style={{
      minHeight: 'calc(100vh - 53px)', marginTop: 53,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 24px',
    }}>
      <div style={{ width: '100%', maxWidth: 460, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <PixelOwl size={6} state="idle" />

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: M, fontSize: 10, letterSpacing: '0.15em', textTransform: 'uppercase', color: t.accentMuted, marginBottom: 10 }}>
            RAG · llama-3.3-70b · multi-turn
          </div>
          <h1 style={{ fontFamily: F, fontWeight: 300, fontSize: 26, color: t.text1, margin: '0 0 10px' }}>
            AI assistant
          </h1>
          <p style={{ fontFamily: F, fontSize: 14, color: t.text3, lineHeight: 1.7, margin: 0 }}>
            Ask anything about the site's architecture, passkey auth,<br />
            the RAG pipeline, deployment, or anything in the docs.
          </p>
        </div>

        <div style={{ width: '100%' }}>
          <FrozenChat showCta={false} />
        </div>

        <Link
          to="/auth"
          style={{
            display: 'block', width: '100%', maxWidth: 320, textAlign: 'center',
            padding: '12px', borderRadius: 12, textDecoration: 'none',
            fontFamily: F, fontSize: 15, fontWeight: 500,
            background: t.accentDim, color: t.accent, border: `1px solid ${t.accentBorder}`,
          }}
        >
          Sign in to chat →
        </Link>
        <span style={{ fontFamily: M, fontSize: 10, color: t.text3, letterSpacing: '0.04em' }}>
          No password · passkey required
        </span>
      </div>
    </main>
  );
}

// ── Page ─────────────────────────────────────────────────────────
export default function ChatPage() {
  const { t }           = useTheme();
  const { user, loading } = useAuth();
  const navigate        = useNavigate();
  const { isMobile }    = useResponsive();

  const [conversations,  setConversations]  = useState([]);
  const [activeConvId,   setActiveConvId]   = useState(null); // sidebar highlight only
  const [chatKey,        setChatKey]        = useState('new'); // controls ChatArea remount
  const [sidebarOpen,    setSidebarOpen]    = useState(false);

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
    if (activeConvId === id) {
      setActiveConvId(null);
      setChatKey('new-' + Date.now());
    }
  }, [activeConvId]);

  // Called by ChatArea when it creates a new conversation on first send.
  // Only updates the sidebar list + highlight — does NOT change chatKey,
  // so ChatArea does not remount and the live conversation is preserved.
  const handleNewConversation = useCallback((conv) => {
    setConversations(prev => [conv, ...prev.filter(c => c.id !== conv.id)]);
    setActiveConvId(conv.id);
  }, []);

  // Called when the user clicks a conversation in the sidebar.
  const handleSelectConversation = useCallback((id) => {
    setActiveConvId(id);
    setChatKey(id); // remount ChatArea to load selected conversation
  }, []);

  // Called when the user clicks "+ New conversation" in the sidebar.
  const handleNewChat = useCallback(() => {
    setActiveConvId(null);
    setChatKey('new-' + Date.now()); // remount ChatArea fresh
  }, []);

  if (loading) return null;
  if (!user) return <ChatGate />;

  return (
    <div style={{
      display:    'flex',
      height:     'calc(100vh - 53px)',
      marginTop:  53,
      overflow:   'hidden',
      background: t.bg,
      position:   'relative',
    }}>
      <Sidebar
        conversations={conversations}
        activeId={activeConvId}
        onSelect={handleSelectConversation}
        onDelete={handleDelete}
        onNew={handleNewChat}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        isMobile={isMobile}
        t={t}
      />
      <ChatArea
        key={chatKey}
        t={t}
        initialConversationId={chatKey !== 'new' && !chatKey.startsWith('new-') ? chatKey : null}
        onNewConversation={handleNewConversation}
        onOpenSidebar={() => setSidebarOpen(true)}
        isMobile={isMobile}
      />
    </div>
  );
}
