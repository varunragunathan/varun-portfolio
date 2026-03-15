// ── Auth context ─────────────────────────────────────────────────
// Gated by VITE_ENABLE_AUTH. When false, useAuth() returns a no-op
// so the rest of the app doesn't need to know auth exists.

import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);

const ENABLED = import.meta.env.VITE_ENABLE_AUTH === 'true';

export function AuthProvider({ children }) {
  // undefined = loading, null = not signed in, object = signed in
  const [user, setUser] = useState(ENABLED ? undefined : null);

  useEffect(() => {
    if (!ENABLED) return;
    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(({ user }) => setUser(user || null))
      .catch(() => setUser(null));
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading: user === undefined, logout, enabled: ENABLED }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
