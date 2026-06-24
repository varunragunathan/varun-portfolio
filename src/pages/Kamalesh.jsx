import React, { useState, useEffect } from 'react';
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
      <button className="kf__field-value" onClick={copy} title="Click to copy">
        {value}
        <span className="kf__copy-hint">{copied ? 'copied!' : 'copy'}</span>
      </button>
    </div>
  );
}

export default function KamaleshPage() {
  useEffect(() => {
    fetch('/api/track/page', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ page: 'kamalesh' }),
    }).catch(() => {});
  }, []);

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
        </div>

        {/* Progress */}
        <div className="kf__progress-card">
          <div className="kf__progress-header">
            <div>
              <div className="kf__raised">Rs. 8,09,211 raised</div>
              <div className="kf__raised-sub">of Rs. 12,25,000 goal · 385 supporters</div>
            </div>
            <div className="kf__needed-box">
              <div className="kf__needed-amount">Rs. 4,15,789</div>
              <div className="kf__needed-label">still needed · ≈ $4,400 USD</div>
            </div>
          </div>
          <div className="kf__bar">
            <div className="kf__bar-fill" style={{ width: '66%' }} />
          </div>
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
                <CopyField label="Phone"        value="+1 437-984-6976" />
              </div>
              <p className="kf__donate-contact">
                Point of contact: <strong>Karthika Nallaperumal</strong> · CEG Civil 2008–12
              </p>
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
              <a className="kf__org-phone" href="tel:+14379846976">+1 437-984-6976</a>
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

        <div className="kf__footer-note">
          Every rupee and every dollar counts. Please share this page with your network.
        </div>

      </div>
    </div>
  );
}
