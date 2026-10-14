# Client decisions log — AI profile recommendations, received 2026-10-14

Answers to `docs/AI_RECOMMENDATIONS_QUESTIONS.md` (7 questions), recorded in intent
and traced to the build. This is the authority for how recommendations behave; the
questionnaire itself is unchanged.

The feature is delivered in two parts. The **backend MVP** (this change) covers
interest storage, the eligibility/visibility-scoped recommendation endpoint, and
the feature flag. The **mobile integration** (Phase 9) consumes it.

## Resolved answers

| Q | Decision | Effect on the build |
|---|---|---|
| 1 Interest management | **Curated list** | A seeded `Interest` table is the vocabulary. No free text and no "Other" tag, so there is no user-generated moderation surface. Retiring an interest is `isActive = false`, never a delete — a delete would cascade every user's selection. |
| 2 AI model | **Hybrid** (start free/local, add embeddings later) | MVP scores by interest overlap (content-based). The scorer is a single seam so an embeddings stage can be added behind it without a contract change. No external API call, no per-request cost. |
| 3 Placement | **Separate 'For You' tab** | A new `GET /recommendations` endpoint. Discovery (`GET /discovery`) is untouched, so the existing feed cannot regress. |
| 4 Mobile integration | **Full integration** (Phase 9) | Deferred to the mobile block. The backend returns the shared-interest keys per card so the carousel *can* render reasons; the UI decision is answer 6. |
| 5 User interactions | **Hybrid** (start with interests, add interactions over time) | MVP uses interests only. Behavioural signals (views/likes/accepts) are not tracked yet; there is no seam that assumes them, so adding them later is additive. |
| 6 Privacy & transparency | **Just show recommendations** (minimal UI) | No reason string is required in the UI. The card still carries `shared_interests` because it costs nothing and answer 4 wants reasons available — the client may ignore the field. |
| 7 Feature rollout | **Feature flag + gradual rollout** | `FEATURE_AI_RECOMMENDATIONS`, default **off**. When off the endpoint answers `{ enabled: false, items: [] }` — a 200, so a client hides the tab without a release and no data is produced. |

## Interaction with existing decisions

- **Same eligibility and visibility rules as discovery.** A recommendation is a
  discovery candidate that also shares an interest. The two-way net-worth scope
  (`visibility-discoverability-2026-10-03.md`) and every eligibility gate
  (verified, setup fee paid, active, not deleted, not blocked) still apply, because
  the recommendation query reuses the discovery scope rather than restating it. A
  profile the viewer could not discover cannot be recommended.
- **Net worth is not an interest.** Interests are lifestyle tags from answer 1, not
  the net-worth bands, which stay server-controlled (B1).
- **No new exposure.** A recommendation card is the same thin projection as a
  discovery card (id, approved photos, unlock price), plus interest keys that the
  candidate themselves chose to publish.
