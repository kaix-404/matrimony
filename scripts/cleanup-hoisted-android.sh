#!/bin/bash
# npm 10 with hoist-limit=0 still hoists Expo packages to root
# node_modules. Their android/ subfolders trigger Gradle errors when
# the Android project is evaluated. Remove them after install.
#
# The native parts are handled by `npx expo prebuild` which generates
# its own android/ project in apps/mobile/android/, so removing these
# hoisted copies does not affect the build.
set -e

echo "Cleaning android/ folders from hoisted Expo packages..."

find node_modules -maxdepth 2 -type d -name "android" | while read -r dir; do
  pkg=$(dirname "$dir")
  # Only clean Expo-related packages
  if [[ "$pkg" == node_modules/expo* ]] || [[ "$pkg" == node_modules/@expo* ]] || \
     [[ "$pkg" == node_modules/@react-native* ]] || [[ "$pkg" == node_modules/react-native* ]]; then
    echo "  removing $dir"
    rm -rf "$dir"
  fi
done

echo "Done."
