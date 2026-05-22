import React, { useState } from 'react';
import { useApiKey } from '../hooks/useApiKey';
import './ApiKeySettings.css';

export default function ApiKeySettings() {
  const { loading, configured, hint, saveKey, deleteKey } = useApiKey();
  const [input,   setInput]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);
  const [success, setSuccess] = useState(false);

  const handleSave = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    if (!input.startsWith('sk-')) {
      setError('OpenAI keys start with sk-');
      return;
    }
    setSaving(true);
    try {
      await saveKey(input);
      setInput('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Remove your stored OpenAI API key?')) return;
    await deleteKey();
  };

  if (loading) return <div className="api-key-settings__loading">Loading…</div>;

  return (
    <section className="api-key-settings">
      <div className="api-key-settings__header">
        <h3 className="api-key-settings__title">OpenAI API Key</h3>
        <p className="api-key-settings__desc">
          Powers high-quality TTS voice for interviews. Encrypted server-side —
          your key never appears in browser memory.
        </p>
      </div>

      {configured ? (
        <div className="api-key-settings__configured">
          <div className="api-key-settings__status">
            <span className="api-key-settings__dot" />
            {hint}
          </div>
          <button className="api-key-settings__remove" onClick={handleDelete}>
            Remove
          </button>
        </div>
      ) : (
        <form className="api-key-settings__form" onSubmit={handleSave}>
          <input
            className="api-key-settings__input"
            type="password"
            value={input}
            onChange={e => { setInput(e.target.value); setError(null); }}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            className="api-key-settings__save"
            type="submit"
            disabled={saving || !input}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      )}

      {error   && <p className="api-key-settings__error">{error}</p>}
      {success && <p className="api-key-settings__ok">Key saved successfully.</p>}

      <p className="api-key-settings__note">
        Get a key at{' '}
        <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">
          platform.openai.com/api-keys
        </a>
        . Usage is billed to your OpenAI account.
      </p>
    </section>
  );
}
