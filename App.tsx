// This file exists so that expo/AppEntry.js (resolved from root
// node_modules/expo/) can find ../../App when running `npx expo export
// --platform web` from the monorepo root or any subdirectory.
//
// The real app entry is apps/mobile/App.tsx; this re-exports it so
// Metro's module resolution succeeds during the web export step.
export { default } from './apps/mobile/App';
