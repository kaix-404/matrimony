# Clarifications needed

Status as of 2026-10-23. The client re-stated their 2026-10-15 answers and
answered Q5, so the open list is now two items, neither a build blocker.

## Closed

- **Q5 / GAP-2 (net-worth boundaries)** — 2026-10-23: client chose "go with
  recommendation", i.e. a value exactly on a boundary (2 Cr, 5 Cr, 10 Cr) is
  assigned into the higher band. That is the current build's rule, so no code
  change is needed. See docs/client/client-answers-2026-10-15.md.
- **Q1 / GAP-11 storage choice** — client chose Cloudflare R2 fully. The
  remaining wording point is below.
- **Q9 / GAP-12 SMS half** — MSG91, delivered.

## Open

### 1. GAP-11 (storage residency wording)
The client chose R2 fully because "they have India database". R2 has no
guaranteed India jurisdiction — only best-effort Asia-Pacific placement. We need
them to confirm they accept best-effort placement and will word the Privacy
Policy to match (versus a hybrid that keeps sensitive data in a guaranteed India
region). Not a build blocker; R2 is already the storage backend.

### 2. GAP-12 (email provider half)
The client's "Msg91" answered the SMS question. Transactional email is still
unresolved: either MSG91 email (if their product covers it) or a separate
provider. Until this is answered the email gateway stays unconfigured and fails
closed; SMS and push are both delivered.

