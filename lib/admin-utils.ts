import { Alert } from 'react-native';
import { supabase } from './supabase';

export function storagePathFromUrl(url: string): string | null {
  const marker = '/lot-photos/';
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

export function confirmAsync(title: string, message: string, okLabel = 'Delete'): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
      resolve(window.confirm(`${title}\n\n${message}`));
    } else {
      Alert.alert(title, message, [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: okLabel, style: 'destructive', onPress: () => resolve(true) },
      ]);
    }
  });
}

// "Friday, 15 January 2027 at 15:00"
export function whenText(iso?: string | null): string {
  if (!iso) return 'No date set';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) +
    ' at ' +
    d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })
  );
}

// Permanently deletes a live event with its lots, photos, bids and session.
export async function deleteEventCompletely(auctionId: string) {
  const { data: lots } = await supabase.from('lots').select('id, photos').eq('auction_id', auctionId);
  const ids = (lots ?? []).map((l: any) => l.id);
  const paths = (lots ?? []).flatMap((l: any) => (l.photos ?? []).map(storagePathFromUrl).filter(Boolean)) as string[];
  if (paths.length) await supabase.storage.from('lot-photos').remove(paths);
  if (ids.length) await supabase.from('bids').delete().in('lot_id', ids);
  if (ids.length) {
    const { error } = await supabase.from('lots').delete().in('id', ids);
    if (error) throw new Error(error.message);
  }
  await supabase.from('live_sessions').delete().eq('auction_id', auctionId);
  const { error } = await supabase.from('auctions').delete().eq('id', auctionId);
  if (error) throw new Error(error.message);
}
