// Step 1 of running an auction: name it and set the date and time.
// Lots are added next, on the event screen.
import { View, Text, Pressable, ScrollView, TextInput, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../lib/auth-store';
import { C } from '../components/LiveViewerParts';

const webInput: any = {
  width: '100%', boxSizing: 'border-box', height: 56, fontSize: 18, padding: '0 16px', borderRadius: 14,
  border: `1.5px solid ${C.line}`, background: '#fff', color: C.ink, fontFamily: 'inherit',
};

export default function CreateAuction() {
  const session = useAuthStore((s) => s.session);
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');   // YYYY-MM-DD
  const [time, setTime] = useState('15:00'); // HH:MM
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!session) { setError('Please log in again.'); return; }
    if (!title.trim()) { setError('Enter a name for the auction.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { setError('Choose the date of the auction.'); return; }
    if (!/^\d{2}:\d{2}$/.test(time)) { setError('Choose the start time.'); return; }
    const when = new Date(`${date}T${time}:00`);
    if (isNaN(when.getTime())) { setError('That date or time is not valid.'); return; }

    setBusy(true);
    const { data: auction, error: aErr } = await supabase
      .from('auctions')
      .insert({ title: title.trim(), auctioneer_id: session.user.id, type: 'live', status: 'scheduled', end_at: when.toISOString() })
      .select('id').single();
    if (aErr || !auction) { setBusy(false); setError('Could not create the auction: ' + (aErr?.message ?? 'unknown error')); return; }

    const { error: sErr } = await supabase.from('live_sessions').insert({
      auction_id: auction.id, auctioneer_id: session.user.id, channel_name: auction.id,
      status: 'scheduled', scheduled_at: when.toISOString(), lot_ids: [], current_lot_index: 0, title: title.trim(),
    });
    if (sErr) {
      await supabase.from('auctions').delete().eq('id', auction.id);
      setBusy(false); setError('Could not schedule the auction: ' + sErr.message); return;
    }

    queryClient.invalidateQueries({ queryKey: ['admin-events'] });
    queryClient.invalidateQueries({ queryKey: ['auction-events'] });
    setBusy(false);
    router.replace(`/event/${auction.id}`);
  }

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
      <Stack.Screen options={{
        headerShown: true, title: 'Create a live auction',
        headerStyle: { backgroundColor: C.ink }, headerTintColor: '#fff',
        headerLeft: () => (
          <Pressable onPress={() => router.back()} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: '#fff', fontSize: 16 }}>← Back</Text>
          </Pressable>
        ),
      }} />
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.step}>STEP 1 OF 2</Text>
        <Text style={s.h1}>Name and date</Text>
        <Text style={s.sub}>Clients will see this date and time on their home screen. You add the lots on the next screen.</Text>

        <View style={s.card}>
          <Text style={s.label}>Auction name</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Classic cars, January sale" placeholderTextColor="#7C8F9A" style={s.input} />

          <Text style={[s.label, { marginTop: 20 }]}>Date</Text>
          {Platform.OS === 'web' ? (
            <input type="date" value={date} onChange={(e: any) => setDate(e.target.value)} style={webInput} />
          ) : (
            <TextInput value={date} onChangeText={setDate} placeholder="2027-01-15" placeholderTextColor="#7C8F9A" style={s.input} />
          )}

          <Text style={[s.label, { marginTop: 20 }]}>Start time</Text>
          {Platform.OS === 'web' ? (
            <input type="time" value={time} onChange={(e: any) => setTime(e.target.value)} style={webInput} />
          ) : (
            <TextInput value={time} onChangeText={setTime} placeholder="15:00" placeholderTextColor="#7C8F9A" style={s.input} />
          )}
        </View>

        {error && <View style={s.error}><Text style={s.errorTxt}>{error}</Text></View>}

        <Pressable onPress={save} disabled={busy} style={[s.next, busy && { opacity: 0.6 }]}>
          {busy ? <ActivityIndicator color={C.ink} /> : <Text style={s.nextTxt}>Save and add lots →</Text>}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingBottom: 60, width: '100%', maxWidth: 640, alignSelf: 'center' },
  step: { color: C.orangeDark, fontSize: 13, fontWeight: '800', letterSpacing: 1.4, marginTop: 8 },
  h1: { color: C.ink, fontSize: 30, fontWeight: '900', marginTop: 4 },
  sub: { color: C.sub, fontSize: 16, lineHeight: 24, marginTop: 8, marginBottom: 22 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 20 },
  label: { color: C.ink, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  input: { height: 56, borderWidth: 1.5, borderColor: C.line, borderRadius: 14, paddingHorizontal: 16, fontSize: 18, color: C.ink, backgroundColor: '#fff' },
  error: { backgroundColor: C.redBg, borderRadius: 12, padding: 14, marginTop: 16 },
  errorTxt: { color: C.red, fontSize: 15.5, fontWeight: '600' },
  next: { backgroundColor: C.orange, borderRadius: 16, minHeight: 64, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  nextTxt: { color: C.ink, fontSize: 20, fontWeight: '900' },
});
