# Client decisions log — received 2026-09-29

Answers to `02_client_clarification_questions.pdf`, recorded verbatim in intent and
traced to the code they change. Brand is **Networth Matrimony**.

> **Superseded in part on 2026-10-01.** Supplier choices (Razorpay, Cashfree, Cloudflare
> R2, Firebase) and the resulting **GAP-11** residency conflict are recorded in
> [`client-provider-decisions-2026-10-01.md`](client-provider-decisions-2026-10-01.md).
> That file is authoritative for *which* supplier; this one stays authoritative for
> product behaviour, and nothing here has been rewritten.

## Resolved answers

| Q | Decision | Effect on the build |
|---|---|---|
| A1 | Show full date of birth | DOB leaves the hidden-before-payment list. Age is consequently visible; hiding it would be cosmetic. |
| A2 | Community hidden, religion visible | `community` added to the hidden list; `religion` explicitly preview-visible. Note: this combination was not one of the offered options. |
| A4 | No refund; account deleted immediately with no access; move user to the deleted-account database | See **GAP-1** — access stops *and* no refund, which was not an offered option. |
| B1 | Discovery is strictly within the user's own category. Category cannot be edited by the user; only an admin may change it. Net worth must not appear in filters or preferences. | Net worth becomes a partition key, not a filter. Trivially settles the buyer's-price-vs-target-price question: both are the same category, so the same price. |
| B3 | Block duplicate purchases | Re-charging for a live 24h unlock is refused before any gateway order is created. |
| B5 | No refunds except technical glitches, by email request. Remove "view refund status" | No self-serve refund surface at all. The only route is an emailed request handled by an admin. |
| C3 | Reminder 2 hours before expiry | `UNLOCK_EXPIRING_2H` notification event. |
| D1 | Single-person photo **and** family group photo | See **GAP-4** — also not an offered option. |
| D2 | Horoscope display only, no compatibility matching | Confirms the matching engine is **out of scope**. Scope reduction. |
| D3 | Master lists for education, profession, caste and community. Company name and income remain free text | New admin-managed master-list tables. |
| D9 | Mandatory Aadhaar/DigiLocker ID verification. Collect a ₹15 account setup fee as the last step; only after paying may a user view others or be seen | Identity verification becomes mandatory, and a second payment type is introduced. See **GAP-5**. |
| E1 | Return all profiles | A user with no partner preference sees everyone in their category. Preference is not a gate. |
| E2 | Newest and closest profile first | See **GAP-3** — precedence is ambiguous. |
| F1 | Automated screening with admin spot-checks | Screening is automated-first, not manual-review-everything. |
| F2 | (a) Only Super Admin may change category, edit pricing, or issue a manual unlock, each audit-logged | Role matrix tightened. See **GAP-6** — "deleting a user" was asked but not answered. |
| F4 | (a) Permanent block, no warning, no appeals | BlockedUser becomes permanent. |
| F6 | 6 months data retention | `purgeAfter` = deletion + 6 months. |
| G1 | (b) Push and email, with OTP by SMS | SMS is OTP-only, not a general event channel. Material cost saving. |
| H1 | (b) We draft the Privacy Policy and Terms, client has them professionally reviewed | New deliverable on us. See **GAP-7**. |
| H2 | (b) 18 and above, date of birth verified during profile review | Minimum age 18, DOB checked at review. |
| H3 | Yes — India-only data residency. Implement consent capture | India-only storage, consent records, data export and deletion request flow. |
| I1 | Developer team to propose designs. Minimalist. | We now own UI/UX for 18 user + 14 admin screens. See **GAP-8**. |
| I2 | 30 to 60 days | Delivery window. |

## Net-worth categories and pricing (supersedes the two-category schedule)

| Category | Band | Unlock price | With 18% GST |
|---|---|---|---|
| `BELOW_2CR` | Below ₹2 Cr | ₹99.00 | ₹116.82 |
| `2CR_5CR` | ₹2 Cr – ₹5 Cr | ₹249.00 | ₹293.82 |
| `5CR_10CR` | ₹5 Cr – ₹10 Cr | ₹499.00 | ₹588.82 |
| `ABOVE_10CR` | Above ₹10 Cr | ₹999.00 | ₹1,178.82 |

The client has said further categories will be added later, so the category is
therefore **data, not a database enum**: `NetWorthCategoryRef` rows are the
authority and a new band is a row insert, not a migration.

## Open gaps — decisions still needed

**GAP-1 — Unlocks bought from a deleted profile get nothing.** A4 asks what
happens when a profile owner deletes their account mid-unlock. The client
answered "no refund, and the account is deleted immediately with no access",
which means the buyer loses access to a contact they already paid for, with no
refund and no credit. Offered options were "access continues, no refund" and
"access stops, automatic full refund" — this is a third combination. At the top
band that is ₹1,178.82 paid for nothing. Recommend A4(c), a credit note for a
future unlock, which is the only offered option that leaves the client whole.
Related: F4(a) removes appeals entirely, so there is no route to contest it.

**GAP-2 — Boundary values are undefined.** The old spec sent exactly ₹2 Cr to
admin review. The new bands are "below 2 Cr" and "2–5 Cr", so a user entering
exactly ₹2 Cr, ₹5 Cr or ₹10 Cr has no defined category. This is a
data-integrity question, not a UI one. Options: define half-open intervals
`[0,2Cr) [2Cr,5Cr) [5Cr,10Cr) [10Cr,∞)` and drop `PENDING_REVIEW` entirely, or
keep an admin-review bucket for exact boundary values. Needs an answer before
the category-selection screen ships.

**GAP-3 — Discovery sort precedence.** E2 answered "newest and closest profile
first", which is two orderings. Is the primary sort newest-registered, breaking
ties by location distance? Or a blend of the two? This changes the index design
and the query, so it needs settling before discovery is built.

**GAP-4 — Family photos.** D1 offered "single-person only" or "add a parent's
photo and the user's own role". The answer is neither: single-person *and*
family group photos. Undefined: is a family photo required or optional, which
photo is the primary/cover image, and does a family photo count as visible
before payment? Note that F1 automated screening has to detect faces in group
photos, which is materially harder than single-face screening.

**GAP-5 — The ₹15 setup fee.** Undefined: is ₹15 the final amount or is GST
added on top? Is it ever refunded if ID verification fails? Is it one per
account lifetime? Does it appear in payment history? Current implementation
assumption: ₹15.00 total, no separate GST, one per account, collected only
after ID verification succeeds, and recorded as a distinct payment purpose so it
is never confused with an unlock.

**GAP-6 — Who may delete a user.** F2(a) covers changing category, editing
pricing and manual unlock, all restricted to Super Admin. The question also
asked about deleting a user, and F2(a) does not answer it. Recommend Super Admin
only, since deletion now also means an archive-and-purge obligation.

**GAP-7 — We are drafting the legal documents.** H1(b) puts the Privacy Policy
and Terms of Service on this engagement, subject to professional review. The app
collects religion, caste, horoscope, income, family details, contact numbers and
Aadhaar. This is a new line item and should be reflected in the contract and the
quote before it is started, not absorbed silently.

**GAP-8 — We now own UI/UX design.** I1 answers (b) with "minimalist", which
puts 18 user-facing and 14 admin screens of design work into scope. Confirm this
is in the 30–60 day estimate and priced accordingly.

**GAP-9 — Aadhaar handling.** Implemented as: never persist a raw Aadhaar
number. Store only the DigiLocker/UIDAI reference and a masked last-4, plus a
consent record. Worth confirming the client is comfortable with the app never
holding the full number, since some verification flows appear to require it.

**GAP-10 — Do preferences filter at all?** E1 answers the "no preference set"
case by returning everyone in the category. It does not say what happens when a
preference *is* set. If preferences filter, some profiles could become
permanently undiscoverable by other means, which would undercut E1. Needs a
yes/no.
