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

- `src/app/` - Expo Router routes (screens)
- `src/lib/` - API client, config, auth context
- `src/components/`, `src/screens/`, `src/hooks/` - placeholder structure for UI (to be populated by the UI spec)

## Quality gates

```bash
npx tsc --noEmit -p tsconfig.json   # typecheck
npx eslint "src/**/*.ts" "src/**/*.tsx"   # lint
```

Root `npm run verify` also typechecks and lints all workspaces after building `@matrimony/shared`.

## Notes

- No native push (FCM) registration yet; device token registration is defined by the shared contracts and the API at `POST /devices` - to be wired in when the UI needs it.
- Store bundle IDs (iOS/Android) are to be determined by the client before EAS builds.
- Metro consumes `@matrimony/shared` from its built `dist` (workspace). Rebuild shared if you edit contracts.
