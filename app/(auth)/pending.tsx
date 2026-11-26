import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../lib/auth-store';
import { C } from '../../components/LiveViewerParts';

export default function Pending() {
  const signOut = useAuthStore((s) => s.signOut);

  return (
    <View style={s.root}>
      <View style={s.card}>
        <Text style={s.title}>Application submitted</Text>
        <Text style={s.body}>
          Our team reviews new accounts before they can take part. We will let you know once you are approved.
        </Text>
        <Pressable onPress={() => router.replace('/(tabs)')} style={s.btn}>
          <Text style={s.btnTxt}>Browse the auction meanwhile</Text>
        </Pressable>
        <Pressable onPress={signOut} style={{ marginTop: 18, alignItems: 'center' }}>
          <Text style={s.link}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: { width: '100%', maxWidth: 480, backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: C.line, padding: 28 },
  title: { color: C.ink, fontSize: 26, fontWeight: '900', textAlign: 'center' },
  body: { color: C.sub, fontSize: 16.5, lineHeight: 25, textAlign: 'center', marginTop: 12, marginBottom: 24 },
  btn: { backgroundColor: C.orange, borderRadius: 16, minHeight: 60, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  btnTxt: { color: C.ink, fontWeight: '900', fontSize: 18 },
  link: { color: C.sub, fontSize: 15.5, textDecorationLine: 'underline' },
});
