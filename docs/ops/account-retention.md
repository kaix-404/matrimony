# Account retention

Deleting an account is soft: `deleteAccount` sets `purgeAfter` to the end of the
retention window (`DELETED_ACCOUNT_RETENTION_MONTHS`, client answer F6) and the
member can no longer sign in. The PII is erased later — mobile replaced with a
tombstone, email cleared, profile blanked, payments kept — by a six-hourly timer
in the API. That timer is the only reader of `purgeAfter`, so a stopped sweep
leaves a legal deadline passing with no error, no missing screen and no log line.
The rows it should have erased stay readable in the database.

`GET /health/ready` (and the console's **Account retention** card) reports the
queue itself, which is the evidence a stopped timer cannot fake:

```json
"checks": { "…": "…", "accountRetention": "up" },
"accountRetention": {
  "due": 3,
  "oldestDueAt": "2026-11-21T04:26:55.028Z",
  "oldestOverdueSeconds": 50400,
  "overdue": true
}
```

- `due` — accounts past `purgeAfter` that are still `isAnonymised = false`: the
  whole overdue set, and the number an audit asks for.
- `oldestDueAt` — when the oldest of those became due, i.e. when the purge was
  owed, not when the account was deleted.
- `oldestOverdueSeconds` — how far past that deadline the oldest one is.
- `overdue` — that overrun is longer than two sweep intervals (12 hours). One
  interval is normal: a deadline that falls just after a pass waits almost six
  hours. Two missed passes in a row means the timer is not running.

## What `accountRetention: down` means

The sweep has not anonymised what it owes: its timer has stopped, the process is
wedged, or every pass is throwing. It does **not** fail readiness — the API still
serves members — and nobody can see the affected accounts, because they are
already deleted. What is slipping is the erasure deadline, not a feature.

`accountRetention: null`, with the check `down`, means the table could not be
read at all. "Could not ask" is not "nothing overdue".

## Confirming it

```bash
curl -s "$API/api/v1/health/ready" |
  jq '{accountRetention: .checks.accountRetention, queue: .accountRetention}'
```

Then ask the database what is waiting, oldest first:

```sql
select u.id, u."deletedAt", u."purgeAfter", now() - u."purgeAfter" as overdue
from "User" u
where u."isAnonymised" = false
  and u."purgeAfter" <= now()
order by u."purgeAfter"
limit 20;
```

- Rows whose `overdue` grows between two checks are the stopped-timer case. Rows
  that stay the same count and then vanish were anonymised by a sweep.
- The log says `Account retention sweep failed; will retry on the next interval.`
  when a pass throws. That is a failing sweep — look at the error before
  restarting, since a restart will fail the same way.
- Silence plus a growing `due` count is a timer that is no longer firing.
- `isAnonymised = true` is the finish line: if the rows above already show it,
  the sweep is running and the report is stale by one poll.

## Repairing it

An overdue queue also raises the `ops-alert` issue through `/health/alerts`, so this
page is for the confirmation and the repair rather than the discovery. See
`docs/ops/alerting.md`.

Restarting the API is the repair for a stopped timer: the boot sweep runs
immediately, then the six-hourly interval is re-armed. The rows stay overdue
until that first sweep completes, so check `accountRetention.due` again a minute
after the restart rather than expecting the card to clear with the process.
