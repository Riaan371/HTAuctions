import { View, Text, Pressable, ActivityIndicator, Alert, Platform, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/auth-store';
import { Colors } from '../../lib/theme';
import { getAgoraToken, markSessionLive, markSessionEnded, HOST_UID } from '../../lib/agora';
import { formatZAR } from '../../components/LotCard';
import { PhotoViewer, LotGallery, BidPanel, BidHistory, LotsList, LotGrid, type LiveLot, type LiveBid } from '../../components/LiveViewerParts';

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
  });

  const { data: topBid } = useQuery({
    queryKey: ['live-top-bid', activeLotId],
    queryFn: async () => {
      if (!activeLotId) return null;
      const { data } = await supabase
        .from('bids')
        .select('amount, users(screen_name, full_name)')
        .eq('lot_id', activeLotId)
        .order('amount', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as { amount: number; users: { screen_name: string | null; full_name: string } | null } | null;
    },
    enabled: !!activeLotId && canAccess,
    refetchInterval: 3000,
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

  // Bids on the lot that is on the block (highest first).
  const bidLotId = currentLot?.id ?? null;
  const { data: liveBids } = useQuery({
    queryKey: ['live-bids', bidLotId],
    queryFn: async () => {
      const { data } = await supabase
        .from('bids')
        .select('id, amount, created_at, bidder_id, users(full_name, screen_name)')
        .eq('lot_id', bidLotId)
        .order('amount', { ascending: false })
        .limit(15);
      return (data ?? []) as unknown as LiveBid[];
    },
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
    // Re-check the latest bid just before inserting (another bidder may have beaten us to it).
    const { data: latest } = await supabase
      .from('bids').select('amount').eq('lot_id', currentLot.id)
      .order('amount', { ascending: false }).limit(1).maybeSingle();
    if (latest && amount <= latest.amount) {
      queryClient.invalidateQueries({ queryKey: ['live-bids'] });
      return `Someone just bid ${'R' + Math.round(latest.amount).toLocaleString('en-ZA')}. Please bid again.`;
    }
    const { error: bidErr } = await supabase.from('bids').insert({ lot_id: currentLot.id, bidder_id: session.user.id, amount });
    if (bidErr) {
      if (/row-level security|policy/i.test(bidErr.message)) return 'Your account has not been approved to bid yet. Please contact HT Auctions.';
      return bidErr.message;
    }
    queryClient.invalidateQueries({ queryKey: ['live-bids'] });
    queryClient.invalidateQueries({ queryKey: ['live-lot'] });
    return null;
  }

  async function nextLot() {
    const next = lotIndex + 1;
    if (next >= totalLots) { Alert.alert('Last lot', 'No more lots in this session.'); return; }
    setLotIndex(next);
    await supabase.from('live_sessions').update({ current_lot_index: next }).eq('auction_id', auctionId).eq('status', 'live');
  }

  async function prevLot() {
    const prev = Math.max(0, lotIndex - 1);
    setLotIndex(prev);
    await supabase.from('live_sessions').update({ current_lot_index: prev }).eq('auction_id', auctionId).eq('status', 'live');
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
            .is('winner_id', null); // only lots not already sold
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
      router.replace('/(tabs)/');
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
    <Pressable onPress={leave} style={[s.outlineBtn, { marginTop: 4, marginBottom: 12 }]}>
      <Text style={s.outlineBtnTxt}>Leave auction</Text>
    </Pressable>
  ) : null;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: '#000' }]}>
      <Stack.Screen options={{ headerShown: true, headerTitle: 'Live Auction', headerStyle: { backgroundColor: '#000' }, headerTintColor: '#fff', headerLeft: () => (
        <Pressable onPress={() => router.push('/(tabs)/')} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
          <Text style={{ color: '#fff', fontSize: 15 }}>🏠 Home</Text>
        </Pressable>
      ) }} />

      {!canAccess ? (
        /* ---- Client, auction not live: countdown + photos of every lot ---- */
        <ScrollView style={s.body} contentContainerStyle={[s.bodyContent, wide && { maxWidth: 1180 }]}>
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

          <Pressable onPress={() => router.push('/(tabs)/')} style={[s.outlineBtn, { marginTop: 20 }]}>
            <Text style={s.outlineBtnTxt}>← Back to Home</Text>
          </Pressable>
          <PhotoViewer key={viewLot?.id ?? 'none'} lot={viewLot} onClose={() => setViewLot(null)} />
        </ScrollView>
      ) : !isHost ? (
        /* ---- Client, auction live: video + sound, bidding, bid history, photos ---- */
        <ScrollView style={s.body} contentContainerStyle={[s.bodyContent, wide && { maxWidth: 1180 }]}>
          <View style={wide ? s.wideRow : undefined}>
            <View style={wide ? s.colMain : undefined}>
              <View style={s.liveRow}>
                {status === 'live' ? (
                  <>
                    <View style={s.liveDot} />
                    <Text style={s.liveTxt}>LIVE</Text>
                    <Text style={s.liveTitle} numberOfLines={1}>{sessionInfo?.title ?? ''}</Text>
                  </>
                ) : (
                  <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14 }}>{sessionInfo?.title ?? 'Live Auction'} is on air</Text>
                )}
              </View>

              {/* Live video. The first View stays childless: Agora injects the <video> into it. */}
              <View style={s.videoWrap}>
                <View id={VIDEO_ID} style={s.video} />
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
                <View style={s.errorBox}>
                  <Text style={s.errorTxt}>{error}</Text>
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
      <ScrollView style={s.body} contentContainerStyle={s.bodyContent}>
        {/* Live indicator */}
        <View style={s.liveRow}>
          {status === 'live' ? (
            <>
              <View style={s.liveDot} />
              <Text style={s.liveTxt}>LIVE</Text>
            </>
          ) : (
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
              {isHost ? 'Start your live auction session' : 'Join the live auction'}
            </Text>
          )}
        </View>

        {/* Live video. The first View stays childless: Agora injects the <video> into it. */}
        <View style={s.videoWrap}>
          <View id={VIDEO_ID} style={s.video} />
          {!hasVideo && (
            <View style={s.videoPlaceholder}>
              <Text style={s.videoPlaceholderTxt}>{placeholderText}</Text>
            </View>
          )}
        </View>

        {/* Host: camera and microphone setup before going live */}
        {isHost && status === 'idle' && (
          <View style={s.setupBox}>
            <Pressable onPress={setupDevices} style={s.outlineBtn}>
              <Text style={s.outlineBtnTxt}>{cameras.length || mics.length ? 'Refresh camera and microphone list' : 'Set up camera and microphone'}</Text>
            </Pressable>
            {cameras.length > 0 && <DevicePicker label="CAMERA" devices={cameras} value={cameraId} onPick={pickCamera} />}
            {mics.length > 0 && <DevicePicker label="MICROPHONE" devices={mics} value={micId} onPick={pickMic} />}
          </View>
        )}

        {/* Current lot */}
        {currentLot && (
          <View style={s.lotCard}>
            <View style={{ padding: 14 }}>
              {totalLots > 1 && (
                <Text style={s.lotCounter}>LOT {lotIndex + 1} OF {totalLots}</Text>
              )}
              <Text style={s.lotLabel}>NOW ON THE BLOCK</Text>
              <Text style={s.lotTitle}>{currentLot.title}</Text>
              <Text style={s.lotBid}>{formatZAR(currentLot.current_bid ?? currentLot.starting_bid)}</Text>
              {topBid && (
                <View style={{ backgroundColor: 'rgba(22,163,74,0.15)', borderRadius: 8, padding: 8, marginTop: 4, marginBottom: 4 }}>
                  <Text style={{ color: '#16A34A', fontWeight: '700', fontSize: 13 }}>
                    🏆 Top bidder: {topBid.users?.screen_name ?? topBid.users?.full_name ?? 'Unknown'}
                  </Text>
                </View>
              )}
              {session && (
                <Pressable onPress={() => router.push(`/lot/${currentLot.id}`)} style={[s.bidBtn, isHost && { backgroundColor: '#16A34A' }]}>
                  <Text style={s.bidBtnTxt}>{isHost ? '📋 View Live Bids' : 'Place a Bid'}</Text>
                </Pressable>
              )}
            </View>
            {/* Auctioneer lot navigation */}
            {isHost && status === 'live' && totalLots > 1 && (
              <View style={s.lotNav}>
                <Pressable onPress={prevLot} disabled={lotIndex === 0} style={[s.navBtn, { opacity: lotIndex === 0 ? 0.3 : 1 }]}>
                  <Text style={s.navBtnTxt}>← Prev</Text>
                </Pressable>
                <Pressable onPress={nextLot} disabled={lotIndex >= totalLots - 1} style={[s.navBtn, { opacity: lotIndex >= totalLots - 1 ? 0.3 : 1 }]}>
                  <Text style={s.navBtnTxt}>Next →</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {status === 'live' && (
          <Text style={s.micStatus}>
            {isHost
              ? `${micOn ? 'Microphone on' : 'Microphone muted'} · ${camTrackRef.current ? (camOn ? 'Camera on' : 'Camera off') : 'No camera (audio only)'}`
              : 'Watching and listening live'}
          </Text>
        )}

        {/* Error */}
        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorTxt}>{error}</Text>
          </View>
        )}

        {/* Controls */}
        <View style={{ gap: 12 }}>
          {status === 'idle' && (
            <Pressable onPress={join} style={s.actionBtn}>
              <Text style={s.actionBtnTxt}>{isHost ? 'Start Live Session' : 'Join Live Video'}</Text>
            </Pressable>
          )}
          {status === 'joining' && (
            <View style={s.joiningBox}>
              <ActivityIndicator color={Colors.primary} />
              <Text style={{ color: Colors.primary, fontSize: 13, marginTop: 8 }}>Connecting...</Text>
            </View>
          )}
          {status === 'live' && isHost && (
            <>
              <Pressable onPress={toggleMic} style={[s.outlineBtn, !micOn && { borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                <Text style={s.outlineBtnTxt}>{micOn ? '🎙 Mute Mic' : '🔇 Unmute Mic'}</Text>
              </Pressable>
              {camTrackRef.current && (
                <Pressable onPress={toggleCam} style={[s.outlineBtn, !camOn && { borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)' }]}>
                  <Text style={s.outlineBtnTxt}>{camOn ? 'Turn Camera Off' : 'Turn Camera On'}</Text>
                </Pressable>
              )}
              <Pressable onPress={leave} style={[s.outlineBtn, { borderColor: '#ef4444' }]}>
                <Text style={[s.outlineBtnTxt, { color: '#ef4444' }]}>End Session</Text>
              </Pressable>
            </>
          )}
          {status === 'live' && !isHost && (
            <Pressable onPress={leave} style={s.outlineBtn}>
              <Text style={s.outlineBtnTxt}>Leave</Text>
            </Pressable>
          )}
        </View>

        {isHost && status === 'idle' && (
          <Pressable onPress={leave} style={[s.outlineBtn, { borderColor: '#ef4444', marginTop: 12 }]}>
            <Text style={[s.outlineBtnTxt, { color: '#ef4444' }]}>End Session</Text>
          </Pressable>
        )}
      </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, width: '100%', maxWidth: 960, alignSelf: 'center' },
  bodyContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  liveRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ef4444', marginRight: 8 },
  liveTxt: { color: '#ef4444', fontWeight: '800', fontSize: 13, letterSpacing: 2, marginRight: 12 },
  videoWrap: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000', borderRadius: 14, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  video: { width: '100%', height: '100%' },
  videoPlaceholder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 20, pointerEvents: 'none' },
  videoPlaceholderTxt: { color: 'rgba(255,255,255,0.55)', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  setupBox: { marginBottom: 18 },
  pickerLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 6 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', borderRadius: 99, paddingHorizontal: 12, paddingVertical: 7, maxWidth: '100%' },
  chipOn: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipTxt: { color: 'rgba(255,255,255,0.8)', fontSize: 12.5, fontWeight: '600' },
  chipTxtOn: { color: Colors.navy },
  lotCard: { backgroundColor: 'rgba(255,255,255,0.07)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20, overflow: 'hidden', marginBottom: 20 },
  lotCounter: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 2 },
  lotLabel: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  lotTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  lotBid: { color: Colors.primary, fontSize: 26, fontWeight: '800', marginTop: 8 },
  bidBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
  bidBtnTxt: { color: Colors.navy, fontWeight: '700', fontSize: 15 },
  lotNav: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
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
  waitBanner: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 18 },
  waitKicker: { color: Colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1.6, marginBottom: 6 },
  waitTitle: { color: '#fff', fontSize: 20, fontWeight: '800', textAlign: 'center' },
  waitWhen: { color: Colors.gold, fontSize: 16, fontWeight: '700', marginTop: 10, textAlign: 'center' },
  waitSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13.5, lineHeight: 20, marginTop: 10, textAlign: 'center', maxWidth: 520 },
  sectionHead: { color: '#fff', fontSize: 16, fontWeight: '800', marginBottom: 10 },
  wideRow: { flexDirection: 'row', gap: 24, alignItems: 'flex-start' },
  colMain: { flex: 3, minWidth: 0 },
  colSide: { flex: 2, minWidth: 320 },
  liveTitle: { color: 'rgba(255,255,255,0.7)', fontSize: 14, flex: 1 },
  videoOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 20 },
  joinBtn: { backgroundColor: Colors.gold, borderRadius: 99, paddingVertical: 16, paddingHorizontal: 32 },
  joinBtnTxt: { color: Colors.navy, fontWeight: '900', fontSize: 17 },
  joinHint: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 12 },
  previewLotCard: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 14, overflow: 'hidden', marginBottom: 12 },
  previewLotImg: { width: 100, height: 100 },
  previewLotCat: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  previewLotTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  previewLotBid: { color: Colors.gold, fontSize: 13, fontWeight: '700' },
  previewLockedBadge: { backgroundColor: 'rgba(220,38,38,0.15)', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start', marginTop: 6 },
  previewLockedTxt: { color: '#f87171', fontSize: 10, fontWeight: '700' },
});
