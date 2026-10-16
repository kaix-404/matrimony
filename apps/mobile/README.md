This is an Expo + TypeScript mobile application for the matrimony platform. It uses Expo Router with file-based navigation, TypeScript, and consumes contracts from `@matrimony/shared`.

## Local development (after install)

From the repo root:

```bash
npm install
cd apps/mobile
npx expo start
```

To run on a device: `npx expo start --android`, `npx expo start --ios`, or `npx expo start --web`.

## Environment

- `EXPO_PUBLIC_API_BASE_URL` (optional) overrides the API base URL. Defaults to `http://localhost:4000/api/v1`.
- The API base URL is also read from the Expo config `extra.apiBaseUrl` if present.

## Architecture

- `src/app/` - Expo Router routes (screens). `index.tsx` is the home feed; `variants.tsx` previews all hero variants.
- `src/theme/tokens.ts` - design tokens (colors, gradients, radii, spacing, shadows, layout, typography).
- `src/components/` - `AppShell`, `HeaderBar`, `SearchBar`, `StoryCarousel`, `FilterChips`, `FilterHeroCard`, `SearchFilterRow`, `HeroSection`, `FeedCard`, `BottomNav`.
- `src/screens/` - composed screens (`HomeFeedScreen`).
- `src/data/sample.ts` - placeholder feed/story/chip content (swap for API data).
- `src/lib/` - API client, config, auth context.

## Design system

The home UI follows the client-supplied spec: coral accent (`#FF5A43`), near-white surfaces, 24-28px card radii, pill controls, soft diffused shadows, and a phone-width canvas (max 412px) centred on wider viewports. Gradient rings and scrims use `expo-linear-gradient`; icons use `@expo/vector-icons` (Ionicons). `HeroSection` exposes four interchangeable search/hero variants via a `variant` prop.

## Quality gates

```bash
npx tsc --noEmit -p tsconfig.json   # typecheck
npx eslint "src/**/*.ts" "src/**/*.tsx"   # lint
```

Root `npm run verify` also typechecks and lints all workspaces after building `@matrimony/shared`.

## Notes

- No native push (FCM) registration yet; device token registration is defined by the shared contracts and the API at `POST /devices` - to be wired in when the UI needs it.
- Sample feed imagery uses remote placeholder URLs; replace with profile API data.
- Store bundle IDs (iOS/Android) are to be determined by the client before EAS builds.
- Metro consumes `@matrimony/shared` from its built `dist` (workspace). Rebuild shared if you edit contracts.
