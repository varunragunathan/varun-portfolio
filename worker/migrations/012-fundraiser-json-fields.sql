ALTER TABLE fundraisers ADD COLUMN cost_items_json TEXT;
ALTER TABLE fundraisers ADD COLUMN organizers_json TEXT;

-- Update Geetha record with cost breakdown and organizers
UPDATE fundraisers SET
  cost_items_json = '[
    {"label":"Specialized Brain Tumor Medicines / Targeted Therapy Drugs","amount":320000},
    {"label":"Chemotherapy / Injectable Medicines","amount":110000},
    {"label":"Supportive Medicines (Steroids, Anti-emetics, Anti-seizure, Pain Management)","amount":50000},
    {"label":"Diagnostic Tests, Lab Investigations & Follow-up Medications","amount":30000}
  ]',
  organizers_json = '[
    {"name":"Varun Ragunathan","role":"US Coordinator","batch":"CEG ECE 2008–12","phone":"+1 352-222-6680","linkedin":"https://www.linkedin.com/in/varun-ragunathan/"},
    {"name":"Karthika Nallaperumal","role":"Canada Coordinator","batch":"CEG Civil 2008–12","linkedin":"https://www.linkedin.com/in/karthika-nallaperumal"},
    {"name":"Srinath Srinivas","role":"Co-organizer","batch":"CEG ECE 2008–12","phone":"+1 945-305-0588","linkedin":"https://www.linkedin.com/in/shree-srinivas/"},
    {"name":"Bala Valluvan","role":"Main Fundraiser Organizer","batch":"India","phone":"+91 97879 73729"}
  ]'
WHERE slug = 'geetha';
