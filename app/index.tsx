import { Redirect, Link } from 'expo-router';
import { View, Text, Pressable, StyleSheet, Image, ImageBackground } from 'react-native';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../lib/auth-store';
import { Colors } from '../lib/theme';
import { C } from '../components/LiveViewerParts';
import LegalLinks from '../components/LegalLinks';

export default function Welcome() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);

  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isInStandalone = typeof window !== 'undefined' && (
    (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: any) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (isIOS) { setShowIOSGuide(true); return; }
    if (!installPrompt) { setShowIOSGuide(true); return; }
    installPrompt.prompt();
    await installPrompt.userChoice;
  };

  if (session && profile) return <Redirect href="/(tabs)" />;

  return (
    <View style={s.root}>
      {/* Top: logo + branding */}
      <View style={s.top}>
        <Image source={require('../assets/logo.png')} style={s.logo} resizeMode="contain" />
        <Text style={s.title}>HT Auctions West Coast</Text>
        <Text style={s.tagline}>Online Auction</Text>
        <Text style={s.taglineSub}>South Africa's Live Auction Marketplace</Text>
        <View style={s.divider} />
        <Text style={s.sub}>Watch our live auctions and bid in real time, from your phone or computer.</Text>

        {!isInStandalone && (
          <Pressable onPress={handleInstall} style={s.installBtn}>
            <Text style={s.installBtnTxt}>📲 Install App</Text>
          </Pressable>
        )}
      </View>

      {showIOSGuide && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 999, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360 }}>
            <Text style={{ fontSize: 20, fontWeight: '800', color: Colors.navy, marginBottom: 8 }}>Install on Mobile</Text>
            <Text style={{ color: '#374151', fontSize: 14, lineHeight: 22, marginBottom: 16 }}>
              iPhone/iPad: Tap Share → "Add to Home Screen"{'\n'}
              Android (Chrome): Tap the 3-dot menu → "Add to Home screen"
            </Text>
            <Pressable onPress={() => setShowIOSGuide(false)} style={{ backgroundColor: Colors.navy, borderRadius: 10, padding: 12, alignItems: 'center' }}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Got it</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Bottom: CTAs */}
      <View style={s.btns}>
        <Link href="/(auth)/role" asChild>
          <Pressable style={s.btnPrimary}>
            <Text style={s.btnPrimaryTxt}>Register to bid</Text>
          </Pressable>
        </Link>
        <Link href="/(auth)/login" asChild>
          <Pressable style={s.btnSecondary}>
            <Text style={s.btnSecondaryTxt}>Log in</Text>
          </Pressable>
        </Link>
        <Link href="/(tabs)" asChild>
          <Pressable style={{ alignItems: 'center', marginTop: 16, paddingBottom: 8 }}>
            <Text style={s.guestTxt}>Just watch as a guest →</Text>
          </Pressable>
        </Link>
        <LegalLinks />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },
  top: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 132, height: 132, marginBottom: 20 },
  title: { fontSize: 34, fontWeight: '900', color: C.ink, textAlign: 'center' },
  tagline: { fontSize: 14, color: C.orangeDark, fontWeight: '800', letterSpacing: 1.6, textTransform: 'uppercase', marginTop: 8, textAlign: 'center' },
  taglineSub: { fontSize: 15, color: C.sub, marginTop: 6, textAlign: 'center' },
  divider: { width: 56, height: 3, backgroundColor: C.orange, borderRadius: 2, marginVertical: 22 },
  sub: { fontSize: 17.5, color: C.ink, textAlign: 'center', lineHeight: 27, maxWidth: 400 },
  installBtn: { marginTop: 22, borderWidth: 1.5, borderColor: C.ink, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 22, backgroundColor: '#fff' },
  installBtnTxt: { color: C.ink, fontWeight: '800', fontSize: 15 },
  btns: { paddingBottom: 48, gap: 14, width: '100%', maxWidth: 480, alignSelf: 'center' },
  btnPrimary: { backgroundColor: C.orange, borderRadius: 16, minHeight: 64, alignItems: 'center', justifyContent: 'center' },
  btnPrimaryTxt: { color: C.ink, fontWeight: '900', fontSize: 20 },
  btnSecondary: { borderRadius: 16, minHeight: 60, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: C.ink, backgroundColor: '#fff' },
  btnSecondaryTxt: { color: C.ink, fontWeight: '800', fontSize: 18 },
  guestTxt: { color: C.sub, fontSize: 16, textDecorationLine: 'underline' },
});
