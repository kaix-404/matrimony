# Networth Matrimony - Store Submission Requirements

**Prepared:** November 13, 2026 | **Applies to:** `apps/mobile` (Expo / React Native) | **Stores:** Google Play, Apple App Store

## Verdict

Neither store can accept the app today. The code is complete enough — the app builds, every screen works, and the store-facing identifiers are already set — but two of the blockers are policy decisions rather than engineering, and both stores have a hard gate the current build does not clear.

| Store           | Can submit today | Hard blockers                                                              |
| --------------- | ---------------- | -------------------------------------------------------------------------- |
| Google Play     | No               | Target API level 36, AAB artifact, in-app purchase policy, reviewer access |
| Apple App Store | No               | In-App Purchase, reviewer access, no iOS build pipeline, no iPad decision  |

The platform requirements below were checked on 13 November 2026 and change on Google's and Apple's schedule, not ours. Re-check them before submitting.

## Common Requirements

### The SDK upgrade is done; device testing is what remains

The app moved from **Expo SDK 52 / React Native 0.76.9** to **Expo SDK 57.0.34 / React Native 0.86.3**, which targets **Android 16 (API level 36)** — the level Google Play has required of new apps and updates since 31 August 2026 — where SDK 52 targeted API 34 and would have been refused outright. The CI workflow now installs platform 36, build-tools 36.0.0 and NDK 27.1.12297006, the toolchain React Native 0.86.3 compiles against, in place of the SDK 52-era platform 35, build-tools 35.0.1 and NDK 26. On iOS the same upgrade brings current privacy-manifest support and a maintained Expo module set. What it leaves is regression testing on physical devices, not the upgrade itself.

### Selling access inside the app is the second problem

The setup fee and the contact unlock are sold through Razorpay inside the app. Google Play and Apple both require their own billing systems for digital content, and a contact unlock is a digital entitlement rather than a physical good or a service delivered outside the app. Google offers Play Billing; Apple requires In-App Purchase and forbids steering users to an external payment page. This is a commercial decision that changes the API, the app and the pricing screen, so it must be settled before either store submission is planned in detail.

### Reviewers must be able to use the app

Every screen sits behind three gates: an SMS one-time code, identity verification, and the setup fee. A reviewer has no Indian number to receive the code, and even with one could not pass verification or payment to reach discovery, previews, unlocks or the profile. Both stores reject apps they cannot get into, and Apple asks for a demo account explicitly. A review path is therefore a feature — a pre-verified, fee-waived account, or a documented review sign-in — and it is a product decision because it touches production authentication.

### The backend must be awake and complete

The API runs on Render's free tier and sleeps when idle, so a reviewer's first request can take 30 to 60 seconds and look like a hung app. Two other gaps are visible from the first screen: email is not configured, so no address can be added or changed, and the community list is empty, so one profile picker is hidden rather than complete.

### Data protection disclosures

Both stores require a privacy policy URL, and both require disclosures that match what the app actually collects: mobile number, email, date of birth, photographs, partner preferences, location at state and city level, and Aadhaar-derived verification state. Aadhaar handling is consent-based and mediated by DigiLocker through Cashfree, which is the right answer to a reviewer's question, but it has to be written down rather than left to be inferred from the code. Account deletion already exists in the app, which satisfies both stores' in-app requirement.

## Google Play

### Technical requirements

| Requirement        | Current state                                                                           | What is needed                                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Artifact format    | CI runs `bundleRelease` and publishes `app-release.aab`, signed with the debug keystore | Nothing for the format; APKs have not been accepted for new apps since August 2021, but the bundle still needs the upload key in the Signing row |
| Target API level   | SDK 57 targets API 36                                                                   | Nothing for the level itself; regression-test on devices                                                                                         |
| Signing            | Debug keystore, suitable only for sideloading                                           | Upload key via EAS credentials, plus Play App Signing enrolment                                                                                  |
| Version code       | Not set; no auto-increment                                                              | `versionCode` starting at 1, incremented per upload                                                                                              |
| Package name       | `com.networth.matrimony`                                                                | Nothing; already correct                                                                                                                         |
| Permissions        | None beyond the SDK defaults                                                            | Nothing; the unused `RECORD_AUDIO` declaration is removed                                                                                        |
| Reproducible build | Written during `prebuild` by the local plugin `plugins/with-secure-store-backup-rules`  | Nothing; an EAS build runs the same plugin                                                                                                       |

### Policy requirements

- **Payments.** Digital content must use Google Play Billing. As built, checkout goes to Razorpay.
- **Data safety form.** Mandatory for every app and must match the app's real collection, including Aadhaar-derived data and photographs. An inaccurate declaration is itself a policy violation.
- **Account deletion.** The app has an in-app deletion path, which is required. Play also expects a web-accessible way to request deletion.
- **User-generated content.** Profile text and photographs make this a UGC app: reporting, blocking, moderation and a published contact route are all required. All four exist.
- **Ads.** The app serves no ads, which must be declared in the listing.

### Store listing assets

- App icon at 512 by 512 PNG, plus the adaptive icon already in the project.
- Feature graphic at 1024 by 500, no transparency.
- At least two phone screenshots, 320 to 3840 pixels per side.
- Short description, full description, category, contact email and the privacy policy URL.

### Testing before production

A new personal developer account must run a closed test with at least twelve testers who stay opted in for fourteen consecutive days before production access is granted. An organisation account is not subject to that gate. Either way, a closed track is where the review account, the fee waiver and the sleeping backend should be proven before a public release.

## Apple App Store

### Technical requirements

| Requirement       | Current state                                 | What is needed                                                     |
| ----------------- | --------------------------------------------- | ------------------------------------------------------------------ |
| Build pipeline    | No iOS workflow; Android only                 | EAS cloud build, or a macOS machine with Xcode                     |
| Apple account     | None in the repository                        | Apple Developer Program membership and an App Store Connect record |
| Bundle identifier | `com.networth.matrimony`                      | Nothing; already correct                                           |
| Build number      | Not set                                       | `ios.buildNumber`, incremented per upload                          |
| Push              | Client registers `IOS`; API sends through FCM | An APNs key uploaded to Firebase, or iOS push silently fails       |
| Privacy manifest  | Not verified                                  | `PrivacyInfo.xcprivacy` present and complete at build time         |
| iPad              | `supportsTablet` is true                      | Either test on iPad and supply iPad screenshots, or set it false   |

### Policy requirements

- **In-App Purchase (Guideline 3.1.1).** Digital features must be sold through StoreKit, with no link or button that steers a user to an external payment page. This is stricter than Google's rule and there is no exception that fits a contact unlock.
- **Reviewer access (Guideline 2.1).** A working demo account is required, and the account must reach the app's substantive screens.
- **User-generated content (Guideline 1.2).** Reporting, blocking, moderation, a filter for objectionable material, and published terms with a contact route. The app has all but the published terms.
- **Privacy and data (Guideline 5.1.1).** Purpose strings for every permission, a privacy policy, accurate App Privacy answers, and in-app account deletion. The last is already implemented.
- **Sign in with Apple (Guideline 4.8).** Not triggered: the app offers no third-party or social login, only mobile plus one-time code.
- **Age rating.** A matrimony app with user-generated content and contact exchange will land in the highest age bracket the store offers.

### Store listing assets

- App icon at 1024 by 1024.
- Screenshots for the current required device sizes, plus iPad screenshots while `supportsTablet` is true.
- Description, keywords, support URL, marketing URL and the privacy policy URL.
- App Privacy answers covering every data type collected.

### Testing before release

TestFlight is the equivalent of Play's closed track. Internal testers need no review; external testers do, so the review account should be exercised internally first. App Review typically answers within a day or two, but a rejection returns a written reason and costs another cycle.

## Implementation Status

| Area                | Requirement                                              | Status  | Owner  |
| ------------------- | -------------------------------------------------------- | ------- | ------ |
| Framework           | Expo SDK 57 / RN 0.86.3                                  | Done    | Us     |
| Android artifact    | AAB instead of APK                                       | Done    | Us     |
| Android target API  | API 36                                                   | Done    | Us     |
| Android build       | Config plugin for secure-store resources                 | Done    | Us     |
| Both stores         | Version code and build number auto-increment             | Work    | Us     |
| Android permissions | Remove unused `RECORD_AUDIO`                             | Done    | Us     |
| iOS build           | EAS iOS build and Apple account                          | Blocker | Client |
| iOS push            | APNs key in Firebase                                     | Blocker | Client |
| Payments            | Play Billing or Apple IAP, or a new model                | Blocker | Client |
| Review access       | Demo account, verification and fee waiver                | Blocker | Both   |
| Backend             | Paid instance or keep-alive during review                | Work    | Client |
| Backend             | Email credentials                                        | Work    | Client |
| Backend             | Community list values                                    | Work    | Client |
| Listing             | Privacy policy, terms, screenshots, feature graphic      | Work    | Client |
| Play testing        | Closed test, 12 testers over 14 days                     | Gate    | Client |
| Apple testing       | TestFlight build and external review                     | Gate    | Client |
| Documentation       | Status report and this document state SDK 57 / RN 0.86.3 | Done    | Us     |

## Suggested Sequence

1. Decide the payments model. Nothing else in the store plan can be finalised until this is settled, because it changes screens, the API and the review notes.
2. Test the SDK 57 upgrade on a physical Android device and an iPhone: checkout, push, secure-store restore and edge-to-edge are all behaviour a typecheck cannot see.
3. Build the review path: a demo account that skips verification and the fee, seeded with enough profiles to exercise discovery, previews and unlocking.
4. Produce the AAB for Play and the iOS build for TestFlight; set up signing, Play App Signing and the APNs key.
5. Prepare the listing and privacy material for both stores, then run the closed test and TestFlight before requesting production review.

## Decisions Needed

- Which billing route the product takes: Google Play Billing and Apple IAP, or selling access outside the stores and shipping the app as a free directory.
- Whether a review account is acceptable in production, and if so what it may see.
- Who owns the Google Play Console and Apple Developer accounts, and who holds the recovery credentials.
- Who writes and hosts the privacy policy and terms, since both stores require public URLs.

## Sources

- Google Play target API level requirement: https://developer.android.com/google/play/requirements/target-sdk
- Google Play target API levels, Play Console Help: https://support.google.com/googleplay/android-developer/answer/11926878
- Google Play Billing: https://developer.android.com/google/play/billing
- App Store Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple privacy manifests: https://developer.apple.com/documentation/bundleresources/privacy_manifest_files
