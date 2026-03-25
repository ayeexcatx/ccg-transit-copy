# Personal Baseline Gap Analysis (Implementation vs Reference)

Date reviewed: 2026-03-24.

Reference used for comparison: `docs/personal-app-baseline-reference.md` (secondary).
Source of truth: current repository implementation (primary).

## 1) Missing baseline areas in `/docs` before this update

After this refresh pass, no additional major baseline-area gaps were identified beyond the focused docs already present in `/docs`.

## 2) New baseline docs created

No new docs were created in this pass.

## 3) Behavior present in code but missing from personal baseline

All previously listed section-3 items from the earlier audit were incorporated into `docs/personal-app-baseline-reference.md` during this refresh (with concise code-backed review notes), including:
- Admin dashboard Fri/Sat/Sun Monday-rollover upcoming logic.
- Force App Refresh admin-code reconfirmation + runtime-version trigger model.
- Admin announcement card activity-log behavior.
- Admin access-code multi-workspace + linked-company behavior.
- Owner notification effective-read semantics.
- Driver incidents create-entry constraints and conditional truck prefill.
- Structured contact-method/SMS-designation behavior in owner/company profile flows.

## 4) Conflicts between code and personal baseline

Rechecked and resolved in this pass by updating `docs/personal-app-baseline-reference.md` to match visible current behavior:
- Admin dashboard upcoming logic mismatch (Friday-only vs Fri/Sat/Sun) — resolved.
- Header second-line identity semantics — rechecked against visible header behavior and corrected in baseline.
- Driver incident truck prefill wording (absolute vs conditional) — resolved.

Remaining unresolved conflicts after this update: **None confirmed from code review in this pass**.

## 5) Potential bugs, inconsistencies, or risky areas

- **Potential completion-control gap (Incidents)**: UI warns to save restart time before completion, but status mutation path is not hard-blocked by visible frontend check at mutation level.
- **Potential wording/behavior drift**: several long instructional text blocks in Drivers page can diverge from actual workflow logic over time.
- **Complex read-state logic risk**: owner notifications depend on computed effective-read state combining notifications, confirmations, and truck visibility; regression risk is high without focused tests.
- **Admin SMS ambiguity risk**: profile stores admin SMS preference while UI says delivery is not active; this can confuse operators unless policy is explicit.

## 6) Needs manual verification (cross-cutting)

- Runtime force-refresh timing consistency across background tabs/devices.
- Incident completion backend validation constraints.
- Notification load behavior under high-volume production data.
- Policy-level correctness of scoring formulas and instructional guidance text.
