// Hall screen: a big, read-only view of the lot on the block and the online bids, for a TV in the auction room.
// Open it on a laptop (logged in as admin) connected to the TV. Add ?demo=1 to the address to preview it with sample data.
import { View, Text, Image, StyleSheet, useWindowDimensions, Platform, Pressable } from 'react-native';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/auth-store';
import { C } from '../../components/LiveViewerParts';
import { formatZAR } from '../../components/LotCard';
import { whenText } from '../../lib/admin-utils';
import { LEGAL } from '../../lib/legal';

type TvLot = { id: string; title: string; photos: string[] | null; starting_bid: number; current_bid: number | null; closed: boolean | null; no_sale: boolean | null; winner_id: string | null };
type TvBid = { id: string; amount: number; created_at: string; bidder_id: string; name: string };
type TvSession = { status: string; title: string | null; scheduled_at: string | null; lot_ids: string[] | null; current_lot_index: number | null };

const BG = '#0F1E2D';
const PANEL = 'rgba(255,255,255,0.07)';
const GREEN = '#4ADE80';

const svgPhoto = (label: string, color: string) =>
  'data:image/svg+xml;base64,' + btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="${color}"/><text x="600" y="420" font-size="64" fill="white" text-anchor="middle" font-family="Arial">${label}</text></svg>`);

const DEMO = {
  session: { status: 'live', title: 'Classic Cars Auction January 2027', scheduled_at: null, lot_ids: ['a', 'b', 'c', 'd'], current_lot_index: 1 } as TvSession,
  lots: [
    { id: 'a', title: 'Chevrolet Bel Air 1957', photos: [svgPhoto('Photo 1', '#2b4a63')], starting_bid: 100000, current_bid: 115000, closed: true, no_sale: false, winner_id: 'x' },
    { id: 'b', title: 'Ford Mustang 1965', photos: [svgPhoto('Mustang: photo 1', '#5a3a2b'), svgPhoto('Mustang: photo 2', '#3a5a2b')], starting_bid: 200000, current_bid: null, closed: false, no_sale: false, winner_id: null },
    { id: 'c', title: 'Mercedes-Benz 280 SL', photos: [svgPhoto('Photo', '#4a2b5a')], starting_bid: 500000, current_bid: null, closed: false, no_sale: false, winner_id: null },
    { id: 'd', title: 'VW Beetle 1967', photos: [svgPhoto('Photo', '#2b5a55')], starting_bid: 90000, current_bid: null, closed: false, no_sale: false, winner_id: null },
  ] as TvLot[],
  bids: [
    { id: '4', amount: 235000, created_at: new Date().toISOString(), bidder_id: 'u1', name: 'Jane D.' },
    { id: '3', amount: 230000, created_at: new Date(Date.now() - 9000).toISOString(), bidder_id: 'u2', name: 'Pieter' },
    { id: '2', amount: 220000, created_at: new Date(Date.now() - 21000).toISOString(), bidder_id: 'u1', name: 'Jane D.' },
    { id: '1', amount: 210000, created_at: new Date(Date.now() - 40000).toISOString(), bidder_id: 'u3', name: 'Thandi M.' },
  ] as TvBid[],
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const shortName = (full?: string | null, screen?: string | null) => {
  if (screen && screen.trim()) return screen.trim();
  const parts = (full ?? '').trim().split(/\s+/);
  return parts[0] ? parts[0] + (parts[1] ? ' ' + parts[1][0] + '.' : '') : 'Bidder';
};

function Shell({ pad, children }: { pad: number; children: React.ReactNode }) {
  return (
    <View style={[s.root, { padding: pad }]}>
      <Stack.Screen options={{ headerShown: false }} />
      {children}
    </View>
  );
}

export default function TvScreen() {
  const { auctionId, demo } = useLocalSearchParams<{ auctionId: string; demo?: string }>();
  const isDemo = demo === '1';
  const authSession = useAuthStore((s) => s.session);
  const { width, height } = useWindowDimensions();
  const k = Math.max(0.5, Math.min(width / 1920, height / 1080));
  const f = (n: number) => Math.round(n * k);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [hint, setHint] = useState(true);

  const enabled = !isDemo && !!authSession;

  const { data: liveSessionRow } = useQuery({
    queryKey: ['tv-session', auctionId],
    queryFn: async () => {
      const { data } = await supabase.from('live_sessions').select('status, title, scheduled_at, lot_ids, current_lot_index').eq('auction_id', auctionId).maybeSingle();
      return data as TvSession | null;
    },
    enabled, refetchInterval: 2000,
  });
  const sess: TvSession | null = isDemo ? DEMO.session : liveSessionRow ?? null;

  const lotIds = sess?.lot_ids ?? [];
  const { data: lotRows } = useQuery({
    queryKey: ['tv-lots', auctionId, lotIds.join(',')],
    queryFn: async () => {
      if (!lotIds.length) return [] as TvLot[];
      const { data } = await supabase.from('lots').select('id, title, photos, starting_bid, current_bid, closed, no_sale, winner_id').in('id', lotIds);
      const rows = (data ?? []) as TvLot[];
      rows.sort((a, b) => lotIds.indexOf(a.id) - lotIds.indexOf(b.id));
      return rows;
    },
    enabled: enabled && lotIds.length > 0, refetchInterval: 3000,
  });
  const lots: TvLot[] = isDemo ? DEMO.lots : lotRows ?? [];
  const idx = Math.min(Math.max(sess?.current_lot_index ?? 0, 0), Math.max(lots.length - 1, 0));
  const lot = lots[idx] ?? null;
  const next = lots[idx + 1] ?? null;

  const { data: bidRows } = useQuery({
    queryKey: ['tv-bids', lot?.id],
    queryFn: async () => {
      const { data: safe, error: rpcErr } = await supabase.rpc('lot_bids', { p_lot: lot!.id });
      if (!rpcErr && Array.isArray(safe)) {
        return safe.map((r: any) => ({ id: String(r.id), amount: Number(r.amount), created_at: r.created_at, bidder_id: r.bidder_id, name: r.display_name || 'Bidder' })) as TvBid[];
      }
      const { data } = await supabase.from('bids').select('id, amount, created_at, bidder_id, users(full_name, screen_name)').eq('lot_id', lot!.id).order('amount', { ascending: false }).limit(15);
      return ((data ?? []) as any[]).map((b) => ({ id: String(b.id), amount: b.amount, created_at: b.created_at, bidder_id: b.bidder_id, name: shortName(b.users?.full_name, b.users?.screen_name) })) as TvBid[];
    },
    enabled: enabled && !!lot?.id, refetchInterval: 2000,
  });
  const bids: TvBid[] = isDemo ? DEMO.bids : bidRows ?? [];

  // rotate through the lot's photos
  const photos = lot?.photos ?? [];
  useEffect(() => { setPhotoIdx(0); }, [lot?.id]);
  useEffect(() => {
    if (photos.length < 2) return;
    const t = setInterval(() => setPhotoIdx((i) => (i + 1) % photos.length), 6000);
    return () => clearInterval(t);
  }, [photos.length, lot?.id]);

  // F toggles full screen; the hint hides itself
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'f') {
        if (document.fullscreenElement) document.exitFullscreen?.();
        else document.documentElement.requestFullscreen?.();
      }
    };
    window.addEventListener('keydown', onKey);
    const t = setTimeout(() => setHint(false), 12000);
    return () => { window.removeEventListener('keydown', onKey); clearTimeout(t); };
  }, []);

  const top = bids[0];
  const sold = !!lot?.winner_id;
  const noSale = !!lot?.no_sale && !sold;
  const closed = !!lot?.closed || sold || noSale;
  const price = top ? top.amount : lot?.starting_bid ?? 0;

  const Header = (
    <View style={[s.header, { marginBottom: f(24) }]}>
      <Image source={require('../../assets/logo.png')} style={{ width: f(84), height: f(84) }} resizeMode="contain" />
      <View style={{ flex: 1, marginLeft: f(20) }}>
        <Text style={[s.brand, { fontSize: f(40) }]}>HT Auctions West Coast</Text>
        <Text style={[s.sub, { fontSize: f(26) }]} numberOfLines={1}>{sess?.title ?? 'Live auction'}</Text>
      </View>
      {sess?.status === 'live' && (
        <View style={[s.livePill, { paddingHorizontal: f(24), paddingVertical: f(10) }]}>
          <View style={[s.liveDot, { width: f(16), height: f(16), borderRadius: f(8) }]} />
          <Text style={[s.liveTxt, { fontSize: f(28) }]}>LIVE</Text>
        </View>
      )}
    </View>
  );

  if (!isDemo && !authSession) {
    return (
      <Shell pad={f(36)}>
        {Header}
        <View style={s.center}>
          <Text style={[s.big, { fontSize: f(54) }]}>Log in to show this screen</Text>
          <Text style={[s.sub, { fontSize: f(30), marginTop: f(16), textAlign: 'center' }]}>Open this page on the laptop that is connected to the TV, logged in as the administrator.</Text>
          <Pressable onPress={() => router.push('/(auth)/login')} style={[s.btn, { marginTop: f(30), paddingHorizontal: f(40), paddingVertical: f(18) }]}>
            <Text style={[s.btnTxt, { fontSize: f(30) }]}>Log in</Text>
          </Pressable>
        </View>
      </Shell>
    );
  }

  if (sess?.status === 'ended') {
    return (
      <Shell pad={f(36)}>
        {Header}
        <View style={s.center}>
          <Text style={[s.big, { fontSize: f(80) }]}>The auction has ended</Text>
          <Text style={[s.sub, { fontSize: f(36), marginTop: f(16) }]}>Thank you for joining us.</Text>
        </View>
      </Shell>
    );
  }

  if (!sess || sess.status !== 'live') {
    return (
      <Shell pad={f(36)}>
        {Header}
        <View style={s.center}>
          <Text style={[s.big, { fontSize: f(80) }]}>Starting soon</Text>
          {!!sess?.scheduled_at && <Text style={[s.sub, { fontSize: f(40), marginTop: f(20) }]}>{whenText(sess.scheduled_at)}</Text>}
          <Text style={[s.sub, { fontSize: f(30), marginTop: f(20) }]}>Bids placed online will appear on this screen.</Text>
        </View>
      </Shell>
    );
  }

  return (
    <Shell pad={f(36)}>
      {Header}
      <View style={s.main}>
        {/* Left: lot and photo */}
        <View style={{ flex: 5, marginRight: f(28) }}>
          <Text style={[s.kicker, { fontSize: f(28) }]}>LOT {idx + 1} OF {lots.length}</Text>
          <Text style={[s.lotTitle, { fontSize: f(64), marginBottom: f(16) }]} numberOfLines={2}>{lot?.title ?? '…'}</Text>
          <View style={[s.photoBox, { borderRadius: f(24) }]}>
            {photos[photoIdx]
              ? <Image source={{ uri: photos[photoIdx] }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
              : <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: f(36) }}>No photo</Text>}
            {photos.length > 1 && (
              <View style={[s.dots, { bottom: f(16) }]}>
                {photos.map((_, i) => <View key={i} style={{ width: f(14), height: f(14), borderRadius: f(7), marginHorizontal: f(5), backgroundColor: i === photoIdx ? C.orange : 'rgba(255,255,255,0.35)' }} />)}
              </View>
            )}
          </View>
        </View>

        {/* Right: price and bids */}
        <View style={{ flex: 3 }}>
          <View style={[s.panel, { borderRadius: f(24), padding: f(28) }]}>
            {closed ? (
              <>
                <Text style={[s.kicker, { fontSize: f(28) }]}>RESULT</Text>
                <Text style={[s.result, { fontSize: f(84), color: sold ? GREEN : '#fff' }]}>{sold ? 'SOLD' : noSale ? 'NO SALE' : 'SOLD'}</Text>
                {sold && <Text style={[s.price, { fontSize: f(96) }]}>{formatZAR(lot?.current_bid ?? top?.amount ?? 0)}</Text>}
                <Text style={[s.sub, { fontSize: f(34), marginTop: f(8) }]}>
                  {sold ? `Online buyer: ${bids.find((b) => b.bidder_id === lot?.winner_id)?.name ?? 'Bidder'}` : noSale ? 'Passed in' : 'Sold in the room'}
                </Text>
              </>
            ) : (
              <>
                <Text style={[s.kicker, { fontSize: f(28) }]}>{top ? 'CURRENT BID' : 'OPENING BID'}</Text>
                <Text style={[s.price, { fontSize: f(128) }]} numberOfLines={1} adjustsFontSizeToFit>{formatZAR(price)}</Text>
                <Text style={[s.lead, { fontSize: f(36) }]}>{top ? `Leading online: ${top.name}` : 'No online bids yet'}</Text>
              </>
            )}
            <Text style={[s.fee, { fontSize: f(22), marginTop: f(14) }]}>Plus buyer's commission of {LEGAL.buyerCommissionPct}% {LEGAL.vatNote}.</Text>
          </View>

          <View style={[s.panel, { borderRadius: f(24), padding: f(24), marginTop: f(20), flex: 1 }]}>
            <Text style={[s.kicker, { fontSize: f(26), marginBottom: f(10) }]}>ONLINE BIDS</Text>
            {bids.length === 0 ? (
              <Text style={[s.sub, { fontSize: f(30) }]}>Waiting for the first online bid…</Text>
            ) : bids.slice(0, 6).map((b, i) => (
              <View key={b.id} style={[s.bidRow, { paddingVertical: f(11) }, i > 0 && s.bidRowLine]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.bidName, { fontSize: f(34) }, i === 0 && { color: C.orange }]} numberOfLines={1}>{b.name}</Text>
                  <Text style={[s.bidMeta, { fontSize: f(22) }]}>ONLINE · {clock(b.created_at)}</Text>
                </View>
                <Text style={[s.bidAmt, { fontSize: f(40) }, i === 0 && { color: C.orange }]}>{formatZAR(b.amount)}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={[s.footer, { marginTop: f(20) }]}>
        <Text style={[s.sub, { fontSize: f(28) }]}>
          {next ? `Next: Lot ${idx + 2} · ${next.title}` : 'This is the last lot'}
        </Text>
        {hint && <Text style={[s.hint, { fontSize: f(22) }]}>Press F for full screen</Text>}
      </View>
    </Shell>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center' },
  brand: { color: '#fff', fontWeight: '900' },
  sub: { color: 'rgba(255,255,255,0.75)' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#DC2626', borderRadius: 99 },
  liveDot: { backgroundColor: '#fff' },
  liveTxt: { color: '#fff', fontWeight: '900', letterSpacing: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  big: { color: '#fff', fontWeight: '900', textAlign: 'center' },
  btn: { backgroundColor: C.orange, borderRadius: 18 },
  btnTxt: { color: C.ink, fontWeight: '900' },
  main: { flex: 1, flexDirection: 'row', minHeight: 0 },
  kicker: { color: 'rgba(255,255,255,0.6)', fontWeight: '800', letterSpacing: 3 },
  lotTitle: { color: '#fff', fontWeight: '900' },
  photoBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  dots: { position: 'absolute', flexDirection: 'row' },
  panel: { backgroundColor: PANEL },
  price: { color: C.orange, fontWeight: '900', letterSpacing: -2 },
  result: { fontWeight: '900' },
  lead: { color: '#fff', fontWeight: '700' },
  fee: { color: 'rgba(255,255,255,0.55)' },
  bidRow: { flexDirection: 'row', alignItems: 'center' },
  bidRowLine: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.12)' },
  bidName: { color: '#fff', fontWeight: '800' },
  bidMeta: { color: 'rgba(255,255,255,0.5)', fontWeight: '700', letterSpacing: 1 },
  bidAmt: { color: '#fff', fontWeight: '900' },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hint: { color: 'rgba(255,255,255,0.45)' },
});
