# Clarifications needed (questions 2026-10-15)

## 1. Q5/GAP-2 (net-worth boundaries)
Client said 'Didn't understand the question'. For values exactly on boundaries (2 Cr, 5 Cr, 10 Cr), should we use:
1. Half-open intervals: [0,2Cr) [2Cr,5Cr) [5Cr,10Cr) [10Cr,∞) — so 2 Cr falls in 2-5 Cr band
2. Keep an admin-review bucket (PENDING_REVIEW) for boundary values

## 2. Q9 (GAP-12) — Email provider
Client said 'Msg91'. Should transactional email also go via Msg91 (if supported), or do they mean use MSG91 as SMS provider only and we need a different email provider?

## 3. GAP-11 (Storage residency)
Client chose R2 fully ('they have india database'). Note: R2 has no guaranteed India jurisdiction (only best-effort Asia-Pacific placement). Confirm they accept Asia-Pacific best-effort placement and will update Privacy Policy accordingly (vs hybrid with India for sensitive data).

