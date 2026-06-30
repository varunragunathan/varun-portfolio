import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import './FundraiserPage.css';

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
          <p className="fr__donate-intro">
            Every contribution helps. Please add the memo <strong>&ldquo;{data.memo || data.beneficiary}&rdquo;</strong> to your transfer so we can track it.
          </p>
          <div className="fr__cards">
            {hasZelle && (
              <div className="fr__card">
                <div className="fr__card-label">US · Zelle</div>
                {data.payment_zelle_email && <CopyField label="Email"  value={data.payment_zelle_email} />}
                {data.payment_zelle_name  && <CopyField label="Name"   value={data.payment_zelle_name} />}
                {data.payment_zelle_phone && <CopyField label="Phone"  value={data.payment_zelle_phone} />}
                {data.memo && (
                  <div className="fr__memo">
                    Memo: <span className="fr__memo-val">{data.memo}</span>
                  </div>
                )}
              </div>
            )}

            {hasInterac && (
              <div className="fr__card">
                <div className="fr__card-label">Canada · Interac</div>
                {data.payment_interac_email && <CopyField label="Email" value={data.payment_interac_email} />}
                {data.payment_interac_name  && <CopyField label="Name"  value={data.payment_interac_name} />}
                {data.memo && (
                  <div className="fr__memo">
                    Memo: <span className="fr__memo-val">{data.memo}</span>
                  </div>
                )}
              </div>
            )}

            {hasIndia && (
              <div className="fr__card">
                <div className="fr__card-label">India · UPI / Bank</div>
                {data.payment_upi       && <CopyField label="UPI"          value={data.payment_upi} />}
                {data.payment_bank_ac   && <CopyField label="Account No."  value={data.payment_bank_ac} />}
                {data.payment_bank_ifsc && <CopyField label="IFSC"         value={data.payment_bank_ifsc} />}
                {data.payment_bank_name && <CopyField label="Account Name" value={data.payment_bank_name} />}
                {data.memo && (
                  <div className="fr__memo">
                    Memo: <span className="fr__memo-val">{data.memo}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* footer */}
      <div className="fr__footer">
        <p>Questions? <a href="mailto:ragunathanvarun@gmail.com" className="fr__footer-link">ragunathanvarun@gmail.com</a></p>
        <Link to="/" className="fr__site-link">varunr.dev</Link>
      </div>
    </div>
  );
}
