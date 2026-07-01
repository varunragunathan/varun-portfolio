-- Hide UPI for Geetha fundraiser
UPDATE fundraisers SET payment_upi = NULL WHERE slug = 'geetha';
