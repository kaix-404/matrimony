# Health alerting

`/health/ready` reports two different kinds of `down`: a repair path that has
stopped (`reconciliation`, `pushDispatch`, `accountRetention`, `clockGuard`) and a
provider that was never configured (`email`, `sms`, `push`, `payments`, …). The
repair paths cannot fail readiness — a broken timer must not take a working API out
of rotation — so before this they only ever reached a person who happened to open
the console. That is the silence the checks were built to end.

## What fires

`GET /api/v1/health/alerts` is the alertable view of the same report:

```json
{
  "status": "down",
  "down": ["pushDispatch", "accountRetention"],
  "checkedAt": "2026-11-21T15:02:11.000Z"
}
```

It answers **200** when every alerted check is up and **503** when any of them is
down. The alerted set is fixed in `apps/api/src/health/health-alerts.ts`:

| check              | down means                                                         |
| ------------------ | ------------------------------------------------------------------ |
| `database`         | the pool cannot execute a query                                    |
| `clock`            | the clock jumped backwards; payments and unlock windows unsafe     |
| `clockGuard`       | the drift watchdog stopped sampling                                |
| `reconciliation`   | the recovery sweep never ran, stopped, or every run threw          |
| `pushDispatch`     | queued pushes have waited longer than five dispatch intervals      |
| `accountRetention` | a purge is past its deadline, or a deletion has no deadline at all |

The provider checks are deliberately **not** alerted. `email: down` today means
the MSG91 credentials have not been entered; paging every half hour until someone
signs a contract teaches people to ignore the alert that matters. Those stay on
the console, where they answer "what is this deployment configured for".

The payload is names and a timestamp only. The route is public so a prober needs
no session token, and an unauthenticated caller should not be able to read how many
accounts are overdue or which providers are configured. The console still carries
the counts.

## How it is delivered

`.github/workflows/health-alert.yml` is scheduled every 30 minutes, calls the
endpoint, and **opens one GitHub issue** labelled `ops-alert` when it is not 200; it
**closes that issue** with a comment on the first healthy probe. One issue, not one
per run — the open issue is the alert, and GitHub notifies the repository's watchers
by email. The schedule is a request rather than a promise; see the cadence bullet
under "Behaviour to expect".

The step sets `GH_REPO: ${{ github.repository }}` because `gh` takes its repository
from `GH_REPO` or a git remote and never from `GITHUB_REPOSITORY`, and the job does
not check out: without it every `gh` call fails before it reaches the API.

This is the option that fits the current Render deployment:

- **Render cron jobs are not on the free plan** — they start at $1/month per job,
  and this workspace has no payment method.
- **Render's own notifications** cover deploys and service events, not a 503 from
  an application route.
- **An external uptime monitor** (UptimeRobot and similar) works against the same
  endpoint, but a five-minute monitor keeps a free service permanently awake and
  spends the workspace's 750 shared instance hours on the API alone; GitHub Actions
  wakes it for one request per run instead.
- **Email and SMS from inside the API** are not usable yet: `EMAIL_*` credentials
  are still unset, and MSG91 SMS is bound to DLT-approved templates, so free-form
  alert text cannot be sent.

If you later want the alert in Slack or a phone, add a step to the workflow that
posts to a webhook secret — the trigger and the state machine do not change.

## Behaviour to expect

- **Cold starts.** A sleeping free instance takes about a minute to answer. The
  workflow waits up to 120 seconds and treats a timeout as down, so a slow wake is
  not an outage; a real failure is caught on the next run the scheduler delivers.
- **The cadence is GitHub's, and it is loose.** `*/30 * * * *` asks for 48 runs a
  day; this repository has received four to five, with gaps of four to eight hours.
  `schedule` runs are delayed during load and dropped slots are not replayed, so a
  stopped repair path is reported hours after it stops, not within half an hour.
  If that is too slow, move the trigger off GitHub: an external cron calling the
  `workflow_dispatch` API with a token holding `Actions: write`, or a probe hosted
  by a scheduler you control. A step that dispatches the workflow itself does not
  work, because runs started by `GITHUB_TOKEN` do not trigger further workflows.
- **Before the route is deployed.** A 404 is treated as "not deployed yet" and
  raises nothing: the release that carries the route can wait on a build quota,
  and a rollout state is not a stopped repair path. The route is pinned where it
  can be checked before deploying instead — the controller test asserts the path
  and HTTP method, and CI calls `/health/alerts` on the built API and requires
  `200` with `status: ok`. A genuinely missing route therefore fails CI rather than
  opening an issue here.
- **Recovery is automatic.** The issue closes itself, so an open `ops-alert` issue
  always means the probe is still failing.
- **Scheduled workflows go quiet after 60 days of repository inactivity**; any push
  to the default branch restarts the clock, and `workflow_dispatch` runs it by hand.

## Checking by hand

```bash
curl -s -o /tmp/alerts.json -w '%{http_code}\n' \
  https://matrimony-api-2bmy.onrender.com/api/v1/health/alerts
jq . /tmp/alerts.json
```

Then follow the runbook for the named check: `docs/ops/account-retention.md` for an
overdue erasure queue, `docs/ops/push-delivery.md` for a stalled dispatcher, and
`docs/ops/webhook-reconciliation.md` for the recovery sweep.
