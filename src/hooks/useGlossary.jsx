// ── Glossary hook ─────────────────────────────────────────────────
// Local-first: all writes hit localStorage immediately (instant UI).
// When signed in, terms are mirrored to /api/glossary so they survive
// across devices. On sign-in we fetch the server state, merge in any
// offline-created local terms, and upload them in bulk.

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './useAuth.jsx';

const STORAGE_KEY = 'glossary_v1';
const ENABLED     = import.meta.env.VITE_ENABLE_AUTH === 'true';

// ── localStorage helpers ──────────────────────────────────────────
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(terms) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(terms));
  } catch {
    // storage full — fail silently
  }
}

// ── API helpers ───────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  try {
    const res = await fetch(path, { credentials: 'include', ...opts });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function apiJson(path, method, body) {
  return apiFetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Context ───────────────────────────────────────────────────────
const GlossaryContext = createContext(null);

export function GlossaryProvider({ children }) {
  const { user } = useAuth();
  const [terms, setTerms]     = useState(load);
  const [syncing, setSyncing] = useState(false);
  // Track which user we last synced for, so we don't re-fetch on every render
  const syncedUserRef = useRef(null);

  // ── Persist to localStorage whenever terms change ─────────────
  useEffect(() => { save(terms); }, [terms]);

  // ── Server sync on sign-in ────────────────────────────────────
  useEffect(() => {
    if (!ENABLED || !user) {
      syncedUserRef.current = null;
      return;
    }
    // Only sync once per user session (not on every re-render)
    if (syncedUserRef.current === user.userId) return;
    syncedUserRef.current = user.userId;

    async function syncOnSignIn() {
      setSyncing(true);
      try {
        const data = await apiFetch('/api/glossary');
        if (!data?.terms) return;

        const serverTerms  = data.terms;
        const serverIds    = new Set(serverTerms.map(t => t.id));

        // Terms that exist locally but haven't reached the server yet
        const localTerms   = load();
        const unsynced     = localTerms.filter(t => !serverIds.has(t.id));

        // Push offline terms to the server in one batch
        if (unsynced.length > 0) {
          await apiJson('/api/glossary/sync', 'POST', { terms: unsynced });
        }

        // Merge: server is source of truth for synced terms; append offline ones
        const merged = [
          ...serverTerms,
          ...unsynced,
        ].sort((a, b) => b.createdAt - a.createdAt);

        setTerms(merged);
        save(merged);
      } finally {
        setSyncing(false);
      }
    }

    syncOnSignIn();
  }, [user?.userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── CRUD ──────────────────────────────────────────────────────
  const addTerm = useCallback((draft) => {
    const term = {
      id:            crypto.randomUUID(),
      createdAt:     Date.now(),
      showOnProfile: false,
      tags:          [],
      definition:    '',
      searchQuery:   '',
      ...draft,
      term:          draft.term.trim(),
    };

    // Optimistic local write
    setTerms(prev => [term, ...prev]);

    // Background server write
    if (ENABLED && user) {
      apiJson('/api/glossary', 'POST', term);
    }

    return term;
  }, [user]);

  const updateTerm = useCallback((id, patch) => {
    setTerms(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));

    if (ENABLED && user) {
      apiJson(`/api/glossary/${id}`, 'PATCH', patch);
    }
  }, [user]);

  const deleteTerm = useCallback((id) => {
    setTerms(prev => prev.filter(t => t.id !== id));

    if (ENABLED && user) {
      apiFetch(`/api/glossary/${id}`, { method: 'DELETE' });
    }
  }, [user]);

  const toggleProfile = useCallback((id) => {
    setTerms(prev => prev.map(t => {
      if (t.id !== id) return t;
      const updated = { ...t, showOnProfile: !t.showOnProfile };
      if (ENABLED && user) {
        apiJson(`/api/glossary/${id}`, 'PATCH', { showOnProfile: updated.showOnProfile });
      }
      return updated;
    }));
  }, [user]);

  const allTags = [...new Set(terms.flatMap(t => t.tags))].sort();

  return (
    <GlossaryContext.Provider value={{ terms, addTerm, updateTerm, deleteTerm, toggleProfile, allTags, syncing }}>
      {children}
    </GlossaryContext.Provider>
  );
}

export function useGlossary() {
  const ctx = useContext(GlossaryContext);
  if (!ctx) throw new Error('useGlossary must be used inside GlossaryProvider');
  return ctx;
}

export function buildSearchUrl(term, tags = [], searchQuery = '') {
  const q = searchQuery.trim() || [term, ...tags].join(' ');
  return `https://www.google.com/search?q=${encodeURIComponent(q)}`;
}
