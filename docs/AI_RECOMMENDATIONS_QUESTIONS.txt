# AI Profile Recommendations - Questions for Client Clarification

Date: October 12, 2026

## Overview
To integrate AI-based profile recommendations based on user interests, we need clarification on the following points.

---

## 1. Interest Management
**Question:** Should users select interests from a pre-defined curated list, or can they enter their own custom tags?

**Options:**
- Curated list (Recommended): Fixed set of interests (e.g., Travel, Movies, Music, Reading, Fitness, Food, Photography)
- Free text tags: Users can type anything
- Hybrid: Curated list + 'Other' option to add custom tags

**Why:** Determines schema design, matching accuracy, and moderation effort.

---

## 2. AI Model Choice
**Question:** Do you prefer using a paid external AI service, or a free/local approach?

**Options:**
- Free/Local (Recommended for MVP): Content-based matching using interest overlap. No API costs, fast, explainable.
- External LLM embeddings: Better semantic similarity but incurs costs.
- Hybrid: Start free, add embeddings later.

**Why:** Impacts cost, latency, and complexity.

---

## 3. Recommendation Placement
**Question:** Should AI recommendations replace existing search, or appear separately?

**Options:**
- Separate 'For You' tab (Recommended): Keep search as-is, add new tab. Less risky.
- Replace existing search: Higher impact, needs validation.
- Blend: Mix recommendations into search results with 'Recommended' badge.

**Why:** Affects UX and rollout strategy.

---

## 4. Mobile Integration Scope
**Question:** What level of integration for Phase 9 (Mobile)?

**Options:**
- Minimal (MVP): New screen showing recommendations in same card format.
- Full integration: 'Recommended for you' carousel on home + reasons shown.
- Deferred: Backend first, mobile later.

**Why:** Mobile is largest block (2-3 weeks). Scope affects timeline.

---

## 5. Leveraging User Interactions
**Question:** Should recommendations learn from views/likes/accepts over time?

**Options:**
- Interests only (Recommended for MVP): Faster, predictable, explainable.
- Behavioral signals: Better personalization but needs more data/tracking.
- Hybrid: Start with interests, add interactions over time.

**Why:** Affects algorithm complexity and data needs.

---

## 6. Privacy & Transparency
**Question:** How important is explainability?

**Options:**
- Must show reasons (Recommended): e.g. 'Because you both like Travel & Movies'.
- Just show recommendations: Minimal UI.
- Optional: Show reasons on tap/info icon.

**Why:** Builds trust in matrimony context.

---

## 7. Feature Rollout
**Question:** Gradual or immediate rollout?

**Options:**
- Feature flag + gradual rollout (Recommended): Test safely before wide release.
- Beta only: Limited user group.
- All users at once: Faster but higher risk.

**Why:** Safety and incident control.

---

**Next Step:** Review and indicate preferences. We will provide detailed implementation plan and timeline.
