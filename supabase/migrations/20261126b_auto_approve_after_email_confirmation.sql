-- Policy: anyone who has confirmed their email address can bid. No manual approval.
-- Admins can still BLOCK a bidder (kyc_status = 'rejected'); a blocked bidder is never re-approved automatically.
-- Run once in Supabase > SQL Editor (after 20261126_security_and_registration.sql). Safe to run again.

-- 1. The app calls this when a bidder logs in. The database itself checks that the email is confirmed.
create or replace function public.approve_confirmed_bidder()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  perform set_config('app.bypass_user_guard', '1', true);
  update public.users u
     set kyc_status = 'approved'
   where u.id = auth.uid()
     and u.role = 'bidder'
     and u.kyc_status = 'pending'
     and exists (select 1 from auth.users a where a.id = u.id and a.email_confirmed_at is not null);
end $$;

revoke all on function public.approve_confirmed_bidder() from public, anon;
grant execute on function public.approve_confirmed_bidder() to authenticated;

-- 2. Switch on everyone who is already registered and has confirmed their email.
update public.users u
   set kyc_status = 'approved'
  from auth.users a
 where a.id = u.id
   and a.email_confirmed_at is not null
   and u.role = 'bidder'
   and u.kyc_status = 'pending';
