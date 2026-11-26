import { View, Text, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Dimensions, FlatList, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/auth-store';
import { useAppTheme, Colors } from '../../lib/theme';
import { requestNotificationPermission, getNotificationPermission } from '../../lib/onesignal';
import { shouldShowInstallPrompt, markInstallPromptShown } from '../../lib/install-prompt';
import { TIMED_AUCTIONS_ENABLED } from '../../lib/features';
import { C } from '../../components/LiveViewerParts';

const { width: SW } = Dimensions.get('window');
const CATEGORIES = ['Vehicles', 'Plant & Equipment', 'Livestock', 'Property', 'Industrial', 'Household', 'Electronics', 'Collectibles', 'Art & Jewellery'];


async function fetchAuctionEvents() {
  // Live sessions (live + scheduled)
  // (no join to auctions: the session row already carries the title, and the
  // old join asked for a column that doesn't exist, which silently emptied the list)
  const { data: sessions, error: sessionsError } = await supabase
    .from('live_sessions')
    .select('auction_id, title, scheduled_at, status, lot_ids')
    .in('status', ['live', 'scheduled'])
    .order('scheduled_at');
  if (sessionsError) throw new Error(sessionsError.message);

  // Timed auctions — all active ones (end_at may be null or future).
  // Skipped entirely while the app is live-auction-only.
  const { data: timed } = TIMED_AUCTIONS_ENABLED
    ? await supabase
        .from('auctions')
        .select('id, title, end_at, type, status')
        .eq('type', 'timed')
        .eq('status', 'active')
        .order('end_at')
    : { data: [] as any[] };

  const timedMapped = (timed ?? []).map((a: any) => ({
    auction_id: a.id,
    title: a.title,
    scheduled_at: a.end_at,
    status: 'timed',
    lot_ids: null,
    auctions: { title: a.title, end_at: a.end_at, auction_type: 'timed' },
  }));

  return [...(sessions ?? []), ...timedMapped] as any[];
}

async function fetchLotCovers(auctionIds: string[]) {
  if (!auctionIds.length) return {};
  const { data } = await supabase
    .from('lots')
    .select('auction_id, photos, title')
    .in('auction_id', auctionIds)
    .neq('photos', '{}')
    .limit(60);
  // Collect up to 4 photos per auction for the collage
  const map: Record<string, string[]> = {};
  for (const l of data ?? []) {
    if (!l.photos?.[0]) continue;
    if (!map[l.auction_id]) map[l.auction_id] = [];
    if (map[l.auction_id].length < 4) map[l.auction_id].push(l.photos[0]);
  }
  return map;
}

const FALLBACK = 'https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=600&q=80';

function PhotoCollage({ photos }: { photos: string[] }) {
  const p = photos.length;
  if (p === 0) return <Image source={{ uri: FALLBACK }} style={s.eventImgSingle} resizeMode="contain" />;
  if (p === 1) return <Image source={{ uri: photos[0] }} style={s.eventImgSingle} resizeMode="contain" />;
  if (p === 2) return (
    <View style={s.collageRow}>
      <Image source={{ uri: photos[0] }} style={s.collageHalf} resizeMode="contain" />
      <View style={s.collageDivider} />
      <Image source={{ uri: photos[1] }} style={s.collageHalf} resizeMode="contain" />
    </View>
  );
  // 3 or 4 photos: big left + stacked right
  return (
    <View style={s.collageRow}>
      <Image source={{ uri: photos[0] }} style={s.collageBig} resizeMode="contain" />
      <View style={s.collageDivider} />
      <View style={s.collageSmallWrap}>
        <Image source={{ uri: photos[1] }} style={s.collageSmall} resizeMode="contain" />
        <View style={s.collageDividerH} />
        <Image source={{ uri: photos[2] ?? photos[1] }} style={s.collageSmall} resizeMode="contain" />
        {p >= 4 && (
          <>
            <View style={s.collageDividerH} />
            <Image source={{ uri: photos[3] }} style={s.collageSmall} resizeMode="contain" />
          </>
        )}
      </View>
    </View>
  );
}

function timeUntil(isoDate: string): string {
  const diff = new Date(isoDate).getTime() - Date.now();
  if (diff <= 0) return 'Closed';
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `${days}d ${hrs}h remaining`;
  if (hrs > 0) return `${hrs}h ${mins}m remaining`;
  return `${mins}m remaining`;
}

function EventBadge({ isLive, isTimed, inline }: { isLive: boolean; isTimed: boolean; inline?: boolean }) {
  const wrapStyle = inline ? s.badgeInline : s.liveBadge;
  if (isLive) return (
    <View style={wrapStyle}>
      <View style={s.liveDot} />
      <Text style={s.liveBadgeTxt}>LIVE NOW</Text>
    </View>
  );
  if (isTimed) return (
    <View style={[wrapStyle, { backgroundColor: Colors.navy, borderWidth: 1, borderColor: Colors.gold }]}>
      <Text style={[s.liveBadgeTxt, { color: Colors.gold }]}>⏱ TIMED</Text>
    </View>
  );
  return (
    <View style={[wrapStyle, { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#DC2626' }]}>
      <Text style={[s.liveBadgeTxt, { color: '#DC2626' }]}>LIVE EVENT</Text>
    </View>
  );
}

function countdownText(target: number, now: number): string {
  const diff = target - now;
  if (diff <= 0) return 'Starting shortly';
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  if (days > 0) return `Starts in ${days} day${days !== 1 ? 's' : ''} ${hrs} h`;
  if (hrs > 0) return `Starts in ${hrs} h ${mins} min`;
  return `Starts in ${Math.max(mins, 1)} min`;
}

// Live-auction-only home screen: one big card with the next live auction's
// date and time, or a "join now" card while it is on air.
function NextLiveCard({ events, loadError }: { events: any[]; loadError?: boolean }) {
  const ink = C.ink, muted = C.sub;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const live = events.find((e) => e.status === 'live');
  const upcoming = events
    .filter((e) => e.status === 'scheduled' && e.scheduled_at)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    // ignore stale sessions whose start time passed more than 3 hours ago
    .find((e) => new Date(e.scheduled_at).getTime() >= now - 3 * 3600000);

  if (live) {
    return (
      <View style={s.nlWrap}>
        <Pressable onPress={() => router.push(`/live/${live.auction_id}`)} style={[s.nlCard, { borderColor: '#DC2626', borderWidth: 2 }]}>
          <View style={s.nlLivePill}>
            <View style={s.liveDot} />
            <Text style={s.liveBadgeTxt}>LIVE NOW</Text>
          </View>
          <Text style={s.nlTitle}>{live.title ?? live.auctions?.title ?? 'Live Auction'}</Text>
          <Text style={s.nlBody}>The auction is on air. Watch the auctioneer and place your bids live.</Text>
          <View style={s.nlBtn}>
            <Text style={s.nlBtnTxt}>Watch & Bid Live →</Text>
          </View>
        </Pressable>
      </View>
    );
  }

  if (upcoming) {
    const d = new Date(upcoming.scheduled_at);
    const timeStr = d.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', hour12: false });
    const dateStr = d.toLocaleDateString('en-ZA', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const lotCount = upcoming.lot_ids?.length ?? 0;
    return (
      <View style={s.nlWrap}>
        <View style={s.nlCard}>
          <Text style={s.nlLabel}>NEXT LIVE AUCTION</Text>
          <Text style={s.nlTime}>{timeStr}</Text>
          <Text style={s.nlDate}>{dateStr}</Text>
          <View style={s.nlCountdown}>
            <Text style={s.nlCountdownTxt}>{countdownText(d.getTime(), now)}</Text>
          </View>
          <Text style={s.nlTitle}>{upcoming.title ?? upcoming.auctions?.title ?? 'Live Auction'}</Text>
          {lotCount > 0 && <Text style={s.nlMeta}>{lotCount} lot{lotCount !== 1 ? 's' : ''} on the block</Text>}
          <Text style={s.nlBody}>
            Come back at this time to watch the auction live and bid from your phone or computer.
            Turn on notifications and we'll alert you the moment we go live.
          </Text>
          <Pressable onPress={() => router.push(`/live/${upcoming.auction_id}`)} style={s.nlBtn}>
            <Text style={s.nlBtnTxt}>View the lots & photos →</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={s.emptyEvents}>
        <Text style={{ fontSize: 48, marginBottom: 12 }}>⚠️</Text>
        <Text style={[s.emptyTitle, { color: ink }]}>Couldn't load the auction schedule</Text>
        <Text style={[s.emptyBody, { color: muted }]}>Check your connection and tap the refresh button at the top right.</Text>
      </View>
    );
  }

  return (
    <View style={s.emptyEvents}>
      <Text style={{ fontSize: 48, marginBottom: 12 }}>📅</Text>
      <Text style={[s.emptyTitle, { color: ink }]}>No live auction scheduled yet</Text>
      <Text style={[s.emptyBody, { color: muted }]}>The date and time of the next live auction will appear here. Check back soon.</Text>
    </View>
  );
}

function AuctionEventCard({ session, photos }: { session: any; photos?: string[] }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const isLive = session.status === 'live';
  const isTimed = session.status === 'timed';
  const dt = session.scheduled_at ? new Date(session.scheduled_at) : null;
  const dateStr = dt ? `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}` : '';
  const timeStr = dt ? dt.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '';
  const lotCount = session.lot_ids?.length ?? 0;
  const title = session.title ?? session.auctions?.title ?? 'Auction Event';
  const onPress = () => isTimed
    ? router.push(`/auction/${session.auction_id}`)
    : router.push(`/live/${session.auction_id}`);

  if (isDesktop) {
    return (
      <Pressable style={s.eventCardRow} onPress={onPress}>
        <View style={s.rowImgWrap}>
          <PhotoCollage photos={photos ?? []} />
        </View>
        <View style={s.rowContent}>
          <EventBadge isLive={isLive} isTimed={isTimed} inline />
          <Text style={s.rowTitle} numberOfLines={1}>{title}</Text>
          <Text style={s.rowMeta}>
            {isTimed && dt ? `${timeUntil(dt.toISOString())} · Closes ${dateStr}` : ''}
            {!isTimed && !isLive && dt ? dateStr + (timeStr ? ` at ${timeStr}` : '') : ''}
            {lotCount > 0 ? ` · ${lotCount} lot${lotCount !== 1 ? 's' : ''}` : ''}
          </Text>
          <View style={s.rowBottom}>
            <Text style={s.rowHint}>Tap to view lots</Text>
            <View style={s.rowBtn}>
              <Text style={s.rowBtnTxt}>{isTimed ? 'Bid Now →' : 'View Auction →'}</Text>
            </View>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable style={s.eventCard} onPress={onPress}>
      <View style={s.lotImgWrap}>
        <PhotoCollage photos={photos ?? []} />
      </View>
      <EventBadge isLive={isLive} isTimed={isTimed} />
      <View style={s.eventContent}>
        {isTimed && dt && (
          <Text style={s.eventDate}>{timeUntil(dt.toISOString()).toUpperCase()}</Text>
        )}
        {!isTimed && dt && !isLive && <Text style={s.eventDate}>{dateStr.toUpperCase()}</Text>}
        <Text style={s.eventTitle} numberOfLines={2}>{title}</Text>
        <View style={s.eventMeta}>
          {isTimed && dt && <Text style={s.eventMetaTxt}>Closes {dateStr}</Text>}
          {timeStr && !isLive && !isTimed && <Text style={s.eventMetaTxt}>{timeStr}</Text>}
          {lotCount > 0 && <Text style={s.eventMetaTxt}>{lotCount} lot{lotCount !== 1 ? 's' : ''}</Text>}
        </View>
        <View style={s.eventBtn}>
          <Text style={s.eventBtnTxt}>{isTimed ? 'Bid Now →' : 'View Auction →'}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function Home() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const { bg, ink, muted, border } = useAppTheme();

  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [showNotifAsk, setShowNotifAsk] = useState(false);
  const [showInstallTakeover, setShowInstallTakeover] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    (async () => {
      const perm = await getNotificationPermission();
      const dismissed = window.localStorage.getItem('wcp-notif-dismissed');
      if (!cancelled && perm === 'default' && !dismissed) {
        setTimeout(() => setShowNotifAsk(true), 2500);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleEnableNotifications = async () => {
    setShowNotifAsk(false);
    if (typeof window !== 'undefined') window.localStorage.setItem('wcp-notif-dismissed', '1');
    await requestNotificationPermission();
  };

  const handleDismissNotifAsk = () => {
    setShowNotifAsk(false);
    if (typeof window !== 'undefined') window.localStorage.setItem('wcp-notif-dismissed', '1');
  };
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  // Detect if already running as installed PWA (works on both iOS and Android/Chrome)
  const isInStandalone = typeof window !== 'undefined' && (
    (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // Proactively offer install: immediately on a first-ever visit, or later
  // once the user has shown real engagement (viewed 2+ lots / placed a bid).
  // iOS never fires beforeinstallprompt, so it qualifies as soon as we know
  // the platform; Android/desktop Chrome waits for the deferred event.
  useEffect(() => {
    if (isInStandalone) return;
    if (!isIOS && !installPrompt) return;
    if (!shouldShowInstallPrompt()) return;
    const t = setTimeout(() => setShowInstallTakeover(true), 1500);
    return () => clearTimeout(t);
  }, [isIOS, installPrompt, isInStandalone]);

  const dismissInstallTakeover = () => {
    setShowInstallTakeover(false);
    markInstallPromptShown();
  };

  const acceptInstallTakeover = async () => {
    markInstallPromptShown();
    setShowInstallTakeover(false);
    if (isIOS) { setShowIOSGuide(true); return; }
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
  };

  const { data: events, isRefetching, refetch, isError: eventsError } = useQuery({
    queryKey: ['auction-events'],
    queryFn: fetchAuctionEvents,
    refetchInterval: 15000,
  });

  const auctionIds = (events ?? []).map((e: any) => e.auction_id);
  const { data: covers } = useQuery({
    queryKey: ['lot-covers', auctionIds.join(',')],
    queryFn: () => fetchLotCovers(auctionIds),
    enabled: TIMED_AUCTIONS_ENABLED && auctionIds.length > 0,
  }); // covers: Record<auctionId, string[]>

  const liveEvents = (events ?? []).filter((e: any) => e.status === 'live');
  const upcomingEvents = (events ?? []).filter((e: any) => e.status === 'scheduled' || e.status === 'timed');

  // Visual only — not wired to filter the events list.
  const [category, setCategory] = useState<string | null>(null);

  return (
    <SafeAreaView style={[s.root, { backgroundColor: C.bg }]}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.gold} />}
        showsVerticalScrollIndicator={false}
      >
        {/* —— HEADER —— */}
        <View style={s.header}>
          <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.headerTitle}>HT Auctions West Coast</Text>
            <Text style={s.headerOnline}>Online Auction</Text>
            <Text style={s.headerSub}>South Africa's Live Auction Marketplace</Text>
          </View>
          <Pressable onPress={refetch} style={s.refreshBtn}>
            <Text style={{ fontSize: 15 }}>{isRefetching ? '⏳' : '↺'}</Text>
          </Pressable>
        </View>

        {profile && (
          <View style={[s.welcomeBar, { borderBottomColor: border }]}>
            <Text style={[s.welcomeTxt, { color: C.sub }]}>Welcome back, <Text style={{ color: C.ink, fontWeight: '800' }}>{(((profile as any).screen_name || profile.full_name || profile.email?.split('@')[0] || '') as string).split(' ')[0]}</Text></Text>
          </View>
        )}

        {/* Soft-ask: explain value before triggering the real browser permission prompt */}
        {showNotifAsk && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 999, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.navy, marginBottom: 8, textAlign: 'center' }}>Never miss an auction</Text>
              <Text style={{ color: '#374151', fontSize: 14, lineHeight: 20, marginBottom: 20, textAlign: 'center' }}>
                Get notified the moment a new auction opens or a live event starts — so you never lose out on a bid.
              </Text>
              <Pressable onPress={handleEnableNotifications} style={{ backgroundColor: C.orange, borderRadius: 10, padding: 14, alignItems: 'center', width: '100%', marginBottom: 10 }}>
                <Text style={{ color: Colors.navy, fontWeight: '800' }}>Enable Notifications</Text>
              </Pressable>
              <Pressable onPress={handleDismissNotifAsk} style={{ padding: 8 }}>
                <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Not now</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Proactive install takeover — first visit, or after engagement on later visits */}
        {showInstallTakeover && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 999, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360, alignItems: 'center' }}>
              <Text style={{ fontSize: 18, fontWeight: '800', color: Colors.navy, marginBottom: 8, textAlign: 'center' }}>Install HT Auctions West Coast
              </Text>
              <Text style={{ color: '#374151', fontSize: 14, lineHeight: 20, marginBottom: 20, textAlign: 'center' }}>
                Get one-tap access from your home screen — faster loading, live auction alerts, no browser tabs to dig through.
              </Text>
              <Pressable onPress={acceptInstallTakeover} style={{ backgroundColor: C.orange, borderRadius: 10, padding: 14, alignItems: 'center', width: '100%', marginBottom: 10 }}>
                <Text style={{ color: Colors.navy, fontWeight: '800' }}>Install Now</Text>
              </Pressable>
              <Pressable onPress={dismissInstallTakeover} style={{ padding: 8 }}>
                <Text style={{ color: '#9CA3AF', fontSize: 13 }}>Maybe later</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* iOS install guide modal */}
        {showIOSGuide && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 999, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360 }}>
              <Text style={{ fontSize: 20, fontWeight: '800', color: Colors.navy, marginBottom: 8 }}>Install on iPhone / iPad</Text>
              <Text style={{ color: '#374151', fontSize: 14, lineHeight: 22, marginBottom: 16 }}>
                1. Tap the <Text style={{ fontWeight: '700' }}>Share</Text> button at the bottom of Safari {'\n'}
                2. Scroll down and tap <Text style={{ fontWeight: '700' }}>"Add to Home Screen"</Text>{'\n'}
                3. Tap <Text style={{ fontWeight: '700' }}>Add</Text> — done!
              </Text>
              <Text style={{ color: '#6B7280', fontSize: 12, marginBottom: 16 }}>
                On Android (Chrome): tap the 3-dot menu   "Add to Home screen"
              </Text>
              <Pressable onPress={() => setShowIOSGuide(false)} style={{ backgroundColor: Colors.navy, borderRadius: 10, padding: 12, alignItems: 'center' }}>
                <Text style={{ color: '#fff', fontWeight: '700' }}>Got it</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* —— LIVE-ONLY MODE: next live auction —— */}
        {!TIMED_AUCTIONS_ENABLED && <NextLiveCard events={events ?? []} loadError={eventsError && !events} />}

        {/* —— LIVE NOW —— */}
        {TIMED_AUCTIONS_ENABLED && liveEvents.length > 0 && (
          <View style={s.section}>
            {liveEvents.map((e: any) => (
              <Pressable key={e.auction_id} onPress={() => router.push(`/live/${e.auction_id}`)} style={s.liveBanner}>
                <View style={s.livePulse} />
                <View style={{ flex: 1 }}>
                  <Text style={s.liveBannerTitle}>AUCTION LIVE NOW</Text>
                  <Text style={s.liveBannerSub}>{e.title ?? e.auctions?.title ?? 'Live Auction'} — Tap to join</Text>
                </View>
                <Text style={{ fontSize: 22 }}>►</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* —— UPCOMING AUCTIONS —— */}
        {TIMED_AUCTIONS_ENABLED && upcomingEvents.length > 0 && (
          <View style={{ marginBottom: 24 }}>
            <View style={s.sectionHeader}>
              <Text style={[s.sectionTitle, { color: ink }]}>Active Auctions</Text>
              <View style={s.goldLine} />
            </View>

            <FlatList
              data={['All', ...CATEGORIES]}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8, marginBottom: 14 }}
              renderItem={({ item }) => {
                const active = item === 'All' ? category === null : category === item;
                return (
                  <Pressable
                    onPress={() => setCategory(item === 'All' ? null : item)}
                    style={[s.catChip, { backgroundColor: active ? Colors.gold : 'transparent', borderColor: active ? Colors.gold : border }]}
                  >
                    <Text style={[s.catChipTxt, { color: active ? Colors.navy : ink }]}>{item}</Text>
                  </Pressable>
                );
              }}
            />

            <View style={{ paddingHorizontal: 16, gap: 14 }}>
              {upcomingEvents.map((e: any) => (
                <AuctionEventCard key={e.auction_id} session={e} photos={covers?.[e.auction_id]} />
              ))}
            </View>
          </View>
        )}

        {/* —— NO EVENTS PLACEHOLDER —— */}
        {TIMED_AUCTIONS_ENABLED && (!events || events.length === 0) && (
          <View style={s.emptyEvents}>
            <Text style={{ fontSize: 48, marginBottom: 12 }}>🏗</Text>
            <Text style={[s.emptyTitle, { color: ink }]}>No auctions scheduled yet</Text>
            <Text style={[s.emptyBody, { color: muted }]}>Check back soon — new events are added regularly.</Text>
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },

  // Header
  header: { backgroundColor: Colors.navy, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  logo: { width: 60, height: 60 },
  headerTitle: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: 0.2 },
  headerOnline: { color: C.orange, fontSize: 13, fontWeight: '700', letterSpacing: 0.6, marginTop: 1 },
  headerSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 1 },
  refreshBtn: { padding: 8, borderRadius: 8, backgroundColor: 'rgba(196,154,34,0.15)' },

  welcomeBar: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1 },
  welcomeTxt: { fontSize: 17 },

  // Live banner
  liveBanner: { backgroundColor: Colors.navy, borderWidth: 1.5, borderColor: '#DC2626', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  livePulse: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#DC2626' },
  liveBannerTitle: { color: '#fff', fontWeight: '800', fontSize: 14 },
  liveBannerSub: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 2 },

  // Section
  section: { paddingHorizontal: 16, marginBottom: 24 },
  sectionHeader: { paddingHorizontal: 16, marginBottom: 14 },
  sectionTitle: { fontSize: 17, fontWeight: '800', letterSpacing: 0.2, marginBottom: 6 },
  goldLine: { width: 36, height: 3, backgroundColor: Colors.gold, borderRadius: 2 },

  // Auction event card
  eventCard: { width: '100%', borderRadius: 16, overflow: 'hidden', backgroundColor: Colors.navy },
  catChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, borderWidth: 1 },
  catChipTxt: { fontSize: 13, fontWeight: '700' },
  lotImgWrap: { alignSelf: 'flex-start', margin: 12, borderRadius: 10, overflow: 'hidden' },
  eventImgSingle: { width: 150, height: 120, backgroundColor: '#E9EBE7' },
  // Collage layouts
  collageRow: { alignSelf: 'flex-start', flexDirection: 'row', height: 120 },
  collageDivider: { width: 2, backgroundColor: Colors.navy },
  collageDividerH: { height: 2, backgroundColor: Colors.navy },
  collageHalf: { width: 120, height: 120, backgroundColor: '#E9EBE7' },
  collageBig: { width: 150, height: 120, backgroundColor: '#E9EBE7' },
  collageSmallWrap: { width: 70, height: 120 },
  collageSmall: { flex: 1, backgroundColor: '#E9EBE7' },
  liveBadge: { position: 'absolute', top: 12, left: 12, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DC2626', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeInline: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DC2626', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  liveBadgeTxt: { color: '#fff', fontWeight: '800', fontSize: 11, letterSpacing: 0.5 },

  // Desktop wide row
  eventCardRow: { flexDirection: 'row', borderRadius: 16, overflow: 'hidden', backgroundColor: Colors.navy },
  rowImgWrap: { alignSelf: 'center', margin: 16, borderRadius: 10, overflow: 'hidden' },
  rowContent: { flex: 1, paddingVertical: 18, paddingRight: 20, justifyContent: 'center' },
  rowTitle: { color: '#fff', fontWeight: '800', fontSize: 19, marginBottom: 4 },
  rowMeta: { color: 'rgba(255,255,255,0.55)', fontSize: 13, marginBottom: 14 },
  rowBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowHint: { color: 'rgba(255,255,255,0.45)', fontSize: 12 },
  rowBtn: { backgroundColor: Colors.gold, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 20 },
  rowBtnTxt: { color: Colors.navy, fontWeight: '800', fontSize: 13.5 },
  eventContent: { padding: 14 },
  eventDate: { color: Colors.gold, fontWeight: '700', fontSize: 11, letterSpacing: 0.8, marginBottom: 6 },
  eventTitle: { color: '#fff', fontWeight: '800', fontSize: 16, lineHeight: 22, marginBottom: 8 },
  eventMeta: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  eventMetaTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },
  eventBtn: { backgroundColor: Colors.gold, borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  eventBtnTxt: { color: Colors.navy, fontWeight: '800', fontSize: 14 },

  // Next live auction card (live-only mode)
  nlWrap: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 8, alignItems: 'center' },
  nlCard: { width: '100%', maxWidth: 640, backgroundColor: '#FFFFFF', borderRadius: 24, borderWidth: 1, borderColor: C.line, padding: 32, alignItems: 'center' },
  nlLabel: { color: C.orangeDark, fontWeight: '800', fontSize: 14, letterSpacing: 1.6, marginBottom: 12 },
  nlTime: { color: C.ink, fontWeight: '900', fontSize: 76, lineHeight: 82, letterSpacing: -1 },
  nlDate: { color: C.ink, fontSize: 22, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  nlCountdown: { backgroundColor: C.orangeSoft, borderRadius: 99, paddingHorizontal: 18, paddingVertical: 8, marginTop: 18, marginBottom: 22 },
  nlCountdownTxt: { color: C.orangeDark, fontWeight: '800', fontSize: 16 },
  nlTitle: { color: C.ink, fontWeight: '900', fontSize: 24, textAlign: 'center', marginBottom: 6 },
  nlMeta: { color: C.sub, fontSize: 16, marginBottom: 12 },
  nlBody: { color: C.sub, fontSize: 16.5, lineHeight: 25, textAlign: 'center', marginTop: 6, maxWidth: 480 },
  nlLivePill: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#DC2626', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 16 },
  nlBtn: { backgroundColor: C.orange, borderRadius: 16, minHeight: 60, paddingHorizontal: 36, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  nlBtnTxt: { color: C.ink, fontWeight: '900', fontSize: 19 },

  // Empty state
  emptyEvents: { alignItems: 'center', paddingVertical: 48, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },

  // Category grid
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  catTile: { width: (SW - 42) / 2, height: 96, borderRadius: 12, overflow: 'hidden' },
  catTileImg: { width: '100%', height: '100%' },
  catTileOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(13,27,46,0.52)' },
  catTileName: { position: 'absolute', bottom: 10, left: 10, right: 10, color: '#fff', fontWeight: '800', fontSize: 13, letterSpacing: 0.2 },
});
