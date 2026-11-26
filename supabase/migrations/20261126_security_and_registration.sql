-- HT Auctions: security hardening + registration records.
-- Run once in Supabase > SQL Editor (project: HT Auctions). Safe to run again.

-- 1. Users can no longer change their own role, approval status, ban flags or email.
create or replace function public.protect_user_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  k text;
  caller_role text;
begin
  if auth.uid() is null then return new; end if;                          -- SQL editor / service role
  if coalesce(current_setting('app.bypass_user_guard', true), '') = '1' then return new; end if;  -- set by set_bidder_status()
  select role into caller_role from public.users where id = auth.uid();
  if caller_role = 'super_admin' then return new; end if;
  foreach k in array array['id', 'role', 'kyc_status', 'is_banned', 'is_suspended', 'email'] loop
    if (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k) then
      raise exception 'You are not allowed to change that.' using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists protect_user_columns on public.users;
create trigger protect_user_columns before update on public.users
  for each row execute function public.protect_user_columns();

-- 2. Admin approval of bidders (used by the Bidder approvals panel on Profile).
create or replace function public.set_bidder_status(p_user uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin_or_auctioneer() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_status not in ('approved', 'rejected', 'pending') then
    raise exception 'Invalid status';
  end if;
  perform set_config('app.bypass_user_guard', '1', true);
  update public.users set kyc_status = p_status where id = p_user and role = 'bidder';
end $$;

revoke all on function public.set_bidder_status(uuid, text) from public, anon;
grant execute on function public.set_bidder_status(uuid, text) to authenticated;

-- 3. Bidders see each other only as a display name (screen name, or first name + initial).
create or replace function public.lot_bids(p_lot uuid)
returns table (id text, lot_id uuid, amount numeric, created_at timestamptz, bidder_id uuid, display_name text)
language sql stable security definer set search_path = public as $$
  select b.id::text, b.lot_id::uuid, b.amount::numeric, b.created_at::timestamptz, b.bidder_id::uuid,
         coalesce(
           nullif(trim(u.screen_name), ''),
           trim(split_part(trim(u.full_name), ' ', 1) || ' ' ||
                coalesce(left(nullif(split_part(trim(u.full_name), ' ', 2), ''), 1) || '.', ''))
         ) as display_name
  from public.bids b
  join public.users u on u.id = b.bidder_id
  where b.lot_id = p_lot
  order by b.amount desc
  limit 15;
$$;

revoke all on function public.lot_bids(uuid) from public, anon;
grant execute on function public.lot_bids(uuid) to authenticated;

-- 4. Record of who accepted which version of the terms (and confirmed they are 18+).
create table if not exists public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text,
  adult_confirmed boolean not null default false,
  accepted_at timestamptz not null default now(),
  unique (user_id, terms_version)
);
alter table public.consents enable row level security;

drop policy if exists "consents insert own" on public.consents;
create policy "consents insert own" on public.consents for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "consents read own" on public.consents;
create policy "consents read own" on public.consents for select to authenticated using (user_id = auth.uid());
drop policy if exists "consents admin read" on public.consents;
create policy "consents admin read" on public.consents for select to authenticated using (public.is_admin_or_auctioneer());
