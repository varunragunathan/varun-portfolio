import React, { useState, useEffect, useCallback } from 'react';
import { useApiKey } from '../hooks/useApiKey';
import './ApiKeySettings.css';

function useGeminiKey() {
  const [state, setState] = useState({ loading: true, configured: false, hint: null });

  const refresh = useCallback(() => {
    setState(s => ({ ...s, loading: true }));
    fetch('/api/user/key/status')
      .then(r => r.ok ? r.json() : null)
      .then(data => setState({
        loading:    false,
        configured: data?.gemini?.configured ?? false,
        hint:       data?.gemini?.hint ?? null,
      }))
      .catch(() => setState({ loading: false, configured: false, hint: null }));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const saveKey = useCallback(async (key) => {
    const res  = await fetch('/api/user/key/gemini', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ key }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save key');
    setState({ loading: false, configured: true, hint: data.hint });
  }, []);

  const deleteKey = useCallback(async () => {
    await fetch('/api/user/key/gemini', { method: 'DELETE' });
    setState({ loading: false, configured: false, hint: null });
  }, []);

  return { ...state, refresh, saveKey, deleteKey };
}

function KeySection({ title, desc, hint, configured, loading, input, setInput, onSave, onDelete, saving, error, success, placeholder, noteText, noteHref, noteLinkText }) {
  if (loading) return <div className="api-key-settings__loading">Loading…</div>;

  return (
    <section className="api-key-settings">
      <div className="api-key-settings__header">
        <h3 className="api-key-settings__title">{title}</h3>
        <p className="api-key-settings__desc">{desc}</p>
      </div>

      {configured ? (
        <div className="api-key-settings__configured">
          <div className="api-key-settings__status">
            <span className="api-key-settings__dot" />
            {hint}
          </div>
          <button className="api-key-settings__remove" onClick={onDelete}>
            Remove
          </button>
        </div>
      ) : (
        <form className="api-key-settings__form" onSubmit={onSave}>
          <input
            className="api-key-settings__input"
            type="password"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={placeholder}
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
        {noteText}{' '}
        <a href={noteHref} target="_blank" rel="noreferrer">{noteLinkText}</a>.
        Usage is billed to your account.
      </p>
    </section>
  );
}

export default function ApiKeySettings() {
  const openai = useApiKey();
  const gemini = useGeminiKey();

  const [openaiInput,   setOpenaiInput]   = useState('');
  const [openaiSaving,  setOpenaiSaving]  = useState(false);
  const [openaiError,   setOpenaiError]   = useState(null);
  const [openaiSuccess, setOpenaiSuccess] = useState(false);

  const [geminiInput,   setGeminiInput]   = useState('');
  const [geminiSaving,  setGeminiSaving]  = useState(false);
  const [geminiError,   setGeminiError]   = useState(null);
  const [geminiSuccess, setGeminiSuccess] = useState(false);

  const handleOpenaiSave = async (e) => {
    e.preventDefault();
    setOpenaiError(null);
    setOpenaiSuccess(false);
    if (!openaiInput.startsWith('sk-')) { setOpenaiError('OpenAI keys start with sk-'); return; }
    setOpenaiSaving(true);
    try {
      await openai.saveKey(openaiInput);
      setOpenaiInput('');
      setOpenaiSuccess(true);
      setTimeout(() => setOpenaiSuccess(false), 3000);
    } catch (err) { setOpenaiError(err.message); }
    finally { setOpenaiSaving(false); }
  };

  const handleGeminiSave = async (e) => {
    e.preventDefault();
    setGeminiError(null);
    setGeminiSuccess(false);
    if (!geminiInput.startsWith('AIza')) { setGeminiError('Gemini keys start with AIza'); return; }
    setGeminiSaving(true);
    try {
      await gemini.saveKey(geminiInput);
      setGeminiInput('');
      setGeminiSuccess(true);
      setTimeout(() => setGeminiSuccess(false), 3000);
    } catch (err) { setGeminiError(err.message); }
    finally { setGeminiSaving(false); }
  };

  return (
    <>
      <KeySection
        title="OpenAI API Key"
        desc="Powers OpenAI TTS voice for interviews. Encrypted server-side — your key never appears in browser memory."
        hint={openai.hint}
        configured={openai.configured}
        loading={openai.loading}
        input={openaiInput}
        setInput={v => { setOpenaiInput(v); setOpenaiError(null); }}
        onSave={handleOpenaiSave}
        onDelete={() => { if (confirm('Remove your stored OpenAI API key?')) openai.deleteKey(); }}
        saving={openaiSaving}
        error={openaiError}
        success={openaiSuccess}
        placeholder="sk-…"
        noteText="Get a key at"
        noteHref="https://platform.openai.com/api-keys"
        noteLinkText="platform.openai.com/api-keys"
      />

      <KeySection
        title="Gemini API Key"
        desc="Powers Gemini TTS voice for interviews. Same encryption model — your key is never exposed in the browser."
        hint={gemini.hint}
        configured={gemini.configured}
        loading={gemini.loading}
        input={geminiInput}
        setInput={v => { setGeminiInput(v); setGeminiError(null); }}
        onSave={handleGeminiSave}
        onDelete={() => { if (confirm('Remove your stored Gemini API key?')) gemini.deleteKey(); }}
        saving={geminiSaving}
        error={geminiError}
        success={geminiSuccess}
        placeholder="AIzaSy…"
        noteText="Get a key at"
        noteHref="https://aistudio.google.com/app/apikey"
        noteLinkText="aistudio.google.com"
      />
    </>
  );
}
