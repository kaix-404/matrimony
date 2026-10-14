# Push delivery over Firebase — 2026-10-14

Implements **section 42** push delivery on the transport the client chose on
2026-10-01: Firebase Cloud Messaging, HTTP v1. Until now `Notification` rows were
written for every channel but only `SMS` had a sender, so `PUSH` notifications sat
`PENDING` forever and were visible only in the in-app list. This adds the missing
halves of the channel: a place to record a device's FCM token, a gateway that sends
to it, and a sweeper that drains the queue.

## Decision

- **HTTP v1 with a service-account assertion, not the legacy server key.** The legacy
  server key is deprecated and was already dropped from `env.ts`. HTTP v1
  authenticates by signing a short-lived RS256 JWT and exchanging it for an OAuth2
  access token, which is cached until it nears expiry. That is done on `node:crypto`
  rather than pulling in `firebase-admin`, which would drag a large SDK in for two
  HTTP calls.
- **The gateway is a substitutable seam.** `PushGateway` is abstract and bound to
  `FcmPushGateway` in `PushModule`; the same shape as `SmsGateway` and the payment
  gateway. Tests exercise send decisions and response parsing without the network, and
  nothing outside the gateway can reach FCM.
- **Fail closed when unconfigured.** With `FCM_SERVICE_ACCOUNT_JSON` empty or
  malformed the gateway reports `configured = false`; the dispatcher returns without
  touching the queue. A missing credential disables push rather than half-sending.
- **A dead token is a result, not an error.** FCM answers `UNREGISTERED` (404) for a
  token whose app was uninstalled. `send` reports that as `invalidToken` so the caller
  prunes the row; throwing instead would look like an outage and strand the
  notification in `FAILED` forever.
- **Registration is an upsert keyed on the token, reassigning its owner.** A token can
  outlive the account that registered it — the same phone can be signed into a second
  account. Upserting and reassigning `userId` is what stops pushes for the old account
  from continuing to reach the device.
- **The token is never echoed.** It is the device's own secret; responses carry only
  the row id, platform, optional device id, and timestamps, so a response cannot leak
  a token and access logs stay free of it.

## Delivery is at-least-once, never twice-per-worker

`Notification.status` gains `SENDING`, between `PENDING` and `SENT`, to make the claim
explicit. The dispatcher lists `PENDING` `PUSH` rows whose owner has a device, then
flips each to `SENDING` with a conditional `updateMany({ where: { id, status: 'PENDING' } })`.
Only a caller that gets `count === 1` sends, so two dispatchers — or two API
instances — cannot both deliver the same row. A row left `SENDING` by a crashed worker
is requeued to `PENDING` once it is older than five minutes (measured on `updatedAt`),
which is why the index is `(channel, status, createdAt)`: the sweep is a scan of one
status ordered by age.

Delivery to a user's several devices is best-effort per notification: one success
marks the row `SENT`, dead tokens are pruned, and a device that errored is left to the
next event rather than retried as its own row. If every device fails, the row is
`FAILED`; after five attempts it is no longer retried.

## Effect on the build

- `DeviceToken` model, `DevicePlatform` enum, `NotificationStatus.SENDING`, and the
  `(channel, status, createdAt)` index; migration `20261014140000_device_tokens_push`.
- Shared contracts in `packages/shared/src/contracts/devices.ts`
  (`RegisterDeviceTokenSchema` strict, platform enum, token 1–4096) and
  `DEVICE_PLATFORMS` in `enums.ts`; `NotificationStatusSchema` gains `SENDING`.
- `PushModule` / `FcmPushGateway`; `POST|GET /devices` and `DELETE /devices/:token`
  under `JwtAuthGuard`; `PushDispatchService` and `PushDispatchSweeper` (60 s interval,
  boot sweep, `unref()`, failures caught and logged).
- `UnlockExpiryReminder` switches from `IN_APP` to `PUSH`
  ([unlock-expiry-reminder-2026-10-14.md](unlock-expiry-reminder-2026-10-14.md)); the
  event key is unchanged.

## Open / follow-ups

- **No real send has been exercised.** `FCM_SERVICE_ACCOUNT_JSON` is empty and no
  client credential has been provided, so the integration is unit-tested against a
  mocked `fetch` only. The client has an Admin SDK JSON in the repo that can supply a
  service account for a live check.
- **FCM is a third party for content.** Notification text and the small `data` map
  pass through Google, so they carry no sensitive profile data — ids and event keys,
  not names or photos.
- **`PUSH` is not fanned out to a segment.** Only per-user rows are delivered; a
  notification with no `userId` is not pushed here.
- **The sweep is per-instance**, like the other timers; the row claim keeps delivery
  correct across instances.
