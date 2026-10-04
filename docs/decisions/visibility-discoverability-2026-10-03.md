# Visibility and discoverability - received 2026-10-03

Source: `docs/spec/Visibility_and_Discoverability.docx` (internal product /
developer document, Networth Matrimony).

> **This file is authoritative for visibility, discoverability, and profile-unlock
> pricing.** It supersedes parts of
> [`client-answers-2026-09-29.md`](client-answers-2026-09-29.md) - specifically **B1**
> and **E1** - and the setup-fee half of **GAP-5**. Those parts are marked below
> rather than deleted, so the earlier reasoning stays auditable. Everything else in
> those files still stands, notably B1's rule that a user cannot edit their own
> category.

## What changed, and why it is a real change

The previous model made net-worth a **partition key**: a user could only ever
discover profiles in their own band, because both sides of a candidate pair were
required to share one category. Net worth appeared in no filter and no preference,
by explicit instruction (B1: *"Net worth must not appear in filters or
preferences"*).

The new document replaces that with **two-way preferences**. A target profile
appears only when *both* sides allow it:

| Rule | Statement |
|---|---|
| Viewer to target | The viewer's discovery selection includes the target's net-worth category. |
| Target to viewer | The target's allowed-viewer selection includes the viewer's net-worth category. |
| Always also | Target is approved and active; neither user has blocked the other; all other access rules pass. |

Net worth is still **not** a filter. It is still not editable by the user. What
changed is that it is no longer a hard boundary - it became a preference the user
holds in two directions, both editable at any time.

### Superseded assertions, and what replaces them

| Was | Now |
|---|---|
| B1: *"Discovery is strictly within the user's own category."* | Replaced by the two-way rule above. |
| B1: *"Net worth must not appear in filters or preferences."* | Replaced. It appears in two preference lists, and in neither a temporary filter nor the query string. |
| B1: *"both are the same category, so the same price."* | The price is the **target's** category. `PricingConfig.category` always meant the target; the old model just made it invisible because both parties shared a band. No schema change was needed. |
| E1: *"A user with no partner preference sees everyone in their category."* | The fallback scope becomes the intersection of the two two-way selections. |
| GAP-5: setup fee treated as a flat ₹15 total, no GST | **Resolved:** the fee is ₹15 **plus 18% GST**, so the payable amount is **₹17.70**. |

B1's remaining force is unchanged: the user's own category is server-controlled,
set once at registration, and only an audited admin action may change it. That is
now the *one* net-worth rule the user has no control over; the two preference
lists are separate rows and cannot widen it.

## Pricing

Unlock price comes from the **target's** net-worth category, so the amount is
knowable before checkout. 18% GST applies on top:

| Target profile | Base | 18% GST | Customer pays |
|---|---|---|---|
| Below ₹2 Cr | ₹99 | ₹17.82 | ₹116.82 |
| ₹2-5 Cr | ₹249 | ₹44.82 | ₹293.82 |
| ₹5-10 Cr | ₹499 | ₹89.82 | ₹588.82 |
| Above ₹10 Cr | ₹999 | ₹179.82 | ₹1,178.82 |

The amount actually charged is snapshotted onto the payment row, so a later price
change never rewrites a historical transaction. An admin change to a user's
category stays permission-controlled and audited.

## Decisions taken where the document is silent

The document does not define three things. These were settled here rather than
guessed at runtime.

1. **A user who has never set either list defaults to their own category only.**
   Behaviour is therefore identical to the old partition behaviour until a user
   opts in. Cross-band discovery is opt-in, not opt-out, so no existing user is
   silently exposed to a band they never chose to see.

2. **An empty list is valid and means nobody.** A user may deliberately hide from
   everyone or see nobody, which doubles as a pause control. This makes
   "never configured" and "configured to nobody" genuinely different states, so
   the schema carries an explicit flag for each direction rather than inferring
   intent from an empty table.

3. **A user may not browse on the strength of a preview they are not entitled
   to.** An empty discovery list suppresses results; it does not bypass the
   existing eligibility gates (verified, setup fee paid, active, not blocked).

## Carried forward unchanged

- Unlock duration 24 hours, starting only after backend-confirmed payment, expiry
  enforced on server time, re-unlockable after expiry, no unlock on a failed or
  cancelled payment.
- Net worth still never appears as a discovery *filter*. Only the saved
  preference drives it, and it cannot be widened per-request.
- `PENDING_REVIEW` is not selectable in either list. Its `isDiscoverable = false`
  flag means "not offered in the picker" - a property of the band, not a
  per-user permission - and the column is not overloaded to carry user intent.
- Gender, age, height, city, religion, community and horoscope preferences are
  unchanged. D2 confirmed the matching engine is out of scope.