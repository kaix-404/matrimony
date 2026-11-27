# Play Console submission copy — Networth Matrimony

**Applies to:** `com.networth.matrimony`, versionCode 1220 (`matrimony-1220.aab`, workflow run 220)
**Derived from:** the app and API as they stand in this repository, not from a template. Every
answer below is traceable to `apps/api/prisma/schema.prisma`, the screens in `apps/mobile/src/app`,
the shared contracts in `packages/shared/src/contracts`, and `apps/mobile/package.json`.

Anything marked **TODO** needs a decision or a value from the client. Nothing here is invented:
where the repository has no support address, privacy-policy URL or demo account, the field says so.

## What the app actually collects

| Source                                         | Data                                                                                                                                                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Registration (`auth.tsx`, `register.tsx`)      | Mobile number (login identity), one-time code, chosen net-worth band                                                                                                                                               |
| Profile (`onboarding.tsx`, `profile-edit.tsx`) | First/last name, gender, date of birth, height, marital status, religion, sub-caste, mother tongue, city/state/district, education, profession, income, family, horoscope, lifestyle, interests, "about me"        |
| Photos (`photos.tsx`)                          | Profile photographs, uploaded to object storage, moderated before display                                                                                                                                          |
| Identity (`verification.tsx`)                  | Aadhaar check through Cashfree Secure ID → DigiLocker. Stored: provider reference, last four digits, name and birth year as printed on the ID, consent record. For the manual fallback, the uploaded document copy |
| Payments (`checkout.tsx`, `setup-fee.tsx`)     | Razorpay order and payment ids, amount, GST, status. No card, UPI or bank credentials ever reach this app or its API                                                                                               |
| Device (`push.ts`)                             | The device push token only — FCM on Android, APNs on iOS. The API accepts an optional device id but this app never sends one                                                                                       |
| Safety (`report.tsx`, `blocks.tsx`)            | Reports filed, blocks, shortlists                                                                                                                                                                                  |

Not collected, and confirmed absent from the code: device location (no `expo-location`; city and
state are typed by the member), camera and microphone (no camera capture, no audio APIs), contacts,
SMS or call logs, calendar, health data, installed-app lists, advertising ID, analytics or
crash-reporting SDKs.

## Data safety — answers

**Data collection and security**

- Does the app collect or share required user data types? **Yes**
- Is all collected data encrypted in transit? **Yes** in the production build: the API and the
  storage presigned URLs are HTTPS. The development fallback is a localhost `http` URL and never
  ships
- Do you provide a way to request data deletion? **Yes** — in-app `delete-account.tsx` plus the
  export/erasure request screen (`data-request.tsx`). Play also wants a web URL: **TODO**
- Independent security review: **No**
- Committed to the Play Families policy: **No** — the app is for adults

**Data types**

| Play data type                              | Collected | Shared | Optional | Purpose                                         | Notes                                                                                                                                                                                                                                                     |
| ------------------------------------------- | --------- | ------ | -------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Personal info → Name                        | Yes       | No     | No       | App functionality, Account management           | No name is shown to another member before a paid unlock: `HIDDEN_BEFORE_PAYMENT` lists `first_name`, `last_name` and `name`                                                                                                                               |
| Personal info → Phone number                | Yes       | No     | No       | App functionality, Account management, Security | Login identity, and the contact detail disclosed after an unlock. No SMS vendor is configured yet — the API returns the code rather than sending it, so no number leaves for delivery                                                                     |
| Personal info → Email                       | Yes       | No     | Yes      | Account management                              | Added and changed from Settings after an emailed code; delivery goes through MSG91 as a processor                                                                                                                                                         |
| Personal info → Address                     | Yes       | No     | Yes      | App functionality                               | State, district and city as typed by the member; there is no device location collection                                                                                                                                                                   |
| Personal info → Race and ethnicity          | Yes       | No     | Yes      | App functionality                               | Religion, community and sub-caste, because matching is by community in this market                                                                                                                                                                        |
| Personal info → Other info                  | Yes       | No     | Yes      | App functionality                               | Date of birth, gender, marital status, height, education, profession, income band, family details, horoscope                                                                                                                                              |
| Photos and videos → Photos                  | Yes       | No     | Yes      | App functionality                               | Moderated; only approved photos are visible to anyone                                                                                                                                                                                                     |
| Financial info → Purchase history           | Yes       | Yes    | No       | App functionality                               | Razorpay receives the order, our payment id as the receipt, and order notes carrying the unlocked profile's id and first name. No instrument data reaches us                                                                                              |
| Government IDs                              | Yes       | Yes    | No       | App functionality, Security, Compliance         | Aadhaar via Cashfree Secure ID / DigiLocker. The full number is never stored; last four digits and the provider reference are. The manual fallback keeps an uploaded copy until the account is erased. Shared with Cashfree as the verification processor |
| App activity → Other user-generated content | Yes       | No     | Yes      | App functionality, Security                     | Profile text, "about me", reports and blocks used for moderation                                                                                                                                                                                          |
| Device or other IDs                         | Yes       | Yes    | No       | App functionality                               | FCM registration token on Android, APNs token on iOS; delivery runs through Firebase                                                                                                                                                                      |

**Not declared, because the app does not collect them:** precise or approximate location, financial
account numbers, health and fitness, messages (there is no in-app chat — no message or conversation
table exists in the schema; contact details are disclosed after an unlock and the conversation
happens off-platform), contacts, calendar, web browsing history, installed apps, crash logs,
diagnostics, advertising or tracking identifiers.

**Deletion and retention:** account deletion anonymises PII and starts the erasure deadline; payment
records are retained as required for tax and dispute handling. Aadhaar document copies are erased
with the account.

### How these answers were checked

The first draft was written from the data model and then checked against what the code sends. Three
rows were wrong and are corrected above:

- **Device identifiers.** `packages/shared/src/contracts/devices.ts` allows an optional `device_id`,
  but `apps/mobile/src/lib/push.ts` registers only `{ token, platform }`. The app sends no device
  identifier, so the row no longer claims one.
- **Phone number.** The draft said an SMS provider processes the number. It does not:
  `apps/api/src/auth/otp.service.ts` states the provider is undecided and returns the code instead of
  sending it. Nothing leaves the API for SMS delivery today.
- **Name.** The draft said the surname is withheld. In fact no name at all is shown before a paid
  unlock — `packages/shared/src/contracts/profile.ts` hides `first_name` and `last_name` in
  `HIDDEN_BEFORE_PAYMENT`.

Also verified while checking: no `Message`/`Conversation` model exists; the email gateway is MSG91;
Razorpay order notes carry the target profile's id and first name (`payments.service.ts`), which is
why the purchase-history row is marked as shared; and `http://` appears in the mobile source only in
a test fixture and the localhost development default.

## Store listing

**App name (30 max):** `Networth Matrimony`

**Short description (80 max):**
`Verified matrimony profiles, matched within your net-worth band.` (64 characters)

**Full description:**

```
Networth Matrimony is a matrimony app for families who want the introductions to start from a
shared understanding of standing, not from a directory of strangers.

Every member verifies their identity before they can be discovered. Verification runs through
DigiLocker, so the Aadhaar number is asserted and never stored — only the fact that the check
passed, the last four digits for confirmation, and the consent you gave.

Members choose a net-worth band when they register. Discovery works inside the bands you select,
and only for members who have selected yours: both sides opt in, so no profile is shown to a band
it did not open itself. The band cannot be changed afterwards, by the member or by the app.

Profiles carry what a matrimony introduction actually needs — family, education, profession,
community, horoscope, lifestyle, photographs — and photographs are reviewed by a moderator before
anyone sees them.

Contact details are disclosed one profile at a time, for 24 hours, after a small payment. There is
no subscription and no auto-renewal. Prices, including GST, are shown in the app before checkout.

Safety is built in rather than bolted on: report a profile, block a member, and your shortlist and
blocks stay private. Account deletion and a data export request are both in Settings.

We are an introduction service. We do not verify income claims or family circumstances, and we do
not arrange, negotiate or take part in any marriage.
```

**Category:** Dating (Play's closest match; Lifestyle is the alternative if the client prefers)
**Tags:** matrimony, marriage, verified profiles, Indian families
**Contact email:** **TODO** — the repository has no support address (`apps/mobile/src/app/help.tsx`
still has `null` for the care number and WhatsApp link)
**Website:** **TODO**
**Privacy policy URL:** **TODO** — required before any track can roll out

**Graphics:** 512×512 icon (the project has `assets/icon.png`), 1024×500 feature graphic, at least
two phone screenshots. The adaptive icon assets already exist under `apps/mobile/assets`.

## Content rating questionnaire — expected answers

- User-generated content, sharing of personal information, and a way to report/block: **yes**
- Digital purchases: **yes** (contact unlocks and the setup fee)
- Violence, sexual content, profanity, drugs, gambling, simulated gambling: **no**
- Shares the user's current location: **no**
- Allows users to interact or exchange contact details: **yes**, after a paid unlock

## Before the review

The reviewer needs a path through three gates the app enforces: the one-time code, identity
verification, and the setup fee. Without a review account that skips all three, the app is
unreviewable and will be rejected under the same rule that applies to any login-walled app.
**TODO** — decide whether the demo account is a production account with waivers or a seeded
environment.

Also note: the app sells digital access through Razorpay. That is acceptable for internal and
closed testing, but a production release needs Play Billing or a changed commercial model.
