-- Room bids: bids made by people in the auction hall, entered by the auctioneer / bid clerk.
-- They share ONE price with online bids, so the next online bid is always based on the highest bid of either kind.
-- Safe to run more than once.

-- 1. The table. A room bid has no bidder account: the buyer in the room is recorded by the auctioneer.
create table if not exists public.room_bids (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.lots(id) on delete cascade,
  amount numeric not null check (amount > 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists room_bids_lot_idx on public.room_bids (lot_id, amount desc);

alter table public.room_bids enable row level security;

-- Everyone logged in may see the amounts (there is no personal information in a room bid).
drop policy if exists "room bids readable" on public.room_bids;
create policy "room bids readable" on public.room_bids for select to authenticated using (true);
-- Only the admin / auctioneer may add or remove them.
drop policy if exists "room bids staff insert" on public.room_bids;
create policy "room bids staff insert" on public.room_bids for insert to authenticated with check (public.is_admin_or_auctioneer());
drop policy if exists "room bids staff delete" on public.room_bids;
create policy "room bids staff delete" on public.room_bids for delete to authenticated using (public.is_admin_or_auctioneer());

revoke all on public.room_bids from anon;

-- 2. One list of every bid on a lot (online + room), highest first, with a safe display name.
create or replace function public.lot_feed(p_lot uuid)
returns table (id text, amount numeric, created_at timestamptz, bidder_id uuid, display_name text, source text)
language sql stable security definer set search_path = public as $$
  select * from (
    select b.id::text as id, b.amount::numeric as amount, b.created_at::timestamptz as created_at, b.bidder_id::uuid as bidder_id,
           coalesce(
             nullif(trim(u.screen_name), ''),
             trim(split_part(trim(u.full_name), ' ', 1) || ' ' ||
                  coalesce(left(nullif(split_part(trim(u.full_name), ' ', 2), ''), 1) || '.', ''))
           ) as display_name,
           'online'::text as source
    from public.bids b
    join public.users u on u.id = b.bidder_id
    where b.lot_id = p_lot
    union all
    select r.id::text, r.amount::numeric, r.created_at::timestamptz, null::uuid, 'In the room'::text, 'room'::text
    from public.room_bids r
    where r.lot_id = p_lot
  ) f
  order by f.amount desc, f.created_at desc
  limit 20;
$$;
revoke all on function public.lot_feed(uuid) from public, anon;
grant execute on function public.lot_feed(uuid) to authenticated;

-- 3. The rules. They run inside the database, so a slow screen can never put a stale price on the record.
--    A bid must beat the highest bid of EITHER kind, and nothing can be bid on a lot that has a result.
create or replace function public.guard_new_bid()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  hi numeric;
  opening numeric;
  done boolean;
begin
  select coalesce(l.closed, false) or coalesce(l.no_sale, false) or l.winner_id is not null, l.starting_bid
    into done, opening
    from public.lots l where l.id = new.lot_id;
  if done then
    raise exception 'LOT_CLOSED' using errcode = 'P0001';
  end if;

  select greatest(
           coalesce((select max(b.amount) from public.bids b where b.lot_id = new.lot_id), 0),
           coalesce((select max(r.amount) from public.room_bids r where r.lot_id = new.lot_id), 0)
         ) into hi;

  if hi > 0 and new.amount <= hi then
    raise exception 'PRICE_MOVED:%', hi using errcode = 'P0001';
  end if;
  if hi = 0 and opening is not null and new.amount < opening then
    raise exception 'BELOW_OPENING:%', opening using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_online_bid on public.bids;
create trigger guard_online_bid before insert on public.bids
  for each row execute function public.guard_new_bid();

drop trigger if exists guard_room_bid on public.room_bids;
create trigger guard_room_bid before insert on public.room_bids
  for each row execute function public.guard_new_bid();
