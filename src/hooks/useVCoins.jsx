import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'vcoins';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { balance: 0, completed: {}, moduleProgress: {} };
    return JSON.parse(raw);
  } catch {
    return { balance: 0, completed: {}, moduleProgress: {} };
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* ignore quota errors */ }
}

const VCoinsContext = createContext(null);

export function VCoinsProvider({ children }) {
  const [state, setState] = useState(loadState);

  useEffect(() => { saveState(state); }, [state]);

  // Award coins for completing a module (idempotent)
  const awardCoins = useCallback((moduleId, amount) => {
    setState(prev => {
      if (prev.completed[moduleId]) return prev; // already awarded
      return {
        ...prev,
        balance: prev.balance + amount,
        completed: { ...prev.completed, [moduleId]: Date.now() },
      };
    });
  }, []);

  // Track lesson progress within a module
  const setLessonProgress = useCallback((moduleId, lessonIndex) => {
    setState(prev => {
      const current = prev.moduleProgress[moduleId] || 0;
      if (lessonIndex <= current) return prev;
      return {
        ...prev,
        moduleProgress: { ...prev.moduleProgress, [moduleId]: lessonIndex },
      };
    });
  }, []);

  // Get highest completed lesson index for a module
  const getLessonProgress = useCallback(
    (moduleId) => state.moduleProgress[moduleId] || 0,
    [state.moduleProgress],
  );

  const isModuleCompleted = useCallback(
    (moduleId) => !!state.completed[moduleId],
    [state.completed],
  );

  const value = {
    balance: state.balance,
    completed: state.completed,
    awardCoins,
    setLessonProgress,
    getLessonProgress,
    isModuleCompleted,
  };

  return <VCoinsContext.Provider value={value}>{children}</VCoinsContext.Provider>;
}

export function useVCoins() {
  const ctx = useContext(VCoinsContext);
  if (!ctx) throw new Error('useVCoins must be used inside VCoinsProvider');
  return ctx;
}
