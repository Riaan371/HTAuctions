-- OPTIONAL, run only if you agree: removes ID numbers and bank details that earlier sign-ups stored in plain text.
-- This cannot be undone. The app no longer collects this data.

update public.users set id_number_hash = null, bank_token = null;

update auth.users
set raw_user_meta_data = raw_user_meta_data - 'id_number' - 'bank_name' - 'account_number' - 'branch_code'
where raw_user_meta_data ?| array['id_number', 'bank_name', 'account_number', 'branch_code'];
