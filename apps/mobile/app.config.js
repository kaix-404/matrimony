/**
 * Expo resolves this file over `app.json`, which stays the static base: name,
 * slug, plugins, permissions and everything else still come from there, and the
 * config passed in below is exactly that merged object.
 *
 * The Android version code is the one value that cannot live in a committed
 * file. Play orders uploads by it and refuses a code it has already seen, so it
 * has to rise on its own instead of depending on somebody remembering to edit
 * `app.json` before a release. CI derives it from the workflow run number and
 * passes it in `MATRIMONY_ANDROID_VERSION_CODE`; a local `expo prebuild` or
 * `expo run:android` has no such value and falls back to the static
 * `android.versionCode` in `app.json`, so local builds are unchanged.
 *
 * Docs: https://docs.expo.dev/workflow/configuration/
 */
module.exports = ({ config }) => {
  const fromEnv = process.env.MATRIMONY_ANDROID_VERSION_CODE;
  const versionCode = Number(fromEnv ?? config.android?.versionCode ?? 1);

  // A release signed with an unparseable or non-positive code is rejected by
  // Play long after the build, so fail the build that produced it instead.
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    throw new Error(`MATRIMONY_ANDROID_VERSION_CODE must be a positive integer, got '${fromEnv}'.`);
  }

  return {
    ...config,
    android: {
      ...config.android,
      versionCode,
    },
  };
};
