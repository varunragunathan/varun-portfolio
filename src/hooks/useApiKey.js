import { useState, useEffect, useCallback } from 'react';

export function useApiKey() {
  const [state, setState] = useState({ loading: true, configured: false, hint: null });

  const refresh = useCallback(() => {
    setState(s => ({ ...s, loading: true }));
    fetch('/api/user/key/status')
      .then(r => r.ok ? r.json() : null)
      .then(data => setState({
        loading:    false,
        configured: data?.configured ?? false,
        hint:       data?.hint ?? null,
      }))
      .catch(() => setState({ loading: false, configured: false, hint: null }));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const saveKey = useCallback(async (key) => {
    const res  = await fetch('/api/user/key', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ key }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save key');
    setState({ loading: false, configured: true, hint: data.hint });
  }, []);

  const deleteKey = useCallback(async () => {
    await fetch('/api/user/key', { method: 'DELETE' });
    setState({ loading: false, configured: false, hint: null });
  }, []);

  return { ...state, refresh, saveKey, deleteKey };
}
