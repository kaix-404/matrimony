import Constants from 'expo-constants';

const EXPO_PUBLIC_API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;
const DEFAULT_API_BASE_URL = 'http://localhost:4000/api/v1';

interface ExpoExtra {
  apiBaseUrl?: string;
}

function getApiBaseUrl(): string {
  const extra = (Constants.expoConfig?.extra ?? {}) as ExpoExtra;
  const fromExtra = typeof extra.apiBaseUrl === 'string' ? extra.apiBaseUrl : undefined;
  const candidate = fromExtra ?? EXPO_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  return candidate.replace(/\/+$/, '');
}

export const config = {
  apiBaseUrl: getApiBaseUrl(),
} as const;
