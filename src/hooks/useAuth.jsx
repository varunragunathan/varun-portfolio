// ── Auth context ─────────────────────────────────────────────────
// Gated by VITE_ENABLE_AUTH. When false, useAuth() returns a no-op
// so the rest of the app doesn't need to know auth exists.
//
// After fetching /api/auth/me (which may return role once backend is updated),
// also fetches /api/user/upgrade-request to attach upgradeRequest status.
// Derives isPro and isAdmin from the role field.

import { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);

const ENABLED = import.meta.env.VITE_ENABLE_AUTH === 'true';

export function AuthProvider({ children }) {
  // undefined = loading, null = not signed in, object = signed in
  // During SSR there is no window — start as null (guest) so the server renders
  // the guest view rather than the loading placeholder.
  const [user, setUser] = useState(
    ENABLED && typeof window !== 'undefined' ? undefined : null
  );

  useEffect(() => {
    if (!ENABLED) return;

    fetch('/api/auth/me', { credentials: 'include' })
      .then(r => r.json())
      .then(async ({ user: meUser }) => {
        if (!meUser) {
          setUser(null);
          return;
        }

        // Attempt to fetch upgrade request status for signed-in users.
        // Silently ignore errors (e.g. 404 = no request yet).
        let upgradeRequest = null;
        try {
          const ur = await fetch('/api/user/upgrade-request', { credentials: 'include' });
          if (ur.ok) {
            const urData = await ur.json();
            upgradeRequest = urData.request ?? urData ?? null;
          }
        } catch {
          // non-fatal
        }

        setUser({ ...meUser, upgradeRequest });
      })
      .catch(() => setUser(null));
  }, []);

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    setUser(null);
  };

  const loading   = user === undefined;
  const isPro     = user?.role === 'pro' || user?.role === 'student' || user?.role === 'admin';
  const isStudent = user?.role === 'student';
  const isAdmin   = user?.role === 'admin';

  return (
    <AuthContext.Provider value={{
      user, setUser,
      loading,
      logout,
      enabled: ENABLED,
      isPro,
      isStudent,
      isAdmin,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
