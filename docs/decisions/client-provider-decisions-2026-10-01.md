# Provider decisions — received 2026-10-01

Vendor selections for the integrations listed in the client brief. These sit on top of
`client-answers-2026-09-29.md`, which remains authoritative for product behaviour; this
file is authoritative for **which supplier** we use.

## Decisions

| # | Service | Decision | Change from the brief's recommendation |
|---|---|---|---|
| 1 | Payments | **Razorpay** | Confirmed as recommended. No change. |
| 2 | Identity verification | **Cashfree ID verification suite** | Was a licensed KYC aggregator (IDfy / Signzy / Karza). Cashfree is one. |
| 3 | SMS + email | **Undecided.** Client is looking for a cheaper alternative to MSG91; MSG91 is the fallback if nothing better is found. | No change yet. |
| 4 | Object storage | **Cloudflare R2** | Was AWS S3 in `ap-south-1`. See **GAP-11**, this one is not clean. |
| 5 | Push notifications | **Firebase** | Confirmed as recommended. Needs the HTTP v1 credential, not the legacy key. |

## What each decision changes in the build

### Razorpay (unchanged)
`PaymentProvider.RAZORPAY` already exists in the schema and the SDK is installed.
Only credentials were outstanding.

### Cashfree ID verification
Cashfree **Secure ID** supports a consent-based **DigiLocker** Aadhaar flow, which is
UIDAI- and DPDP-compliant, returns an already-masked number (`XXXXXXXX3712`), and does
not retain the document. That matches D9 and **GAP-9** without loosening the
"never store a full Aadhaar number" rule, so no change to that rule.

The supplier and the verification method are recorded separately:

* `IdentityVerificationProvider` stays `DIGILOCKER` / `AADHAAR_UIDAI` — that is the
  *method* (DigiLocker flow versus direct UIDAI), which is what actually varies.
* `IdentityVerificationVendor` is new and records `CASHFREE`, for audit: which
  aggregator performed a given check.

These were kept apart deliberately. Folding the vendor into the existing enum would
have mixed "who did it" with "how it was done", and the method list is what a future
change of aggregator would still have to record.

**Still needed from the client:** a Cashfree Secure ID account, sandbox and production
credentials, and confirmation of the pricing model (per check) and the DLT/consent
position. The recommended flow is DigiLocker, not OCR.

### Firebase
Confirmed. The existing `FCM_SERVER_KEY` value is the **legacy** key; the supported
mechanism is the FCM **HTTP v1** API with a service-account credential, now
`FCM_SERVICE_ACCOUNT_JSON`. The legacy key is removed so no one deploys with it.

Note that push payloads pass through Google's infrastructure, so they carry no
sensitive profile data — only a short message and an identifier the app resolves
after authenticating. This is a weaker residency story than the rest of the stack and
should be stated in the Privacy Policy.

### SMS and email (pending)
Configuration stays **provider-agnostic** — a single `SMS_PROVIDER_API_KEY` and
`EMAIL_PROVIDER_API_KEY` — so swapping the provider is a configuration change, not a
code change. MSG91 is recorded as the fallback.

The DLT fields are added regardless of provider, because **TRAI DLT registration is
mandatory for all transactional SMS in India** and the client owns that registration:

* `SMS_SENDER_ID`, `SMS_DLT_ENTITY_ID`, `SMS_DLT_TEMPLATE_ID`
* `EMAIL_FROM_ADDRESS`, plus SPF/DKIM/DMARC on the sending domain

**GAP-12** — SMS and email provider undecided. Low risk, but DLT registration should
start now because it is business-side work with lead time, and it is required whichever
provider is chosen.

### Cloudflare R2 — see GAP-11
Adopted as instructed. Endpoint becomes `https://<account-id>.r2.cloudflarestorage.com`
and the region becomes `auto` (R2 is a single global service addressed by account).

The benefit is real: no egress charges, which matters for photo delivery. The problem
is residency, below.

## Open gaps

**GAP-11 — Cloudflare R2 cannot guarantee India-only storage (this is new).**

Answer H3 committed the platform to India-only data residency. R2's hard residency
controls, called *jurisdictions*, are only:

| Jurisdiction | Meaning |
|---|---|
| `eu` | European Union |
| `us` | United States |
| `fedramp` | FedRAMP |
| `default` | none |

**There is no India jurisdiction.** The only Asia-Pacific control is a *location hint*
(`apac`), and Cloudflare documents these as best-effort placement, explicitly **not** a
residency guarantee. Location hints are also honoured only when a bucket is created.

So with R2, user photographs cannot be asserted to reside in India. For a platform
collecting religion, caste, horoscope, income, family details, contact numbers and
Aadhaar references, that is a direct weakening of a commitment the client has already
made, and it is the sort of commitment that needs to be deliberate rather than
inherited from a default.

Three ways out, for the client to choose:

1. **Accept it.** H3 is downgraded from "India only" to "Asia-Pacific, best-effort",
   and the Privacy Policy says so plainly. Cheapest, and R2's cost benefit is real.
2. **Override H3 for photos only.** Keep an India-region bucket (AWS S3
   `ap-south-1`, or an Indian provider) for user photos and identity documents, and use
   R2 for non-sensitive assets. Two vendors, but the sensitive data stays home.
3. **Keep everything in India** and drop R2. Simplest, and the only choice that leaves
   H3 exactly as answered.

Recommendation: **option 2** if the cost saving is worth it, otherwise **option 3**. Not
option 1 — the mismatch is between two written commitments from the same client, and it
should be resolved deliberately.

**GAP-12 — SMS and email provider undecided.** MSG91 fallback agreed. No architectural
impact. Start DLT registration in the meantime.

## Effect on the client brief

`docs/client/networth-matrimony-integrations-and-api.pdf` is v1.1 and reflects all five
decisions, with GAP-11 called out in the storage section, the compliance section, and
the "what we need from you" table.
