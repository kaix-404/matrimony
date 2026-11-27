/**
 * Expo resolves this file over `app.json`, which stays the static base: name,
 * slug, plugins, permissions and everything else still come from there, and the
 * config passed in below is exactly that merged object.
 *
 * The Android version code is the one value that cannot live in a committed
 * file. Play orders uploads by it and refuses a code it has already seen, so it
 * has to rise on its own instead of depending on somebody remembering to edit
 * `app.json` before a release. The two build paths own it differently:
 *
 * - GitHub Actions (.github/workflows/android-build.yml) computes
 *   `1000 + GITHUB_RUN_NUMBER` and passes it in MATRIMONY_ANDROID_VERSION_CODE.
 * - EAS builds set `cli.appVersionSource: "remote"` and `autoIncrement` in
 *   eas.json, so Expo's servers own the counter and write it onto the native
 *   project. The value here is ignored on those builds, which is why nothing is
 *   injected when the variable is absent: a defined `android.versionCode` in
 *   app config only earns an "ignored, remove it" warning from EAS.
 *
 * With neither source present, `app.json` keeps whatever it declares and Expo
 * applies its own default of 1, so local prebuild and run:android are unchanged.
 *
 * Docs: https://docs.expo.dev/workflow/configuration/
 *       https://docs.expo.dev/build-reference/app-versions/
 */
module.exports = ({ config }) => {
  const fromEnv = process.env.MATRIMONY_ANDROID_VERSION_CODE;

  if (fromEnv === undefined) {
    return { ...config };
  }

  const versionCode = Number(fromEnv);

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
