import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { C } from '../../components/LiveViewerParts';

// Public sign-up is for bidders only. Auctioneer / admin accounts are created by HT Auctions.
export default function Register() {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [surname, setSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const cell = phone.replace(/[\s()-]/g, '');
    if (!firstName.trim() || !surname.trim()) { setError('Enter your first name and surname.'); return; }
    if (!/^(\+27|0)\d{9}$/.test(cell)) { setError('Enter a valid South African cell number, for example 082 123 4567.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError('Enter a valid email address.'); return; }
    if (password.length < 6) { setError('Your password must be at least 6 characters.'); return; }
    if (idNumber.trim().length < 6) { setError('Enter your South African ID or passport number.'); return; }
    if (!agreed) { setError('Please tick the box to confirm that you agree to pay for anything you win.'); return; }
    setError(''); setLoading(true);

    const { error: err } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: {
        data: {
          role: 'bidder',
          full_name: `${firstName.trim()} ${surname.trim()}`,
          first_name: firstName.trim(), surname: surname.trim(),
          phone: cell, id_number: idNumber.trim(),
          terms_accepted_at: new Date().toISOString(),
        },
      },
    });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  };

  if (sent) {
    return (
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={s.scroll}>
        <View style={s.wrap}>
          <View style={s.card}>
            <Text style={s.heading}>Check your email</Text>
            <Text style={s.body}>We sent a confirmation link to <Text style={{ fontWeight: '800', color: C.ink }}>{email.trim()}</Text>. Tap it to confirm your email address, then log in.</Text>
            <View style={s.info}>
              <Text style={s.infoTitle}>What happens next</Text>
              <Text style={s.body}>HT Auctions checks and approves every new account before it can bid. You can watch the auction and browse the lots straight away.</Text>
            </View>
            <Pressable onPress={() => router.replace('/(auth)/login')} style={s.btn}>
              <Text style={s.btnTxt}>Go to log in</Text>
            </Pressable>
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
          <Text style={s.sub}>Register once to bid in our live auctions. We use your details to approve you and to contact you if you win.</Text>

          {error ? <View style={s.errorBox}><Text style={s.errorTxt}>{error}</Text></View> : null}

          <View style={s.twoCol}>
            <F label="First name" value={firstName} onChange={setFirstName} placeholder="Jane" cap="words" style={{ flex: 1 }} />
            <F label="Surname" value={surname} onChange={setSurname} placeholder="Dlamini" cap="words" style={{ flex: 1 }} />
          </View>
          <F label="Cell number" value={phone} onChange={setPhone} placeholder="082 123 4567" keyboard="phone-pad" />
          <F label="Email address" value={email} onChange={setEmail} placeholder="jane@example.com" keyboard="email-address" />
          <F label="Password (at least 6 characters)" value={password} onChange={setPassword} placeholder="Choose a password" secure />
          <F label="SA ID or passport number" value={idNumber} onChange={setIdNumber} placeholder="8501015009087" />

          <Pressable onPress={() => setAgreed(!agreed)} style={s.agreeRow}>
            <View style={[s.box, agreed && s.boxOn]}>{agreed && <Text style={s.tick}>✓</Text>}</View>
            <Text style={s.agreeTxt}>
              I understand that <Text style={{ fontWeight: '800' }}>every bid I place is a binding offer to buy</Text>. If I win a lot I will pay for it in full, plus any fees, by the deadline the auctioneer gives. HT Auctions may ban me from future auctions if I do not pay.
            </Text>
          </Pressable>

          <Pressable disabled={loading} onPress={submit} style={[s.btn, { opacity: loading ? 0.7 : 1 }]}>
            {loading ? <ActivityIndicator color={C.ink} /> : <Text style={s.btnTxt}>Create account</Text>}
          </Pressable>

          <Pressable onPress={() => router.replace('/(auth)/login')} style={{ alignItems: 'center', marginTop: 20, paddingVertical: 6 }}>
            <Text style={{ color: C.ink, fontSize: 16 }}>Already registered? <Text style={{ color: C.orangeDark, fontWeight: '800' }}>Log in</Text></Text>
          </Pressable>
          <Text style={s.legal}>Your details are used only to run our auctions and are handled under POPIA.</Text>
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
  agreeRow: { flexDirection: 'row', gap: 14, alignItems: 'flex-start', backgroundColor: '#F4F8F7', borderRadius: 14, padding: 16, marginTop: 4 },
  box: { width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: C.ink, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  boxOn: { backgroundColor: C.orange, borderColor: C.orange },
  tick: { color: C.ink, fontSize: 18, fontWeight: '900', lineHeight: 20 },
  agreeTxt: { flex: 1, color: C.ink, fontSize: 15, lineHeight: 22 },
  btn: { backgroundColor: C.orange, borderRadius: 16, minHeight: 60, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  btnTxt: { color: C.ink, fontWeight: '900', fontSize: 20 },
  info: { backgroundColor: '#F4F8F7', borderRadius: 14, padding: 16, marginTop: 18 },
  infoTitle: { color: C.ink, fontSize: 16, fontWeight: '800' },
  errorBox: { backgroundColor: C.redBg, borderWidth: 1, borderColor: '#F2B8B5', borderRadius: 12, padding: 14, marginBottom: 18 },
  errorTxt: { color: C.red, fontSize: 15, fontWeight: '600' },
  legal: { fontSize: 13.5, color: C.sub, textAlign: 'center', marginTop: 14, lineHeight: 20 },
});
