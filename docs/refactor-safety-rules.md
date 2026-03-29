# Refactor Safety Rules

Source of truth: existing baseline docs in `/docs` (especially notifications, admin dispatches, and portal dispatch drawer baselines). This document only extracts behavior already documented there.

## 1) Critical invariants (must never change)

### Notification system (read state, triggers, dedupe)
- Owner status notifications remain deduped as one record per `(dispatch, status, owner)` using `dispatch_status_key` semantics.
- Driver dispatch notifications remain deduped by `(recipient access code, dispatch, notification_type, exact message-with-date-line)` and stale unread driver-update notifications are marked read.
- Driver-seen owner notifications remain deduped per `(dispatch, driver identity, seen kind, seen version key, owner)`.
- Owner status notification unread logic remains action-based: effective read state is computed from required-vs-confirmed trucks, not only stored `read_flag`.
- Notification click auto-read behavior remains limited to informational/driver-seen categories for owner/admin flows; owner status notifications are not click-to-read.

### Dispatch lifecycle (status changes, confirmations)
- Dispatch lifecycle statuses remain `Scheduled`, `Dispatch`, `Amended`, `Cancelled`.
- Any transition into `Amended` or `Cancelled` continues to reset active driver assignment receipt-confirmation fields (`receipt_confirmed_*`).
- Owner confirmations remain truck-level and tied to the current dispatch status as `confirmation_type`.
- All-trucks-confirmed admin notification remains created only when every currently assigned truck has a matching current-status confirmation, with dedupe preserved.

### Driver/owner visibility rules
- Driver dispatch visibility remains assignment-driven (active `DriverDispatch`), not `allowed_trucks`-driven.
- Owner/truck-user dispatch visibility remains allowed-truck driven.
- Owner visible trucks in dispatch detail remain `allowed_trucks ∩ dispatch.trucks_assigned`.
- Driver visible trucks in drawer remain derived from that driver’s active assignments for the dispatch.

### SMS enablement logic (owner + driver + phone)
- SMS eligibility stays limited to notifications with `recipient_type: 'AccessCode'`.
- Owner SMS remains gated by: owner access code opted in **and** valid company SMS-designated contact phone.
- Driver SMS remains gated by all three: owner SMS enabled on driver record, driver opt-in enabled, valid driver phone.
- Admin notifications remain non-SMS in this workflow (`recipient_type: 'Admin'` skipped).

### Dispatch drawer behavior
- Deep-link drawer open remains tab-aware and URL-param driven (`dispatchId`, optional `notificationId`), and close clears those params.
- Driver removal deep-link behavior remains modal override (removed-assignment modal instead of normal drawer open).
- Driver open-dispatch behavior continues to mark matching driver notifications read and stamp unseen assignment receipt fields.

### Confirmation reset and owner-action resolution rules
- Owner action resolution remains tied to required trucks for the owner and matching confirmations for current status.
- `expandCurrentStatusRequiredTrucks` remains the only broadening path when trucks are added without status change.
- `reconcileOwnerNotificationsForDispatch` continues reducing required trucks to current dispatch + owner permissions and marking non-current-status rows read.

### Truck assignment and driver assignment interactions
- Removing trucks from a dispatch continues to deactivate matching active driver assignments for removed trucks.
- Owner truck-edit flow keeps exact truck-count preservation and allowed-truck restriction.
- Owner truck-edit flow preserves implicit side effects: confirmation delete/recreate behavior, notification reconciliation/expansion, and admin truck-reassignment notification.
- Driver assign/unassign behavior preserves inactive-row history pattern (unassign marks inactive, not delete) and preserves add/remove driver notification behavior.

## 2) High-risk areas (easy to break during refactor)

- Deep-link and notification-driven drawer open sequencing (including removed-assignment modal branch).
- Cross-entity seen flow coupling: notification read state + assignment receipt fields + owner seen notification.
- Owner confirmation/action logic where effective read state differs from stored `read_flag`.
- Notification dedupe keys that depend on exact strings (especially driver message/date-line coupling).
- Owner truck edit/swap flows that mutate multiple entities (dispatch trucks, assignments, confirmations, notifications) in one operation.
- Status transition side effects (`Amended`/`Cancelled`) that reset assignment receipt fields.
- Role split logic for dispatch/truck visibility (owner/truck via allowed trucks vs driver via assignments).
- Required-truck expansion vs reconciliation pathways for owner notifications.
- SMS gating and recipient resolution (owner company-phone resolution vs driver phone/opt-in/owner-enabled checks).

## 3) Safe-to-refactor areas (low coupling)

- Pure formatting/presentation helpers that do not feed dedupe keys or side effects.
- Static display blocks in drawer that are read-only and mutation-free.
- Query-param normalization and ID normalization helpers (pure/near-pure).
- Pure validation helpers for owner truck editing (count/authorization/conflict detection), while keeping mutation orchestration untouched.
- Read-only wrappers/sections for time-log display in non-editing contexts.

## 4) Suggested refactor order (safe sequencing)

1. **Extract pure helpers first**
   - Normalize small pure utilities (ID/truck normalization, non-side-effect formatting).
2. **Stabilize read-only UI sections**
   - Refactor static drawer rendering/read-only subcomponents without touching mutation handlers.
3. **Isolate visibility selectors**
   - Extract role-based visibility calculators behind tests to preserve owner/truck vs driver split.
4. **Isolate notification read-state derivation**
   - Extract owner effective-read computation and required/confirmed truck math before touching mutations.
5. **Refactor notification creation/dedupe internals**
   - Keep dedupe keys and stale-read semantics byte-for-byte compatible while reorganizing code.
6. **Refactor assignment mutation orchestration**
   - Preserve coupled behavior bundle: assignment mutation + notification fanout + receipt reset rules.
7. **Refactor owner truck-edit/swap orchestration last**
   - Treat as highest risk due to multi-dispatch/multi-entity side effects.
8. **Only then refactor deep-link/drawer-open effects**
   - Keep URL + tab + modal override sequencing unchanged until final phase.

---

## Baseline extraction note
If any behavior seems ambiguous during implementation, defer to:
- `docs/notifications-behavior-baseline.md`
- `docs/admin-dispatches-behavior-baseline.md`
- `docs/portal-dispatch-drawer-behavior-baseline.md`
- `docs/behavior-preservation-baseline.md`

No new behavior should be introduced without first updating baselines.

## Refactor Implementation Notes (March 2026)

New shared modules/services introduced during the refactor:
- `dispatchVisibility` (visibility rules)
- `confirmationStateHelpers` (confirmation math + status parsing)
- `ownerActionStatus` (notification read/effective-read logic)
- `smsDerivedState` + `smsPhone` (SMS eligibility + validation)
- `driverAssignmentMutationService`
- `ownerTruckEditMutationService`
- `adminDispatchMutationService`
- `dispatchArchiveMutationService`
- `dispatchOpenOrchestration`

These modules centralize previously duplicated logic, are now the primary places to modify that logic, and behavior must remain consistent with baseline docs.
