// The whole admin panel: create a live auction, then manage its lots, run it, and read the report.
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { C } from './LiveViewerParts';
import { confirmAsync, deleteEventCompletely, whenText } from '../lib/admin-utils';

type EventRow = { id: string; auction_id: string; title: string | null; status: string; scheduled_at: string | null; lot_ids: string[] | null };

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { text: string; bg: string; fg: string }> = {
    scheduled: { text: 'Scheduled', bg: '#E3EDEB', fg: C.ink },
    live: { text: 'LIVE NOW', bg: '#FDECEA', fg: C.red },
    ended: { text: 'Ended', bg: '#EEF3F2', fg: C.sub },
  };
  const m = map[status] ?? map.scheduled;
  return (
    <View style={[s.pill, { backgroundColor: m.bg }]}>
      <Text style={[s.pillTxt, { color: m.fg }]}>{m.text}</Text>
    </View>
  );
}

function EventCard({ ev, onDelete }: { ev: EventRow; onDelete: (ev: EventRow) => void }) {
  const lots = ev.lot_ids?.length ?? 0;
  const ended = ev.status === 'ended';
  return (
    <View style={s.card}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <Text style={s.title} numberOfLines={2}>{ev.title ?? 'Untitled auction'}</Text>
        <StatusPill status={ev.status} />
      </View>
      <Text style={s.when}>{whenText(ev.scheduled_at)}</Text>
      <Text style={s.meta}>{lots} lot{lots === 1 ? '' : 's'}</Text>

      <View style={s.btnRow}>
        {ended ? (
          <Pressable onPress={() => router.push(`/report/${ev.auction_id}`)} style={[s.btn, s.btnPrimary]}>
            <Text style={s.btnPrimaryTxt}>View report</Text>
          </Pressable>
        ) : (
          <>
            <Pressable onPress={() => router.push(`/event/${ev.auction_id}`)} style={[s.btn, s.btnPrimary]}>
              <Text style={s.btnPrimaryTxt}>Lots and details</Text>
            </Pressable>
            <Pressable onPress={() => router.push(`/live/${ev.auction_id}`)} style={[s.btn, s.btnOutline]}>
              <Text style={s.btnOutlineTxt}>{ev.status === 'live' ? 'Open live room' : 'Go to live room'}</Text>
            </Pressable>
          </>
        )}
        {ev.status === 'live' && (
          <Pressable onPress={() => router.push(`/report/${ev.auction_id}`)} style={[s.btn, s.btnOutline]}>
            <Text style={s.btnOutlineTxt}>Report so far</Text>
          </Pressable>
        )}
        <Pressable onPress={() => onDelete(ev)} style={[s.btn, s.btnDanger]}>
          <Text style={s.btnDangerTxt}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function AdminEvents() {
  const queryClient = useQueryClient();
  const { data: events, isLoading } = useQuery({
    queryKey: ['admin-events'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('live_sessions')
        .select('id, auction_id, title, status, scheduled_at, lot_ids')
        .order('scheduled_at', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as EventRow[];
    },
    refetchInterval: 15000,
  });

  const upcoming = (events ?? []).filter((e) => e.status !== 'ended');
  const past = (events ?? []).filter((e) => e.status === 'ended').reverse();

  async function onDelete(ev: EventRow) {
    const ok = await confirmAsync(
      'Delete this auction?',
      `"${ev.title ?? 'Untitled'}" will be permanently deleted together with its lots, photos and bids. This cannot be undone.`,
    );
    if (!ok) return;
    try {
      await deleteEventCompletely(ev.auction_id);
      queryClient.invalidateQueries({ queryKey: ['admin-events'] });
      queryClient.invalidateQueries({ queryKey: ['auction-events'] });
    } catch (e: any) {
      Alert.alert('Could not delete', e.message);
    }
  }

  return (
    <View>
      <Pressable onPress={() => router.push('/schedule-live')} style={s.create}>
        <Text style={s.createTxt}>+ Create a live auction</Text>
      </Pressable>

      <Text style={s.section}>Your auctions</Text>
      {isLoading && <Text style={s.meta}>Loading…</Text>}
      {!isLoading && upcoming.length === 0 && (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No auction scheduled</Text>
          <Text style={s.meta}>Create one to set the date and time, then add the lots that will be sold.</Text>
        </View>
      )}
      {upcoming.map((ev) => <EventCard key={ev.id} ev={ev} onDelete={onDelete} />)}

      {past.length > 0 && (
        <>
          <Text style={[s.section, { marginTop: 22 }]}>Past auctions</Text>
          {past.map((ev) => <EventCard key={ev.id} ev={ev} onDelete={onDelete} />)}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  create: { backgroundColor: C.orange, borderRadius: 16, minHeight: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  createTxt: { color: C.ink, fontSize: 19, fontWeight: '900' },
  section: { color: C.ink, fontSize: 20, fontWeight: '800', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 18, marginBottom: 14 },
  title: { color: C.ink, fontSize: 20, fontWeight: '800', flex: 1 },
  when: { color: C.ink, fontSize: 15.5, fontWeight: '600', marginTop: 8 },
  meta: { color: C.sub, fontSize: 14.5, marginTop: 3, lineHeight: 21 },
  pill: { borderRadius: 99, paddingHorizontal: 12, paddingVertical: 5 },
  pillTxt: { fontSize: 12.5, fontWeight: '800' },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  btn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  btnPrimary: { backgroundColor: C.ink },
  btnPrimaryTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnOutline: { borderWidth: 1.5, borderColor: C.ink, backgroundColor: '#fff' },
  btnOutlineTxt: { color: C.ink, fontWeight: '800', fontSize: 15 },
  btnDanger: { borderWidth: 1, borderColor: '#F2B8B5', backgroundColor: '#fff' },
  btnDangerTxt: { color: C.red, fontWeight: '700', fontSize: 14.5 },
  empty: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 20, marginBottom: 14 },
  emptyTitle: { color: C.ink, fontSize: 18, fontWeight: '800' },
});
