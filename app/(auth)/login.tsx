import { View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, ScrollView, Image } from 'react-native';
import { router, Link } from 'expo-router';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../lib/auth-store';
import { C } from '../../components/LiveViewerParts';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const setSession = useAuthStore((s) => s.setSession);
  const loadProfile = useAuthStore((s) => s.loadProfile);

  const submit = async () => {
    if (!email || !password) { setError('Please enter your email and password.'); return; }
    setError(''); setLoading(true);

    const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) {
      setLoading(false);
      setError(err.message.toLowerCase().includes('confirm')
        ? 'Please confirm your email first — check your inbox.'
        : err.message);
      return;
    }

    setSession(data.session);
    const meta = data.user.user_metadata as Record<string, string> | undefined;
    const { data: existing } = await supabase.from('users').select('id').eq('id', data.user.id).maybeSingle();

    if (!existing) {
      await supabase.from('users').insert({
        id: data.user.id,
        role: meta?.role ?? 'bidder',
        full_name: meta?.full_name ?? data.user.email?.split('@')[0] ?? 'User',
        email: data.user.email,
        phone: meta?.phone,
        id_number_hash: meta?.id_number,
        bank_token: meta ? JSON.stringify({ bankName: meta.bank_name, accountNumber: meta.account_number, branchCode: meta.branch_code }) : null,
        kyc_status: 'pending',
      });
    }

    await loadProfile();
    setLoading(false);
    const profile = useAuthStore.getState().profile;
    if (profile?.role === 'auctioneer' && profile.kyc_status === 'pending') {
      router.replace('/(auth)/pending');
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.root} keyboardShouldPersistTaps="handled">
      <View style={s.wrap}>
        <View style={s.logoWrap}>
          <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
          <Text style={s.brand}>HT Auctions West Coast</Text>
          <Text style={s.brandOnline}>Online Auction</Text>
        </View>

        <View style={s.card}>
          <Text style={s.heading}>Welcome back</Text>
          <Text style={s.sub}>Log in to watch the auction and bid.</Text>

          {error ? <View style={s.errorBox}><Text style={s.errorTxt}>{error}</Text></View> : null}

          <Text style={s.label}>Email address</Text>
          <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="jane@example.com"
            placeholderTextColor="#7C8F9A" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />

          <Text style={s.label}>Password</Text>
          <View style={s.passwordRow}>
            <TextInput style={[s.input, { flex: 1, marginBottom: 0, borderWidth: 0, backgroundColor: 'transparent' }]} value={password} onChangeText={setPassword}
              placeholder="Your password" placeholderTextColor="#7C8F9A" secureTextEntry={!showPassword} autoCapitalize="none" onSubmitEditing={submit} />
            <Pressable onPress={() => setShowPassword(!showPassword)} style={s.eyeBtn}>
              <Text style={s.eyeTxt}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>

          <Pressable disabled={loading} onPress={submit} style={[s.btn, { opacity: loading ? 0.7 : 1 }]}>
            {loading ? <ActivityIndicator color={C.ink} /> : <Text style={s.btnTxt}>Log in</Text>}
          </Pressable>

          <Link href="/(auth)/register" asChild>
            <Pressable style={{ alignItems: 'center', marginTop: 22, paddingVertical: 6 }}>
              <Text style={{ color: C.ink, fontSize: 16 }}>New here? <Text style={{ color: C.orangeDark, fontWeight: '800' }}>Create an account</Text></Text>
            </Pressable>
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flexGrow: 1, padding: 20, paddingTop: 40, paddingBottom: 48, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 460 },
  logoWrap: { alignItems: 'center', marginBottom: 26 },
  logo: { width: 96, height: 96, marginBottom: 12 },
  brand: { color: C.ink, fontSize: 24, fontWeight: '900', textAlign: 'center' },
  brandOnline: { color: C.orangeDark, fontSize: 13, fontWeight: '800', letterSpacing: 1.6, marginTop: 4, textTransform: 'uppercase' },
  card: { backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: C.line, padding: 26 },
  heading: { fontSize: 26, fontWeight: '900', color: C.ink, marginBottom: 4 },
  sub: { fontSize: 16, color: C.sub, marginBottom: 22 },
  label: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: C.line, borderRadius: 14, paddingHorizontal: 16, minHeight: 56, fontSize: 17, color: C.ink, marginBottom: 18, backgroundColor: '#fff' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: C.line, borderRadius: 14, backgroundColor: '#fff', marginBottom: 22 },
  eyeBtn: { paddingHorizontal: 16, minHeight: 56, justifyContent: 'center' },
  eyeTxt: { fontSize: 15, fontWeight: '800', color: C.orangeDark },
  btn: { backgroundColor: C.orange, borderRadius: 16, minHeight: 60, alignItems: 'center', justifyContent: 'center' },
  btnTxt: { color: C.ink, fontWeight: '900', fontSize: 20 },
  errorBox: { backgroundColor: C.redBg, borderWidth: 1, borderColor: '#F2B8B5', borderRadius: 12, padding: 14, marginBottom: 18 },
  errorTxt: { color: C.red, fontSize: 15, fontWeight: '600' },
});