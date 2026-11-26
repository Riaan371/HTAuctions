import { View, Text, Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { C } from './LiveViewerParts';

// Small footer row that links to the legal pages from any screen.
export default function LegalLinks({ style }: { style?: any }) {
  return (
    <View style={[s.row, style]}>
      <Pressable onPress={() => router.push('/terms')}><Text style={s.link}>Conditions of Sale</Text></Pressable>
      <Text style={s.dot}>·</Text>
      <Pressable onPress={() => router.push('/privacy')}><Text style={s.link}>Privacy notice</Text></Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, paddingVertical: 8 },
  link: { color: C.sub, fontSize: 14.5, textDecorationLine: 'underline' },
  dot: { color: C.sub, fontSize: 14.5 },
});
