/**
 * Jest for the member app.
 *
 * `jest-expo` rather than plain babel-jest, which is what this workspace used
 * implicitly (there was no config at all). expo@57 ships `expo/virtual/env` as
 * real ESM, and babel-jest's default `transformIgnorePatterns` refuses to
 * transform anything under node_modules — so importing `expo-constants`
 * anywhere in a tested module died with `Unexpected token 'export'`. The preset
 * exists to know which node_modules packages Expo still has to transform, and
 * it also supplies the React Native mocks (Platform, NativeModules) the app's
 * logic modules touch.
 */
module.exports = {
  preset: 'jest-expo',
  // The suites are logic-only and live beside the code they cover, so the
  // default `src` root discovery and the preset's transform are enough.
  testMatch: ['**/*.test.ts', '**/*.test.tsx'],
};
