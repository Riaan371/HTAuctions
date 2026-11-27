import { View, Text, TextInput, Pressable, ActivityIndicator, Alert, Platform, StyleSheet, ScrollView, Image, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/auth-store';
import { Colors } from '../../lib/theme';
import { getAgoraToken, markSessionLive, markSessionEnded, HOST_UID } from '../../lib/agora';
import { formatZAR } from '../../components/LotCard';
import { confirmAsync } from '../../lib/admin-utils';
import { C, PhotoViewer, LotGallery, BidPanel, BidHistory, LotsList, LotGrid, SourceTag, isRoom, bidderName, type LiveLot, type LiveBid } from '../../components/LiveViewerParts';
import { fetchLotFeed, friendlyBidError, addRoomBid, undoLastRoomBid, rand } from '../../lib/room-bids';

const APP_ID = process.env.EXPO_PUBLIC_AGORA_APP_ID ?? '';
const VIDEO_ID = 'agora-video';
type AgoraClient = any;
type AgoraTrack = any;
type Device = { deviceId: string; label: string };

function friendlyMediaError(raw: string): string {
  if (raw.includes('PERMISSION_DENIED') || raw.includes('NotAllowedError')) {
    return 'Camera or microphone access is blocked. Click the padlock icon in your browser address bar, set Camera and Microphone to "Allow", then refresh this page and try again.';
  }
  if (raw.includes('NotFoundError') || raw.includes('DevicesNotFoundError')) {
    return 'No camera or microphone was found on this device. Connect one and try again.';
  }
  return raw;
}

function DevicePicker({ label, devices, value, onPick }: { label: string; devices: Device[]; value: string | null; onPick: (id: string) => void }) {
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={s.pickerLabel}>{label}</Text>
      <View style={s.chipWrap}>
        {devices.map((d) => {
          const on = d.deviceId === value;
          return (
            <Pressable key={d.deviceId} onPress={() => onPick(d.deviceId)} style={[s.chip, on && s.chipOn]}>
              <Text style={[s.chipTxt, on && s.chipTxtOn]} numberOfLines={1}>{d.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function LiveRoom() {
  const { auctionId } = useLocalSearchParams<{ auctionId: string }>();
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const queryClient = useQueryClient();

  const isHost = profile?.role === 'auctioneer' || profile?.role === 'super_admin';
  const clientRef = useRef<AgoraClient>(null);
  const micTrackRef = useRef<AgoraTrack>(null);
  const camTrackRef = useRef<AgoraTrack>(null);
  const remoteAudioRef = useRef<Set<any>>(new Set());
  const remoteVideoRef = useRef<AgoraTrack>(null);

  // Agora's track.close() doesn't always stop the underlying native
  // MediaStreamTrack reliably — stop it directly so the browser/OS
  // camera and microphone-in-use indicators actually clear.
  function hardStop(ref: { current: AgoraTrack }) {
    const track = ref.current;
    if (track) {
      try { track.getMediaStreamTrack?.()?.stop(); } catch {}
      try { track.close(); } catch {}
    }
    ref.current = null;
  }

  function stopRemoteMedia() {
    remoteAudioRef.current.forEach((track) => track?.stop());
    remoteAudioRef.current.clear();
    try { remoteVideoRef.current?.stop(); } catch {}
    remoteVideoRef.current = null;
    setRemoteVideoOn(false);
  }

  const [status, setStatus] = useState<'idle' | 'joining' | 'live' | 'ended'>('idle');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [remoteVideoOn, setRemoteVideoOn] = useState(false);
  const [cameras, setCameras] = useState<Device[]>([]);
  const [mics, setMics] = useState<Device[]>([]);
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [micId, setMicId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const [lotIndex, setLotIndex] = useState(0);
  const [roomMsg, setRoomMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [roomBusy, setRoomBusy] = useState(false);
  const [roomCustom, setRoomCustom] = useState('');

  // Track the session's real status (scheduled/live/ended) regardless — used to gate bidder access
  const { data: sessionInfo } = useQuery({
    queryKey: ['live-session-status', auctionId],
    queryFn: async () => {
      const { data } = await supabase
        .from('live_sessions').select('status, scheduled_at, title, lot_ids')
        .eq('auction_id', auctionId).maybeSingle();
      return data;
    },
    refetchInterval: 5000,
  });

  const sessionIsLive = sessionInfo?.status === 'live';
  const canAccess = isHost || sessionIsLive;

  // Safeguard for viewers: if the polled session status flips away from 'live'
  // (host ended the session), force-stop remote media and leave the channel
  // even if Agora's own unpublish/left events were missed.
  useEffect(() => {
    if (!isHost && sessionInfo?.status === 'ended' && clientRef.current) {
      stopRemoteMedia();
      clientRef.current.leave().catch(() => {});
      setStatus('ended');
    }
  }, [isHost, sessionInfo?.status]);

  const { data: liveSession } = useQuery({
    queryKey: ['live-session-detail', auctionId],
    queryFn: async () => {
      const { data } = await supabase
        .from('live_sessions').select('lot_ids, current_lot_index, title')
        .eq('auction_id', auctionId).eq('status', 'live').maybeSingle();
      return data;
    },
    enabled: canAccess,
    refetchInterval: 3000,
  });

  // Everyone follows the auctioneer's current lot as it changes on the server.
  useEffect(() => {
    const idx = liveSession?.current_lot_index;
    if (idx != null) setLotIndex(idx);
  }, [liveSession?.current_lot_index]);

  const activeLotId = liveSession?.lot_ids?.[lotIndex] ?? null;

  const { data: currentLot } = useQuery({
    queryKey: ['live-lot', auctionId, activeLotId],
    queryFn: async () => {
      if (activeLotId) {
        const { data } = await supabase.from('lots').select('id, title, description, current_bid, starting_bid, increment, photos, closed, no_sale, winner_id').eq('id', activeLotId).single();
        return data as LiveLot | null;
      }
      const { data } = await supabase
        .from('lots').select('id, title, description, current_bid, starting_bid, increment, photos, closed, no_sale, winner_id')
        .eq('auction_id', auctionId).is('winner_id', null)
        .order('created_at').limit(1).maybeSingle();
      return data as LiveLot | null;
    },
    enabled: canAccess,
    refetchInterval: 3000,
    placeholderData: (prev) => prev, // keep showing the previous lot while the next one loads (no flicker)
  });

  const totalLots = liveSession?.lot_ids?.length ?? 0;

  // Every lot in this auction, in running order — drives the pre-live photo
  // browser and the "all lots" list during the auction.
  const lotIds: string[] | null = (liveSession?.lot_ids ?? sessionInfo?.lot_ids) ?? null;
  const { data: allLots } = useQuery({
    queryKey: ['live-all-lots', auctionId, (lotIds ?? []).join(',')],
    queryFn: async () => {
      let q = supabase.from('lots').select('id, title, description, photos, starting_bid, current_bid, increment, category, closed, no_sale, winner_id');
      q = lotIds?.length ? q.in('id', lotIds) : q.eq('auction_id', auctionId);
      const { data } = await q;
      const rows = (data ?? []) as LiveLot[];
      if (lotIds?.length) rows.sort((a, b) => lotIds.indexOf(a.id) - lotIds.indexOf(b.id));
      return rows;
    },
    refetchInterval: 6000,
  });

  // Every bid on the lot that is on the block, online AND from the room, highest first.
  const bidLotId = currentLot?.id ?? null;
  const { data: liveBids } = useQuery({
    queryKey: ['live-bids', bidLotId],
    queryFn: () => fetchLotFeed(bidLotId as string),
    enabled: !!bidLotId && canAccess,
    refetchInterval: 2500,
  });

  const { width: winWidth } = useWindowDimensions();
  const wide = winWidth >= 900;
  const [viewLot, setViewLot] = useState<LiveLot | null>(null);

  // Place a bid straight from the live screen so the viewer never leaves the video.
  // Returns null on success, or a message to show the bidder.
  async function placeBidAmount(amount: number): Promise<string | null> {
    if (!session) return 'Please log in to bid.';
    if (!currentLot) return 'No lot is on the block right now.';
    if (currentLot.closed || currentLot.winner_id || currentLot.no_sale) return 'Bidding on this lot has closed.';
    // Re-check the latest price just before inserting. It may have moved: another bidder, or a bid in the room.
    const feed = await fetchLotFeed(currentLot.id);
    const latest = feed[0];
    if (latest && !isRoom(latest) && latest.bidder_id === session.user.id) {
      queryClient.invalidateQueries({ queryKey: ['live-bids'] });
      return 'You are already the highest bidder.';
    }
    if (latest && amount <= latest.amount) {
      queryClient.invalidateQueries({ queryKey: ['live-bids'] });
      return `${isRoom(latest) ? 'A bid was just made in the room' : 'Someone just bid'}: ${rand(latest.amount)}. Please bid again.`;
    }
    const { error: bidErr } = await supabase.from('bids').insert({ lot_id: currentLot.id, bidder_id: session.user.id, amount });
    if (bidErr) {
      queryClient.invalidateQueries({ queryKey: ['live-bids'] });
      const friendly = friendlyBidError(bidErr.message);
      if (friendly) return friendly;
      if (/row-level security|policy/i.test(bidErr.message)) return 'Your account has not been approved to bid yet. Please contact HT Auctions.';
      return bidErr.message;
    }
    queryClient.invalidateQueries({ queryKey: ['live-bids'] });
    queryClient.invalidateQueries({ queryKey: ['live-lot'] });
    return null;
  }

  // Lot changes are always applied relative to what the SERVER says is on the
  // block (not a local counter), and extra taps while a change is in flight are
  // ignored — so a double-tap or a slow connection can never skip lots.
  const changingLotRef = useRef(false);
  async function setServerLot(target: number) {
    if (changingLotRef.current) return;
    if (target < 0 || target >= totalLots) return;
    changingLotRef.current = true;
    setLotIndex(target);
    try {
      const { error: e } = await supabase.from('live_sessions').update({ current_lot_index: target })
        .eq('auction_id', auctionId).eq('status', 'live');
      if (e) Alert.alert('Could not change lot', e.message);
      queryClient.invalidateQueries({ queryKey: ['live-session-detail', auctionId] });
    } finally {
      setTimeout(() => { changingLotRef.current = false; }, 800);
    }
  }

  async function serverLotIndex(): Promise<number> {
    const { data } = await supabase.from('live_sessions').select('current_lot_index')
      .eq('auction_id', auctionId).eq('status', 'live').maybeSingle();
    return data?.current_lot_index ?? lotIndex;
  }

  async function nextLot() {
    if (changingLotRef.current) return;
    const cur = await serverLotIndex();
    if (cur + 1 >= totalLots) { Alert.alert('Last lot', 'There are no more lots in this auction.'); return; }
    await setServerLot(cur + 1);
  }

  async function prevLot() {
    if (changingLotRef.current) return;
    const cur = await serverLotIndex();
    await setServerLot(cur - 1);
  }

  useEffect(() => {
    const channel = supabase
      .channel(`live-bids-${auctionId}-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bids' }, () => {
        queryClient.invalidateQueries({ queryKey: ['live-lot', auctionId] });
        queryClient.invalidateQueries({ queryKey: ['live-bids'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [auctionId]);

  // Result of the lot on the block, set by the auctioneer.
  const lotClosed = !!(currentLot?.closed || currentLot?.winner_id || currentLot?.no_sale);

  async function closeLot(kind: 'online' | 'room' | 'nosale') {
    if (!currentLot) return;
    const top = liveBids?.[0];
    let patch: Record<string, unknown>;
    if (kind === 'online') {
      if (!top || isRoom(top)) return;
      patch = { closed: true, no_sale: false, winner_id: top.bidder_id, current_bid: top.amount };
    } else if (kind === 'room') {
      patch = { closed: true, no_sale: false, winner_id: null, ...(top && isRoom(top) ? { current_bid: top.amount } : {}) };
    } else {
      patch = { closed: true, no_sale: true, winner_id: null };
    }
    const { error: e } = await supabase.from('lots').update(patch).eq('id', currentLot.id);
    if (e) { Alert.alert('Could not update the lot', e.message); return; }
    queryClient.invalidateQueries({ queryKey: ['live-lot'] });
    queryClient.invalidateQueries({ queryKey: ['live-all-lots'] });
  }

  // Bid clerk: record a bid that was made in the room.
  async function placeRoomBid(amount: number) {
    if (!currentLot || roomBusy) return;
    setRoomBusy(true); setRoomMsg(null);
    const err = await addRoomBid(currentLot.id, amount);
    setRoomBusy(false);
    queryClient.invalidateQueries({ queryKey: ['live-bids'] });
    if (err) { setRoomMsg({ text: err, ok: false }); return; }
    setRoomCustom('');
    setRoomMsg({ text: `Room bid recorded: ${rand(amount)}`, ok: true });
    setTimeout(() => setRoomMsg(null), 3000);
  }

  async function undoRoomBid() {
    if (!currentLot) return;
    const ok = await confirmAsync('Remove the last room bid?', 'Use this only if the amount was typed wrongly. The price goes back to the bid before it.', 'Remove');
    if (!ok) return;
    const err = await undoLastRoomBid(currentLot.id);
    queryClient.invalidateQueries({ queryKey: ['live-bids'] });
    setRoomMsg(err ? { text: err, ok: false } : { text: 'Last room bid removed', ok: true });
  }

  async function reopenLot() {
    if (!currentLot) return;
    const { error: e } = await supabase.from('lots').update({ closed: false, no_sale: false, winner_id: null }).eq('id', currentLot.id);
    if (e) { Alert.alert('Could not reopen the lot', e.message); return; }
    queryClient.invalidateQueries({ queryKey: ['live-lot'] });
    queryClient.invalidateQueries({ queryKey: ['live-all-lots'] });
  }

  // Host: list cameras/microphones (asks the browser for permission) and show a
  // local preview. A capture card or USB mixer appears here as just another device.
  async function setupDevices() {
    if (Platform.OS !== 'web') return;
    setError(null);
    try {
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      const cams = await AgoraRTC.getCameras();
      const mcs = await AgoraRTC.getMicrophones();
      setCameras(cams.map((d: any) => ({ deviceId: d.deviceId, label: d.label || 'Camera' })));
      setMics(mcs.map((d: any) => ({ deviceId: d.deviceId, label: d.label || 'Microphone' })));
      const camId = cameraId ?? cams[0]?.deviceId ?? null;
      setCameraId(camId);
      setMicId(micId ?? mcs[0]?.deviceId ?? null);
      if (camId && !camTrackRef.current) {
        const cam = await AgoraRTC.createCameraVideoTrack({ cameraId: camId, encoderConfig: '720p_2' });
        camTrackRef.current = cam;
        cam.play(VIDEO_ID, { fit: 'contain', mirror: false });
      }
      setPreviewing(!!camTrackRef.current);
      if (!cams.length) setError('No camera found. You can still go live with audio only.');
    } catch (e: any) {
      setError(friendlyMediaError(e?.message ?? 'Could not access the camera or microphone.'));
    }
  }

  async function pickCamera(id: string) {
    setCameraId(id);
    try { await camTrackRef.current?.setDevice(id); }
    catch (e: any) { setError(friendlyMediaError(e?.message ?? 'Could not switch camera.')); }
  }

  async function pickMic(id: string) {
    setMicId(id);
    try { await micTrackRef.current?.setDevice(id); } catch {}
  }

  async function join() {
    if (Platform.OS !== 'web') {
      Alert.alert('Web only', 'Live video requires the web app for now.');
      return;
    }
    if (!session) { router.push('/(auth)/role'); return; }
    setStatus('joining'); setError(null);

    // 15-second timeout guard so the UI never gets stuck on "Connecting..."
    const timeoutHandle = setTimeout(() => {
      setError('Connection timed out. Check your network and try again.');
      setStatus('idle');
    }, 15000);

    try {
      const role = isHost ? 'publisher' : 'subscriber';
      const { token, appId, uid } = await getAgoraToken(auctionId, role);
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      AgoraRTC.setLogLevel(3); // warnings only
      const client: AgoraClient = AgoraRTC.createClient({ mode: 'live', codec: 'vp8' });
      clientRef.current = client;

      // Viewers only ever play the auctioneer's stream (the fixed host uid);
      // the auctioneer's own device never subscribes to anything.
      if (!isHost) {
        client.on('user-published', async (user: any, mediaType: string) => {
          if (Number(user.uid) !== HOST_UID) return;
          await client.subscribe(user, mediaType);
          if (mediaType === 'audio') { user.audioTrack?.play(); remoteAudioRef.current.add(user.audioTrack); }
          if (mediaType === 'video') {
            remoteVideoRef.current = user.videoTrack;
            user.videoTrack?.play(VIDEO_ID, { fit: 'contain' });
            setRemoteVideoOn(true);
          }
        });
        client.on('user-unpublished', (user: any, mediaType: string) => {
          if (Number(user.uid) !== HOST_UID) return;
          if (mediaType === 'audio') { user.audioTrack?.stop(); remoteAudioRef.current.delete(user.audioTrack); }
          if (mediaType === 'video') { user.videoTrack?.stop(); remoteVideoRef.current = null; setRemoteVideoOn(false); }
        });
        client.on('user-left', (user: any) => {
          if (Number(user.uid) !== HOST_UID) return;
          stopRemoteMedia();
        });
      }

      // Tokens last 6 hours; renew well before they lapse so a long auction never drops.
      const renew = async () => {
        try {
          const fresh = await getAgoraToken(auctionId, role);
          await client.renewToken(fresh.token);
        } catch (e) { console.warn('Token renewal failed', e); }
      };
      client.on('token-privilege-will-expire', renew);
      client.on('token-privilege-did-expire', renew);

      await client.setClientRole(isHost ? 'host' : 'audience');
      await client.join(appId || APP_ID, auctionId, token, uid);

      if (isHost) {
        const mic = await AgoraRTC.createMicrophoneAudioTrack({ ...(micId ? { microphoneId: micId } : {}), encoderConfig: 'music_standard' });
        micTrackRef.current = mic;
        const tracks = [mic];
        if (!camTrackRef.current) {
          try {
            const cam = await AgoraRTC.createCameraVideoTrack({ cameraId: cameraId ?? undefined, encoderConfig: '720p_2' });
            camTrackRef.current = cam;
            cam.play(VIDEO_ID, { fit: 'contain', mirror: false });
            setPreviewing(true);
          } catch (e: any) {
            setError(`Camera could not start, so you are broadcasting audio only. ${friendlyMediaError(e?.message ?? '')}`);
          }
        }
        if (camTrackRef.current) tracks.push(camTrackRef.current);
        await client.publish(tracks);
        await markSessionLive(auctionId, session.user.id);
      }
      clearTimeout(timeoutHandle);
      setStatus('live');
    } catch (e: any) {
      clearTimeout(timeoutHandle);
      hardStop(micTrackRef);
      setError(friendlyMediaError(e.message ?? 'Failed to join'));
      setStatus('idle');
    }
  }

  async function leave() {
    const published = [micTrackRef.current, camTrackRef.current].filter(Boolean);
    if (isHost && clientRef.current && published.length) {
      try { await clientRef.current.unpublish(published); } catch {}
    }
    hardStop(micTrackRef);
    hardStop(camTrackRef);
    setPreviewing(false);
    stopRemoteMedia();
    try { await clientRef.current?.leave(); } catch {}
    if (isHost) {
      try {
        // Close all unsold lots in this session so they disappear from home screen
        if (liveSession?.lot_ids?.length) {
          await supabase
            .from('lots')
            .update({ closed: true, no_sale: true })
            .in('id', liveSession.lot_ids)
            .is('winner_id', null) // only lots not already sold online
            .or('closed.is.null,closed.eq.false'); // and not already given a result (e.g. sold in the room)
        }
        await markSessionEnded(auctionId);
      } catch (e: any) {
        Alert.alert('Error ending session', e.message);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['lots'] });
      queryClient.invalidateQueries({ queryKey: ['live-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['my-sessions'] });
      queryClient.invalidateQueries({ queryKey: ['live-session-status', auctionId] });
      setStatus('ended');
      router.replace(`/report/${auctionId}`);
    } else {
      setStatus('ended');
      router.back();
    }
  }

  async function toggleMic() {
    if (!micTrackRef.current) return;
    await micTrackRef.current.setEnabled(!micOn);
    setMicOn(!micOn);
  }

  async function toggleCam() {
    if (!camTrackRef.current) return;
    await camTrackRef.current.setEnabled(!camOn);
    setCamOn(!camOn);
  }

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    // If the page is closed, refreshed, or the app is backgrounded without
    // tapping "End Session", the React unmount cleanup below never runs and
    // the mic and camera keep publishing until Agora's own connection timeout —
    // which is how a stale broadcast lingers. Force-kill both the instant the
    // page is leaving.
    const forceStop = () => {
      const published = [micTrackRef.current, camTrackRef.current].filter(Boolean);
      try { clientRef.current?.unpublish(published.length ? published : undefined); } catch {}
      hardStop(micTrackRef);
      hardStop(camTrackRef);
      try { clientRef.current?.leave(); } catch {}
    };
    window.addEventListener('pagehide', forceStop);
    window.addEventListener('beforeunload', forceStop);
    return () => {
      window.removeEventListener('pagehide', forceStop);
      window.removeEventListener('beforeunload', forceStop);
      hardStop(micTrackRef);
      hardStop(camTrackRef);
      clientRef.current?.leave().catch(() => {});
    };
  }, []);

  const hasVideo = isHost ? previewing : remoteVideoOn;
  const placeholderText = isHost
    ? 'Your camera preview appears here. Tap "Set up camera and microphone" below.'
    : status === 'live'
      ? 'Waiting for the auctioneer’s video...'
      : 'The auctioneer’s video appears here once you join.';

  // Auctioneer-side pieces: the lot console and the running order of all lots.
  async function goToLot(l: LiveLot) {
    const idx = (lotIds ?? []).indexOf(l.id);
    if (idx < 0) { setViewLot(l); return; }
    await setServerLot(idx);
  }

  async function endAuction() {
    const ok = await confirmAsync(
      'End the auction?',
      'Clients are disconnected and the report becomes available. Lots with no result yet are marked as no sale.',
      'End auction',
    );
    if (ok) leave();
  }

  const bidName = (b: LiveBid) => bidderName(b);
  const hostTop = liveBids?.[0];
  const hostTopRoom = isRoom(hostTop);
  const onlineCount = (liveBids ?? []).filter((b) => !isRoom(b)).length;
  const roomCount = (liveBids ?? []).filter((b) => isRoom(b)).length;
  const hostInc = currentLot?.increment && currentLot.increment > 0 ? currentLot.increment : 100;
  const hostNext = hostTop ? hostTop.amount + hostInc : currentLot?.starting_bid ?? 0;
  const hostBase = hostTop ? hostTop.amount : currentLot?.starting_bid ?? 0;
  const customAmount = Number(roomCustom.replace(/[^0-9]/g, ''));
  const hostConsoleEl = currentLot ? (
    <View style={s.hCard}>
      <Text style={s.hKicker}>LOT {Math.max(1, (lotIds?.indexOf(currentLot.id) ?? lotIndex) + 1)} OF {Math.max(totalLots, 1)} · ON THE BLOCK</Text>
      <Text style={s.hTitle}>{currentLot.title}</Text>

      {(currentLot.photos?.length ?? 0) > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginTop: 12 }}>
          {currentLot.photos!.map((p, i) => (
            <Image key={i} source={{ uri: p }} style={{ width: 92, height: 70, borderRadius: 10, backgroundColor: '#EEF3F2' }} resizeMode="cover" />
          ))}
        </ScrollView>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <Text style={s.hKicker}>{hostTop ? 'HIGHEST BID' : 'OPENING BID'}</Text>
        <SourceTag bid={hostTop} big />
      </View>
      <Text style={s.hPrice}>{formatZAR(hostTop?.amount ?? currentLot.starting_bid)}</Text>
      <Text style={s.hSub}>
        {hostTop ? `${onlineCount} online bid${onlineCount === 1 ? '' : 's'} · ${roomCount} room bid${roomCount === 1 ? '' : 's'}` : 'No bids yet'}
      </Text>

      {(liveBids ?? []).slice(0, 5).map((b, i) => (
        <View key={b.id} style={s.hBidRow}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <SourceTag bid={b} />
            <Text style={[s.hBidName, i === 0 && { color: C.orangeDark }]} numberOfLines={1}>{bidName(b)}</Text>
          </View>
          <Text style={[s.hBidAmt, i === 0 && { color: C.orangeDark }]}>{formatZAR(b.amount)}</Text>
        </View>
      ))}

      {status === 'live' && !lotClosed && (
        <View style={s.roomBox}>
          <Text style={s.roomKicker}>BID FROM THE ROOM</Text>
          <Text style={s.roomHint}>When the auctioneer accepts a bid in the hall, tap it here. It goes on the TV and online bidders see the new price at once.</Text>
          <Pressable onPress={() => placeRoomBid(hostNext)} disabled={roomBusy} style={[s.roomBtn, roomBusy && { opacity: 0.6 }]}>
            <Text style={s.roomBtnTxt}>{hostTop ? 'ROOM BID' : 'ROOM OPENING BID'}  {formatZAR(hostNext)}</Text>
          </Pressable>
          <Text style={s.roomSmall}>Bigger jump:</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[5, 10, 50].map((k) => (
              <Pressable key={k} onPress={() => placeRoomBid(hostBase + hostInc * k)} disabled={roomBusy} style={s.roomChip}>
                <Text style={s.roomChipAmt}>{formatZAR(hostBase + hostInc * k)}</Text>
                <Text style={s.roomChipSub}>+{formatZAR(hostInc * k)}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TextInput
              value={roomCustom} onChangeText={setRoomCustom} keyboardType="numeric" placeholder="Other amount, e.g. 56500"
              placeholderTextColor="#7C8F9A" style={s.roomInput} onSubmitEditing={() => customAmount > 0 && placeRoomBid(customAmount)}
            />
            <Pressable onPress={() => customAmount > 0 && placeRoomBid(customAmount)} disabled={roomBusy || !(customAmount > 0)} style={[s.roomSet, (roomBusy || !(customAmount > 0)) && { opacity: 0.4 }]}>
              <Text style={s.roomSetTxt}>Record</Text>
            </Pressable>
          </View>
          {roomCount > 0 && (
            <Pressable onPress={undoRoomBid} style={{ marginTop: 10, alignSelf: 'flex-start' }}>
              <Text style={s.roomUndo}>Typed it wrongly? Remove the last room bid</Text>
            </Pressable>
          )}
          {roomMsg && <Text style={[s.roomMsg, { color: roomMsg.ok ? C.green : C.red }]}>{roomMsg.text}</Text>}
        </View>
      )}

      {status === 'live' && (
        <View style={{ marginTop: 16, gap: 10 }}>
          {lotClosed ? (
            <>
              <View style={[s.hResultBox, currentLot.winner_id || !currentLot.no_sale ? { backgroundColor: C.greenBg } : { backgroundColor: '#EEF3F2' }]}>
                <Text style={[s.hResult, (currentLot.winner_id || !currentLot.no_sale) && { color: C.green }]}>
                  {currentLot.winner_id
                    ? `SOLD ONLINE to ${liveBids?.find((b) => !isRoom(b) && b.bidder_id === currentLot.winner_id) ? bidName(liveBids.find((b) => !isRoom(b) && b.bidder_id === currentLot.winner_id)!) : 'bidder'} for ${formatZAR(currentLot.current_bid)}`
                    : currentLot.no_sale ? 'NO SALE' : `SOLD IN THE ROOM${hostTop ? ' for ' + formatZAR(hostTop.amount) : ''}`}
                </Text>
              </View>
              <Pressable onPress={reopenLot} style={s.hGhost}><Text style={s.hGhostTxt}>Reopen this lot</Text></Pressable>
            </>
          ) : (
            <>
              <Pressable
                onPress={() => closeLot(hostTopRoom ? 'room' : 'online')} disabled={!hostTop}
                style={[s.hSold, !hostTop && { opacity: 0.35 }]}
              >
                <Text style={s.hSoldTxt}>
                  {!hostTop ? 'SOLD (no bids yet)' : hostTopRoom ? `SOLD IN THE ROOM · ${formatZAR(hostTop.amount)}` : `SOLD ONLINE: ${bidName(hostTop)} · ${formatZAR(hostTop.amount)}`}
                </Text>
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                {!hostTopRoom && (
                  <Pressable
                    onPress={async () => {
                      if (hostTop && !(await confirmAsync('Sold in the room instead?', `The highest bid is an ONLINE bid of ${formatZAR(hostTop.amount)}. Only continue if the room bought it at a price you did not record.`, 'Sold in the room'))) return;
                      closeLot('room');
                    }}
                    style={[s.hGhost, { flex: 1 }]}
                  ><Text style={s.hGhostTxt}>{hostTop ? 'Sold in the room instead' : 'Sold in the room'}</Text></Pressable>
                )}
                <Pressable onPress={() => closeLot('nosale')} style={[s.hGhost, { flex: 1 }]}><Text style={s.hGhostTxt}>No sale</Text></Pressable>
              </View>
            </>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
            <Pressable onPress={prevLot} disabled={lotIndex === 0} style={[s.hGhost, { flex: 1 }, lotIndex === 0 && { opacity: 0.3 }]}>
              <Text style={s.hGhostTxt}>← Previous lot</Text>
            </Pressable>
            <Pressable onPress={nextLot} disabled={lotIndex >= totalLots - 1} style={[s.hNext, { flex: 1 }, lotIndex >= totalLots - 1 && { opacity: 0.3 }]}>
              <Text style={s.hNextTxt}>Next lot →</Text>
            </Pressable>
          </View>
          <Text style={s.hSub}>
            {totalLots > 0 && lotIndex >= totalLots - 1
              ? 'This is the last lot. Press End auction when you are finished.'
              : 'Clients’ photos and price switch to the next lot straight away. You can also tap any lot in the list below to bring it up.'}
          </Text>
        </View>
      )}
    </View>
  ) : status === 'live' ? (
    <View style={s.hCard}>
      <Text style={s.hTitle}>No lots in this auction</Text>
      <Text style={s.hSub}>Add lots from Profile → Lots and details.</Text>
    </View>
  ) : null;
  const hostLotsEl = <LotsList lots={allLots ?? []} activeLotId={status === 'live' ? currentLot?.id ?? null : null} onOpen={status === 'live' ? goToLot : setViewLot} />;

  // Opens the hall-TV page in its own window: drag it to the TV screen and press F for full screen.
  function openTv() {
    if (typeof window !== 'undefined') window.open(`${window.location.origin}/tv/${auctionId}`, 'htauctions-tv', 'popup,width=1280,height=720');
  }

  function goFullscreen() {
    const el: any = typeof document !== 'undefined' ? document.getElementById(VIDEO_ID)?.parentElement : null;
    try { (el?.requestFullscreen ?? el?.webkitRequestFullscreen)?.call(el); } catch {}
  }

  // Client-side pieces, assembled differently for wide (side-by-side) and narrow (stacked) screens.
  const userId = session?.user.id ?? null;
  const lotNumber = currentLot ? Math.max(1, (lotIds?.indexOf(currentLot.id) ?? lotIndex) + 1) : 1;
  const bidPanelEl = currentLot ? (
    <BidPanel
      key={currentLot.id}
      lot={currentLot}
      lotNumber={lotNumber}
      totalLots={lotIds?.length ?? allLots?.length ?? 0}
      bids={liveBids ?? []}
      userId={userId}
      bidStatus={profile?.kyc_status ?? 'pending'}
      onBid={placeBidAmount}
      onLogin={() => router.push('/(auth)/role')}
    />
  ) : (
    <View style={s.waitBanner}>
      <Text style={s.waitTitle}>Waiting for the next lot</Text>
      <Text style={s.waitSub}>The auctioneer will bring up the next lot shortly.</Text>
    </View>
  );
  const historyEl = currentLot ? <BidHistory bids={liveBids ?? []} userId={userId} /> : null;
  const galleryEl = currentLot ? (
    <View style={{ marginBottom: 14 }}>
      <Text style={s.sectionHead}>Photos of this lot</Text>
      <LotGallery key={currentLot.id} lot={currentLot} onOpen={setViewLot} />
    </View>
  ) : null;
  const lotsEl = <LotsList lots={allLots ?? []} activeLotId={currentLot?.id ?? null} onOpen={setViewLot} />;
  const leaveEl = status === 'live' ? (
    <Pressable onPress={leave} style={[s.outlineBtn, s.outlineBtnL, { marginTop: 4, marginBottom: 12 }]}>
      <Text style={[s.outlineBtnTxt, { color: C.ink }]}>Leave auction</Text>
    </Pressable>
  ) : null;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'Live Auction', headerStyle: { backgroundColor: C.ink }, headerTintColor: '#fff', headerLeft: () => (
        <Pressable onPress={() => router.push('/(tabs)/')} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ color: '#fff', fontSize: 15 }}>🏠 Home</Text>
        </Pressable>
      ) }} />

      {!canAccess ? (
        /* ---- Client, auction not live: countdown + photos of every lot ---- */
        <ScrollView style={s.bodyFull} contentContainerStyle={[s.bodyContent, { maxWidth: 1280, width: '100%', alignSelf: 'center' }]}>
          <View style={s.waitBanner}>
            {sessionInfo?.status === 'ended' ? (
              <>
                <Text style={s.waitTitle}>This auction has ended</Text>
                <Text style={s.waitSub}>Thank you for joining. Watch the home screen for the next live auction.</Text>
              </>
            ) : (
              <>
                <Text style={s.waitKicker}>LIVE AUCTION</Text>
                <Text style={s.waitTitle}>{sessionInfo?.title ?? 'Live Auction'}</Text>
                {sessionInfo?.scheduled_at && (
                  <Text style={s.waitWhen}>
                    {new Date(sessionInfo.scheduled_at).toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    {'  ·  '}
                    {new Date(sessionInfo.scheduled_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false })}
                  </Text>
                )}
                <Text style={s.waitSub}>
                  Live video and bidding open when the auction starts. Browse the lots below. This page switches to the live auction by itself.
                </Text>
              </>
            )}
          </View>

          {(allLots?.length ?? 0) > 0 ? (
            <>
              <Text style={s.sectionHead}>Lots in this auction ({allLots!.length})</Text>
              <LotGrid lots={allLots!} onOpen={setViewLot} columns={wide ? 3 : 1} />
            </>
          ) : (
            <Text style={[s.waitSub, { textAlign: 'center' }]}>The lots for this auction will appear here.</Text>
          )}

          <Pressable onPress={() => router.push('/(tabs)/')} style={[s.outlineBtn, s.outlineBtnL, { marginTop: 20 }]}>
            <Text style={[s.outlineBtnTxt, { color: C.ink }]}>← Back to Home</Text>
          </Pressable>
          <PhotoViewer key={viewLot?.id ?? 'none'} lot={viewLot} onClose={() => setViewLot(null)} />
        </ScrollView>
      ) : !isHost ? (
        /* ---- Client, auction live: video + sound, bidding, bid history, photos ---- */
        <ScrollView style={s.bodyFull} contentContainerStyle={[s.bodyContent, { maxWidth: 1600, width: '100%', alignSelf: 'center' }]}>
          <View style={wide ? s.wideRow : undefined}>
            <View style={wide ? s.colMain : undefined}>
              <View style={s.liveRow}>
                {status === 'live' ? (
                  <>
                    <View style={s.liveDot} />
                    <Text style={[s.liveTxt, { color: '#C8261F', fontSize: 15 }]}>LIVE</Text>
                    <Text style={s.liveTitle} numberOfLines={1}>{sessionInfo?.title ?? ''}</Text>
                  </>
                ) : (
                  <Text style={{ color: C.ink, fontSize: 16 }}>{sessionInfo?.title ?? 'Live Auction'} is on air</Text>
                )}
              </View>

              {/* Live video. The first View stays childless: Agora injects the <video> into it. */}
              <View style={[s.videoWrap, !wide && s.videoWrapFull]}>
                <View id={VIDEO_ID} style={s.video} />
                {hasVideo && Platform.OS === 'web' && (
                  <Pressable onPress={goFullscreen} style={s.fsBtn}>
                    <Text style={s.fsTxt}>⛶ Full screen</Text>
                  </Pressable>
                )}
                {!hasVideo && status === 'idle' && (
                  <View style={s.videoOverlay}>
                    <Pressable onPress={join} style={s.joinBtn}>
                      <Text style={s.joinBtnTxt}>▶  Watch & listen live</Text>
                    </Pressable>
                    <Text style={s.joinHint}>Tap to start the video and sound</Text>
                  </View>
                )}
                {!hasVideo && status === 'joining' && (
                  <View style={s.videoOverlay}>
                    <ActivityIndicator color={Colors.primary} />
                    <Text style={s.joinHint}>Connecting…</Text>
                  </View>
                )}
                {!hasVideo && status === 'live' && (
                  <View style={s.videoPlaceholder}>
                    <Text style={s.videoPlaceholderTxt}>Waiting for the auctioneer's video…</Text>
                  </View>
                )}
              </View>

              {error && (
                <View style={[s.errorBox, { backgroundColor: C.redBg, borderColor: '#F2B8B5' }]}>
                  <Text style={[s.errorTxt, { color: C.red, fontSize: 15 }]}>{error}</Text>
                </View>
              )}

              {!wide && bidPanelEl}
              {!wide && historyEl}
              {galleryEl}
              {lotsEl}
              {!wide && leaveEl}
            </View>

            {wide && (
              <View style={s.colSide}>
                {bidPanelEl}
                {historyEl}
                {leaveEl}
              </View>
            )}
          </View>
          <PhotoViewer key={viewLot?.id ?? 'none'} lot={viewLot} onClose={() => setViewLot(null)} />
        </ScrollView>
      ) : (
      <ScrollView style={s.bodyFull} contentContainerStyle={[s.bodyContent, { maxWidth: 1600, width: '100%', alignSelf: 'center' }]}>
        <View style={wide ? s.wideRow : undefined}>
          <View style={wide ? s.colMain : undefined}>
            <View style={s.liveRow}>
              {status === 'live' ? (
                <>
                  <View style={s.liveDot} />
                  <Text style={[s.liveTxt, { color: '#C8261F', fontSize: 15 }]}>ON AIR</Text>
                  <Text style={s.liveTitle} numberOfLines={1}>{sessionInfo?.title ?? ''}</Text>
                </>
              ) : (
                <Text style={s.liveTitle} numberOfLines={1}>{sessionInfo?.title ?? 'Live auction'} · not on air yet</Text>
              )}
            </View>

            {/* Live video. The first View stays childless: Agora injects the <video> into it. */}
            <View style={[s.videoWrap, !wide && s.videoWrapFull]}>
              <View id={VIDEO_ID} style={s.video} />
              {!hasVideo && (
                <View style={s.videoPlaceholder}>
                  <Text style={s.videoPlaceholderTxt}>{placeholderText}</Text>
                </View>
              )}
            </View>

            {error && (
              <View style={[s.errorBox, { backgroundColor: C.redBg, borderColor: '#F2B8B5' }]}>
                <Text style={[s.errorTxt, { color: C.red, fontSize: 15 }]}>{error}</Text>
              </View>
            )}

            {status === 'idle' && (
              <View style={s.hPanel}>
                <Text style={s.hStep}>STEP 1</Text>
                <Text style={s.hH}>Choose your camera and microphone</Text>
                <Pressable onPress={setupDevices} style={s.hOutline}>
                  <Text style={s.hOutlineTxt}>{cameras.length || mics.length ? 'Refresh the list' : 'Turn on camera and microphone'}</Text>
                </Pressable>
                {cameras.length > 0 && <DevicePicker label="CAMERA" devices={cameras} value={cameraId} onPick={pickCamera} />}
                {mics.length > 0 && <DevicePicker label="MICROPHONE" devices={mics} value={micId} onPick={pickMic} />}

                <Text style={[s.hStep, { marginTop: 26 }]}>STEP 2</Text>
                <Text style={s.hH}>Go on air</Text>
                <Text style={s.hP}>Clients see the auction go live the moment you press the button. Wear headphones so the microphone does not pick up the speakers.</Text>
                <Pressable onPress={join} style={s.hStart}>
                  <Text style={s.hStartTxt}>Start live session</Text>
                </Pressable>
                <Pressable onPress={openTv} style={[s.hOutline, { marginTop: 12 }]}>
                  <Text style={s.hOutlineTxt}>Open the TV screen for the hall</Text>
                </Pressable>
                <Pressable onPress={() => router.replace('/(tabs)/profile')} style={[s.hOutline, { marginTop: 12 }]}>
                  <Text style={s.hOutlineTxt}>← Back to profile</Text>
                </Pressable>
              </View>
            )}

            {status === 'joining' && (
              <View style={s.hPanel}>
                <ActivityIndicator color={C.orange} />
                <Text style={[s.hP, { textAlign: 'center', marginTop: 8 }]}>Going on air…</Text>
              </View>
            )}

            {status === 'live' && (
              <View style={s.hPanel}>
                <Text style={s.hP}>
                  {`${micOn ? 'Microphone on' : 'Microphone muted'} · ${camTrackRef.current ? (camOn ? 'Camera on' : 'Camera off') : 'No camera (audio only)'}`}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
                  <Pressable onPress={toggleMic} style={[s.hCtl, !micOn && s.hCtlOff]}>
                    <Text style={[s.hCtlTxt, !micOn && { color: C.red }]}>{micOn ? 'Mute microphone' : 'Unmute microphone'}</Text>
                  </Pressable>
                  {camTrackRef.current && (
                    <Pressable onPress={toggleCam} style={[s.hCtl, !camOn && s.hCtlOff]}>
                      <Text style={[s.hCtlTxt, !camOn && { color: C.red }]}>{camOn ? 'Turn camera off' : 'Turn camera on'}</Text>
                    </Pressable>
                  )}
                  <Pressable onPress={openTv} style={s.hCtl}>
                    <Text style={s.hCtlTxt}>TV screen</Text>
                  </Pressable>
                  <Pressable onPress={endAuction} style={s.hEnd}>
                    <Text style={s.hEndTxt}>End auction</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {!wide && hostConsoleEl}
            {!wide && hostLotsEl}
          </View>

          {wide && (
            <View style={s.colSide}>
              {hostConsoleEl}
              {hostLotsEl}
            </View>
          )}
        </View>
        <PhotoViewer key={viewLot?.id ?? 'none'} lot={viewLot} onClose={() => setViewLot(null)} />
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, width: '100%', maxWidth: 960, alignSelf: 'center' },
  bodyFull: { flex: 1, width: '100%' },
  bodyContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  liveRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444', marginRight: 8 },
  liveTxt: { color: '#ef4444', fontWeight: '800', fontSize: 13, letterSpacing: 2, marginRight: 12 },
  videoWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 14, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  video: { width: '100%', height: '100%' },
  videoPlaceholder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 20, pointerEvents: 'none' },
  videoPlaceholderTxt: { color: 'rgba(255,255,255,0.55)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  setupBox: { marginBottom: 18 },
  pickerLabel: { color: C.sub, fontSize: 12.5, fontWeight: '800', letterSpacing: 1.2, marginBottom: 6 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', borderRadius: 99, paddingHorizontal: 14, paddingVertical: 9, maxWidth: '100%' },
  chipOn: { backgroundColor: C.orange, borderColor: C.orange },
  chipTxt: { color: C.ink, fontSize: 14, fontWeight: '600' },
  chipTxtOn: { color: C.ink, fontWeight: '800' },
  lotCard: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20, overflow: 'hidden', marginBottom: 20 },
  lotCounter: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 2 },
  lotLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  lotTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  lotBid: { color: Colors.primary, fontSize: 26, fontWeight: '800', marginTop: 8 },
  bidBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  bidBtnTxt: { color: Colors.navy, fontWeight: '700', fontSize: 15 },
  lotNav: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  navNext: { backgroundColor: '#E8742C' },
  hPanel: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 20, marginBottom: 16 },
  hStep: { color: C.orangeDark, fontSize: 12.5, fontWeight: '800', letterSpacing: 1.4 },
  hH: { color: C.ink, fontSize: 21, fontWeight: '800', marginTop: 2, marginBottom: 12 },
  hP: { color: C.sub, fontSize: 15.5, lineHeight: 23 },
  hOutline: { borderWidth: 1.5, borderColor: C.ink, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  hOutlineTxt: { color: C.ink, fontSize: 16, fontWeight: '800' },
  hStart: { backgroundColor: C.orange, borderRadius: 16, minHeight: 66, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  hStartTxt: { color: C.ink, fontSize: 22, fontWeight: '900' },
  hCtl: { borderWidth: 1.5, borderColor: C.ink, borderRadius: 12, minHeight: 48, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  hCtlOff: { borderColor: C.red, backgroundColor: C.redBg },
  hCtlTxt: { color: C.ink, fontSize: 15, fontWeight: '800' },
  hEnd: { borderWidth: 1.5, borderColor: C.red, borderRadius: 12, minHeight: 48, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  hEndTxt: { color: C.red, fontSize: 15, fontWeight: '800' },
  hCard: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 18, marginBottom: 16 },
  hKicker: { color: C.sub, fontSize: 12.5, fontWeight: '800', letterSpacing: 1.2 },
  hTitle: { color: C.ink, fontSize: 24, fontWeight: '800', marginTop: 4, lineHeight: 30 },
  hPrice: { color: C.ink, fontSize: 48, fontWeight: '900', lineHeight: 54, letterSpacing: -1, marginTop: 2 },
  hSub: { color: C.sub, fontSize: 14.5, lineHeight: 21, marginTop: 4 },
  hBidRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line, marginTop: 2 },
  hBidName: { color: C.ink, fontSize: 16, fontWeight: '700', flex: 1 },
  hBidAmt: { color: C.ink, fontSize: 17, fontWeight: '800' },
  hResultBox: { borderRadius: 14, padding: 14 },
  hResult: { color: C.ink, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  hSold: { backgroundColor: C.green, borderRadius: 14, minHeight: 56, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  hSoldTxt: { color: '#fff', fontSize: 17, fontWeight: '800', textAlign: 'center' },
  hGhost: { borderWidth: 1.5, borderColor: C.ink, borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  hGhostTxt: { color: C.ink, fontSize: 15.5, fontWeight: '800' },
  hNext: { backgroundColor: C.orange, borderRadius: 14, minHeight: 50, alignItems: 'center', justifyContent: 'center' },
  hNextTxt: { color: C.ink, fontSize: 16.5, fontWeight: '900' },
  roomBox: { backgroundColor: '#EEF3F2', borderRadius: 16, padding: 14, marginTop: 16, borderWidth: 2, borderColor: C.ink },
  roomKicker: { color: C.ink, fontSize: 13, fontWeight: '900', letterSpacing: 1.4 },
  roomHint: { color: C.sub, fontSize: 13.5, lineHeight: 19, marginTop: 4, marginBottom: 10 },
  roomBtn: { backgroundColor: C.ink, borderRadius: 14, minHeight: 62, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  roomBtnTxt: { color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center' },
  roomSmall: { color: C.sub, fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  roomChip: { flex: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.ink, borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  roomChipAmt: { color: C.ink, fontSize: 14.5, fontWeight: '900' },
  roomChipSub: { color: C.sub, fontSize: 12, marginTop: 1 },
  roomInput: { flex: 1, borderWidth: 1.5, borderColor: C.line, backgroundColor: '#fff', borderRadius: 12, paddingHorizontal: 12, minHeight: 48, fontSize: 16, color: C.ink },
  roomSet: { backgroundColor: C.orange, borderRadius: 12, paddingHorizontal: 18, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  roomSetTxt: { color: C.ink, fontSize: 15.5, fontWeight: '900' },
  roomUndo: { color: C.red, fontSize: 13.5, fontWeight: '700', textDecorationLine: 'underline' },
  roomMsg: { marginTop: 10, fontSize: 15, fontWeight: '800' },
  hostBidRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' },
  hostBidName: { color: 'rgba(255,255,255,0.85)', fontSize: 15, flex: 1 },
  hostBidAmt: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '700' },
  hostActions: { paddingHorizontal: 14, paddingBottom: 12, gap: 10 },
  hostResult: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center', paddingVertical: 6 },
  hostSold: { backgroundColor: '#16A34A', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  hostSoldTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
  hostGhost: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  hostGhostTxt: { color: '#fff', fontSize: 14.5, fontWeight: '700' },
  navBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  navBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  micStatus: { color: 'rgba(255,255,255,0.4)', fontSize: 12, marginBottom: 14, textAlign: 'center' },
  errorBox: { backgroundColor: 'rgba(220,38,38,0.15)', borderWidth: 1, borderColor: 'rgba(220,38,38,0.3)', borderRadius: 12, padding: 12, marginBottom: 14 },
  errorTxt: { color: '#f87171', fontSize: 13 },
  actionBtn: { backgroundColor: Colors.primary, borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  actionBtnTxt: { color: Colors.navy, fontWeight: '800', fontSize: 16 },
  joiningBox: { backgroundColor: 'rgba(217,164,65,0.15)', borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  outlineBtn: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  outlineBtnTxt: { color: 'rgba(255,255,255,0.8)', fontWeight: '700', fontSize: 15 },
  waitBanner: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line, borderRadius: 20, padding: 24, alignItems: 'center', marginBottom: 18 },
  waitKicker: { color: C.orangeDark, fontSize: 13, fontWeight: '800', letterSpacing: 1.6, marginBottom: 6 },
  waitTitle: { color: C.ink, fontSize: 26, fontWeight: '800', textAlign: 'center' },
  waitWhen: { color: C.ink, fontSize: 19, fontWeight: '700', marginTop: 12, textAlign: 'center' },
  waitSub: { color: C.sub, fontSize: 16, lineHeight: 24, marginTop: 12, textAlign: 'center', maxWidth: 560 },
  sectionHead: { color: C.ink, fontSize: 20, fontWeight: '800', marginBottom: 12 },
  outlineBtnL: { borderColor: C.ink, backgroundColor: '#FFFFFF' },
  wideRow: { flexDirection: 'row', gap: 24, alignItems: 'flex-start' },
  colMain: { flex: 1, minWidth: 0 },
  colSide: { width: 420 },
  videoWrapFull: { width: 'auto', marginHorizontal: -20, borderRadius: 0, borderWidth: 0 },
  fsBtn: { position: 'absolute', right: 10, bottom: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  fsTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  liveTitle: { color: C.ink, fontSize: 16, fontWeight: '700', flex: 1 },
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 20 },
  joinBtn: { backgroundColor: C.orange, borderRadius: 99, paddingVertical: 18, paddingHorizontal: 36 },
  joinBtnTxt: { color: C.ink, fontWeight: '900', fontSize: 20 },
  joinHint: { color: 'rgba(255,255,255,0.85)', fontSize: 15, marginTop: 12 },
  previewLotCard: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  previewLotImg: { width: 100, height: 100 },
  previewLotCat: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  previewLotTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  previewLotBid: { color: Colors.gold, fontSize: 13, fontWeight: '700' },
  previewLockedBadge: { backgroundColor: 'rgba(220,38,38,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 6 },
  previewLockedTxt: { color: '#f87171', fontSize: 10, fontWeight: '700' },
});
