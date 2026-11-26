import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { C } from '../../components/LiveViewerParts';
import LegalLinks from '../../components/LegalLinks';
import { LEGAL } from '../../lib/legal';

// Public sign-up is for bidders only. Auctioneer / admin accounts are created by HT Auctions.
// We deliberately collect only what is needed: name, surname, cell and email.
// No ID number and no bank or card details are collected here.

function Check({ on, onToggle, children }: { on: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <Pressable onPress={onToggle} style={s.agreeRow}>
      <View style={[s.box, on && s.boxOn]}>{on && <Text style={s.tick}>✓</Text>}</View>
      <Text style={s.agreeTxt}>{children}</Text>
    </Pressable>
  );
}

export default function Register() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [adult, setAdult] = useState(false);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [resendMsg, setResendMsg] = useState('');
  const [resending, setResending] = useState(false);

  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;

  const submit = async () => {
    const cell = phone.replace(/[\s()-]/g, '');
    if (!firstName.trim() || !surname.trim()) { setError('Enter your first name and surname.'); return; }
    if (!/^(\+27|0)\d{9}$/.test(cell)) { setError('Enter a valid South African cell number, for example 082 123 4567.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    if (password.length < 8) { setError('Your password must be at least 8 characters.'); return; }
    if (!adult) { setError('You must be 18 or older to register.'); return; }
    if (!terms) { setError('Please accept the Conditions of Sale to continue.'); return; }
    if (!privacy) { setError('Please accept the Privacy notice to continue.'); return; }
    setError(''); setLoading(true);

    const { error: err } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: {
        emailRedirectTo: redirectTo,
        data: {
          role: 'bidder',
          full_name: `${firstName.trim()} ${surname.trim()}`,
          first_name: firstName.trim(), surname: surname.trim(),
          phone: cell,
          adult_confirmed: true,
          terms_version: LEGAL.termsVersion,
          privacy_version: LEGAL.privacyVersion,
          terms_accepted_at: new Date().toISOString(),
        },
      },
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  };

  const resend = async () => {
    setResending(true); setResendMsg('');
    const { error: err } = await supabase.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: redirectTo } });
    setResending(false);
    setResendMsg(err ? `Could not resend: ${err.message}` : 'Sent again. Please check your inbox and your spam folder.');
  };

  if (sent) {
    return (
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.scroll}>
        <View style={s.wrap}>
          <View style={s.card}>
            <Text style={s.heading}>Check your email</Text>
            <Text style={s.body}>We sent a confirmation link to <Text style={{ fontWeight: '800', color: C.ink }}>{email.trim()}</Text>. Tap the link to confirm your email address, then log in.</Text>
            <View style={s.info}>
              <Text style={s.infoTitle}>What happens next</Text>
              <Text style={s.body}>1. Confirm your email.{'\n'}2. Log in.{'\n'}3. You can then watch the auction and place bids.</Text>
            </View>
            <Pressable onPress={() => router.replace('/(auth)/login')} style={s.btn}>
              <Text style={s.btnTxt}>Go to log in</Text>
            </Pressable>
            <Pressable onPress={resend} disabled={resending} style={{ alignItems: 'center', marginTop: 18, paddingVertical: 6 }}>
              <Text style={{ color: C.ink, fontSize: 16 }}>Did not get it? <Text style={{ color: C.orangeDark, fontWeight: '800' }}>{resending ? 'Sending…' : 'Send it again'}</Text></Text>
            </Pressable>
            {resendMsg ? <Text style={[s.body, { textAlign: 'center' }]}>{resendMsg}</Text> : null}
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
      <View style={s.wrap}>
        <View style={s.logoWrap}>
          <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
          <Text style={s.brand}>HT Auctions West Coast</Text>
        </View>

        <View style={s.card}>
          <Text style={s.heading}>Create your account</Text>
          <Text style={s.sub}>Register once to bid in our live auctions. We use your details to run the auction and to contact you if you win.</Text>

          {error ? <View style={s.errorBox}><Text style={s.errorTxt}>{error}</Text></View> : null}

          <View style={s.twoCol}>
            <F label="First name" value={firstName} onChange={setFirstName} placeholder="Jane" cap="words" style={{ flex: 1 }} />
            <F label="Surname" value={surname} onChange={setSurname} placeholder="Dlamini" cap="words" style={{ flex: 1 }} />
          </View>
          <F label="Cell number" value={phone} onChange={setPhone} placeholder="082 123 4567" keyboard="phone-pad" />
          <F label="Email address" value={email} onChange={setEmail} placeholder="jane@example.com" keyboard="email-address" />
          <F label="Password (at least 8 characters)" value={password} onChange={setPassword} placeholder="Choose a password" secure />

          <Check on={adult} onToggle={() => setAdult(!adult)}>I am <Text style={{ fontWeight: '800' }}>18 years or older</Text>.</Check>
          <Check on={terms} onToggle={() => setTerms(!terms)}>
            I have read and agree to the{' '}
            <Text style={s.link} onPress={() => router.push('/terms')}>Conditions of Sale</Text>. I understand that <Text style={{ fontWeight: '800' }}>every bid I place is a binding offer to buy</Text>, and that if I win I must pay in full plus the buyer's commission.
          </Check>
          <Check on={privacy} onToggle={() => setPrivacy(!privacy)}>
            I have read the{' '}
            <Text style={s.link} onPress={() => router.push('/privacy')}>Privacy notice</Text> and agree that HT Auctions may use my details to register me, run the auction and contact me.
          </Check>

          <Pressable disabled={loading} onPress={submit} style={[s.btn, { opacity: loading ? 0.7 : 1 }]}>
            {loading ? <ActivityIndicator color={C.ink} /> : <Text style={s.btnTxt}>Create account</Text>}
          </Pressable>

          <Pressable onPress={() => router.replace('/(auth)/login')} style={{ alignItems: 'center', marginTop: 20, paddingVertical: 6 }}>
            <Text style={{ color: C.ink, fontSize: 16 }}>Already registered? <Text style={{ color: C.orangeDark, fontWeight: '800' }}>Log in</Text></Text>
          </Pressable>
          <LegalLinks style={{ marginTop: 6 }} />
        </View>
      </View>
    </ScrollView>
  );
}

function F({ label, value, onChange, placeholder, keyboard, secure, cap, style }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; keyboard?: any; secure?: boolean; cap?: 'none' | 'words'; style?: any }) {
  return (
    <View style={[{ marginBottom: 18 }, style]}>
      <Text style={s.label}>{label}</Text>
      <TextInput style={s.input} value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor="#7C8F9A"
        keyboardType={keyboard ?? 'default'} secureTextEntry={secure} autoCapitalize={cap ?? 'none'} autoCorrect={false} />
    </View>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, padding: 20, paddingTop: 36, paddingBottom: 56, alignItems: 'center' },
  wrap: { width: '100%', maxWidth: 520 },
  logoWrap: { alignItems: 'center', marginBottom: 22 },
  logo: { width: 80, height: 80, marginBottom: 10 },
  brand: { color: C.ink, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: C.line, padding: 26 },
  heading: { fontSize: 26, fontWeight: '900', color: C.ink, marginBottom: 6 },
  sub: { fontSize: 16, color: C.sub, marginBottom: 22, lineHeight: 24 },
  body: { fontSize: 16, color: C.sub, lineHeight: 24, marginTop: 8 },
  twoCol: { flexDirection: 'row', gap: 12 },
  label: { fontSize: 15, fontWeight: '800', color: C.ink, marginBottom: 8 },
  input: { borderWidth: 1.5, borderColor: C.line, borderRadius: 14, paddingHorizontal: 16, minHeight: 56, fontSize: 17, color: C.ink, backgroundColor: '#fff' },
  agreeRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', backgroundColor: '#F4F8F7', borderRadius: 14, padding: 16, marginTop: 10 },
  box: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: C.ink, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  boxOn: { backgroundColor: C.orange, borderColor: C.orange },
  tick: { color: C.ink, fontSize: 18, fontWeight: '900', lineHeight: 20 },
  agreeTxt: { flex: 1, color: C.ink, fontSize: 15, lineHeight: 22 },
  link: { color: C.orangeDark, fontWeight: '800', textDecorationLine: 'underline' },
  btn: { backgroundColor: C.orange, borderRadius: 16, minHeight: 60, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  btnTxt: { color: C.ink, fontWeight: '900', fontSize: 20 },
  info: { backgroundColor: '#F4F8F7', borderRadius: 14, padding: 16, marginTop: 18, marginBottom: 18 },
  infoTitle: { color: C.ink, fontSize: 16, fontWeight: '800' },
  errorBox: { backgroundColor: C.redBg, borderWidth: 1, borderColor: '#F2B8B5', borderRadius: 12, padding: 14, marginBottom: 18 },
  errorTxt: { color: C.red, fontSize: 15, fontWeight: '600' },
});
