// Building blocks for the CLIENT side of the live auction room:
// photo gallery + full-screen viewer, bid panel, bid history, lot list.
import { View, Text, Image, Pressable, Modal, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { useEffect, useState } from 'react';
import { Colors } from '../lib/theme';
import { formatZAR } from './LotCard';

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
          <View style={s.vStage}><Text style={{ color: 'rgba(255,255,255,0.5)' }}>No photos for this lot</Text></View>
        )}
        <View style={s.vCaption}>
          <Text style={s.vTitle}>{lot?.title}</Text>
          {photos.length > 1 && <Text style={s.vSub}>{i + 1} / {photos.length}</Text>}
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
        <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 6 }}>No photos for this lot</Text>
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

      <Text style={[s.kicker, { marginTop: 14 }]}>{top ? 'CURRENT BID' : 'OPENING BID'}</Text>
      <Text style={s.price}>{formatZAR(top ? top.amount : lot.starting_bid)}</Text>

      {top ? (
        <View style={[s.pill, iAmTop ? s.pillGood : s.pillNeutral]}>
          <Text style={[s.pillTxt, { color: iAmTop ? '#4ade80' : 'rgba(255,255,255,0.85)' }]}>
            {iAmTop ? "🏆 You're the highest bidder" : `Leading: ${bidderName(top)}`}
          </Text>
        </View>
      ) : (
        <Text style={s.noBids}>No bids yet. Be the first!</Text>
      )}
      {!iAmTop && iHaveBid && !closed && (
        <View style={[s.pill, s.pillBad]}><Text style={[s.pillTxt, { color: '#f87171' }]}>You have been outbid</Text></View>
      )}

      {closed ? (
        <View style={[s.closedBox, sold ? s.closedSold : s.closedNoSale]}>
          <Text style={s.closedTxt}>
            {sold ? `SOLD for ${formatZAR(top?.amount ?? lot.current_bid ?? 0)}` : 'NO SALE'}
          </Text>
          {sold && top && <Text style={s.closedSub}>Winning bidder: {bidderName(top)}</Text>}
        </View>
      ) : iAmTop ? (
        // You already lead: no bid controls until someone outbids you.
        <View style={[s.closedBox, s.closedSold]}>
          <Text style={s.closedTxt}>You are the highest bidder</Text>
          <Text style={s.closedSub}>Your bid of {formatZAR(top!.amount)} is leading. You can bid again if someone outbids you.</Text>
        </View>
      ) : (
        <>
          <View style={s.stepper}>
            <Pressable onPress={() => setSteps((n) => Math.max(0, n - 1))} disabled={steps === 0} style={[s.stepBtn, steps === 0 && { opacity: 0.3 }]}>
              <Text style={s.stepTxt}>−</Text>
            </Pressable>
            <Text style={s.stepAmt}>{formatZAR(amount)}</Text>
            <Pressable onPress={() => setSteps((n) => n + 1)} style={s.stepBtn}>
              <Text style={s.stepTxt}>+</Text>
            </Pressable>
          </View>
          <Text style={s.stepHint}>Each step is {formatZAR(inc)}</Text>
          <Pressable onPress={press} disabled={busy} style={[s.bidBtn, busy && { opacity: 0.6 }]}>
            {busy ? <ActivityIndicator color={Colors.navy} /> : <Text style={s.bidBtnTxt}>{userId ? `BID ${formatZAR(amount)}` : 'Log in to bid'}</Text>}
          </Pressable>
        </>
      )}
      {msg && <Text style={[s.msg, { color: msg.ok ? '#4ade80' : '#f87171' }]}>{msg.text}</Text>}
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
              <Text style={[s.bidName, idx === 0 && { color: Colors.gold }]} numberOfLines={1}>
                {userId && b.bidder_id === userId ? 'You' : bidderName(b)}
              </Text>
              <Text style={s.bidTime}>{clock(b.created_at)}</Text>
            </View>
            <Text style={[s.bidAmt, idx === 0 && { color: Colors.gold }]}>{formatZAR(b.amount)}</Text>
          </View>
        ))
      )}
    </View>
  );
}

/* ------------------------------------------------------------------ lots */

function statusOf(l: LiveLot, activeId: string | null): { text: string; color: string } {
  if (l.winner_id) return { text: 'SOLD', color: '#4ade80' };
  if (l.no_sale) return { text: 'NO SALE', color: 'rgba(255,255,255,0.45)' };
  if (activeId && l.id === activeId) return { text: 'ON THE BLOCK', color: Colors.gold };
  return { text: `Opening ${formatZAR(l.starting_bid)}`, color: 'rgba(255,255,255,0.6)' };
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
            <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 20 }}>›</Text>
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
          <View style={{ padding: 12 }}>
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
  // photo viewer
  vBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center' },
  vClose: { position: 'absolute', top: 16, right: 16, zIndex: 10, width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  vCloseTxt: { color: '#fff', fontSize: 20 },
  vStage: { flex: 1, marginTop: 70, marginBottom: 8, alignItems: 'center', justifyContent: 'center' },
  vImg: { width: '100%', height: '100%' },
  vCaption: { paddingHorizontal: 20, paddingBottom: 28, alignItems: 'center' },
  vTitle: { color: '#fff', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  vSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 3 },
  vDesc: { color: 'rgba(255,255,255,0.75)', fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'center', maxWidth: 560 },
  arrow: { position: 'absolute', top: '45%', width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' },
  arrowTxt: { color: '#fff', fontSize: 28, lineHeight: 32 },

  // gallery
  galleryMain: { width: '100%', aspectRatio: 4 / 3, maxHeight: 420, backgroundColor: '#0b0b0b', borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  zoomHint: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  zoomHintTxt: { color: 'rgba(255,255,255,0.85)', fontSize: 11 },
  thumb: { width: 64, height: 64, borderRadius: 8, overflow: 'hidden', borderWidth: 2, borderColor: 'transparent', opacity: 0.7 },
  thumbOn: { borderColor: Colors.gold, opacity: 1 },

  // panels
  panel: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 18, padding: 16, marginBottom: 14 },
  kicker: { color: 'rgba(255,255,255,0.45)', fontSize: 10.5, fontWeight: '700', letterSpacing: 1.4, marginBottom: 6 },
  panelTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  price: { color: Colors.gold, fontSize: 40, fontWeight: '800', marginTop: 2 },
  noBids: { color: 'rgba(255,255,255,0.5)', fontSize: 13, marginTop: 6 },
  pill: { alignSelf: 'flex-start', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8 },
  pillGood: { backgroundColor: 'rgba(22,163,74,0.18)' },
  pillNeutral: { backgroundColor: 'rgba(255,255,255,0.1)' },
  pillBad: { backgroundColor: 'rgba(220,38,38,0.16)' },
  pillTxt: { fontSize: 13, fontWeight: '700' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 },
  stepBtn: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  stepTxt: { color: '#fff', fontSize: 28, fontWeight: '700', lineHeight: 32 },
  stepAmt: { color: '#fff', fontSize: 24, fontWeight: '800' },
  stepHint: { color: 'rgba(255,255,255,0.4)', fontSize: 11.5, textAlign: 'center', marginTop: 6 },
  bidBtn: { backgroundColor: Colors.gold, borderRadius: 16, paddingVertical: 18, alignItems: 'center', marginTop: 14 },
  bidBtnTxt: { color: Colors.navy, fontSize: 19, fontWeight: '900', letterSpacing: 0.5 },
  msg: { marginTop: 10, fontSize: 13.5, fontWeight: '600', textAlign: 'center' },
  closedBox: { borderRadius: 14, padding: 16, marginTop: 16, alignItems: 'center' },
  closedSold: { backgroundColor: 'rgba(22,163,74,0.18)' },
  closedNoSale: { backgroundColor: 'rgba(255,255,255,0.08)' },
  closedTxt: { color: '#fff', fontSize: 20, fontWeight: '900' },
  closedSub: { color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 4 },

  // bid history
  bidRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  bidRowTop: { borderTopWidth: 0 },
  bidName: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  bidTime: { color: 'rgba(255,255,255,0.4)', fontSize: 11.5, marginTop: 1 },
  bidAmt: { color: '#fff', fontSize: 16, fontWeight: '800' },

  // lots list
  lotRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 6, borderRadius: 12, marginTop: 4 },
  lotRowOn: { backgroundColor: 'rgba(217,164,65,0.12)' },
  lotRowImg: { width: 64, height: 64, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.06)' },
  lotRowNo: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1.2 },
  lotRowTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginTop: 1 },
  lotRowStatus: { fontSize: 12, fontWeight: '700', marginTop: 2 },

  // pre-live grid
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, justifyContent: 'flex-start' },
  gridCard: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 16, overflow: 'hidden' },
  gridImgWrap: { width: '100%', aspectRatio: 4 / 3, backgroundColor: '#0b0b0b', alignItems: 'center', justifyContent: 'center' },
  gridTitle: { color: '#fff', fontSize: 16, fontWeight: '800', marginTop: 2, minHeight: 40 },
  gridBid: { color: Colors.gold, fontSize: 13.5, fontWeight: '700', marginTop: 6 },
  photoCount: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  photoCountTxt: { color: '#fff', fontSize: 11 },
});
