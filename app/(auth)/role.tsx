import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { router } from 'expo-router';
import { Colors } from '../../lib/theme';

export default function ChooseRole() {
  return (
    <View style={s.root}>
      <View style={s.header}>
        <Image source={require('../../assets/logo.png')} style={s.logo} resizeMode="contain" />
        <Text style={s.brand}>HT Auctions West Coast</Text>
        <Text style={s.brandOnline}>Online Auction</Text>
      </View>

      <Text style={s.heading}>Create Your Account</Text>
      <Text style={s.sub}>Start bidding on live auctions across South Africa - it's free to register.</Text>

      <Pressable
        style={[s.card, s.activeCard]}
        onPress={() => router.push({ pathname: '/(auth)/register', params: { role: 'bidder' } })}
      >
        <Text style={s.cardIcon}>🪙</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Bidder Account</Text>
          <Text style={s.cardSub}>Browse auctions, place bids, and pay securely for items you win.</Text>
        </View>
      </Pressable>

      <Pressable
        style={[s.card, s.aucCard]}
        onPress={() => router.push({ pathname: '/(auth)/register', params: { role: 'auctioneer' } })}
      >
        <Text style={s.cardIcon}>🔨</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>Auctioneer Account</Text>
          <Text style={s.cardSub}>Create and manage auctions, add lots, and run live bidding sessions.</Text>
        </View>
      </Pressable>

      <View style={{ flex: 1 }} />

      <Pressable onPress={() => router.back()} style={{ alignItems: 'center', marginTop: 16, paddingBottom: 24 }}>
        <Text style={{ color: Colors.gold, fontSize: 14 }}>Back</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.navy, paddingHorizontal: 24, paddingTop: 56 },
  header: { alignItems: 'center', marginBottom: 28 },
  logo: { width: 72, height: 72, marginBottom: 8 },
  brand: { color: '#fff', fontSize: 18, fontWeight: '800' },
  brandOnline: { color: Colors.gold, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, marginTop: 2 },
  heading: { fontSize: 22, fontWeight: '800', color: '#fff', marginBottom: 6 },
  sub: { fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 24, lineHeight: 21 },
  card: { borderWidth: 1.5, borderRadius: 16, padding: 18, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 14 },
  activeCard: { borderColor: Colors.gold, backgroundColor: 'rgba(224,123,57,0.10)' },
  aucCard: { borderColor: 'rgba(255,255,255,0.2)', backgroundColor: 'rgba(255,255,255,0.04)' },
  cardIcon: { fontSize: 28 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 4 },
  cardSub: { fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 19 },
});
