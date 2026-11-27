/**
 * Expo resolves this file over `app.json`, which stays the static base for
 * everything except the Android version code.
 *
 * Play refuses a version code it has already accepted, so it cannot live in a
 * committed file. GitHub Actions passes one in MATRIMONY_ANDROID_VERSION_CODE
 * (`1000 + GITHUB_RUN_NUMBER`). EAS production builds own their own counter
 * remotely (`appVersionSource: "remote"` plus `autoIncrement` in `eas.json`), so
 * nothing is injected when the variable is absent and a local build keeps
 * Expo's default.
 *
 * Docs: https://docs.expo.dev/build-reference/app-versions
 */
module.exports = ({ config }) => {
  const fromEnv = process.env.MATRIMONY_ANDROID_VERSION_CODE;
  if (fromEnv === undefined) return config;

  const versionCode = Number(fromEnv);

  // Play rejects a non-positive or unparseable code long after the build, so
  // fail the build that produced it instead.
  if (!Number.isInteger(versionCode) || versionCode <= 0) {
    throw new Error(`MATRIMONY_ANDROID_VERSION_CODE must be a positive integer, got '${fromEnv}'.`);
  }

  return { ...config, android: { ...config.android, versionCode } };
};
