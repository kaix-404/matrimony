# Switching on identity verification (D9)

Identity verification is mandatory before a member can browse **or be seen**, so
while it is off nobody can pass the gate and `can_discover` is false for every
account — including a profile that has been approved. The API stays up and fails
closed: every attempt to start a session answers `503`.

This is the whole switch-on. It is four settings and one webhook URL; there is no
code change.

## 1. Get the credentials

Cashfree Secure ID (DigiLocker flow). Two values come out of the dashboard:

- a **client id** and **client secret** for Secure ID,
- the pair is per environment: sandbox credentials against the production host
  are rejected with a validation error, not a "wrong host" message.

D9 only asks for Aadhaar, and the gateway requests `document_requested:
['AADHAAR']` with `user_flow: 'signin'`. Nothing else is collected, and no raw
Aadhaar number is ever stored — the schema has no column that could hold one.

## 2. Set the environment variables

On Render, service `matrimony-api` → Environment:

| Key | Value |
| --- | --- |
| `CASHFREE_CLIENT_ID` | client id from Secure ID |
| `CASHFREE_CLIENT_SECRET` | client secret |
| `CASHFREE_ENVIRONMENT` | `sandbox`, then `production` once Cashfree approves it |

They are declared as secrets in `render.yaml`, so a Blueprint sync asks for them
rather than carrying values in the repository. Leaving them empty is not a crash:
`CashfreeVerificationGateway` logs
`CASHFREE_CLIENT_ID/CASHFREE_CLIENT_SECRET are empty — identity verification will reject`
at boot and refuses each session, which is what the 503 in the app is.

## 3. Register the webhook

In the Cashfree dashboard, point the Secure ID webhook at:

```
https://matrimony-api-2bmy.onrender.com/api/v1/verification/webhook
```

The signature is base64 of `HMAC-SHA256(client secret, timestamp + raw body)` —
there is no separate webhook secret to set. The `x-webhook-timestamp` and
`x-webhook-signature` headers are both required, and a missing either is one
rejection message, not a hint about which was missing. The route verifies the
signature against the raw bytes, so nothing between Cashfree and the API may
re-serialise the body; the global JSON body parser already keeps `rawBody` for
this route and for the payment webhook.

No `redirect_url` is sent when the session is created. The consent screen reports
back through this webhook and the app re-reads `GET /verification/status` when it
regains focus, so there is no web page to return to.

## 4. Prove it

1. Restart or redeploy the API, then read the boot log: it should say
   `Cashfree Secure ID configured against https://sandbox.cashfree.com/verification`
   (or the production host) instead of the warning.
2. In the app, open **Verify your identity** and start the check. Expected: a
   consent URL opens instead of `503`.
3. Finish the DigiLocker consent in that browser tab, then tap **Check status**.
   Expected: `identity_verified` true on `GET /auth/me` and in the console's
   member view.
4. The setup fee is the other half of `can_discover` — with identity verified and
   the fee unpaid, the member still cannot browse. Paying it is the last step
   before two members can actually find each other.

## What is still not automatic

An identity check that the vendor never calls back about stays `PENDING`; there is
no sweeper that expires it. The member is not stranded, though: the app compares
the attempt's `providerReferenceExpiresAt` with the status and, once the session
has lapsed, replaces "waiting" with a request for a new link. Re-initiating
overwrites the stuck row, so a fresh attempt needs no operator. The console's
**Identity checks** queue is still where a stuck one is cleared for the record.
