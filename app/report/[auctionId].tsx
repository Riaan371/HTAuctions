// Auction report: result of every lot, who bought what online (with contact details), and the full online bid log.
// Buyers in the room are run by the auctioneer, so they appear as "Sold in the room" without a name.
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { C } from '../../components/LiveViewerParts';
import { formatZAR } from '../../components/LotCard';
import { whenText } from '../../lib/admin-utils';

type Who = { full_name?: string | null; screen_name?: string | null; email?: string | null; phone?: string | null } | null;
type Bid = { id: string; amount: number; created_at: string; lot_id: string; bidder_id: string; users: Who };
type Lot = { id: string; title: string; starting_bid: number; reserve: number | null; current_bid: number | null; winner_id: string | null; closed: boolean | null; no_sale: boolean | null };

const nameOf = (u: Who) => u?.full_name || u?.screen_name || 'Unknown bidder';
const clock = (iso: string) => new Date(iso).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

function csvCell(v: unknown) {
  const t = v == null ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export default function Report() {
  const { auctionId } = useLocalSearchParams<{ auctionId: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['report', auctionId],
    queryFn: async () => {
      const { data: ev } = await supabase.from('live_sessions').select('title, status, scheduled_at, lot_ids').eq('auction_id', auctionId).maybeSingle();
      const ids: string[] = ev?.lot_ids ?? [];
      let lots: Lot[] = [];
      let bids: Bid[] = [];
      if (ids.length) {
        const { data: l } = await supabase.from('lots').select('id, title, starting_bid, reserve, current_bid, winner_id, closed, no_sale').in('id', ids);
        lots = ((l ?? []) as Lot[]).sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
        const { data: b, error: bErr } = await supabase
          .from('bids').select('id, amount, created_at, lot_id, bidder_id, users(full_name, screen_name, email, phone)')
          .in('lot_id', ids).order('created_at', { ascending: true });
        if (bErr) throw new Error(bErr.message);
        bids = (b ?? []) as unknown as Bid[];
      }
      return { ev, lots, bids };
    },
  });

  if (isLoading) return <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}><ActivityIndicator color={C.ink} style={{ marginTop: 60 }} /></SafeAreaView>;

  const ev = data?.ev; const lots = data?.lots ?? []; const bids = data?.bids ?? [];

  const rows = lots.map((l, i) => {
    const lb = bids.filter((b) => b.lot_id === l.id);
    const top = lb.reduce<Bid | null>((m, b) => (!m || b.amount > m.amount ? b : m), null);
    const winBid = l.winner_id ? lb.filter((b) => b.bidder_id === l.winner_id).sort((a, b) => b.amount - a.amount)[0] ?? null : null;
    const result = l.winner_id ? 'Sold online' : l.no_sale ? 'No sale' : l.closed ? 'Sold in the room' : 'Not closed';
    const price = l.winner_id ? (l.current_bid ?? winBid?.amount ?? null) : null;
    return { no: i + 1, lot: l, bidCount: lb.length, top, winner: winBid?.users ?? null, winnerId: l.winner_id, result, price };
  });

  const soldOnline = rows.filter((r) => r.result === 'Sold online');
  const total = soldOnline.reduce((sum, r) => sum + (r.price ?? 0), 0);
  const bidders = new Set(bids.map((b) => b.bidder_id));
  const buyers = Object.values(soldOnline.reduce<Record<string, { who: Who; lots: typeof rows; total: number }>>((acc, r) => {
    const k = r.winnerId as string;
    acc[k] = acc[k] ?? { who: r.winner, lots: [], total: 0 };
    acc[k].lots.push(r); acc[k].total += r.price ?? 0;
    return acc;
  }, {}));

  function downloadCsv() {
    const out: string[][] = [
      ['Auction', ev?.title ?? ''], ['When', whenText(ev?.scheduled_at)], [],
      ['LOTS'], ['Lot', 'Description', 'Opening bid', 'Reserve', 'Online bids', 'Highest online bid', 'Result', 'Sold price', 'Buyer name', 'Buyer cell', 'Buyer email'],
      ...rows.map((r) => [String(r.no), r.lot.title, String(r.lot.starting_bid), String(r.lot.reserve ?? ''), String(r.bidCount), String(r.top?.amount ?? ''), r.result, String(r.price ?? ''), r.winner ? nameOf(r.winner) : '', r.winner?.phone ?? '', r.winner?.email ?? '']),
      [], ['ONLINE BID LOG'], ['Time', 'Lot', 'Bidder', 'Cell', 'Email', 'Amount'],
      ...bids.map((b) => [clock(b.created_at), String((lots.findIndex((l) => l.id === b.lot_id)) + 1), nameOf(b.users), b.users?.phone ?? '', b.users?.email ?? '', String(b.amount)]),
    ];
    const csv = out.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `auction-report-${(ev?.title ?? 'auction').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  const resultColor = (r: string) => (r === 'Sold online' ? C.green : r === 'Not closed' ? C.orangeDark : C.sub);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
      <Stack.Screen options={{
        headerShown: true, title: 'Auction report', headerStyle: { backgroundColor: C.ink }, headerTintColor: '#fff',
        headerLeft: () => (
          <Pressable onPress={() => router.replace('/(tabs)/profile')} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
            <Text style={{ color: '#fff', fontSize: 16 }}>← Profile</Text>
          </Pressable>
        ),
      }} />
      <ScrollView contentContainerStyle={s.content}>
        <Text style={s.h1}>{ev?.title ?? 'Auction'}</Text>
        <Text style={s.sub}>{whenText(ev?.scheduled_at)} · {ev?.status === 'ended' ? 'Ended' : ev?.status === 'live' ? 'Live now (report so far)' : 'Not started'}</Text>
        {error && <Text style={{ color: C.red, marginTop: 10 }}>Could not load the report: {(error as Error).message}</Text>}

        {Platform.OS === 'web' && (
          <View style={s.actions}>
            <Pressable onPress={downloadCsv} style={[s.btn, { backgroundColor: C.ink }]}><Text style={s.btnTxt}>Download spreadsheet (CSV)</Text></Pressable>
            <Pressable onPress={() => window.print()} style={[s.btn, { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.ink }]}><Text style={[s.btnTxt, { color: C.ink }]}>Print or save as PDF</Text></Pressable>
          </View>
        )}

        <View style={s.stats}>
          {[
            ['Lots', String(lots.length)],
            ['Sold online', String(soldOnline.length)],
            ['Online sales total', formatZAR(total)],
            ['Sold in the room', String(rows.filter((r) => r.result === 'Sold in the room').length)],
            ['No sale', String(rows.filter((r) => r.result === 'No sale').length)],
            ['Online bidders', String(bidders.size)],
            ['Online bids', String(bids.length)],
          ].map(([k, v]) => (
            <View key={k} style={s.stat}><Text style={s.statV}>{v}</Text><Text style={s.statK}>{k}</Text></View>
          ))}
        </View>

        <Text style={s.section}>Who bought what online</Text>
        {buyers.length === 0 ? (
          <Text style={s.empty}>No lots were sold to online bidders yet.</Text>
        ) : buyers.map((b, i) => (
          <View key={i} style={s.card}>
            <Text style={s.cardTitle}>{nameOf(b.who)}</Text>
            <Text style={s.line}>Cell: {b.who?.phone ?? 'not given'}</Text>
            <Text style={s.line}>Email: {b.who?.email ?? 'not given'}</Text>
            {b.lots.map((r) => (
              <Text key={r.no} style={s.lotLine}>Lot {r.no}: {r.lot.title}  ·  {formatZAR(r.price)}</Text>
            ))}
            <Text style={s.total}>Total: {formatZAR(b.total)}</Text>
          </View>
        ))}

        <Text style={s.section}>Every lot</Text>
        {rows.map((r) => (
          <View key={r.lot.id} style={s.card}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 10 }}>
              <Text style={[s.cardTitle, { flex: 1 }]}>Lot {r.no}: {r.lot.title}</Text>
              <Text style={[s.result, { color: resultColor(r.result) }]}>{r.result}</Text>
            </View>
            <Text style={s.line}>Opening bid {formatZAR(r.lot.starting_bid)}{r.lot.reserve ? ` · Reserve ${formatZAR(r.lot.reserve)}` : ''}</Text>
            <Text style={s.line}>{r.bidCount} online bid{r.bidCount === 1 ? '' : 's'}{r.top ? ` · highest ${formatZAR(r.top.amount)} (${nameOf(r.top.users)})` : ''}</Text>
            {r.result === 'Sold online' && <Text style={s.lotLine}>Sold for {formatZAR(r.price)} to {nameOf(r.winner)}{r.winner?.phone ? `, ${r.winner.phone}` : ''}</Text>}
            {r.result === 'Sold in the room' && <Text style={s.line}>Buyer and price are recorded by the auctioneer.</Text>}
          </View>
        ))}

        <Text style={s.section}>Online bid log</Text>
        {bids.length === 0 ? <Text style={s.empty}>No online bids.</Text> : bids.map((b) => (
          <View key={b.id} style={s.logRow}>
            <Text style={s.logTime}>{clock(b.created_at)}</Text>
            <Text style={s.logLot}>Lot {lots.findIndex((l) => l.id === b.lot_id) + 1}</Text>
            <Text style={s.logWho} numberOfLines={1}>{nameOf(b.users)}</Text>
            <Text style={s.logAmt}>{formatZAR(b.amount)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 20, paddingBottom: 80, width: '100%', maxWidth: 900, alignSelf: 'center' },
  h1: { color: C.ink, fontSize: 30, fontWeight: '900', marginTop: 6 },
  sub: { color: C.sub, fontSize: 16, marginTop: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 },
  btn: { borderRadius: 12, minHeight: 48, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: '#fff', fontSize: 15.5, fontWeight: '800' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  stat: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, minWidth: 130 },
  statV: { color: C.ink, fontSize: 24, fontWeight: '900' },
  statK: { color: C.sub, fontSize: 13.5, marginTop: 2 },
  section: { color: C.ink, fontSize: 22, fontWeight: '800', marginTop: 30, marginBottom: 12 },
  empty: { color: C.sub, fontSize: 15.5 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 16, marginBottom: 10 },
  cardTitle: { color: C.ink, fontSize: 17.5, fontWeight: '800' },
  line: { color: C.sub, fontSize: 15, marginTop: 4, lineHeight: 21 },
  lotLine: { color: C.ink, fontSize: 15.5, fontWeight: '600', marginTop: 6 },
  total: { color: C.green, fontSize: 17, fontWeight: '900', marginTop: 10 },
  result: { fontSize: 14.5, fontWeight: '800' },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  logTime: { color: C.sub, fontSize: 13.5, width: 150 },
  logLot: { color: C.ink, fontSize: 14.5, fontWeight: '700', width: 56 },
  logWho: { color: C.ink, fontSize: 15, flex: 1 },
  logAmt: { color: C.ink, fontSize: 16, fontWeight: '800' },
});
