#!/bin/bash
# npm 10 with hoist-limit=0 still hoists Expo packages to root
# node_modules. Their android/ subfolders trigger Gradle errors when
# the Android project is evaluated. Remove them after install.
#
# The native parts are handled by `npx expo prebuild` which generates
# its own android/ project in apps/mobile/android/, so removing these
# hoisted copies does not affect the build.
set -e

echo "Cleaning android/ folders from Expo packages..."

# Find all node_modules directories (root + workspaces) and clean Expo
# android/ folders within them. Use -maxdepth 2 within each node_modules
# so we only hit direct children (e.g. node_modules/expo/android, not
# node_modules/some-pkg/node_modules/expo/android).
find . -path "*/node_modules" -type d | while read -r nm; do
  find "$nm" -maxdepth 2 -type d -name "android" 2>/dev/null | while read -r dir; do
    pkg=$(dirname "$dir")
    # Only clean Expo-related packages
    if [[ "$pkg" == */expo* ]] || [[ "$pkg" == */@expo* ]] || \
       [[ "$pkg" == */@react-native* ]] || [[ "$pkg" == */react-native* ]]; then
      echo "  removing $dir"
      rm -rf "$dir"
    fi
  done
done

# Patch expo-router's _ctx.web.js to default EXPO_ROUTER_APP_ROOT to "."
# when the env var is not set. Metro's require.context fails with
# "Invalid call" when the first arg is undefined. The .env file normally
# provides this var for local dev, but CI may not have it.
#
# Using "." as default works because:
# - Locally: .env sets EXPO_ROUTER_APP_ROOT=. so it's already defined
# - CI: working-directory is apps/mobile/, so "." = apps/mobile/ which
#   contains src/app/ (the route files)
CTX_WEB="node_modules/expo-router/_ctx.web.js"
if [ -f "$CTX_WEB" ]; then
  if ! grep -q "EXPO_ROUTER_APP_ROOT ||" "$CTX_WEB" 2>/dev/null; then
    echo "Patching $CTX_WEB to default EXPO_ROUTER_APP_ROOT to '.'"
    sed -i 's/process\.env\.EXPO_ROUTER_APP_ROOT/process.env.EXPO_ROUTER_APP_ROOT || ".\/"/g' "$CTX_WEB"
  fi
fi

echo "Done."
