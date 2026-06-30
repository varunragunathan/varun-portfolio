import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import './FundraiserPage.css';

function LinkedInIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  );
}

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <div className="fr__field">
      <span className="fr__field-label">{label}</span>
      <button className="fr__field-value" onClick={copy} title={`Copy ${value}`}>
        <span className="fr__field-text">{value}</span>
        <span className="fr__copy-hint">{copied ? 'copied!' : 'copy'}</span>
      </button>
    </div>
  );
}

function ProgressBar({ raisedInr, goalInr }) {
  const pct = goalInr > 0 ? Math.min(100, Math.round((raisedInr / goalInr) * 100)) : 0;
  const fmtInr = n => '₹' + Math.round(n).toLocaleString('en-IN');
  return (
    <div className="fr__progress">
      <div className="fr__progress-bar">
        <div className="fr__progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="fr__progress-stats">
        <span className="fr__progress-raised">{fmtInr(raisedInr)} raised</span>
        <span className="fr__progress-pct">{pct}% of {fmtInr(goalInr)}</span>
      </div>
    </div>
  );
}

function StoryParagraphs({ text }) {
  return text.split('\n').filter(Boolean).map((line, i) => (
    line.startsWith('•')
      ? <li key={i} className="fr__story-item">{line.slice(1).trim()}</li>
      : <p key={i} className="fr__story-p">{line}</p>
  ));
}

function CostBreakdown({ json }) {
  const [open, setOpen] = useState(false);
  let items;
  try { items = JSON.parse(json); } catch { return null; }
  if (!Array.isArray(items) || !items.length) return null;
  const total = items.reduce((s, it) => s + (it.amount || 0), 0);
  const fmtInr = n => '₹' + Math.round(n).toLocaleString('en-IN');
  return (
    <div className="fr__section">
      <button className="fr__section-title fr__collapsible" onClick={() => setOpen(o => !o)}>
        Treatment Cost Breakdown
        <span className={`fr__chevron${open ? ' fr__chevron--open' : ''}`}>▾</span>
      </button>
      {open && (
        <>
          <p className="fr__cost-note">Estimated medicine expenses as certified by Dr. U. Saktheeshwaran, Neuro-Oncologist — Sri Meenakshi Healthcare, Trichy.</p>
          <div className="fr__cost-table">
            {items.map((it, i) => {
              const pct = total > 0 ? (it.amount / total) * 100 : 0;
              return (
                <div key={i} className="fr__cost-row">
                  <div className="fr__cost-label">{it.label}</div>
                  <div className="fr__cost-right">
                    <div className="fr__cost-bar-wrap">
                      <div className="fr__cost-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="fr__cost-amount">{fmtInr(it.amount)}</span>
                  </div>
                </div>
              );
            })}
            <div className="fr__cost-total">
              <span>Total Estimated Cost</span>
              <span>{fmtInr(total)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Organizers({ json }) {
  let orgs;
  try { orgs = JSON.parse(json); } catch { return null; }
  if (!Array.isArray(orgs) || !orgs.length) return null;
  return (
    <div className="fr__section">
      <h2 className="fr__section-title">Organized By</h2>
      <p className="fr__org-lead">Anna University CEG Alumni — coordinating from the US, Canada &amp; India</p>
      <div className="fr__org-grid">
        {orgs.map((org, i) => (
          <div key={i} className="fr__org-card">
            <div className="fr__org-name">
              {org.name}
              {org.linkedin && (
                <a className="fr__org-li" href={org.linkedin} target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                  <LinkedInIcon />
                </a>
              )}
            </div>
            <div className="fr__org-role">{org.role}</div>
            {org.batch && <div className="fr__org-batch">{org.batch}</div>}
            {org.phone && <div className="fr__org-phone">{org.phone}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FundraiserPage() {
  const { slug } = useParams();
  const [data,  setData]  = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch(`/api/fundraiser/${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(setData)
      .catch(e => setError(e === 404 ? 'This fundraiser was not found.' : 'Failed to load. Please try again.'));

    fetch('/api/track/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: `fundraiser:${slug}` }),
    }).catch(() => {});
  }, [slug]);

  if (error) return (
    <div className="fr__page fr__page--center">
      <p className="fr__error">{error}</p>
      <Link to="/" className="fr__back">← Back to varunr.dev</Link>
    </div>
  );

  if (!data) return (
    <div className="fr__page fr__page--center">
      <div className="fr__spinner" />
    </div>
  );

  const hasZelle   = !!data.payment_zelle_email;
  const hasInterac = !!data.payment_interac_email;
  const hasIndia   = !!(data.payment_upi || data.payment_bank_ac);

  return (
    <div className="fr__page">
      {/* site link */}
      <div className="fr__topbar">
        <Link to="/" className="fr__site-link">varunr.dev</Link>
        <span className="fr__topbar-badge">Fundraiser</span>
      </div>

      {/* hero */}
      <div className="fr__hero">
        {data.image_url && (
          <img
            src={data.image_url}
            alt={`${data.beneficiary} — fundraiser appeal`}
            className="fr__hero-img"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        <div className="fr__hero-info">
          <div className="fr__condition-badge">{data.condition}</div>
          <h1 className="fr__title">{data.title}</h1>
          {data.age && (
            <p className="fr__subtitle">{data.beneficiary} · {data.age} years old</p>
          )}
          <ProgressBar raisedInr={data.raised_inr} goalInr={data.goal_inr} />
        </div>
      </div>

      {/* story */}
      <div className="fr__section">
        <h2 className="fr__section-title">About {data.beneficiary}</h2>
        <div className="fr__story">
          <StoryParagraphs text={data.story} />
        </div>
      </div>

      {/* donate */}
      {(hasZelle || hasInterac || hasIndia) && (
        <div className="fr__section">
          <h2 className="fr__section-title">How to Donate</h2>
          <p className="fr__donate-intro">Every contribution helps. Please add the memo when transferring so we can track it.</p>
          <div className="fr__cards">
            {hasZelle && (
              <div className="fr__card">
                <div className="fr__card-label">US · Zelle</div>
                {data.payment_zelle_email && <CopyField label="Email"  value={data.payment_zelle_email} />}
                {data.payment_zelle_name  && <CopyField label="Name"   value={data.payment_zelle_name} />}
                {data.payment_zelle_phone && <CopyField label="Phone"  value={data.payment_zelle_phone} />}
                {data.memo && <CopyField label="Memo" value={data.memo} />}
              </div>
            )}

            {hasInterac && (
              <div className="fr__card">
                <div className="fr__card-label">Canada · Interac</div>
                {data.payment_interac_email && <CopyField label="Email" value={data.payment_interac_email} />}
                {data.payment_interac_name  && <CopyField label="Name"  value={data.payment_interac_name} />}
                {data.memo && <CopyField label="Memo" value={data.memo} />}
              </div>
            )}

            {hasIndia && (
              <div className="fr__card">
                <div className="fr__card-label">India · UPI / Bank</div>
                {data.payment_upi       && <CopyField label="UPI"          value={data.payment_upi} />}
                {data.payment_bank_ac   && <CopyField label="Account No."  value={data.payment_bank_ac} />}
                {data.payment_bank_ifsc && <CopyField label="IFSC"         value={data.payment_bank_ifsc} />}
                {data.payment_bank_name && <CopyField label="Account Name" value={data.payment_bank_name} />}
                {data.memo && <CopyField label="Memo" value={data.memo} />}
              </div>
            )}
          </div>
        </div>
      )}

      {/* cost breakdown */}
      {data.cost_items_json && <CostBreakdown json={data.cost_items_json} />}

      {/* organizers */}
      {data.organizers_json && <Organizers json={data.organizers_json} />}

      {/* footer */}
      <div className="fr__footer">
        <p>Questions? <a href="mailto:ragunathanvarun@gmail.com" className="fr__footer-link">ragunathanvarun@gmail.com</a></p>
        <Link to="/" className="fr__site-link">varunr.dev</Link>
      </div>
    </div>
  );
}
