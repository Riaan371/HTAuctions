import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: '#EAF2F1' },
        headerTitle: '',
        headerTintColor: '#17293D',
        headerBackTitle: 'Back',
        contentStyle: { backgroundColor: '#EAF2F1' },
      }}
    />
  );
}
