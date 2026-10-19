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
          <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
          <Stack.Screen name="register" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="member/[id]" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="delete-account" />
          <Stack.Screen name="unlocks" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="checkout" />
          <Stack.Screen name="variants" />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
