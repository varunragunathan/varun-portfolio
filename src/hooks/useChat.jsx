// ── Chat hook ─────────────────────────────────────────────────────
// Manages multi-turn RAG conversation state + SSE streaming.
//
// Usage:
//   const { messages, streaming, send, reset, loadConversation } = useChat();
//   await send('How does the auth system work?');

import { useState, useCallback, useRef } from 'react';

export function useChat(initialConversationId = null) {
  const [messages,       setMessages]       = useState([]);
  const [streaming,      setStreaming]       = useState(false);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [error,          setError]          = useState(null);
  const abortRef = useRef(null);

  const send = useCallback(async (text, model = null) => {
    if (!text.trim() || streaming) return;

    setError(null);

    // Optimistically add user message
    const userMsg = { role: 'user', content: text, id: crypto.randomUUID() };
    setMessages(prev => [...prev, userMsg]);

    // Placeholder for the streaming assistant response
    const assistantId = crypto.randomUUID();
    setMessages(prev => [...prev, { role: 'assistant', content: '', id: assistantId }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch('/api/chat', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ message: text, conversationId, ...(model ? { model } : {}) }),
        signal:      controller.signal,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 429 && data.retryAfter) {
          const mins = Math.floor(data.retryAfter / 60);
          const secs = data.retryAfter % 60;
          const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
          throw new Error(`Rate limited — ${data.reason ?? 'too many requests'}. Try again in ${timeStr}.`);
        }
        throw new Error(data.error || 'Server error');
      }

      // Pick up conversation ID from response header (first turn)
      const convId = res.headers.get('X-Conversation-Id');
      if (convId && !conversationId) setConversationId(convId);

      // Parse SSE stream
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (event.type === 'delta') {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, content: m.content + event.text } : m
            ));
          } else if (event.type === 'error') {
            throw new Error(event.message);
          }
        }
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      setError(err.message);
      // Remove the empty placeholder on error
      setMessages(prev => prev.filter(m => m.id !== assistantId));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [streaming, conversationId]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const reset = useCallback(() => {
    abort();
    setMessages([]);
    setConversationId(null);
    setError(null);
    setStreaming(false);
  }, [abort]);

  // Load an existing conversation's messages from the server
  const loadConversation = useCallback(async (id) => {
    setError(null);
    try {
      const res = await fetch(`/api/chat/conversations/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load conversation');
      const { messages: msgs } = await res.json();
      setMessages(msgs.map(m => ({ role: m.role, content: m.content, id: m.id })));
      setConversationId(id);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  return { messages, streaming, conversationId, error, send, abort, reset, loadConversation };
}
