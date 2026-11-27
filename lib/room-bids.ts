// Online bids and room bids share ONE price per lot. Everything that shows or places a bid goes through here.
import { supabase } from './supabase';
import type { LiveBid } from '../components/LiveViewerParts';

export const rand = (n: number) => 'R' + Math.round(n).toLocaleString('en-ZA');

// Every bid on a lot (online + room), highest first. Falls back to online-only until the database function exists.
export async function fetchLotFeed(lotId: string): Promise<LiveBid[]> {
  const { data: feed, error } = await supabase.rpc('lot_feed', { p_lot: lotId });
  if (!error && Array.isArray(feed)) {
    return feed.map((r: any) => ({
      id: String(r.id), amount: Number(r.amount), created_at: r.created_at,
      bidder_id: r.bidder_id ?? null, source: r.source === 'room' ? 'room' : 'online',
      users: { screen_name: r.display_name },
    })) as LiveBid[];
  }
  const { data: safe, error: e2 } = await supabase.rpc('lot_bids', { p_lot: lotId });
  if (!e2 && Array.isArray(safe)) {
    return safe.map((r: any) => ({
      id: String(r.id), amount: Number(r.amount), created_at: r.created_at,
      bidder_id: r.bidder_id, source: 'online', users: { screen_name: r.display_name },
    })) as LiveBid[];
  }
  return [];
}

// Turns a database refusal into a sentence a person can act on. Returns null when it is some other error.
export function friendlyBidError(message: string): string | null {
  const moved = message.match(/PRICE_MOVED:([0-9.]+)/);
  if (moved) return `The price has just moved to ${rand(Number(moved[1]))}. Please bid again.`;
  const below = message.match(/BELOW_OPENING:([0-9.]+)/);
  if (below) return `The opening bid is ${rand(Number(below[1]))}.`;
  if (message.includes('LOT_CLOSED')) return 'Bidding on this lot has closed.';
  return null;
}

// Auctioneer / bid clerk: record a bid made in the room.
export async function addRoomBid(lotId: string, amount: number): Promise<string | null> {
  const { error } = await supabase.from('room_bids').insert({ lot_id: lotId, amount });
  if (!error) return null;
  const friendly = friendlyBidError(error.message);
  if (friendly) return friendly.replace('Please bid again.', 'Check the screen and try again.');
  if (/room_bids|schema cache|does not exist/i.test(error.message)) return 'Room bids are not installed in the database yet.';
  if (/row-level security|policy/i.test(error.message)) return 'Only the administrator or auctioneer can record room bids.';
  return error.message;
}

// Remove the most recent room bid on a lot (a typing mistake).
export async function undoLastRoomBid(lotId: string): Promise<string | null> {
  const { data, error } = await supabase.from('room_bids').select('id').eq('lot_id', lotId)
    .order('amount', { ascending: false }).limit(1).maybeSingle();
  if (error) return error.message;
  if (!data) return 'There is no room bid to remove.';
  const { error: e2 } = await supabase.from('room_bids').delete().eq('id', data.id);
  return e2 ? e2.message : null;
}
