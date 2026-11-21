# Push delivery

Push notifications are queued before they are sent: a `PUSH` row is written to
`Notification` with `status = 'PENDING'`, and a 60-second timer in the API claims
one batch at a time and sends it through FCM. The member sees the entry in the
in-app list either way, so a dispatcher that has stopped produces no error, no
missing screen and no log line — only notifications that never arrive.

`GET /health/ready` (and the console's **Push delivery** card) reports the queue
itself, which is the evidence a stopped timer cannot fake:

```json
"checks": { "…": "…", "pushDispatch": "up" },
"pushBacklog": {
  "due": 2,
  "abandoned": 0,
  "oldestAt": "2026-11-21T14:03:00.000Z",
  "oldestAgeSeconds": 120,
  "overdue": false
}
```

- `due` — pending pushes a running dispatcher would send now: retries left and a
  device token registered for the recipient. Addresses without a device wait
  without counting (`pushDispatch` is not about them).
- `abandoned` — rows claimed as `SENDING` and never finished. A running
  dispatcher requeues these once they are five minutes old.
- `overdue` — the oldest of those has waited longer than five dispatch intervals
  (five minutes). That is the check going `down`.

## What `pushDispatch: down` means

The dispatcher is not draining the queue: its timer has stopped, the process is
wedged, or every pass is throwing. It does **not** fail readiness — the API still
serves members — and it does **not** mean FCM is misconfigured: on a deployment
without FCM credentials the dispatcher is correctly a no-op, so the check stays
`up` and `push` is the one that reads `down`.

## Confirming it

```bash
curl -s "$API/api/v1/health/ready" |
  jq '{pushDispatch: .checks.pushDispatch, backlog: .pushBacklog}'
```

Then ask the database what is waiting, oldest first:

```sql
select n.id, n.status, n.attempts, n."createdAt", n."lastError"
from "Notification" n
where n.channel = 'PUSH'
  and (
    (n.status = 'PENDING' and n.attempts < 5
      and exists (select 1 from "DeviceToken" d where d."userId" = n."userId"))
    or (n.status = 'SENDING' and n."updatedAt" < now() - interval '5 minutes')
  )
order by n."createdAt"
limit 20;
```

- Rows with a rising `attempts` and a `lastError` are failing at FCM, not stuck —
  that is a delivery problem, not a stopped dispatcher.
- The log says `Push dispatch sweep failed; will retry on the next interval.`
  when a pass throws; silence plus a growing queue is the stopped-timer case.
- Restarting the API is the repair for a stopped timer: the boot sweep runs
  immediately and re-arms the interval.

`pushBacklog: null` means the queue could not be read at all, and the check is
`down` for that too — "could not ask" is not "nothing waiting".
