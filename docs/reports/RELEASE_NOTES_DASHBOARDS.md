# Release notes — Admin console and Member app

**Period covered:** 8–9 November 2026
**Surfaces:** administration console, member mobile app (Android/iOS, plus the browser build)
**Status:** all changes below are deployed to production; the console and API are live.

This note describes what changed for the people who use the two dashboards. It is
written to be circulated as-is.

---

## Admin console

### Approvals that previously could not succeed

**Profile approval now works.** Before this change a submitted profile could be
opened and read, but never approved — so nothing a member sent in could ever
become visible to anyone. Support can now approve or reject with a reason, and
the console only offers decisions the server will actually accept, instead of
showing a button that ends in an error.

**Photo approval had the same fault and is fixed.**

When a decision is rejected for a missing note, the form now keeps the action
that was chosen. It used to fall back to "dismiss report" while still asking for
notes — so an administrator who meant to suspend an account could dismiss the
report instead.

### Member support

- **Restore a deleted account.** A Super Admin can undo a deletion while the
  account is still restorable, with a written reason recorded in the audit log.
  The member's profile comes back without losing its moderation history, and the
  account returns to whichever stage it actually belongs in — waiting for
  verification, or active.
- **Find a member** by mobile number or by status.
- **A member page that explains why an account is blocked**, rather than only
  showing that it is.
- **Identity checks** view, with an "Awaiting member" filter, so support can see
  who has started verification and who has not.
- **Reports** and **data requests** each have their own queue. Closing a report
  now notifies both people it names.
- **Lists page past the first twenty rows.** Beyond twenty, the rest were
  unreachable from the console.

### Console housekeeping

- Administrator accounts can be created and reviewed from the console, without
  the password appearing in the page address when a form is submitted.
- A failed sign-in says that it never reached the server, instead of showing a
  blank error page.
- Pricing can be read before it is edited.

---

## Member app

### Registration and onboarding

- **A new profile is submitted automatically when onboarding ends.** Previously
  it remained a private draft, which is why profiles sat unreviewed: nobody could
  approve something that had never been sent for approval.
- **Trying to register a closed account's number is refused**, with a message
  pointing to support. Before, this either revived the deleted account into a
  session that could not edit anything, or dropped the person into an error.

### Profile and discovery

- The member can see their review state, including a clear "Approved — members
  can find you" once moderation clears the profile.
- **Identity verification is reachable and usable.** New in this release: when a
  DigiLocker attempt's link has expired, the app says so and offers a fresh link,
  instead of telling the member to keep waiting for a check that can no longer
  finish.
- **Blocking** is complete from the member's side, and **reporting** a profile
  works — the server had accepted reports for some time with no way to file one
  from the app.
- **A suspension takes effect immediately.** If another member had already paid
  to unlock that profile, the phone number is withheld — with an explanation, so
  the buyer is not left wondering — instead of continuing to be shown.

### Data rights

- A member can request a copy of their data and see whether it is received or
  being prepared, together with the date an answer is owed. The copy is assembled
  by the team, and the app says so rather than implying it is instant.

---

## Two things this release does not deliver

**Real Aadhaar checks are not live yet.** The integration is built and the
credentials are in the production environment — the service now reports its own
status, which confirms this. The deployment is still pointed at Cashfree's
_sandbox_, which produces test verifications rather than real ones. Going live
needs Cashfree's production approval and a one-line configuration change.

**Approval is only half the gate.** A member must also pay the setup fee before
they can browse or be found. An approved profile on its own does not make someone
discoverable, so "approved but not yet discoverable" is expected behaviour, not a
fault.

---

## For the record

The public-facing changes above came with a small number of internal fixes that
have no visible behaviour but keep the two dashboards trustworthy: profile and
photo decisions are recorded through a single audited path, deleted numbers
cannot be quietly re-registered, and a stuck identity check no longer needs an
operator. These are noted here only so the console's audit trail can be explained
if it is reviewed.
