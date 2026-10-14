# Unlock pre-expiry reminder — 2026-10-14

Implements the **section 15 / client decision C3** reminder: a buyer is nudged
two hours before an unlock lapses. The configuration
(`UNLOCK_EXPIRY_REMINDER_HOURS`, default `2`) and the event
(`NOTIFICATION_EVENTS.UNLOCK_EXPIRING_IN_2H`) already existed in shared and env but
nothing consumed them, so an unlock simply went quiet until it expired. This closes
the last explicit Phase 7 left-over.

## Decision

- **Idempotency lives on the row, not on the timer.** `ContactUnlock` gains a
  `reminderSentAt` column. The sweep claims an unlock with a conditional
  `updateMany({ where: { id, reminderSentAt: null } })`; only the caller that gets
  `count === 1` writes the notification. A restart mid-window, a double-scheduled
  sweep, or a redeploy across the boundary therefore cannot notify twice. The
  alternative — trusting that a single in-process timer runs once — breaks the
  moment the API is scaled past one instance.
- **Channel is `IN_APP`.** No push transport is wired, and the in-app list is the
  surface a user actually reads, so recording the reminder there is honest. A push
  provider added later reads the same `Notification` rows; the event key does not
  change.
- **A dedicated timer, not a cron.** `UnlockExpiryReminder` follows the existing
  `UnlockExpirySweeper` / `ClockDriftGuard` shape: a `setInterval` (5 min) with
  `unref()`, a boot sweep, and every failure caught and logged so a background
  callback can never become an uncaught exception. It needs no new dependency.
- **The claim stays in `UnlockService`.** `ContactUnlock` is written in exactly one
  place, so the reminder does not reach around the service that owns the table. The
  scheduler only decides *what to do* with a claim (write a notification), which is
  a notifications concern.

## Window rule

An unlock is due when `status = ACTIVE`, `reminderSentAt IS NULL`, and
`now < unlockExpiresAt <= now + UNLOCK_EXPIRY_REMINDER_HOURS`. Rows already past
expiry are excluded — a reminder for a dead window is noise, and the expiry pass owns
those rows. Rows still further out are picked up on a later sweep as the window
approaches.

## Effect on the build

- `ContactUnlock.reminderSentAt` plus migration
  `20261014130000_unlock_reminder_sent` (a single nullable `TIMESTAMP(3)` column).
- `UnlockService.claimDueReminders(leadMs, now) -> DueUnlockReminder[]`, unit-tested
  for the claim/once-only boundary.
- `UnlockExpiryReminder` (own module provider in `UnlockModule`) records one
  `IN_APP` notification per claim, keyed off `UNLOCK_EXPIRY_REMINDER_HOURS`.

## Open / follow-ups

- **Delivery is recorded, not pushed.** The notification is stored `PENDING` in the
  in-app list; there is still no push (FCM/APNs) transport, so the "reminder" is only
  visible when the buyer opens the app. Client decision needed on whether push is in
  scope for launch.
- **The sweep is per-instance.** With more than one API instance every instance runs
  a sweep; the row claim keeps that correct, but it is worth noting that the timer is
  a scheduler, not a distributed one.
