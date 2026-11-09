# Demo profiles

Twelve invented members, so discovery, profile preview and the unlock/payment
flow can be exercised in a deployment whose only real accounts are the client's
own test members.

They are defined in `apps/api/prisma/demo-profiles.ts` and created by
`prisma/seed.ts` on boot, which is the only moment the API image writes them.

## What they are

| Band | Profiles |
| --- | --- |
| Below 2 Cr | Aarti Sharma (F), Rohan Patel (M), Sneha Iyer (F) |
| 2–5 Cr | Meera Nair (F), Vikram Reddy (M), Divya Fernandes (F) |
| 5–10 Cr | Kavya Menon (F), Arjun Chopra (M), Isha Kulkarni (F) |
| Above 10 Cr | Ananya Rao (F), Siddharth Bajaj (M), Riya Singh (F) |

Three per band and both genders, because a test member sees their own band by
default: whichever band they registered in already has a feed, and widening the
discovery setting adds the other nine.

Each fixture is created as:

- `User`: `ACTIVE`, phone verified, identity verified, setup fee paid — the four
  gates the discovery query checks. Mobile numbers are in the reserved
  `90000000xx` block (`9000000001`–`9000000012`).
- `Profile`: `APPROVED`, `ACTIVE` visibility, with city, state, religion, mother
  tongue, height, marital status, company, income and a family description.
- `PartnerPreference`: `visibilityConfigured = true`.
- `UserVisibilityCategory`: all four bands, so a member who widens their own
  discovery finds all twelve rather than three.

Every about-me text opens with *"Demo profile used to test browsing and
unlocking."* If a real member ever opens one, that sentence is the label. Their
numbers are fake, so an unlock reveals nothing real.

**No photos.** Photos are object keys in S3/R2 with short-lived presigned URLs,
so a seeded row would point at an object that was never uploaded and render as a
broken image. Cards and the gallery fall back to their designed empty state
instead. Adding images means uploading real objects; it is not part of this
fixture set.

## Turning it on and off

Controlled by one environment variable, read by the seed:

| `SEED_DEMO_PROFILES` | Effect on boot |
| --- | --- |
| `true` (or `1`) | Create any missing fixtures; refresh their descriptive text |
| `remove` | Delete every user whose mobile starts `90000000` |
| unset, `false`, anything else | Nothing |

`render.yaml` sets it to `"true"` for the API service. Because the value is part
of the service definition, changing it triggers a redeploy, and the boot runs
`migrate deploy` → `seed` → serve. No shell access is needed, which matters
because this service is on the free plan and has no pre-deploy command.

**Before real members use the product:** set the value to `remove`, redeploy
once, then set it to `false` and redeploy again. The first deploy deletes the
fixtures; the second stops recreating them. Deleting the users cascades to their
profiles, preferences and visibility rows. Unlocks that were bought against a
fixture are deleted first, because `ContactUnlock.profile` is `onDelete:
Restrict`; the payment rows that produced them are kept with `targetProfileId`
null, since a test payment is still a payment record.

A fixture that already exists keeps its lifecycle state. The seed refreshes
descriptive fields only, so re-running never resurrects a profile an
administrator suspended, nor a user suspended for testing moderation.

## How to see them in the app

1. Sign in as a test member. Discovery requires all four gates, so the account
   must be `ACTIVE`: identity verified (Cashfree **sandbox** — see
   `identity-verification.md`) and the setup fee paid.
2. Open the feed. The three fixtures in that member's net-worth band appear.
3. To see the other nine, widen the discovery bands in **Settings & privacy** →
   discovery preferences. Each fixture accepts every band, so all twelve become
   visible; that is the two-way visibility rule working, not a leak.
4. Tap a profile for the preview. Locks are expected: name, location, income and
   contact stay hidden until unlock.
5. Unlock to exercise the payment flow. The price is quoted from the **target's**
   band (₹116.82 / ₹293.82 / ₹588.82 / ₹1,178.82 including GST), not the viewer's.
   Pay through Cashfree sandbox — the app never marks a payment successful
   itself, it waits for the verified webhook — and the contact section reveals the
   fixture's fake number for 24 hours.

## If something does not appear

- **Empty feed for a real member who is verified and paid.** Check their
  discovery preference: an explicitly saved empty selection means "nobody", and
  is honoured. Profiles appear for their own band by default.
- **A fixture missing.** Check the boot log line `demo profiles : …`. The seed
  reports `12 created`, `0 created, 12 already present`, or the removal count. If
  it says `skipped`, the variable is not reaching the container.
- **A fixture you suspended is still suspended after a deploy.** Expected: the
  seed does not own moderation state.

## Limits

- The fixtures cannot be signed in as. Login is OTP by mobile number, and these
  numbers receive no SMS — which is also what stops them being usable accounts.
- Education and profession are left unset. They are master-list backed, and the
  master lists are seeded as empty containers awaiting the client's values;
  inventing entries would create data the business never approved.
- The seed writes are exercised only through typechecking and the fixture
  assertions in `src/discovery/demo-profiles.test.ts`. The database round-trip
  itself has not been run against a live database from a development machine
  (none is available here), so the first real execution is the deploy that ships
  it. Watch that boot log line.
