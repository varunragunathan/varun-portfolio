-- Update Geetha fundraiser INR bank transfer details to Canara Bank
UPDATE fundraisers
SET payment_bank_name = 'MEERA VISWANATHAN',
    payment_bank_ac   = '0948101062437',
    payment_bank_ifsc = 'CNRB0000948'
WHERE slug = 'geetha';
