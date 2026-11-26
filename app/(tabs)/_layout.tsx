import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Colors } from '../../lib/theme';
import { TIMED_AUCTIONS_ENABLED } from '../../lib/features';

// Live-only mode: hide the tabs that only make sense for timed auctions.
const hide = TIMED_AUCTIONS_ENABLED ? {} : { href: null };

function TabIcon({ icon, focused }: { icon: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.35 }}>{icon}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#E8742C',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: { backgroundColor: Colors.navy, borderTopColor: Colors.navyMid, borderTopWidth: 1 },
        tabBarLabelStyle: { fontWeight: '600', fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index"     options={{ title: 'Home',      tabBarIcon: ({ focused }) => <TabIcon icon="🏠" focused={focused} /> }} />
      <Tabs.Screen name="search"    options={{ title: 'Search',    ...hide, tabBarIcon: ({ focused }) => <TabIcon icon="🔍" focused={focused} /> }} />
      <Tabs.Screen name="watchlist" options={{ title: 'Watchlist', ...hide, tabBarIcon: ({ focused }) => <TabIcon icon="⭐" focused={focused} /> }} />
      <Tabs.Screen name="my-bids"   options={{ title: 'My Bids',   ...hide, tabBarIcon: ({ focused }) => <TabIcon icon="💰" focused={focused} /> }} />
      <Tabs.Screen name="profile"   options={{ title: 'Profile',   tabBarIcon: ({ focused }) => <TabIcon icon="👤" focused={focused} /> }} />
    </Tabs>
  );
}
