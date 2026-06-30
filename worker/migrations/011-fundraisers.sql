CREATE TABLE IF NOT EXISTS fundraisers (
  slug                  TEXT    PRIMARY KEY,
  title                 TEXT    NOT NULL,
  beneficiary           TEXT    NOT NULL,
  age                   INTEGER,
  condition             TEXT    NOT NULL,
  story                 TEXT    NOT NULL DEFAULT '',
  goal_inr              INTEGER NOT NULL DEFAULT 0,
  raised_inr            INTEGER NOT NULL DEFAULT 0,
  image_url             TEXT,
  surgery_date          TEXT,
  active                INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  payment_zelle_email   TEXT,
  payment_zelle_name    TEXT,
  payment_zelle_phone   TEXT,
  payment_interac_email TEXT,
  payment_interac_name  TEXT,
  payment_bank_ac       TEXT,
  payment_bank_ifsc     TEXT,
  payment_bank_name     TEXT,
  payment_upi           TEXT,
  memo                  TEXT,
  created_at            INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at            INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Seed Geetha's fundraiser
INSERT OR IGNORE INTO fundraisers (
  slug, title, beneficiary, age, condition, story, goal_inr, raised_inr,
  image_url, active,
  payment_zelle_email, payment_zelle_name, payment_zelle_phone,
  payment_interac_email, payment_interac_name,
  memo
) VALUES (
  'geetha',
  'Help Save Geetha R — Brain Tumor Treatment Fundraiser',
  'Geetha R',
  39,
  'Brain Tumor',
  'Mrs. Geetha R, 39, is currently undergoing treatment for a Brain Tumor and has been advised to undergo specialized medical treatment — including high-cost chemotherapy drugs (Temozolomide), targeted therapy, hospitalization, and brain surgery — under Dr. U. Saktheeshwaran, Neuro-Oncologist (Reg. No. 103797) at Sri Meenakshi Healthcare, Trichy.

Estimated medicine costs:
• Specialized Brain Tumor Medicines / Targeted Therapy — ₹3,20,000
• Chemotherapy / Injectable Medicines — ₹1,10,000
• Supportive Medicines (Anti-seizure, Steroids, Anti-emetics, Pain Management, Antibiotics) — ₹50,000
• Diagnostic Tests, Laboratory Investigations & Follow-up Medications — ₹30,000

Total Estimated Medicine Cost: ₹5,10,000

Geetha''s family is facing severe financial hardship and is unable to bear the enormous cost of treatment. Your generous contribution, irrespective of the amount, will go a long way in helping her receive timely medical care and improve her chances of recovery.',
  510000,
  0,
  '/geetha-appeal.jpg',
  1,
  'ragunathanvarun@gmail.com',
  'Varun Ragunathan',
  '+1 352-222-6680',
  'shrikarth@gmail.com',
  'Karthika Nallaperumal',
  'Geetha Brain Tumor Treatment'
);
