// Building blocks for the CLIENT side of the live auction room, in the
// "West Coast heritage" look: light sea-mist background, navy text, sunset
// orange for the action. Built to be read at a glance while bidding.
import { View, Text, Image, Pressable, Modal, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { formatZAR } from './LotCard';

export const C = {
  bg: '#EAF2F1',
  card: '#FFFFFF',
  line: '#D3E2E0',
  ink: '#17293D',
  sub: '#456070',
  orange: '#E8742C',
  orangeDark: '#B8500F',
  orangeSoft: '#FDF0E6',
  green: '#146C43',
  greenBg: '#E2F4EA',
  red: '#B42318',
  redBg: '#FDECEA',
};

export type LiveLot = {
  id: string;
  title: string;
  description?: string | null;
  photos?: string[] | null;
  starting_bid: number;
  current_bid?: number | null;
  increment?: number | null;
  category?: string | null;
  closed?: boolean | null;
  no_sale?: boolean | null;
  winner_id?: string | null;
};

export type LiveBid = {
  id: string;
  amount: number;
  created_at: string;
  bidder_id: string;
  users?: { full_name?: string | null; screen_name?: string | null } | null;
};

const bidderName = (b: LiveBid | undefined | null) => b?.users?.screen_name || b?.users?.full_name || 'Bidder';
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

/* ---------------------------------------------------------------- photos */

// Full-screen photo viewer for one lot. Render with key={lot.id} so it resets.
export function PhotoViewer({ lot, onClose }: { lot: LiveLot | null; onClose: () => void }) {
  const [i, setI] = useState(0);
  const photos = lot?.photos ?? [];
  return (
    <Modal visible={!!lot} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.vBg}>
        <Pressable style={s.vClose} onPress={onClose}><Text style={s.vCloseTxt}>✕</Text></Pressable>
        {photos.length > 0 ? (
          <View style={s.vStage}>
            <Image source={{ uri: photos[i] }} style={s.vImg} resizeMode="contain" />
            {photos.length > 1 && (
              <>
                <Pressable onPress={() => setI((n) => (n - 1 + photos.length) % photos.length)} style={[s.arrow, { left: 8 }]}>
                  <Text style={s.arrowTxt}>‹</Text>
                </Pressable>
                <Pressable onPress={() => setI((n) => (n + 1) % photos.length)} style={[s.arrow, { right: 8 }]}>
                  <Text style={s.arrowTxt}>›</Text>
                </Pressable>
              </>
            )}
          </View>
        ) : (
          <View style={s.vStage}><Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16 }}>No photos for this lot</Text></View>
        )}
        <View style={s.vCaption}>
          <Text style={s.vTitle}>{lot?.title}</Text>
          {photos.length > 1 && <Text style={s.vSub}>Photo {i + 1} of {photos.length}</Text>}
          {lot && <Text style={s.vSub}>Opening bid {formatZAR(lot.starting_bid)}</Text>}
          {!!lot?.description && <Text style={s.vDesc}>{lot.description}</Text>}
        </View>
      </View>
    </Modal>
  );
}

// Photos of the lot currently on the block (main picture + thumbnails). Use key={lot.id}.
export function LotGallery({ lot, onOpen }: { lot: LiveLot; onOpen: (l: LiveLot) => void }) {
  const photos = lot.photos ?? [];
  const [i, setI] = useState(0);
  if (!photos.length) {
    return (
      <View style={[s.galleryMain, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ fontSize: 34 }}>📷</Text>
        <Text style={{ color: C.sub, fontSize: 15, marginTop: 6 }}>No photos for this lot</Text>
      </View>
    );
  }
  return (
    <View>
      <Pressable onPress={() => onOpen(lot)} style={s.galleryMain}>
        <Image source={{ uri: photos[i] }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
        <View style={s.zoomHint}><Text style={s.zoomHintTxt}>🔍 Tap to enlarge</Text></View>
        {photos.length > 1 && (
          <>
            <Pressable onPress={() => setI((n) => (n - 1 + photos.length) % photos.length)} style={[s.arrow, { left: 8 }]}>
              <Text style={s.arrowTxt}>‹</Text>
            </Pressable>
            <Pressable onPress={() => setI((n) => (n + 1) % photos.length)} style={[s.arrow, { right: 8 }]}>
              <Text style={s.arrowTxt}>›</Text>
            </Pressable>
          </>
        )}
      </Pressable>
      {photos.length > 1 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 10 }}>
          {photos.map((p, idx) => (
            <Pressable key={idx} onPress={() => setI(idx)} style={[s.thumb, idx === i && s.thumbOn]}>
              <Image source={{ uri: p }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ bids */

// The bidding panel. onBid returns null on success or an error message.
export function BidPanel({
  lot, lotNumber, totalLots, bids, userId, onBid, onLogin,
}: {
  lot: LiveLot; lotNumber: number; totalLots: number; bids: LiveBid[]; userId: string | null;
  onBid: (amount: number) => Promise<string | null>; onLogin: () => void;
}) {
  const [steps, setSteps] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const inc = lot.increment && lot.increment > 0 ? lot.increment : 100;
  const top = bids[0];
  const minNext = top ? top.amount + inc : lot.starting_bid;
  useEffect(() => { setSteps(0); }, [minNext, lot.id]);
  const amount = minNext + steps * inc;

  const sold = !!lot.winner_id;
  const noSale = !!lot.no_sale && !sold;
  const closed = !!lot.closed || sold || noSale;
  const iAmTop = !!userId && top?.bidder_id === userId;
  const iHaveBid = !!userId && bids.some((b) => b.bidder_id === userId);

  async function press() {
    if (!userId) { onLogin(); return; }
    setBusy(true); setMsg(null);
    const err = await onBid(amount);
    setBusy(false);
    if (err) setMsg({ text: err, ok: false });
    else { setMsg({ text: `Bid placed: ${formatZAR(amount)}`, ok: true }); setSteps(0); setTimeout(() => setMsg(null), 4000); }
  }

  return (
    <View style={s.panel}>
      {totalLots > 0 && <Text style={s.kicker}>LOT {lotNumber} OF {totalLots}</Text>}
      <Text style={s.panelTitle}>{lot.title}</Text>

      <Text style={[s.kicker, { marginTop: 18 }]}>{top ? 'CURRENT BID' : 'OPENING BID'}</Text>
      <Text style={s.price}>{formatZAR(top ? top.amount : lot.starting_bid)}</Text>
      {top && !iAmTop && <Text style={s.leading}>Leading: {bidderName(top)}</Text>}
      {!top && <Text style={s.leading}>No bids yet. Be the first!</Text>}

      {closed ? (
        <View style={[s.box, sold ? s.boxGood : s.boxNeutral]}>
          <Text style={[s.boxTitle, { color: sold ? C.green : C.ink }]}>
            {sold ? `SOLD for ${formatZAR(top?.amount ?? lot.current_bid ?? 0)}` : 'NO SALE'}
          </Text>
          {sold && top && <Text style={s.boxSub}>Winning bidder: {bidderName(top)}</Text>}
        </View>
      ) : iAmTop ? (
        // You already lead: no bid controls until someone outbids you.
        <View style={[s.box, s.boxGood]}>
          <Text style={[s.boxTitle, { color: C.green }]}>🏆 You are the highest bidder</Text>
          <Text style={s.boxSub}>Your bid of {formatZAR(top!.amount)} is leading. You can bid again if someone outbids you.</Text>
        </View>
      ) : (
        <>
          {iHaveBid && (
            <View style={[s.box, s.boxBad]}>
              <Text style={[s.boxTitle, { color: C.red }]}>You have been outbid</Text>
            </View>
          )}
          <View style={s.stepper}>
            <Pressable onPress={() => setSteps((n) => Math.max(0, n - 1))} disabled={steps === 0} style={[s.stepBtn, steps === 0 && { opacity: 0.3 }]}>
              <Text style={s.stepTxt}>−</Text>
            </Pressable>
            <View style={{ alignItems: 'center' }}>
              <Text style={s.stepLabel}>YOUR BID</Text>
              <Text style={s.stepAmt}>{formatZAR(amount)}</Text>
            </View>
            <Pressable onPress={() => setSteps((n) => n + 1)} style={s.stepBtn}>
              <Text style={s.stepTxt}>+</Text>
            </Pressable>
          </View>
          <Text style={s.stepHint}>Tap + or − to change your bid ({formatZAR(inc)} each step)</Text>
          <Pressable onPress={press} disabled={busy} style={[s.bidBtn, busy && { opacity: 0.6 }]}>
            {busy ? <ActivityIndicator color={C.ink} /> : <Text style={s.bidBtnTxt}>{userId ? `BID ${formatZAR(amount)}` : 'Log in to bid'}</Text>}
          </Pressable>
        </>
      )}
      {msg && <Text style={[s.msg, { color: msg.ok ? C.green : C.red }]}>{msg.text}</Text>}
    </View>
  );
}

export function BidHistory({ bids, userId }: { bids: LiveBid[]; userId: string | null }) {
  return (
    <View style={s.panel}>
      <Text style={s.kicker}>BIDS ON THIS LOT</Text>
      {bids.length === 0 ? (
        <Text style={s.noBids}>No bids yet.</Text>
      ) : (
        bids.slice(0, 10).map((b, idx) => (
          <View key={b.id} style={[s.bidRow, idx === 0 && s.bidRowTop]}>
            <View style={{ flex: 1 }}>
              <Text style={s.bidName} numberOfLines={1}>
                {userId && b.bidder_id === userId ? 'You' : bidderName(b)}
              </Text>
              <Text style={s.bidTime}>{clock(b.created_at)}</Text>
            </View>
            <Text style={[s.bidAmt, idx === 0 && { color: C.orangeDark }]}>{formatZAR(b.amount)}</Text>
          </View>
        ))
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ lots */

function statusOf(l: LiveLot, activeId: string | null): { text: string; color: string } {
  if (l.winner_id) return { text: 'SOLD', color: C.green };
  if (l.no_sale) return { text: 'NO SALE', color: C.sub };
  if (activeId && l.id === activeId) return { text: 'ON THE BLOCK', color: C.orangeDark };
  return { text: `Opening bid ${formatZAR(l.starting_bid)}`, color: C.sub };
}

// Compact list of every lot in the auction. Tapping one opens its photos.
export function LotsList({ lots, activeLotId, onOpen }: { lots: LiveLot[]; activeLotId: string | null; onOpen: (l: LiveLot) => void }) {
  if (!lots.length) return null;
  return (
    <View style={s.panel}>
      <Text style={s.kicker}>ALL LOTS IN THIS AUCTION ({lots.length})</Text>
      {lots.map((l, idx) => {
        const st = statusOf(l, activeLotId);
        const on = l.id === activeLotId;
        return (
          <Pressable key={l.id} onPress={() => onOpen(l)} style={[s.lotRow, on && s.lotRowOn]}>
            {l.photos?.[0]
              ? <Image source={{ uri: l.photos[0] }} style={s.lotRowImg} resizeMode="cover" />
              : <View style={[s.lotRowImg, { alignItems: 'center', justifyContent: 'center' }]}><Text>📷</Text></View>}
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={s.lotRowNo}>LOT {idx + 1}</Text>
              <Text style={s.lotRowTitle} numberOfLines={1}>{l.title}</Text>
              <Text style={[s.lotRowStatus, { color: st.color }]}>{st.text}</Text>
            </View>
            <Text style={{ color: C.sub, fontSize: 22 }}>›</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Pre-live: a photo card for every lot, so clients can browse before the auction starts.
export function LotGrid({ lots, onOpen, columns }: { lots: LiveLot[]; onOpen: (l: LiveLot) => void; columns: number }) {
  const w = `${100 / columns - 2}%` as any;
  return (
    <View style={s.grid}>
      {lots.map((l, idx) => (
        <Pressable key={l.id} onPress={() => onOpen(l)} style={[s.gridCard, { width: w }]}>
          <View style={s.gridImgWrap}>
            {l.photos?.[0]
              ? <Image source={{ uri: l.photos[0] }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
              : <Text style={{ fontSize: 30 }}>📷</Text>}
            {(l.photos?.length ?? 0) > 1 && (
              <View style={s.photoCount}><Text style={s.photoCountTxt}>📷 {l.photos!.length}</Text></View>
            )}
          </View>
          <View style={{ padding: 14 }}>
            <Text style={s.lotRowNo}>LOT {idx + 1}</Text>
            <Text style={s.gridTitle} numberOfLines={2}>{l.title}</Text>
            <Text style={s.gridBid}>Opening bid {formatZAR(l.starting_bid)}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  // photo viewer (stays dark: photos read best on black)
  vBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  vClose: { position: 'absolute', top: 16, right: 16, zIndex: 10, width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  vCloseTxt: { color: '#fff', fontSize: 22 },
  vStage: { flex: 1, marginTop: 70, marginBottom: 8, alignItems: 'center', justifyContent: 'center' },
  vImg: { width: '100%', height: '100%' },
  vCaption: { paddingHorizontal: 20, paddingBottom: 28, alignItems: 'center' },
  vTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  vSub: { color: 'rgba(255,255,255,0.75)', fontSize: 15, marginTop: 4 },
  vDesc: { color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 22, marginTop: 8, textAlign: 'center', maxWidth: 560 },
  arrow: { position: 'absolute', top: '45%', width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  arrowTxt: { color: '#fff', fontSize: 28, lineHeight: 32 },

  // gallery
  galleryMain: { width: '100%', aspectRatio: 4 / 3, maxHeight: 460, backgroundColor: '#F4F8F7', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: C.line },
  zoomHint: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(23,41,61,0.8)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  zoomHintTxt: { color: '#fff', fontSize: 12 },
  thumb: { width: 68, height: 68, borderRadius: 10, overflow: 'hidden', borderWidth: 3, borderColor: 'transparent', opacity: 0.8 },
  thumbOn: { borderColor: C.orange, opacity: 1 },

  // panels
  panel: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 20, marginBottom: 16 },
  kicker: { color: C.sub, fontSize: 12.5, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
  panelTitle: { color: C.ink, fontSize: 24, fontWeight: '800', lineHeight: 30 },
  price: { color: C.ink, fontSize: 58, fontWeight: '900', lineHeight: 64, letterSpacing: -1 },
  leading: { color: C.sub, fontSize: 16, fontWeight: '600', marginTop: 4 },
  noBids: { color: C.sub, fontSize: 16, marginTop: 4 },
  box: { borderRadius: 14, padding: 16, marginTop: 16 },
  boxGood: { backgroundColor: C.greenBg },
  boxBad: { backgroundColor: C.redBg, marginBottom: 4 },
  boxNeutral: { backgroundColor: '#EEF3F2' },
  boxTitle: { fontSize: 20, fontWeight: '800' },
  boxSub: { color: C.ink, fontSize: 15.5, lineHeight: 22, marginTop: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 20 },
  stepBtn: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E3EDEB', alignItems: 'center', justifyContent: 'center' },
  stepTxt: { color: C.ink, fontSize: 34, fontWeight: '700', lineHeight: 38 },
  stepLabel: { color: C.sub, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  stepAmt: { color: C.ink, fontSize: 32, fontWeight: '900' },
  stepHint: { color: C.sub, fontSize: 14, textAlign: 'center', marginTop: 8 },
  bidBtn: { backgroundColor: C.orange, borderRadius: 18, minHeight: 68, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  bidBtnTxt: { color: C.ink, fontSize: 24, fontWeight: '900', letterSpacing: 0.4 },
  msg: { marginTop: 12, fontSize: 16, fontWeight: '700', textAlign: 'center' },

  // bid history
  bidRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.line },
  bidRowTop: { borderTopWidth: 0 },
  bidName: { color: C.ink, fontSize: 17, fontWeight: '700' },
  bidTime: { color: C.sub, fontSize: 13.5, marginTop: 1 },
  bidAmt: { color: C.ink, fontSize: 20, fontWeight: '800' },

  // lots list
  lotRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 8, borderRadius: 14, marginTop: 4 },
  lotRowOn: { backgroundColor: C.orangeSoft },
  lotRowImg: { width: 72, height: 72, borderRadius: 12, backgroundColor: '#EEF3F2' },
  lotRowNo: { color: C.sub, fontSize: 12, fontWeight: '800', letterSpacing: 1.2 },
  lotRowTitle: { color: C.ink, fontSize: 17, fontWeight: '700', marginTop: 1 },
  lotRowStatus: { fontSize: 14, fontWeight: '700', marginTop: 2 },

  // pre-live grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, justifyContent: 'flex-start' },
  gridCard: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: 18, overflow: 'hidden' },
  gridImgWrap: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#F4F8F7', alignItems: 'center', justifyContent: 'center' },
  gridTitle: { color: C.ink, fontSize: 18, fontWeight: '800', marginTop: 2, minHeight: 44 },
  gridBid: { color: C.orangeDark, fontSize: 15.5, fontWeight: '800', marginTop: 6 },
  photoCount: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(23,41,61,0.8)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  photoCountTxt: { color: '#fff', fontSize: 12 },
});
