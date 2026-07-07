import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import './Habits.css';

// ── helpers ────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toLocaleDateString('sv'); // "sv" gives YYYY-MM-DD in local time
}

function dateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function last28Days() {
  const days = [];
  for (let i = 27; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toLocaleDateString('sv'));
  }
  return days;
}

function last7Days() {
  return last28Days().slice(-7);
}

// Build a set of "habit_id:date" from completions array
function completionSet(completions) {
  return new Set(completions.map(c => `${c.habit_id}:${c.date}`));
}

function weeklyPct(habits, completions) {
  if (!habits.length) return null;
  const days  = last7Days();
  const done  = completions.filter(c => days.includes(c.date)).length;
  const total = habits.length * days.length;
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

function streak(habitId, completions) {
  const done = new Set(completions.filter(c => c.habit_id === habitId).map(c => c.date));
  let count = 0;
  let d = new Date();
  // if today not done, start counting from yesterday
  if (!done.has(d.toLocaleDateString('sv'))) d.setDate(d.getDate() - 1);
  while (done.has(d.toLocaleDateString('sv'))) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

// ── Add habit form ─────────────────────────────────────────────────
const EMOJI_PRESETS = ['💪', '📚', '🧘', '😴', '🥗', '🏃', '💧', '✍️', '🎯', '🧠', '☀️', '🎵'];

function AddHabitForm({ onAdd, onCancel }) {
  const [name,  setName]  = useState('');
  const [emoji, setEmoji] = useState('✅');
  const [busy,  setBusy]  = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/habits', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), emoji }),
      });
      if (res.ok) onAdd();
    } finally { setBusy(false); }
  }

  return (
    <form className="ht__add-form" onSubmit={submit}>
      <div className="ht__add-emoji-row">
        {EMOJI_PRESETS.map(e => (
          <button key={e} type="button"
            className={`ht__emoji-btn${emoji === e ? ' ht__emoji-btn--active' : ''}`}
            onClick={() => setEmoji(e)}>{e}</button>
        ))}
        <input className="ht__emoji-input" maxLength={2} value={emoji}
          onChange={ev => setEmoji(ev.target.value)} title="Custom emoji" />
      </div>
      <div className="ht__add-row">
        <input ref={inputRef} className="ht__add-input" placeholder="Habit name…"
          value={name} onChange={e => setName(e.target.value)} maxLength={80} />
        <button className="ht__btn ht__btn--accent" type="submit" disabled={busy || !name.trim()}>
          {busy ? '…' : 'Add'}
        </button>
        <button className="ht__btn" type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// ── Mini 7-day grid for one habit ─────────────────────────────────
function MiniGrid({ habitId, done, onToggle }) {
  const days = last7Days();
  const today = todayStr();
  return (
    <div className="ht__grid" aria-label="Last 7 days">
      {days.map(d => {
        const isToday = d === today;
        const isDone  = done.has(`${habitId}:${d}`);
        return (
          <button key={d} type="button" title={dateLabel(d)}
            className={`ht__cell${isDone ? ' ht__cell--done' : ''}${isToday ? ' ht__cell--today' : ''}`}
            onClick={() => d <= today && onToggle(habitId, d)}
            disabled={d > today}
          />
        );
      })}
    </div>
  );
}

// ── Single habit row ───────────────────────────────────────────────
function HabitRow({ habit, done, todayDone, onToggleToday, onToggleDate, onDelete, onRename }) {
  const [editing, setEditing]   = useState(false);
  const [draft,   setDraft]     = useState(habit.name);
  const [emojiD,  setEmojiD]   = useState(habit.emoji);
  const [busy,    setBusy]      = useState(false);
  const s = streak(habit.id, Array.from(done).map(k => {
    const [hid, date] = k.split(':');
    return { habit_id: Number(hid), date };
  }).filter(c => c.habit_id === habit.id));

  async function saveRename() {
    if (!draft.trim()) return;
    setBusy(true);
    await fetch(`/api/habits/${habit.id}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: draft.trim(), emoji: emojiD }),
    });
    setBusy(false);
    setEditing(false);
    onRename();
  }

  async function archive() {
    if (!window.confirm(`Archive "${habit.name}"? You can't undo this.`)) return;
    await fetch(`/api/habits/${habit.id}`, { method: 'DELETE', credentials: 'include' });
    onDelete();
  }

  return (
    <div className={`ht__row${todayDone ? ' ht__row--done' : ''}`}>
      {/* toggle button */}
      <button
        className={`ht__check${todayDone ? ' ht__check--done' : ''}`}
        onClick={onToggleToday}
        aria-label={todayDone ? 'Mark incomplete' : 'Mark complete'}
      >
        {todayDone ? '✓' : habit.emoji}
      </button>

      <div className="ht__row-body">
        {editing ? (
          <div className="ht__edit-row">
            <input className="ht__edit-emoji" maxLength={2} value={emojiD}
              onChange={e => setEmojiD(e.target.value)} />
            <input className="ht__edit-input" value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setEditing(false); }}
              ref={el => el?.focus()} />
            <button className="ht__btn ht__btn--accent ht__btn--sm" onClick={saveRename} disabled={busy}>Save</button>
            <button className="ht__btn ht__btn--sm" onClick={() => setEditing(false)}>✕</button>
          </div>
        ) : (
          <div className="ht__name-row">
            <span className="ht__name">{habit.name}</span>
            {s > 0 && (
              <span className="ht__streak" title={`${s}-day streak`}>
                🔥 {s}
              </span>
            )}
          </div>
        )}
        <MiniGrid habitId={habit.id} done={done} onToggle={onToggleDate} />
      </div>

      <div className="ht__row-actions">
        <button className="ht__icon-btn" title="Rename" onClick={() => setEditing(e => !e)}>✏️</button>
        <button className="ht__icon-btn" title="Archive" onClick={archive}>🗑</button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────
export default function Habits() {
  const { user, loading: authLoading } = useAuth();
  const [habits,      setHabits]      = useState([]);
  const [completions, setCompletions] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [adding,      setAdding]      = useState(false);
  const [done,        setDone]        = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/habits', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setHabits(data.habits);
      setCompletions(data.completions);
      setDone(completionSet(data.completions));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  async function toggle(habitId, date) {
    const key = `${habitId}:${date}`;
    // Optimistic update
    setDone(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    await fetch(`/api/habits/${habitId}/toggle`, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    });
    // Re-sync completions for streak accuracy
    const res = await fetch('/api/habits', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      setCompletions(data.completions);
      setDone(completionSet(data.completions));
    }
  }

  if (authLoading) return <div className="ht__page ht__page--center"><div className="ht__spinner" /></div>;

  if (!user) return (
    <div className="ht__page ht__page--center">
      <p className="ht__msg">Sign in to track your habits.</p>
      <Link to="/auth" className="ht__btn ht__btn--accent">Sign in</Link>
    </div>
  );

  const today    = todayStr();
  const pct      = weeklyPct(habits, completions);
  const todayCount = habits.filter(h => done.has(`${h.id}:${today}`)).length;

  return (
    <div className="ht__page">
      <div className="ht__inner">
        {/* header */}
        <div className="ht__header">
          <div>
            <h1 className="ht__title">Daily Habits</h1>
            <p className="ht__date">{dateLabel(today)}</p>
          </div>
          {pct !== null && (
            <div className="ht__week-stat" title="This week's completion rate">
              <span className="ht__week-n">{pct}%</span>
              <span className="ht__week-label">this week</span>
            </div>
          )}
        </div>

        {/* today progress */}
        {habits.length > 0 && (
          <div className="ht__today-bar">
            <div className="ht__today-fill" style={{ width: `${Math.round((todayCount / habits.length) * 100)}%` }} />
            <span className="ht__today-label">{todayCount} / {habits.length} today</span>
          </div>
        )}

        {/* habit list */}
        {loading ? (
          <div className="ht__loading"><div className="ht__spinner" /></div>
        ) : habits.length === 0 && !adding ? (
          <div className="ht__empty">
            <p className="ht__empty-msg">No habits yet.<br />Add your first one below.</p>
          </div>
        ) : (
          <ul className="ht__list">
            {habits.map(h => (
              <li key={h.id}>
                <HabitRow
                  habit={h}
                  done={done}
                  todayDone={done.has(`${h.id}:${today}`)}
                  onToggleToday={() => toggle(h.id, today)}
                  onToggleDate={(id, date) => toggle(id, date)}
                  onDelete={load}
                  onRename={load}
                />
              </li>
            ))}
          </ul>
        )}

        {/* add form / button */}
        <div className="ht__add-section">
          {adding ? (
            <AddHabitForm onAdd={() => { setAdding(false); load(); }} onCancel={() => setAdding(false)} />
          ) : (
            <button className="ht__add-btn" onClick={() => setAdding(true)}>
              + Add habit
            </button>
          )}
        </div>

        {/* legend */}
        {habits.length > 0 && (
          <p className="ht__legend">Tap a circle to mark a past day · 🔥 streak counts consecutive days</p>
        )}
      </div>
    </div>
  );
}
