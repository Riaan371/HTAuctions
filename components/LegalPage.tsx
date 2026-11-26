import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { C } from './LiveViewerParts';
import { LEGAL, type LegalSection } from '../lib/legal';

// Shared layout for the Conditions of Sale and Privacy notice pages.
export default function LegalPage({ title, sections, other }: { title: string; sections: LegalSection[]; other: { label: string; href: '/terms' | '/privacy' } }) {
  const contact = [
    LEGAL.informationOfficer && `Information Officer: ${LEGAL.informationOfficer}`,
    LEGAL.contactEmail && `Email: ${LEGAL.contactEmail}`,
    LEGAL.contactPhone && `Phone: ${LEGAL.contactPhone}`,
  ].filter(Boolean) as string[];

  return (
    <SafeAreaView style={s.root}>
      <View style={s.bar}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} style={{ paddingVertical: 6, paddingRight: 12 }}>
          <Text style={s.back}>← Back</Text>
        </Pressable>
        <Text style={s.barTitle}>{LEGAL.company}</Text>
      </View>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.card}>
          <Text style={s.h1}>{title}</Text>
          <Text style={s.updated}>Last updated {LEGAL.updated}</Text>
          {sections.map((sec) => (
            <View key={sec.heading} style={{ marginTop: 22 }}>
              <Text style={s.h2}>{sec.heading}</Text>
              {sec.body.map((p, i) => <Text key={i} style={s.p}>{p}</Text>)}
            </View>
          ))}
          {contact.length > 0 && (
            <View style={{ marginTop: 22 }}>
              <Text style={s.h2}>Contact us</Text>
              {contact.map((c) => <Text key={c} style={s.p}>{c}</Text>)}
            </View>
          )}
          <Pressable onPress={() => router.push(other.href)} style={s.other}>
            <Text style={s.otherTxt}>{other.label} →</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  bar: { backgroundColor: C.ink, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  back: { color: '#fff', fontSize: 16, fontWeight: '700' },
  barTitle: { color: 'rgba(255,255,255,0.8)', fontSize: 15 },
  content: { padding: 16, paddingBottom: 60, alignItems: 'center' },
  card: { width: '100%', maxWidth: 760, backgroundColor: '#fff', borderRadius: 24, borderWidth: 1, borderColor: C.line, padding: 28 },
  h1: { color: C.ink, fontSize: 30, fontWeight: '900' },
  updated: { color: C.sub, fontSize: 14.5, marginTop: 4 },
  h2: { color: C.ink, fontSize: 19, fontWeight: '800', marginBottom: 6 },
  p: { color: C.ink, fontSize: 16, lineHeight: 25, marginTop: 6 },
  other: { marginTop: 30, borderWidth: 1.5, borderColor: C.ink, borderRadius: 14, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  otherTxt: { color: C.ink, fontSize: 16, fontWeight: '800' },
});
