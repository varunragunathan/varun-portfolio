import React, { useState, useEffect, useRef } from 'react';
import './Kamalesh.css';

const COSTS = [
  { label: 'Initial patient evaluation',              amount: 'Rs. 75,000' },
  { label: 'Donor check-up',                          amount: 'Rs. 75,000' },
  { label: 'Surgery (both donor & recipient)',         amount: 'Rs. 7,00,000' },
  { label: 'Medicines & injections at surgery',        amount: 'Rs. 3,00,000' },
  { label: 'Post-op follow-up & meds (first 3 months)', amount: 'Rs. 75,000' },
];

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
    <div className="kf__field">
      <span className="kf__field-label">{label}</span>
      <button className="kf__field-value" onClick={copy} title={`Copy ${value}`}>
        <span className="kf__field-text">{value}</span>
        <span className="kf__copy-hint">{copied ? 'copied!' : 'copy'}</span>
      </button>
    </div>
  );
}

// Surgery target: June 30 2026 00:00 PDT = UTC-7 = 07:00 UTC
const SURGERY_DATE = new Date('2026-06-30T07:00:00Z');

function getTimeLeft() {
  const diff = SURGERY_DATE - Date.now();
  if (diff <= 0) return null;
  return {
    days:    Math.floor(diff / 86400000),
    hours:   Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
  };
}

function Countdown({ goalReached }) {
  const [left, setLeft] = useState(getTimeLeft);
  useEffect(() => {
    const id = setInterval(() => setLeft(getTimeLeft()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!left) {
    return (
      <div className="kf__countdown-done">
        {goalReached
          ? 'Surgery day has arrived — your support made this possible. 🙏'
          : 'There is still time to support Kamalesh — every contribution counts. 🙏'}
      </div>
    );
  }

  const units = [
    { n: left.days,                         u: 'days' },
    { n: String(left.hours).padStart(2,'0'), u: 'hrs'  },
    { n: String(left.minutes).padStart(2,'0'), u: 'min' },
    { n: String(left.seconds).padStart(2,'0'), u: 'sec' },
  ];

  return (
    <div className="kf__countdown">
      <div className="kf__countdown-label">Surgery scheduled in</div>
      <div className="kf__countdown-units">
        {units.map(({ n, u }, i) => (
          <React.Fragment key={u}>
            {i > 0 && <span className="kf__countdown-sep">:</span>}
            <div className="kf__countdown-unit">
              <span className="kf__countdown-n">{n}</span>
              <span className="kf__countdown-u">{u}</span>
            </div>
          </React.Fragment>
        ))}
      </div>
      <div className="kf__countdown-date">June 30, 2026 · KMCH Coimbatore</div>
    </div>
  );
}

// INR constants — rates updated June 24 2026; inrEq comes from server
const MILAAP_INR  = 809211;
const GOAL_INR    = 1225000;
const USD_TO_INR  = 94.7;
const CAD_TO_INR  = 68.1;

function fmt(n) {
  return 'Rs. ' + Math.round(n).toLocaleString('en-IN');
}

function PledgeForm({ onSuccess, currency, onCurrencyChange }) {
  const [name,   setName]   = useState('');
  const [amount, setAmount] = useState('');
  const [sent,   setSent]   = useState(false);
  const [note,     setNote]     = useState('');
  const [busy,     setBusy]     = useState(false);
  const [error,    setError]    = useState('');

  async function submit(e) {
    e.preventDefault();
    setError('');
    const num = parseFloat(amount);
    if (!name.trim()) return setError('Please enter your name.');
    if (!num || num <= 0) return setError('Please enter a valid amount.');
    setBusy(true);
    try {
      const res = await fetch('/api/kamalesh/pledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), amount: num, currency, sent, note: note.trim() || null }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Something went wrong. Please try again.');
      } else {
        onSuccess();
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="kf__pledge-form" onSubmit={submit}>
      <div className="kf__pledge-row">
        <div className="kf__pledge-field">
          <label className="kf__pledge-label" htmlFor="pf-name">Your name</label>
          <input
            id="pf-name"
            className="kf__pledge-input"
            type="text"
            placeholder="e.g. Priya S."
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={100}
            required
          />
        </div>
        <div className="kf__pledge-field kf__pledge-field--amount">
          <label className="kf__pledge-label" htmlFor="pf-amount">Amount</label>
          <div className="kf__pledge-amount-row">
            <input
              id="pf-amount"
              className="kf__pledge-input kf__pledge-input--num"
              type="number"
              min="1"
              step="any"
              placeholder="100"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
            />
            <div className="kf__currency-toggle">
              {['USD', 'CAD', 'INR', 'SGD', 'AED'].map(c => (
                <button
                  key={c}
                  type="button"
                  className={`kf__currency-btn${currency === c ? ' kf__currency-btn--active' : ''}`}
                  onClick={() => onCurrencyChange(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="kf__pledge-check">
        <input
          id="pf-sent"
          type="checkbox"
          checked={sent}
          onChange={e => setSent(e.target.checked)}
        />
        <label htmlFor="pf-sent">I have already sent this payment via Zelle / Interac</label>
      </div>

      <div className="kf__pledge-field">
        <label className="kf__pledge-label" htmlFor="pf-note">Message <span className="kf__pledge-optional">(optional)</span></label>
        <input
          id="pf-note"
          className="kf__pledge-input"
          type="text"
          placeholder="e.g. Get well soon Kamalesh!"
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={300}
        />
      </div>

      {error && <p className="kf__pledge-error">{error}</p>}

      <button className="kf__pledge-submit" type="submit" disabled={busy}>
        {busy ? 'Submitting…' : 'Log my donation'}
      </button>
    </form>
  );
}

export default function KamaleshPage() {
  const [stats,    setStats]    = useState(null);
  const [pledged,  setPledged]  = useState(false);
  const [currency, setCurrency] = useState('USD');
  const formRef = useRef(null);

  function scrollToForm(cur) {
    setCurrency(cur);
    setPledged(false);
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  useEffect(() => {
    fetch('/api/track/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 'kamalesh' }),
    }).catch(() => {});

    fetch('/api/kamalesh/stats')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d); })
      .catch(() => {});
  }, []);

  const pledgedInr   = stats ? (stats.inrEq ?? Math.round((stats.usd ?? 0) * USD_TO_INR + (stats.cad ?? 0) * CAD_TO_INR)) : 0;
  const totalRaisedInr = MILAAP_INR + pledgedInr;
  const stillNeeded  = Math.max(0, GOAL_INR - totalRaisedInr);
  const pct          = Math.min(100, Math.round((totalRaisedInr / GOAL_INR) * 100));

  return (
    <div className="kf">
      <div className="kf__inner">

        {/* Hero */}
        <div className="kf__hero">
          <div className="kf__urgency-badge">Urgent Medical Appeal</div>
          <h1 className="kf__title">Help Save <span className="kf__name">Kamalesh P</span></h1>
          <p className="kf__subtitle">
            A 25-year-old engineer battling kidney failure. His father is ready to donate.
            The surgery is booked. We are only waiting on funds.
          </p>
          <img
            src="/kamalesh-appeal.jpg"
            alt="Kamalesh P — kidney transplant patient from CEG Anna University seeking help"
            className="kf__hero-img"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        </div>

        {/* Countdown */}
        <Countdown goalReached={totalRaisedInr >= GOAL_INR} />

        {/* Progress */}
        <div className="kf__progress-card">
          <div className="kf__progress-header">
            <div>
              <div className="kf__raised">{fmt(totalRaisedInr)} raised</div>
              <div className="kf__raised-sub">
                of {fmt(GOAL_INR)} goal · 385 Milaap supporters
                {stats?.count > 0 && ` · ${stats.count} via this page`}
              </div>
            </div>
            <div className="kf__needed-box">
              <div className="kf__needed-amount">{fmt(stillNeeded)}</div>
              <div className="kf__needed-label">
                still needed · ≈ ${Math.round(stillNeeded / USD_TO_INR).toLocaleString()} USD
              </div>
            </div>
          </div>
          <div className="kf__bar">
            <div className="kf__bar-fill" style={{ width: `${pct}%` }} />
          </div>
          {pledgedInr > 0 && (
            <div className="kf__bar-breakdown">
              <span className="kf__bar-segment kf__bar-segment--milaap">
                Rs. 8,09,211 Milaap
              </span>
              <span className="kf__bar-segment kf__bar-segment--pledged">
                + {fmt(pledgedInr)} pledged here
              </span>
            </div>
          )}
          <p className="kf__bar-note">
            Milaap campaign raised 66% then closed. Zelle &amp; Interac are the only active channels.
          </p>
        </div>

        {/* Story */}
        <section className="kf__section">
          <h2 className="kf__section-title">His Story</h2>
          <p>
            Kamalesh P graduated from CEG, Anna University with a B.E. in Mechanical Engineering
            (Batch 2019–23). In August 2023, he was diagnosed with <strong>chronic kidney failure</strong> — a
            diagnosis that upended his life overnight. Since then he has survived solely on
            maintenance hemodialysis.
          </p>
          <p>
            A kidney transplant is now his only path forward. His father has come forward as a
            voluntary living donor, and the surgery is fully ready to proceed at{' '}
            <strong>Kovai Medical Center &amp; Hospital (KMCH), Coimbatore</strong> — a NABH-accredited
            facility. We are waiting only on the remaining funds.
          </p>
          <blockquote className="kf__quote">
            "I am reaching out with a hopeful heart — your support can help save my life. Every
            donation, no matter how small, brings me closer to a second chance. Thank you for your
            kindness, prayers, and support."
            <cite>— Kamalesh P</cite>
          </blockquote>
        </section>

        {/* Cost breakdown */}
        <section className="kf__section">
          <h2 className="kf__section-title">Cost Breakdown <span className="kf__section-sub">(certified by KMCH)</span></h2>
          <div className="kf__cost-table">
            {COSTS.map(({ label, amount }) => (
              <div key={label} className="kf__cost-row">
                <span>{label}</span>
                <span>{amount}</span>
              </div>
            ))}
            <div className="kf__cost-row kf__cost-total">
              <span>Total documented cost</span>
              <span>Rs. 12,25,000</span>
            </div>
            <div className="kf__cost-row kf__cost-raised-row">
              <span>Already raised (385 supporters)</span>
              <span>– Rs. 8,09,211</span>
            </div>
            <div className="kf__cost-row kf__cost-needed-row">
              <span>Still needed — urgently</span>
              <span>Rs. 4,15,789</span>
            </div>
          </div>
          <p className="kf__cost-note">
            Post-transplant medication continues long-term at approx. Rs. 800–1,000/month if well matched.
          </p>
        </section>

        {/* Donation channels */}
        <section className="kf__section">
          <h2 className="kf__section-title">Donate Now</h2>
          <div className="kf__donate-grid">

            {/* US — Zelle */}
            <div className="kf__donate-card">
              <div className="kf__donate-region">From the USA</div>
              <div className="kf__donate-method kf__donate-method--zelle">Zelle</div>
              <p className="kf__donate-desc">
                Send directly via your bank app or Zelle.com — no fees, instant transfer.
              </p>
              <div className="kf__fields">
                <CopyField label="Email"        value="ragunathanvarun@gmail.com" />
                <CopyField label="First Name"   value="Varun" />
                <CopyField label="Last Name"    value="Ragunathan" />
                <CopyField label="Phone"        value="+1 352-222-6680" />
              </div>
              <p className="kf__donate-contact">
                Point of contact: <strong>Varun Ragunathan</strong> · CEG ECE 2008–12
              </p>
              <button className="kf__log-btn kf__log-btn--zelle" onClick={() => scrollToForm('USD')}>
                Log my donation →
              </button>
            </div>

            {/* Canada — Interac */}
            <div className="kf__donate-card">
              <div className="kf__donate-region">From Canada</div>
              <div className="kf__donate-method kf__donate-method--interac">Interac e-Transfer</div>
              <p className="kf__donate-desc">
                Send via your bank's online portal using Interac e-Transfer.
              </p>
              <div className="kf__fields">
                <CopyField label="Email"        value="shrikarth@gmail.com" />
                <CopyField label="First Name"   value="Karthika" />
                <CopyField label="Last Name"    value="Nallaperumal" />
              </div>
              <p className="kf__donate-contact">
                Point of contact: <strong>Karthika Nallaperumal</strong> · CEG Civil 2008–12
              </p>
              <button className="kf__log-btn kf__log-btn--interac" onClick={() => scrollToForm('CAD')}>
                Log my donation →
              </button>
            </div>

            {/* India — Bank Transfer / UPI */}
            <div className="kf__donate-card">
              <div className="kf__donate-region">From India</div>
              <div className="kf__donate-method kf__donate-method--upi">Bank Transfer / UPI</div>
              <p className="kf__donate-desc">
                Transfer directly to the family's bank account or pay instantly via UPI.
              </p>
              <div className="kf__fields">
                <CopyField label="Account No."   value="1713366025" />
                <CopyField label="IFSC Code"     value="KKBK0008479" />
                <CopyField label="Bank"          value="Kotak Mahindra Bank" />
                <CopyField label="Branch"        value="Chennai – Ashok Nagar" />
                <CopyField label="Account Name"  value="Nishanth" />
                <CopyField label="UPI ID"        value="9994948251@kotak811" />
              </div>
              <p className="kf__donate-contact">
                Direct to patient's family account
              </p>
              <button className="kf__log-btn kf__log-btn--upi" onClick={() => scrollToForm('INR')}>
                Log my donation →
              </button>
            </div>

          </div>
        </section>

        {/* Verification */}
        <section className="kf__section">
          <h2 className="kf__section-title">Verification</h2>
          <div className="kf__verify-grid">
            <div className="kf__verify-item">
              <div className="kf__verify-label">Hospital</div>
              <div className="kf__verify-value">Kovai Medical Center &amp; Hospital (KMCH)</div>
              <div className="kf__verify-sub">NABH Accredited · Coimbatore</div>
            </div>
            <div className="kf__verify-item">
              <div className="kf__verify-label">Certifying Doctor</div>
              <div className="kf__verify-value">Dr. Vivek Pathak, MD DNB (Nephrology)</div>
              <div className="kf__verify-sub">Head of Nephrology · Reg. No. 67383</div>
            </div>
            <div className="kf__verify-item">
              <div className="kf__verify-label">Patient</div>
              <div className="kf__verify-value">Kamalesh P · Hospital No. 2275211</div>
              <div className="kf__verify-sub">Age 25 · Reg. 11-05-2026</div>
            </div>
          </div>
        </section>

        {/* Organizers */}
        <section className="kf__section">
          <h2 className="kf__section-title">Organized By</h2>
          <p className="kf__org-intro">Anna University CEG Alumni — coordinating from the US, Canada &amp; India</p>
          <div className="kf__org-grid">
            <div className="kf__org-card">
              <div className="kf__org-name">
                Varun Ragunathan
                <a className="kf__org-li" href="https://www.linkedin.com/in/varun-ragunathan/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                  <LinkedInIcon />
                </a>
              </div>
              <div className="kf__org-role">US Coordinator</div>
              <div className="kf__org-detail">CEG ECE 2008–12</div>
              <a className="kf__org-phone" href="tel:+13522226680">+1 352-222-6680</a>
            </div>
            <div className="kf__org-card">
              <div className="kf__org-name">
                Karthika Nallaperumal
                <a className="kf__org-li" href="https://www.linkedin.com/in/karthika-nallaperumal" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                  <LinkedInIcon />
                </a>
              </div>
              <div className="kf__org-role">Canada Coordinator</div>
              <div className="kf__org-detail">CEG Civil 2008–12</div>
            </div>
            <div className="kf__org-card">
              <div className="kf__org-name">
                Srinath Srinivas
                <a className="kf__org-li" href="https://www.linkedin.com/in/shree-srinivas/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn">
                  <LinkedInIcon />
                </a>
              </div>
              <div className="kf__org-role">Co-Organizer</div>
              <div className="kf__org-detail">CEG ECE 2008–12</div>
              <a className="kf__org-phone" href="tel:+19453050588">+1 945-305-0588</a>
            </div>
            <div className="kf__org-card">
              <div className="kf__org-name">Bala Valluvan</div>
              <div className="kf__org-role">Main Fundraiser Organizer</div>
              <div className="kf__org-detail">India</div>
              <a className="kf__org-phone" href="tel:+919787973729">+91 97879 73729</a>
            </div>
          </div>
        </section>

        {/* Pledge form */}
        <section className="kf__section" ref={formRef}>
          <h2 className="kf__section-title">Log Your Donation</h2>
          {pledged ? (
            <div className="kf__pledge-success">
              <div className="kf__pledge-success-icon">✓</div>
              <div className="kf__pledge-success-title">Thank you!</div>
              <p className="kf__pledge-success-text">
                Your donation has been logged. The organizers will verify and update the progress shortly.
                Please share this page with your network — every share helps.
              </p>
              <button
                className="kf__pledge-again"
                onClick={() => setPledged(false)}
              >
                Log another donation
              </button>
            </div>
          ) : (
            <>
              <p className="kf__section p" style={{ marginBottom: 0 }}>
                After sending via Zelle or Interac, let us know here. Once verified by the organizers,
                your amount will be reflected in the progress bar above.
              </p>
              <PledgeForm currency={currency} onCurrencyChange={setCurrency} onSuccess={() => {
                setPledged(true);
                fetch('/api/kamalesh/stats')
                  .then(r => r.ok ? r.json() : null)
                  .then(d => { if (d) setStats(d); })
                  .catch(() => {});
              }} />
            </>
          )}
        </section>

        <div className="kf__footer-note">
          Every rupee and every dollar counts. Please share this page with your network.
        </div>

      </div>
    </div>
  );
}
