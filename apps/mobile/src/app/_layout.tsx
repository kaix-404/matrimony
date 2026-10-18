import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../lib/auth-context';
import { installNotificationHandler } from '../lib/push';

export default function RootLayout() {
  useEffect(() => {
    installNotificationHandler();
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="variants" />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
