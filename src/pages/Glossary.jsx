import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { Fade } from '../components/UI';
import { useGlossary, buildSearchUrl } from '../hooks/useGlossary';
import './Glossary.css';

// ── Tag input ─────────────────────────────────────────────────────
function TagInput({ tags, onChange, suggestions = [], inputId }) {
  const [input, setInput] = useState('');

  function commit(value) {
    const tag = value.trim().toLowerCase().replace(/\s+/g, '-');
    if (tag && !tags.includes(tag)) {
      onChange([...tags, tag]);
    }
    setInput('');
  }

  function handleKey(e) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      commit(input);
    }
    if (e.key === 'Backspace' && !input && tags.length) {
      onChange(tags.slice(0, -1));
    }
  }

  const filtered = suggestions.filter(s => s.startsWith(input.trim().toLowerCase()) && !tags.includes(s));

  return (
    <div className="tag-input">
      {tags.map(tag => (
        <span key={tag} className="tag-chip tag-chip--editable">
          {tag}
          <button
            type="button"
            onClick={() => onChange(tags.filter(t => t !== tag))}
            className="tag-chip__remove"
            aria-label={`Remove tag ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <div className="tag-input__field-wrap">
        <input
          id={inputId}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => input.trim() && commit(input)}
          placeholder={tags.length === 0 ? 'Add tags (Enter or comma)' : ''}
          className="tag-input__field"
          list="tag-suggestions"
        />
        {filtered.length > 0 && (
          <datalist id="tag-suggestions">
            {filtered.map(s => <option key={s} value={s} />)}
          </datalist>
        )}
      </div>
    </div>
  );
}

// ── Term form (add / edit) ────────────────────────────────────────
const EMPTY_DRAFT = { term: '', definition: '', tags: [], searchQuery: '', showOnProfile: false };

function TermForm({ initial = EMPTY_DRAFT, onSave, onCancel, allTags = [] }) {
  const [draft, setDraft] = useState(initial);
  const termRef = useRef(null);

  useEffect(() => { termRef.current?.focus(); }, []);

  function set(key, val) { setDraft(prev => ({ ...prev, [key]: val })); }

  function handleSubmit(e) {
    e.preventDefault();
    if (!draft.term.trim()) return;
    onSave(draft);
  }

  return (
    <form className="term-form" onSubmit={handleSubmit} noValidate>
      <div className="term-form__row">
        <label className="term-form__label" htmlFor="tf-term">Term *</label>
        <input
          id="tf-term"
          ref={termRef}
          type="text"
          className="term-form__input"
          value={draft.term}
          onChange={e => set('term', e.target.value)}
          placeholder="e.g. Closure, useCallback, LCP…"
          required
        />
      </div>

      <div className="term-form__row">
        <label className="term-form__label" htmlFor="tf-def">Details</label>
        <textarea
          id="tf-def"
          className="term-form__textarea"
          value={draft.definition}
          onChange={e => set('definition', e.target.value)}
          placeholder="Your own notes, key points, or a quick definition…"
          rows={3}
        />
      </div>

      <div className="term-form__row">
        <label className="term-form__label" htmlFor="tf-tags">Tags</label>
        <TagInput
          inputId="tf-tags"
          tags={draft.tags}
          onChange={tags => set('tags', tags)}
          suggestions={allTags}
        />
      </div>

      <div className="term-form__row">
        <label className="term-form__label" htmlFor="tf-search">Custom search query</label>
        <input
          id="tf-search"
          type="text"
          className="term-form__input"
          value={draft.searchQuery}
          onChange={e => set('searchQuery', e.target.value)}
          placeholder={`Defaults to "${draft.term || 'term'} ${draft.tags.join(' ')}"`}
        />
        <p className="term-form__hint">Clicking the card opens a Google search with this query. Leave blank to auto-generate from term + tags.</p>
      </div>

      <div className="term-form__row term-form__row--toggle">
        <div className="term-form__toggle-label">
          <input
            id="tf-profile"
            type="checkbox"
            className="term-form__checkbox"
            checked={draft.showOnProfile}
            onChange={e => set('showOnProfile', e.target.checked)}
          />
          <span className="term-form__toggle-track" aria-hidden="true" />
          <span className="term-form__toggle-text">
            <label htmlFor="tf-profile" className="term-form__toggle-title">Add to my profile</label>
            <span className="term-form__toggle-desc">Highlights this term in your public glossary section</span>
          </span>
        </div>
      </div>

      <div className="term-form__actions">
        <button type="submit" className="term-form__save">Save term</button>
        <button type="button" className="term-form__cancel" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ── Term card ─────────────────────────────────────────────────────
function TermCard({ term, onEdit, onDelete, onToggleProfile }) {
  const url = buildSearchUrl(term.term, term.tags, term.searchQuery);

  function handleCardClick(e) {
    if (e.target.closest('button')) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <div
      className={`term-card${term.showOnProfile ? ' term-card--profile' : ''}`}
      onClick={handleCardClick}
      role="link"
      tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleCardClick(e); }}
      aria-label={`${term.term} — open Google search`}
    >
      {term.showOnProfile && (
        <span className="term-card__profile-badge" aria-label="On profile">★</span>
      )}

      <div className="term-card__header">
        <h3 className="term-card__term">{term.term}</h3>
        <span className="term-card__search-hint" aria-hidden="true">↗ Google</span>
      </div>

      {term.definition && (
        <p className="term-card__definition">{term.definition}</p>
      )}

      {term.tags.length > 0 && (
        <div className="term-card__tags" aria-label="Tags">
          {term.tags.map(tag => (
            <span key={tag} className="tag-chip">{tag}</span>
          ))}
        </div>
      )}

      <div className="term-card__footer">
        <button
          className={`term-card__btn term-card__btn--profile${term.showOnProfile ? ' active' : ''}`}
          onClick={e => { e.stopPropagation(); onToggleProfile(term.id); }}
          title={term.showOnProfile ? 'Remove from profile' : 'Add to profile'}
          aria-pressed={term.showOnProfile}
        >
          {term.showOnProfile ? '★' : '☆'}
        </button>
        <button
          className="term-card__btn term-card__btn--edit"
          onClick={e => { e.stopPropagation(); onEdit(term); }}
          aria-label="Edit term"
        >
          ✎
        </button>
        <button
          className="term-card__btn term-card__btn--delete"
          onClick={e => { e.stopPropagation(); onDelete(term.id); }}
          aria-label="Delete term"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="glossary-modal-overlay">
      <button className="glossary-modal-backdrop" onClick={onClose} aria-label="Close dialog" tabIndex={-1} />
      <div
        className="glossary-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="glossary-modal__header">
          <h2 className="glossary-modal__title">{title}</h2>
          <button className="glossary-modal__close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="glossary-modal__body">{children}</div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────
function EmptyState({ onAdd }) {
  return (
    <div className="glossary-empty">
      <div className="glossary-empty__icon" aria-hidden="true">🧠</div>
      <p className="glossary-empty__text">No terms yet. Add your first one to start building your mental map.</p>
      <button className="glossary-add-btn" onClick={onAdd}>+ Add first term</button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────
export default function Glossary() {
  const { terms, addTerm, updateTerm, deleteTerm, toggleProfile, allTags } = useGlossary();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null); // term object being edited
  const [search, setSearch] = useState('');
  const [activeTag, setActiveTag] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const filtered = useMemo(() => {
    let list = terms;
    if (activeTag) list = list.filter(t => t.tags.includes(activeTag));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(t =>
        t.term.toLowerCase().includes(q) ||
        t.definition.toLowerCase().includes(q) ||
        t.tags.some(tag => tag.includes(q))
      );
    }
    return list;
  }, [terms, activeTag, search]);

  const profileTerms = terms.filter(t => t.showOnProfile);

  const handleSave = useCallback((draft) => {
    if (editing) {
      updateTerm(editing.id, draft);
      setEditing(null);
    } else {
      addTerm(draft);
      setShowForm(false);
    }
  }, [editing, addTerm, updateTerm]);

  const handleEdit = useCallback((term) => {
    setEditing(term);
    setShowForm(false);
  }, []);

  const handleDelete = useCallback((id) => {
    setConfirmDelete(id);
  }, []);

  const confirmDoDelete = useCallback(() => {
    deleteTerm(confirmDelete);
    setConfirmDelete(null);
  }, [deleteTerm, confirmDelete]);

  return (
    <div className="glossary-page">
      <Fade>
        <div className="glossary-hero">
          <div className="glossary-hero__eyebrow">personal</div>
          <h1 className="glossary-hero__title">Glossary</h1>
          <p className="glossary-hero__subtitle">
            Your mental map of concepts, terms, and things worth remembering.
            Click any card to search it on Google.
          </p>
        </div>
      </Fade>

      {/* Profile section */}
      {profileTerms.length > 0 && (
        <Fade>
          <section className="glossary-section glossary-section--profile" aria-label="Profile terms">
            <h2 className="glossary-section__heading">
              <span className="glossary-section__star">★</span> On my profile
            </h2>
            <div className="term-grid">
              {profileTerms.map(term => (
                <TermCard
                  key={term.id}
                  term={term}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                  onToggleProfile={toggleProfile}
                />
              ))}
            </div>
          </section>
        </Fade>
      )}

      {/* Controls */}
      <div className="glossary-controls">
        <div className="glossary-search-wrap">
          <span className="glossary-search__icon" aria-hidden="true">🔍</span>
          <input
            type="search"
            className="glossary-search"
            placeholder="Search terms, definitions, tags…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            aria-label="Search glossary"
          />
          {search && (
            <button className="glossary-search__clear" onClick={() => setSearch('')} aria-label="Clear search">×</button>
          )}
        </div>
        <button
          className="glossary-add-btn"
          onClick={() => { setShowForm(true); setEditing(null); }}
        >
          + Add term
        </button>
      </div>

      {/* Tag cloud */}
      {allTags.length > 0 && (
        <div className="tag-cloud" role="group" aria-label="Filter by tag">
          <button
            className={`tag-cloud__chip${!activeTag ? ' active' : ''}`}
            onClick={() => setActiveTag(null)}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              className={`tag-cloud__chip${activeTag === tag ? ' active' : ''}`}
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              aria-pressed={activeTag === tag}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Term grid */}
      {terms.length === 0 ? (
        <EmptyState onAdd={() => setShowForm(true)} />
      ) : filtered.length === 0 ? (
        <p className="glossary-no-results">No terms match your filter.</p>
      ) : (
        <Fade>
          <div className="term-grid">
            {filtered.map(term => (
              <TermCard
                key={term.id}
                term={term}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onToggleProfile={toggleProfile}
              />
            ))}
          </div>
        </Fade>
      )}

      {/* Add modal */}
      {showForm && (
        <Modal title="Add term" onClose={() => setShowForm(false)}>
          <TermForm
            onSave={handleSave}
            onCancel={() => setShowForm(false)}
            allTags={allTags}
          />
        </Modal>
      )}

      {/* Edit modal */}
      {editing && (
        <Modal title="Edit term" onClose={() => setEditing(null)}>
          <TermForm
            initial={editing}
            onSave={handleSave}
            onCancel={() => setEditing(null)}
            allTags={allTags}
          />
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <Modal title="Delete term?" onClose={() => setConfirmDelete(null)}>
          <p className="glossary-confirm__text">This cannot be undone.</p>
          <div className="glossary-confirm__actions">
            <button className="glossary-confirm__yes" onClick={confirmDoDelete}>Delete</button>
            <button className="glossary-confirm__no" onClick={() => setConfirmDelete(null)}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
