import { createContext, useContext, useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'glossary_v1';

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
    // storage full or unavailable
  }
}

const GlossaryContext = createContext(null);

export function GlossaryProvider({ children }) {
  const [terms, setTerms] = useState(load);

  useEffect(() => { save(terms); }, [terms]);

  const addTerm = useCallback((draft) => {
    const term = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      showOnProfile: false,
      tags: [],
      definition: '',
      searchQuery: '',
      ...draft,
      term: draft.term.trim(),
    };
    setTerms(prev => [term, ...prev]);
    return term;
  }, []);

  const updateTerm = useCallback((id, patch) => {
    setTerms(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }, []);

  const deleteTerm = useCallback((id) => {
    setTerms(prev => prev.filter(t => t.id !== id));
  }, []);

  const toggleProfile = useCallback((id) => {
    setTerms(prev => prev.map(t => t.id === id ? { ...t, showOnProfile: !t.showOnProfile } : t));
  }, []);

  const allTags = [...new Set(terms.flatMap(t => t.tags))].sort();

  return (
    <GlossaryContext.Provider value={{ terms, addTerm, updateTerm, deleteTerm, toggleProfile, allTags }}>
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
