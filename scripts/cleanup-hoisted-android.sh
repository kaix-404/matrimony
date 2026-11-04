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

echo "Done."
