import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';

const M = "'IBM Plex Mono', monospace";
const S = "'Outfit', sans-serif";

const s = {
  page:   { padding: '72px 24px 80px', maxWidth: 900, margin: '0 auto', fontFamily: S },
  h1:     { fontFamily: S, fontSize: 24, fontWeight: 600, color: 'var(--text-1)', margin: '0 0 4px' },
  sub:    { fontFamily: M, fontSize: 11, color: 'var(--text-3)', margin: '0 0 28px' },
  back:   { display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: M, fontSize: 11, color: 'var(--text-3)', textDecoration: 'none', marginBottom: 20 },
  card:   { background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 12 },
  row:    { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  badge:  { fontFamily: M, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', background: 'var(--accent-ghost)', border: '1px solid var(--accent-dim)', borderRadius: 999, padding: '2px 8px' },
  h3:     { fontFamily: S, fontSize: 15, fontWeight: 600, color: 'var(--text-1)', margin: 0 },
  meta:   { fontFamily: M, fontSize: 11, color: 'var(--text-3)', margin: '4px 0 0' },
  btn:    { fontFamily: M, fontSize: 11, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--text-2)' },
  btnAcc: { fontFamily: M, fontSize: 11, padding: '4px 12px', borderRadius: 6, border: '1px solid var(--accent-dim)', background: 'var(--accent-ghost)', cursor: 'pointer', color: 'var(--accent)' },
  btnRed: { fontFamily: M, fontSize: 11, padding: '4px 12px', borderRadius: 6, border: '1px solid rgba(248,113,113,0.3)', background: 'rgba(248,113,113,0.08)', cursor: 'pointer', color: 'var(--error-color, #f87171)' },
  sep:    { border: 'none', borderTop: '1px solid var(--border)', margin: '20px 0' },
  label:  { fontFamily: M, fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 5, display: 'block' },
  input:  { fontFamily: M, fontSize: 12, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-alt, var(--card-bg))', color: 'var(--text-1)', width: '100%', boxSizing: 'border-box' },
  textarea: { fontFamily: M, fontSize: 12, padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-alt, var(--card-bg))', color: 'var(--text-1)', width: '100%', boxSizing: 'border-box', resize: 'vertical' },
  grid2:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 },
  grid3:  { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 },
  err:    { fontFamily: M, fontSize: 11, color: 'var(--error-color, #f87171)', margin: '8px 0 0' },
  ok:     { fontFamily: M, fontSize: 11, color: 'var(--success-color, #4ade80)', margin: '8px 0 0' },
  section:{ marginBottom: 20 },
  sh:     { fontFamily: S, fontSize: 13, fontWeight: 600, color: 'var(--text-2)', margin: '0 0 10px', paddingBottom: 8, borderBottom: '1px solid var(--border)' },
};

const EMPTY_FORM = {
  slug: '', title: '', beneficiary: '', age: '', condition: '', story: '',
  goal_inr: '', raised_inr: '0', image_url: '', surgery_date: '', active: '1', expiry_date: '',
  payment_zelle_email: '', payment_zelle_name: '', payment_zelle_phone: '',
  payment_interac_email: '', payment_interac_name: '',
  payment_bank_ac: '', payment_bank_ifsc: '', payment_bank_name: '',
  payment_upi: '', memo: '',
};

function fmtInr(n) {
  if (!n) return '₹0';
  return '₹' + Number(n).toLocaleString('en-IN');
}

function Field({ label, name, value, onChange, type = 'text', rows }) {
  return (
    <div>
      <label style={s.label}>{label}</label>
      {rows
        ? <textarea style={s.textarea} rows={rows} name={name} value={value} onChange={onChange} />
        : <input    style={s.input}    type={type} name={name} value={value} onChange={onChange} />
      }
    </div>
  );
}

function FundraiserForm({ initial, onSave, onCancel, isNew }) {
  const [form, setForm]   = useState(() => ({ ...EMPTY_FORM, ...initial }));
  const [busy, setBusy]   = useState(false);
  const [msg,  setMsg]    = useState(null);

  const set = e => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  async function submit(e) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    const payload = { ...form };
    ['age', 'goal_inr', 'raised_inr', 'active'].forEach(k => {
      if (payload[k] !== '') payload[k] = Number(payload[k]);
    });
    Object.keys(payload).forEach(k => { if (payload[k] === '') payload[k] = null; });

    try {
      const url    = isNew ? '/api/admin/fundraisers' : `/api/admin/fundraisers/${initial.slug}`;
      const method = isNew ? 'POST' : 'PUT';
      const res    = await fetch(url, {
        method,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) { setMsg({ ok: false, text: d.error || 'Error' }); return; }
      setMsg({ ok: true, text: isNew ? 'Created!' : 'Saved!' });
      onSave();
    } catch { setMsg({ ok: false, text: 'Network error' }); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={{ marginTop: 16 }}>
      {/* basic info */}
      <div style={s.section}>
        <div style={s.sh}>Basic Info</div>
        <div style={s.grid2}>
          <Field label="Slug (URL path)" name="slug" value={form.slug} onChange={set} />
          <Field label="Condition / Diagnosis" name="condition" value={form.condition} onChange={set} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <Field label="Page Title" name="title" value={form.title} onChange={set} />
        </div>
        <div style={s.grid3}>
          <Field label="Beneficiary Name" name="beneficiary"  value={form.beneficiary} onChange={set} />
          <Field label="Age"              name="age"          value={form.age}         onChange={set} type="number" />
          <Field label="Active (1=yes)"   name="active"       value={form.active}      onChange={set} type="number" />
        </div>
        <div style={s.grid2}>
          <Field label="Goal (INR)"       name="goal_inr"     value={form.goal_inr}    onChange={set} type="number" />
          <Field label="Raised so far (INR)" name="raised_inr" value={form.raised_inr} onChange={set} type="number" />
        </div>
        <div style={s.grid2}>
          <Field label="Image URL (e.g. /geetha-appeal.jpg)" name="image_url"    value={form.image_url}    onChange={set} />
          <Field label="Surgery Date (ISO, optional)"        name="surgery_date" value={form.surgery_date} onChange={set} />
        </div>
        <div style={s.grid2}>
          <Field label="Expiry Date (ISO, optional — page hides after this date)" name="expiry_date" value={form.expiry_date} onChange={set} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <Field label="Story / Background" name="story" value={form.story} onChange={set} rows={6} />
        </div>
        <div>
          <Field label="Donation Memo" name="memo" value={form.memo} onChange={set} />
        </div>
      </div>

      <hr style={s.sep} />

      {/* payment */}
      <div style={s.section}>
        <div style={s.sh}>Payment — Zelle (US)</div>
        <div style={s.grid3}>
          <Field label="Email" name="payment_zelle_email" value={form.payment_zelle_email} onChange={set} />
          <Field label="Name"  name="payment_zelle_name"  value={form.payment_zelle_name}  onChange={set} />
          <Field label="Phone" name="payment_zelle_phone" value={form.payment_zelle_phone} onChange={set} />
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sh}>Payment — Interac (Canada)</div>
        <div style={s.grid2}>
          <Field label="Email" name="payment_interac_email" value={form.payment_interac_email} onChange={set} />
          <Field label="Name"  name="payment_interac_name"  value={form.payment_interac_name}  onChange={set} />
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sh}>Payment — India Bank / UPI</div>
        <div style={s.grid2}>
          <Field label="Account No." name="payment_bank_ac"   value={form.payment_bank_ac}   onChange={set} />
          <Field label="IFSC Code"   name="payment_bank_ifsc" value={form.payment_bank_ifsc} onChange={set} />
        </div>
        <div style={s.grid2}>
          <Field label="Account Name" name="payment_bank_name" value={form.payment_bank_name} onChange={set} />
          <Field label="UPI ID"       name="payment_upi"       value={form.payment_upi}       onChange={set} />
        </div>
      </div>

      {msg && <p style={msg.ok ? s.ok : s.err}>{msg.text}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button type="submit" style={s.btnAcc} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" style={s.btn}    onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function FundraiserRow({ fr, onRefresh }) {
  const [expanded, setExpanded] = useState(false);
  const [raisedVal, setRaisedVal] = useState(String(fr.raised_inr ?? 0));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);

  async function updateRaised() {
    setSaving(true); setSaveMsg(null);
    try {
      const res = await fetch(`/api/admin/fundraisers/${fr.slug}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raised_inr: Number(raisedVal) }),
      });
      if (!res.ok) throw new Error('Failed');
      setSaveMsg('Saved');
      onRefresh();
    } catch { setSaveMsg('Error'); }
    finally { setSaving(false); setTimeout(() => setSaveMsg(null), 2000); }
  }

  const pct       = fr.goal_inr > 0 ? Math.min(100, Math.round((fr.raised_inr / fr.goal_inr) * 100)) : 0;
  const remaining = Math.max(0, (fr.goal_inr || 0) - (fr.raised_inr || 0));

  return (
    <div style={s.card}>
      <div style={s.row}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={s.h3}>{fr.beneficiary}</span>
            <span style={s.badge}>{fr.condition}</span>
            {!fr.active && <span style={{ ...s.badge, color: 'var(--text-3)', borderColor: 'var(--border)' }}>inactive</span>}
          </div>
          <div style={s.meta}>
            <a href={`/f/${fr.slug}`} target="_blank" rel="noopener noreferrer"
               style={{ color: 'var(--accent)', textDecoration: 'none' }}>/f/{fr.slug}</a>
            {' · '}Goal: {fmtInr(fr.goal_inr)}
            {' · '}{pct}% raised ({fmtInr(fr.raised_inr)})
            {' · '}<span style={{ color: remaining > 0 ? 'var(--error-color, #f87171)' : 'var(--success-color, #4ade80)' }}>
              {remaining > 0 ? `${fmtInr(remaining)} remaining` : 'Goal reached!'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* quick raise update */}
          <input
            style={{ ...s.input, width: 110, padding: '4px 8px' }}
            type="number"
            value={raisedVal}
            onChange={e => setRaisedVal(e.target.value)}
            title="Update raised amount (INR)"
          />
          <button style={s.btnAcc} onClick={updateRaised} disabled={saving}>
            {saveMsg ?? (saving ? '…' : 'Set raised')}
          </button>
          <Link to={`/admin/fundraisers/${fr.slug}`} style={{ ...s.btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            admin →
          </Link>
          <button style={expanded ? s.btnAcc : s.btn} onClick={() => setExpanded(x => !x)}>
            {expanded ? 'close' : 'edit'}
          </button>
        </div>
      </div>

      {expanded && (
        <FundraiserForm
          initial={{ ...fr, age: fr.age ?? '', surgery_date: fr.surgery_date ?? '', expiry_date: fr.expiry_date ?? '', image_url: fr.image_url ?? '' }}
          onSave={() => { setExpanded(false); onRefresh(); }}
          onCancel={() => setExpanded(false)}
          isNew={false}
        />
      )}
    </div>
  );
}

export default function FundraiserAdmin() {
  const [list,       setList]       = useState(null);
  const [error,      setError]      = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch('/api/admin/fundraisers', { credentials: 'include' });
      if (!res.ok) throw new Error('Unauthorized or server error');
      setList(await res.json());
    } catch (e) { setError(e.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return (
    <div style={s.page}>
      <Link to="/admin" style={s.back}>← admin</Link>
      <p style={s.err}>{error}</p>
    </div>
  );

  return (
    <div style={s.page}>
      <Link to="/admin" style={s.back}>← admin</Link>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
        <h1 style={s.h1}>Fundraisers</h1>
        <button style={s.btnAcc} onClick={() => setShowCreate(x => !x)}>
          {showCreate ? 'cancel' : '+ New fundraiser'}
        </button>
      </div>
      <p style={s.sub}>Manage fundraiser pages · each available at /f/:slug</p>

      {/* create form */}
      {showCreate && (
        <div style={{ ...s.card, marginBottom: 24 }}>
          <div style={{ fontFamily: M, fontSize: 12, fontWeight: 600, color: 'var(--text-1)', marginBottom: 4 }}>New Fundraiser</div>
          <FundraiserForm
            initial={EMPTY_FORM}
            onSave={() => { setShowCreate(false); load(); }}
            onCancel={() => setShowCreate(false)}
            isNew
          />
        </div>
      )}

      {/* list */}
      {list === null
        ? <p style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>Loading…</p>
        : list.length === 0
          ? <p style={{ fontFamily: M, fontSize: 12, color: 'var(--text-3)' }}>No fundraisers yet. Create one above.</p>
          : list.map(fr => <FundraiserRow key={fr.slug} fr={fr} onRefresh={load} />)
      }
    </div>
  );
}
