# Webhook reconciliation (lost deliveries)

The API runs on Render's free plan. An instance that has had no traffic for
fifteen minutes is stopped, and the next request — a Razorpay capture webhook, a
DigiLocker callback — waits for a cold start that runs `migrate deploy`, the demo
seed and Nest's bootstrap before anything answers. Both providers retry, but
their retry windows are shorter than that boot. The result is a settlement the
provider recorded and this API never wrote:

- the member paid and no `ContactUnlock` (or no account activation) exists;
- the member authorised DigiLocker, Cashfree says the check passed, and the row
  here is still `PENDING`.

A webhook cannot repair either case, because the webhook is what was lost. The
recovery path is a read of the same provider APIs:

|          | Payments                                                                                                                             | Identity                                                                        |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Read     | `orders.fetchPayments(orderId)`                                                                                                      | `GET /verification/digilocker?verification_id=<our row id>`                     |
| Repaired | `payment.captured`                                                                                                                   | `AUTHENTICATED`, `FAILED`, `CONSENT_DENIED`, `EXPIRED`                          |
| Effect   | the same `confirmCapture` the webhook uses: amount checked against the snapshot, guarded transition, unlock/activation, notification | the same `applyOutcome` the webhook uses: row status, user status, notification |
| Code     | `apps/api/src/payments/payments.service.ts` → `reconcilePending`                                                                     | `apps/api/src/verification/verification.service.ts` → `reconcilePending`        |
| Driver   | `apps/api/src/reconciliation/provider-reconciliation.sweeper.ts`, wired in `app.module.ts`                                           | same                                                                            |

The sweep runs **once at boot** (the first moment after a wake-up when anything
can be reconciled) and then **every 10 minutes** while the instance is awake. The
boot sweep is fired without awaiting, so a slow or refused provider call never
delays readiness.

## Bounds

Both halves use the same limits, deliberately small because they run on a free
instance:

- **2-minute grace** — nothing younger, so a webhook still in flight is not raced.
- **7-day lookback** — older rows are a support question, not a sweep's.
- **25 rows per sweep** — a backlog drains over consecutive sweeps rather than in
  one burst of vendor calls.
- **10-second read timeout** — every Razorpay order read is aborted after ten
  seconds, so a provider that accepts the connection and never answers cannot
  hold the sweep: even a full batch ends in under five minutes. A timed-out read
  is logged as `could not read order order_…: Razorpay order payments read timed
out after 10 s (order order_…)` and retried on the next sweep.
- **One sweep at a time** — a tick that arrives while the previous sweep is still
  running is skipped with `[reconcile] previous sweep is still running; skipping
this one.`, not queued. One line per skipped tick, and the next tick reads the
  same rows anyway.

Identity additionally requires a **lapsed consent link**
(`providerReferenceExpiresAt < now`), because a session the member is still
inside will legitimately report `PENDING`.

## What the provider must not be able to do

- **An unfinished attempt grants nothing.** `PENDING` at the provider leaves the
  row as it is.
- **Only a capture is settled, never a failure.** A failed attempt is not written
  as `FAILED`, because the member can retry the same Razorpay order; a terminal
  row would then refuse the later capture. A stuck `PENDING` row is harmless and
  visible; a wrongly `FAILED` one loses money.
- **An unknown status is not guessed at.** Cashfree adding a status must not
  become an account that verified itself — `statusForProvider` returns `null`
  and the row is left alone.
- **No credentials, no calls.** With `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` or
  `CASHFREE_CLIENT_ID`/`CASHFREE_CLIENT_SECRET` empty, the sweep returns zeros
  before it queries or calls anything.

A recovered capture is recorded in `WebhookEvent` under the key the real delivery
would have used (`payment.captured:<gateway payment id>`), so a webhook that
arrives afterwards is recognised as a duplicate instead of settling twice.

## Confirming it works

Filter the API log for `[reconcile]`.

**At every boot** — one line, present even when there was nothing to do, which is
how you know the path ran rather than being silently skipped:

```
[reconcile] startup sweep — payments: 0 due, 0 settled, 0 unpaid, 0 errors; identity: 0 due, 0 applied, 0 unfinished, 0 errors
```

**When a payment was recovered** (the line that proves the feature works):

```
[reconcile] payment cm3x… settled from Razorpay order order_R1a2b3c: captured 11682 INR, no webhook had been recorded.
[reconcile] payments: 1 due, 1 settled, 0 unpaid, 0 errors.
```

**When an identity check was recovered:**

```
Reconciled DigiLocker status AUTHENTICATED applied to verification cm3y…: VERIFIED
[reconcile] identity: 1 due, 1 applied, 0 unfinished, 0 errors.
```

Cashfree failures are summarised **once per sweep**, however many attempts were
read — when the IP is refused it is refused for all of them, and one line per
attempt would hide the fact behind its repetitions:

```
[reconcile] identity: could not read 3 attempts from Cashfree; will retry on the next sweep. Cashfree DigiLocker status failed (HTTP 403): IP not allowed
```

**Failure lines, and what each means:**

| Line                                                                                           | Meaning                                                                                              |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `[reconcile] could not read order order_…: …`                                                  | Razorpay unreachable, timed out, or rejected the key; retried next sweep.                            |
| `[reconcile] previous sweep is still running; skipping this one.`                              | The last sweep has not finished — expected once per tick while a provider is hanging, and harmless.  |
| `[reconcile] identity: could not read N attempts from Cashfree; … HTTP 403`                    | Cashfree refused this host's IP — see below. Not a code fault.                                       |
| `[reconcile] payments sweep failed` / `identity sweep failed`                                  | The database query itself failed; the other provider still ran.                                      |
| `[reconcile] order … is captured at Razorpay but payment … is FAILED; needs a human decision.` | Money was taken against a row already terminal. Not written automatically: settle or refund by hand. |

**In the database**, for the payment named in the log:

```sql
select id, status, purpose, "gatewayPaymentId", "paidAt", "amountVerifiedAt"
from "Payment" where id = '<payment id>';

select "eventId", "eventType", "processedAt" from "WebhookEvent"
where "paymentId" = '<payment id>';
```

A recovered payment has `status = 'SUCCESS'`, a `paidAt`, and a `WebhookEvent`
row dated at the sweep. For an identity check, `IdentityVerification.status` is
`VERIFIED` with `verifiedAt` set, and the member's `User.status` has moved from
`PENDING_VERIFICATION` to `AWAITING_SETUP_FEE`.

## Two things this does not fix

1. **Cashfree still refuses this deployment's IPs.** The identity half of the
   sweep will therefore log `HTTP 403` once per sweep until the IPs are
   whitelisted (see `docs/ops/identity-verification.md`). The payment half has no
   such problem, so it is the half that demonstrably works today. The manual
   document fallback remains the way identity is completed in the meantime.
2. **It is a repair, not a delivery mechanism.** Recovery takes up to one sweep
   interval while awake, or the next boot if the instance is asleep. A member who
   pays and waits will see the unlock on their next app foregrounding or within
   ten minutes, not instantly — the webhook is still the fast path.

A `FAILED` row that Razorpay reports as captured is deliberately not settled by
this sweep. Changing a terminal payment back to `SUCCESS` (or refunding it) is a
reconciliation decision with money attached, and the log line is the escalation.
