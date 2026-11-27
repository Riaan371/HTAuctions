import { Tabs } from 'expo-router';
import { View, Text } from 'react-native';
import { Colors } from '../../lib/theme';
import { TIMED_AUCTIONS_ENABLED } from '../../lib/features';

// Live-only mode: hide the tabs that only make sense for timed auctions.
const hide = TIMED_AUCTIONS_ENABLED ? {} : { href: null };

// Heritage look: no clip-art emoji. The active tab gets an orange bar on top of the label.
function TabIcon({ icon, focused, plain }: { icon: string; focused: boolean; plain?: boolean }) {
  if (plain) {
    return <View style={{ width: 56, height: 6, borderRadius: 3, marginBottom: 4, backgroundColor: focused ? '#E8742C' : 'rgba(255,255,255,0.18)' }} />;
  }
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.35 }}>{icon}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#FFB070',
        tabBarInactiveTintColor: '#FFFFFF',
        tabBarStyle: { backgroundColor: Colors.navy, borderTopColor: '#E8742C', borderTopWidth: 3, height: 76, paddingTop: 6, paddingBottom: 10 },
        tabBarItemStyle: { marginHorizontal: 12, marginVertical: 2, borderRadius: 14 },
        tabBarLabelStyle: { fontWeight: '900', fontSize: 17, letterSpacing: 0.3 },
      }}
    >
      <Tabs.Screen name="index"     options={{ title: 'Home',      tabBarIcon: ({ focused }) => <TabIcon icon="" plain focused={focused} /> }} />
      <Tabs.Screen name="search"    options={{ title: 'Search',    ...hide, tabBarIcon: ({ focused }) => <TabIcon icon="🔍" focused={focused} /> }} />
      <Tabs.Screen name="watchlist" options={{ title: 'Watchlist', ...hide, tabBarIcon: ({ focused }) => <TabIcon icon="⭐" focused={focused} /> }} />
      <Tabs.Screen name="my-bids"   options={{ title: 'My Bids',   ...hide, tabBarIcon: ({ focused }) => <TabIcon icon="💰" focused={focused} /> }} />
      <Tabs.Screen name="profile"   options={{ title: 'Profile',   tabBarIcon: ({ focused }) => <TabIcon icon="" plain focused={focused} /> }} />
    </Tabs>
  );
}
