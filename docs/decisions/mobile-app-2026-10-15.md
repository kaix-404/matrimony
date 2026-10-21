# Mobile App (Expo + TypeScript) - Decision Record

- Date: 2026-10-15
- Context: Phase 9 - Mobile app scaffolding, Expo + TypeScript
- Decision: Create `apps/mobile` as an Expo (SDK 57, React Native 0.86) workspace app, use Expo Router for navigation, TypeScript strict mode, and consume `@matrimony/shared` contracts.
- Rationale:
  - Expo + TypeScript matches the platform requirement; cross-platform iOS/Android first
  - Expo Router (file-based) mirrors the Next.js App Router style used by the admin dashboard and maps cleanly onto the UI spec to come
  - Shared contracts keep the API client typed and in sync with the backend

## Implementation details

- Generated via `create-expo-app` (blank-typescript, SDK 57); adapted to the monorepo workspace `@matrimony/mobile`
- `package.json`: `main: expo-router/entry`; deps include `expo-router`, `expo-constants`, `expo-linking`, `react-native-safe-area-context`, `react-native-screens`, `react-native-web`, `react-dom`, `@expo/metro-runtime`. Uses `@matrimony/shared` as a workspace dep (built `dist`)
- Config: `app.json` sets name `Matrimony`, slug `matrimony`, scheme `matrimony`, plugin `expo-router`, web bundler `metro`
- Structure: `src/app/` (routes), `src/lib/` (api-client, config, auth-context), `src/components|screens|hooks/` placeholders
- API client: typed `fetch` using `@matrimony/shared` Zod contracts; auth endpoints (otp/request, otp/verify, register, refresh, logout, me); device registration to be added per UI needs
- Auth: placeholder context (in-memory token) - will evolve when the onboarding UI is provided
- Quality gates: `typecheck` (`tsc --noEmit`) and `lint` (flat ESLint config matching the other workspaces); root `npm run verify` builds shared then typechecks and lints all workspaces including mobile
- Navigation: minimal `src/app/_layout.tsx` + `src/app/index.tsx` (placeholder); routes live in `src/app/` per `apps/mobile/AGENTS.md`

## Notes / open questions

- React versions: Expo SDK 57 pins React 19.2.3; the admin dashboard originally used 19.3.x and npm hoisted it, leaving the app with a nested 19.2.3 and `expo-doctor` flagging duplicate native modules. React/react-dom are now pinned to 19.2.3 everywhere (admin dependency, root `overrides`, and a root devDependency anchor so npm does not install a newer peer copy), which satisfies Next's `^19` peer and gives a single copy in the tree; `expo-doctor` passes all 21 checks.
- Native push (FCM): device token registration is already implemented server-side (`/devices` POST/GET/DELETE). Mobile will need FCM token retrieval (`expo-notifications` or `@react-native-firebase/messaging`); choice depends on distribution (Expo Go vs dev builds) - add later per requirements.
- EAS: store IDs (iOS `bundleIdentifier`, Android `package`) pending client decision (client questions list mobile platforms/store accounts as open)
- Env: `EXPO_PUBLIC_API_BASE_URL` or `expoConfig.extra.apiBaseUrl`; defaults to `http://localhost:4000/api/v1`

## Status

- Member app delivered: auth/onboarding, discovery with filters and sort, member previews and Razorpay checkout, the account setup fee, profile and photo management, visibility preferences, notifications, unlocks, and the For You tab
- Quality gates: typecheck, lint and Jest (`jest-expo`) run under root `npm run verify`; the suites cover the feed view model and interest helpers, and CI bundles the app (`expo export --platform web`) so a broken route or import fails before a device build
- `expo-doctor`: 21/21 checks pass (single React copy after pinning react/react-dom to 19.2.3)
