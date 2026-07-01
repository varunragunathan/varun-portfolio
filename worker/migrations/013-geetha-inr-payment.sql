-- Add INR bank transfer details to Geetha's fundraiser (same account as Kamalesh)
UPDATE fundraisers SET
  payment_bank_ac   = '1713366025',
  payment_bank_ifsc = 'KKBK0008479',
  payment_bank_name = 'Nishanth',
  payment_upi       = '9994948251@kotak811',
  updated_at        = strftime('%s', 'now')
WHERE slug = 'geetha';
