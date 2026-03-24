# Notifications behavior baseline

## Intent of this document
This document captures the current notification behavior around dispatch notifications, owner confirmation notifications, driver notification read/seen flows, removal acknowledgement flows, and SMS eligibility side effects. It is intentionally conservative and written to preserve current behavior during future refactors.

Whenever behavior could not be proven from repository code alone, it is marked **needs manual verification**.

---

## A. Purpose / scope

### `src/components/notifications/createNotifications.jsx`
Responsible for notification creation and notification-state reconciliation side effects.

Mutation-critical responsibilities:
- Creating owner-facing dispatch status notifications for `CompanyOwner` access codes.
- Creating owner-facing informational update notifications.
- Expanding existing owner status notifications when new trucks are added without a status change.
- Reconciling owner notifications after dispatch edits so `required_trucks`, message text, and stored `read_flag` stay aligned with current dispatch state and confirmations.
- Resolving owner notifications to `read_flag: true` when all required trucks for that owner have confirmed.
- Creating driver-facing dispatch notifications tied to driver `AccessCode` recipients.
- Deduplicating driver dispatch notifications and marking stale unread ones read.
- Creating owner-facing "driver has seen" notifications.
- Creating admin notifications for truck reassignment and all-trucks-confirmed events.
- Triggering SMS eligibility evaluation immediately after some notification creates/updates.

Display-only or formatting-adjacent helpers inside the file still materially affect behavior because they determine dedupe keys, status categories, relevant truck lists, and message identity.

### `src/components/notifications/useOwnerNotifications.jsx`
Responsible for querying notifications for the current session, role-based visibility filtering, deriving effective read state for owner confirmation notifications, and exposing mutation helpers used by UI/navigation flows.

Mutation-critical responsibilities:
- Marking individual notifications read.
- Marking all current notifications read.
- Marking driver dispatch notifications for a dispatch read.
- Marking driver notifications seen when a driver opens a dispatch, including updating `DriverDispatchAssignment.receipt_confirmed_*` fields and creating owner "driver seen" notifications.
- Marking driver removal notifications seen when the removal modal is dismissed and creating the corresponding owner "driver seen" notification.

Display/filtering responsibilities:
- Fetching notifications for Admin vs AccessCode sessions.
- Filtering notifications against visible dispatches and active driver assignments.
- Computing `effectiveReadFlag` for owner confirmation notifications by comparing live confirmations against required trucks.
- Returning `unreadCount` using `effectiveReadFlag`, not raw `read_flag`, for owners.

### App workflows that call into them

#### Owner/admin dispatch mutation workflows
- Admin dispatch form save path uses:
  - `notifyDispatchChange` on status change.
  - `expandCurrentStatusRequiredTrucks` when trucks are added without status change.
  - `notifyDispatchInformationalUpdate` when a non-status edit includes a custom message.
  - `reconcileOwnerNotificationsForDispatch` after save in all cases.
- Admin dispatch edit page additionally uses:
  - `notifyDriversForDispatchEdit` after dispatch edits.
  - `notifyDriverAssignmentChanges` after assignment diffs.
  - `reconcileOwnerNotificationsForDispatch` after save.
- Portal owner truck reassignment/edit flow uses:
  - `clearRemovedTruckDriverAssignments` -> `notifyDriverAssignmentChanges`.
  - confirmation row deletes/creates.
  - `expandCurrentStatusRequiredTrucks`.
  - `reconcileOwnerNotificationsForDispatch`.
  - `notifyOwnerTruckReassignment`.
- Owner truck confirmation flow uses:
  - `notifyTruckConfirmation`.
  - `resolveOwnerNotificationIfComplete` for the current owner session.

#### Driver consumption flows
- Driver opening a dispatch in `Portal.jsx` calls `markDriverDispatchSeenAsync`.
- Driver dismissing removed-assignment modal calls `markDriverRemovalNotificationSeenAsync`.
- Driver notification data in bell/home/notifications pages comes from `useOwnerNotifications`.

### Mutation-critical vs display/filtering summary

#### Mutation-critical
- Any function in `createNotifications.jsx` that writes `Notification`, `DriverDispatchAssignment`, `Confirmation`, or invokes SMS.
- `markRead*`, `markDriverDispatchSeenAsync`, `markDriverRemovalNotificationSeenAsync` in `useOwnerNotifications.jsx`.
- `ownerActionStatus.js` logic is behavior-critical even though it is a pure helper, because owner unread/read presentation depends on it.
- `openConfirmations.js` is behavior-critical for admin reporting of unresolved owner confirmations.
- `notificationSmsDelivery.js` is side-effect critical.

#### Display/filtering
- `NotificationBell.jsx`, `Notifications.jsx`, `Home.jsx`, `NotificationStatusBadge.jsx`, `formatNotificationDetailsMessage.js`.
- `dispatchDateTimeFormat.js` is formatting-oriented, but message text produced here also affects driver notification dedupe and SMS body content, so changing it can have behavior consequences.

---

## B. Notification types / categories / recipients

### Recipient classes observed in this workflow
- `recipient_type: 'AccessCode'`
  - Company owners receive owner confirmation notifications, owner informational notifications, and owner driver-seen notifications.
  - Drivers receive driver dispatch update notifications.
- `recipient_type: 'Admin'`
  - Admins receive all-trucks-confirmed notifications.
  - Admins receive owner truck reassignment notifications.

### Notification categories observed

#### Owner notifications
- **Status/confirmation notifications**: no explicit `notification_category` is set. They are identified by `dispatch_status_key` and lack membership in non-confirmation category sets.
- `dispatch_update_info`: informational owner update for non-status edits.
- `driver_dispatch_seen`: owner-facing notification that a driver has seen a dispatch/removal/amendment/cancellation.

#### Driver notifications
- `driver_dispatch_update`: all driver assignment/update/removal notifications.
  - `notification_type: driver_assigned`
  - `notification_type: driver_updated`
  - `notification_type: driver_amended`
  - `notification_type: driver_cancelled`
  - `notification_type: driver_removed`

#### Admin notifications
- `admin_dispatch_all_confirmed`
- `owner_truck_reassignment`

### Recipient selection rules

#### Company owner recipients
Selected from `AccessCode` records where:
- `company_id === dispatch.company_id`
- `active_flag === true`
- `code_type === 'CompanyOwner'`
- plus truck intersection requirement: `(dispatch.trucks_assigned || [])` must intersect `(accessCode.allowed_trucks || [])`.

Owner notifications are truck-scoped. Owners with no overlap receive nothing.

#### Driver recipients
Driver notifications are not sent to `Driver` entities directly. They are sent to the driver's `AccessCode` by:
1. collecting affected `driver_id` values from active `DriverDispatchAssignment` rows,
2. fetching each `Driver` record,
3. reading `driver.access_code_id`,
4. creating `Notification` with `recipient_type: 'AccessCode'` and `recipient_access_code_id` equal to that access code id.

If a driver has no `access_code_id`, notification creation stops for that driver.

#### Admin recipients
Admin notifications are created with `recipient_type: 'Admin'` and no additional recipient id targeting in this file. Exact downstream admin fanout is **needs manual verification**.

### How owner/driver/admin targeting differs
- **Owner targeting** is company + active owner access code + allowed truck intersection.
- **Driver targeting** is active driver assignment + driver's linked access code.
- **Admin targeting** is global `recipient_type: 'Admin'` creation with category-based meaning.

### Role of `allowed_trucks`
`allowed_trucks` materially affects:
- whether a CompanyOwner receives an initial status notification,
- whether a CompanyOwner receives a driver-seen notification,
- which trucks are stored in `required_trucks` for owner notifications,
- owner effective read state because confirmations are compared only against required/allowed trucks,
- open confirmation rows in admin reporting.

### Role of `company_id`
`company_id` is used to:
- look up the company for owner notifications and SMS owner phone resolution,
- find matching owner access codes,
- stamp `recipient_company_id` on notifications,
- construct fallback dispatch payloads for removal-seen owner notifications.

### Role of driver assignments
`DriverDispatchAssignment` controls:
- which drivers are notified,
- which trucks are included in driver notification `required_trucks`,
- which assignments are marked receipt-confirmed when a driver opens a dispatch,
- which drivers are considered added or removed during assignment reconciliation.

Only assignments with `active_flag !== false` are treated as active/current.

### Role of access codes
Access codes determine:
- owner targeting,
- driver notification destination via `Driver.access_code_id`,
- SMS eligibility lookup, because SMS is only attempted for `recipient_type: 'AccessCode'`,
- visibility of AccessCode notifications to the current session in `useOwnerNotifications`.

---

## C. Deduping / reconciliation rules

### 1. Status notification dedupe for owners
Deduping key: `dispatch_status_key = "${dispatch.id}:${newStatus}:${ownerAccessCodeId}"`.

Behavior:
- Before creating a new owner status notification, the code calls `resolveStaleOwnerStatusNotifications(dispatch.id, ownerId, newStatus)`.
- That helper fetches AccessCode notifications for the dispatch and marks unread status notifications for the same owner read if their parsed status from `dispatch_status_key` differs from `currentStatus`.
- Notifications in categories `dispatch_update_info` and `driver_dispatch_seen` are explicitly excluded from this stale-resolution step.
- If a notification already exists for the exact dedupe key, creation is skipped entirely.

Implication:
- One owner status notification per `(dispatch, status, owner)` is intended.
- A prior unread owner status notification for a different status is resolved by setting `read_flag: true`.

### 2. Informational update dedupe
There is **no dedupe** in `notifyDispatchInformationalUpdate`.

Behavior:
- Every eligible owner gets a newly created `dispatch_update_info` notification whenever the admin save flow calls it with a non-empty `customUpdateMessage`.
- The message body is exactly the trimmed custom text.
- Multiple informational notifications for the same dispatch/owner can accumulate.

### 3. Driver update dedupe
Deduping for driver notifications happens inside `createDriverDispatchNotification`.

Query scope for dedupe:
- `recipient_type: 'AccessCode'`
- `recipient_access_code_id: driverAccessCodeId`
- `related_dispatch_id: dispatch.id`
- `notification_category: 'driver_dispatch_update'`

Rules:
- Existing unread notifications are loaded.
- A matching unread notification is the first unread record whose:
  - `notification_type` case-insensitively equals the new `notificationType`, and
  - `message` exactly equals `"${message}\n${formatDispatchDateTimeLine(dispatch)}"`.
- All other unread driver-dispatch-update notifications in that scope are marked `read_flag: true` as stale unread notifications.
- If the latest matching unread notification exists:
  - it is reused,
  - `required_trucks`, `message`, and `title` are updated only if `required_trucks` changed by JSON comparison,
  - no new notification is created,
  - SMS is not re-triggered from this reuse branch.
- If no matching unread notification exists, a new notification is created and SMS eligibility is evaluated.

Implications:
- Driver notification dedupe depends on the exact message string, which includes the output of `formatDispatchDateTimeLine(dispatch)`.
- A changed dispatch date/time line can force a new driver notification even when type is unchanged.
- Any other unread driver-dispatch-update notification for the same driver+dispatch becomes read when a new one is created/reused.

### 4. Driver seen dedupe
Owner-facing driver-seen notifications use category `driver_dispatch_seen` and dedupe by `dispatch_status_key`.

Deduping key basis:
- `normalizedDriverKey = lower(trim(driverId || driverName || 'driver'))`
- `normalizedSeenKind = lower(seenKind)`
- `normalizedSeenVersionKey = lower(trim(seenVersionKey || `${dispatch.id}:${seenKind}`))`
- `seenStatusKey = `${dispatch.id}:${normalizedDriverKey}:${normalizedSeenKind}:${normalizedSeenVersionKey}``
- final stored key per owner: `${seenStatusKey}:${ownerCode.id}`

Behavior:
- For each eligible owner whose allowed trucks overlap the assignment truck list supplied to `notifyOwnerDriverSeen`, the code checks for an existing `driver_dispatch_seen` notification with the same `dispatch_status_key`.
- If one exists, creation is skipped.
- Otherwise a new owner notification is created unread.

Implications:
- Driver seen notifications are deduped per owner, dispatch, driver, seen kind, and version key.
- For dispatch-open seen flow, `seenVersionKey` is based on the current relevant notification id when available, otherwise a fallback dispatch+kind string.
- For removal dismissal flow, `seenVersionKey` is the removal notification id.

### 5. All-confirmed/admin notification dedupe
`notifyTruckConfirmation` creates `admin_dispatch_all_confirmed` only when every currently assigned truck is confirmed for the current dispatch status.

Dedupe query:
- `recipient_type: 'Admin'`
- `notification_category: 'admin_dispatch_all_confirmed'`
- `related_dispatch_id: dispatch.id`
- `confirmation_type: dispatch.status`

If one exists, creation is skipped.

### 6. Owner notification resolution/read behavior
There are two distinct mechanisms.

#### Stored read-state writes
- `resolveStaleOwnerStatusNotifications` marks previous-status owner notifications read.
- `expandCurrentStatusRequiredTrucks` updates existing notification `read_flag` to `allConfirmed` after required truck expansion.
- `reconcileOwnerNotificationsForDispatch` updates current-status owner notifications with `read_flag = allConfirmed`, and marks non-current-status owner notifications read.
- `resolveOwnerNotificationIfComplete` marks the current owner's notification read when all `required_trucks` are confirmed.
- explicit UI click marks `dispatch_update_info` and `driver_dispatch_seen` read for non-driver users.
- "mark all read" updates all currently visible notification records with raw `read_flag: true`.

#### Effective read-state for owners
Owner unread counts and list highlighting do **not** use raw `read_flag` alone for status notifications.
`getOwnerNotificationActionStatus` computes:
- `requiredTrucks` from live dispatch trucks intersected with owner allowed trucks when dispatch is available, otherwise falls back to stored `required_trucks`.
- `confirmedTrucks` from live confirmations matching dispatch id and status parsed from `dispatch_status_key`.
- `pendingTrucks = requiredTrucks - confirmedTrucks`.
- `effectiveReadFlag = notification.read_flag || pendingTrucks.length === 0`.

Implication:
- An owner status notification can display as effectively read even if the stored database `read_flag` is still false, as soon as no pending trucks remain in the current client view.

### 7. `required_trucks` expansion/reconciliation behavior

#### Initial owner status notification creation
`required_trucks` is set to the dispatch trucks visible to that owner at creation time.

#### `expandCurrentStatusRequiredTrucks`
Used when trucks are added without a status change.
Behavior per owner:
- Determine newly added trucks that are also in owner `allowed_trucks`.
- Load current owner status notification by dedupe key `(dispatch,status,owner)`.
- Reconcile existing `required_trucks` down to trucks that are still both on the dispatch and still allowed for the owner.
- Union that reconciled set with the owner-visible added trucks.
- Rebuild the owner message from the updated required truck set.
- Compute `allConfirmed` using current confirmations for the dispatch status.
- If notification exists: update `required_trucks`, `message`, and `read_flag`.
- If newly added required trucks include at least one not yet confirmed truck, SMS eligibility is re-evaluated for the updated notification.
- If no notification exists: create one with `required_trucks = nextRequired` and `read_flag = allConfirmed`, then evaluate SMS.

#### `reconcileOwnerNotificationsForDispatch`
Used after edits to keep owner notification payloads aligned.
Behavior:
- Loads all AccessCode notifications for the dispatch.
- Skips `dispatch_update_info` notifications entirely.
- Parses status from `dispatch_status_key`; notifications without parseable status are skipped.
- If notification status is not the current dispatch status, unread ones are marked read.
- For current-status notifications, `required_trucks` is reduced to the intersection of:
  - the notification's stored `required_trucks`,
  - current `dispatch.trucks_assigned`,
  - current owner `allowed_trucks`.
- Message is rebuilt from current dispatch details and the reconciled truck list.
- `read_flag` becomes whether every reconciled required truck has a matching confirmation for the current status.

Implication:
- Reconciliation preserves historical truck scope from the notification's own `required_trucks`; it does not broaden current-status notifications to all currently allowed dispatch trucks except through the explicit expansion path.

---

## D. Read-state and seen behavior

### How notifications become read

#### For all roles
- `markReadMutation` updates one notification to `read_flag: true`.
- `markAllReadMutation` marks every currently filtered notification with `read_flag: true`.

#### For CompanyOwner/Admin click behavior in UI
In `NotificationBell`, `Notifications`, and `Home`:
- Only categories `dispatch_update_info` and `driver_dispatch_seen` are auto-marked read on click.
- This auto-mark-read-on-click path is disabled for drivers.
- Owner status notifications are not marked read on click; they remain action-based.

#### For driver dispatch notifications
- `markDispatchRelatedReadAsync(dispatchId)` marks unread `driver_dispatch_update` notifications for that driver+dispatch read.
- `markDriverDispatchSeenAsync` marks all unread `driver_dispatch_update` notifications for that driver+dispatch read when a driver opens the dispatch.
- `markDriverRemovalNotificationSeenAsync` marks unread `driver_removed` notifications for that driver+dispatch read when the removal modal is dismissed.

### Effective read vs stored `read_flag`
Applies only to owner confirmation/status notifications.

- Stored `read_flag` is the persisted database flag.
- `effectiveReadFlag` is derived client-side in `useOwnerNotifications`, `NotificationBell`, `Notifications`, and `Home` using `getOwnerNotificationActionStatus`.
- Non-owner or non-confirmation notifications use raw `Boolean(notification.read_flag)`.

Important distinction:
- Owner status notifications can appear resolved even before a mutation writes `read_flag: true`, because `effectiveReadFlag` turns true when there are no pending required trucks.

### Driver seen flow: dispatch open
Triggered from `Portal.handleDispatchOpen(dispatch)` for driver sessions.

Behavior in `markDriverDispatchSeenAsync`:
1. Require `session.code_type === 'Driver'`, `dispatch.id`, and `session.driver_id`.
2. Load active assignments for the driver for the dispatch from cached `driverAssignments` query data.
3. Identify `unseenAssignments` where `receipt_confirmed_at` is falsy.
4. Find all matching driver notifications for that dispatch and current driver recipient.
5. Pick `currentRelevantNotification` as:
   - explicit `notificationId` match if provided,
   - else newest matching notification,
   - else null.
6. Determine `seenKind`:
   - `driver_removed` -> `removed`
   - `driver_amended` -> `amended`
   - `driver_cancelled` -> `cancelled`
   - else if dispatch status is amended/cancelled -> matching value
   - else `assigned`
7. Build dedupe guard key `dispatchId:driverId:seenKind:seenVersionKey` and skip if already pending locally.
8. If there are unread notifications, mark them all read.
9. If there are unseen assignments, update every unseen assignment with:
   - `receipt_confirmed_flag: true`
   - `receipt_confirmed_at: seenAt`
   - `receipt_confirmed_by_driver_id: session.driver_id`
   - `receipt_confirmed_by_name`: first non-empty of session label/driver_name/name/assignment driver_name
10. If assignments were updated, call `notifyOwnerDriverSeen` with matching assignments, driver identity, seen kind, and version key.
11. Invalidate notification and assignment queries.

Important consequence:
- Owner "driver seen" notification is only created if there was at least one assignment lacking `receipt_confirmed_at`. If only unread notifications existed but all assignments were already receipt-confirmed, owner seen notification is not sent again.

### Driver removal-notification seen flow
Triggered from the removal modal dismissal path in `Portal.jsx`.

Behavior in `markDriverRemovalNotificationSeenAsync`:
1. Require driver session and `notification.id`.
2. Use pending local key `${related_dispatch_id || 'removed'}:${driver_id}:removed:${notification.id}` to avoid duplicate in-flight work.
3. Find unread notifications for the same driver+dispatch where:
   - category is `driver_dispatch_update`
   - `notification_type` lowercased is `driver_removed`
4. Mark all such unread removal notifications read; if none exist and the passed notification itself is unread, mark that one read.
5. Call `notifyOwnerDriverSeen` with:
   - provided dispatch or fallback minimal dispatch object,
   - synthetic assignments built from `notification.required_trucks || ['Removed']`, each as `{ active_flag: true, truck_number }`,
   - `seenKind: 'removed'`,
   - `seenVersionKey: notification.id`.
6. Invalidate notification queries.

Important difference from normal dispatch-open seen flow:
- This flow does **not** update `DriverDispatchAssignment.receipt_confirmed_*` fields.
- It always attempts owner seen notification creation after marking read, using synthetic assignments if necessary.

### Removal notifications
Removal notifications are a subtype of driver dispatch update notification:
- category: `driver_dispatch_update`
- type: `driver_removed`
- title/message: "Dispatch Removed" / "This dispatch assignment is no longer available"
- `required_trucks` populated from the removed driver's previously assigned active trucks.

In the portal, if a notification-driven open targets a removal notification, the normal dispatch drawer open is replaced by a modal describing that the assignment is no longer available. Dismissing that modal triggers removal seen handling.

### Notification filtering by role
`useOwnerNotifications` applies role filtering after query.

#### Admin sessions
- Query: `Notification.filter({ recipient_type: 'Admin' })`
- Filtering: all admin notifications are kept, regardless of related dispatch visibility.

#### AccessCode sessions
- Query: `Notification.filter({ recipient_type: 'AccessCode' })`, then locally keep records where `recipient_access_code_id === session.id` or `recipient_id === session.id`.

Then additional filtering by role:
- If notification has no `related_dispatch_id`, keep it.
- CompanyOwner/non-admin/non-driver: keep only if related dispatch id exists in current company dispatch query results.
- Driver:
  - keep all `driver_dispatch_update` notifications, even if the driver no longer has an active assignment for that dispatch,
  - keep other related-dispatch notifications only if the driver currently has an active assignment for that dispatch.

Implication:
- Driver removal notifications remain visible because they are `driver_dispatch_update`, even after assignment removal.
- Owner notifications can disappear from the UI if the related dispatch is no longer returned by the owner's dispatch query.

---

## E. SMS-related behavior

### How notification records become SMS candidates
SMS evaluation is only triggered from explicit create/update call sites in `createNotifications.jsx`:
- after `createDriverDispatchNotification` creates a new driver notification,
- after `notifyDispatchChange` creates a new owner status notification,
- after `notifyDispatchInformationalUpdate` creates a new owner informational notification,
- after `expandCurrentStatusRequiredTrucks`:
  - after updating an existing notification when newly added required trucks include at least one unconfirmed truck,
  - after creating a new notification.

No SMS attempt is made from:
- `notifyOwnerDriverSeen`,
- `reconcileOwnerNotificationsForDispatch`,
- `resolveOwnerNotificationIfComplete`,
- `notifyTruckConfirmation`,
- `notifyOwnerTruckReassignment`.

### SMS eligibility gate: recipient type
`sendNotificationSmsIfEligible` immediately skips if `notification.recipient_type !== 'AccessCode'`.

Consequences:
- Admin notifications never send SMS here.
- Owner and driver notifications can be SMS candidates.

### Recipient resolution
The notification's recipient access code is loaded from:
- `notification.recipient_access_code_id || notification.recipient_id`.

If no access code is found, SMS is skipped and an SMS log entry is created with `skip_reason: recipient_access_code_not_found`.

### Owner SMS conditions
For `recipient.code_type === 'CompanyOwner'`:
- `accessCode.sms_enabled === true` must be set.
- Company phone is resolved from `Company.contact_methods` or fallback `contact_info` via `getCompanySmsContact`.
- The chosen/fallback phone must normalize to a valid `+1...` number.

If not eligible, skip reasons are:
- `owner_not_opted_in`
- `missing_sms_phone`

Important nuance:
- Owner SMS target phone comes from the company record, not from the access code itself.

### Driver SMS conditions
For `recipient.code_type === 'Driver'`:
- The linked `Driver` record is fetched by `recipient.driver_id`.
- `getDriverSmsState(driver)` requires all of:
  - `driver.owner_sms_enabled === true`
  - driver opted in: `driver.driver_sms_opt_in === true`, or if that field is nullish then `driver.sms_enabled === true`
  - normalized driver phone is valid.

If not eligible, skip reasons are:
- `owner_sms_disabled`
- `driver_not_opted_in`
- `missing_sms_phone`

### Other AccessCode types
Fallback behavior exists for non-driver/non-company-owner access codes:
- requires `recipient.sms_enabled === true`
- uses `recipient.sms_phone`
- otherwise skipped with `sms_disabled` or `missing_sms_phone`

Whether any such access code types actually participate in this workflow is **needs manual verification**.

### SMS message composition
If notification has no related dispatch:
- SMS message is `notification.message`.

If notification has a related dispatch:
- Headline is derived from `notification.title` and normalized to end with punctuation.
- Dispatch date/time line is resolved by refetching the dispatch and calling `formatDispatchDateTimeLine(dispatch)`.
- Final SMS body is:
  - `CCG Transit: {headline}`
  - dispatch date/time line or fallback `Dispatch details are available in the app.`
  - blank line
  - `Please open the app to view and confirm.`

### Delivery/send path
Eligible SMS sends invoke backend function:
- `base44.functions.invoke('sendNotificationSms/entry', { phone, message, notificationId, dispatchId, recipientAccessCodeId })`

Provider behavior beyond returned payload handling is **needs manual verification** because the backend function source was not inspected here.

### SMS logging side effects
Every send/skip/failure attempt records a `General` entity row with `record_type: 'sms_log'` including notification id, dispatch id, recipient metadata, phone, message, status, skip reason, provider, provider message id, and timestamps when available.

### Owner vs driver vs truck/admin SMS summary
- **Owner notifications**: SMS-eligible if recipient is a CompanyOwner access code opted in and company has a valid SMS contact.
- **Driver notifications**: SMS-eligible if driver access code resolves to a driver whose owner-enabled flag, opt-in state, and phone all allow SMS.
- **Admin notifications**: not SMS-eligible in this workflow because recipient type is `Admin`.
- **Truck confirmation/admin side effects**: `notifyTruckConfirmation` creates an Admin notification only; no SMS path is connected there.

---

## F. Mutation / side-effect sequence maps

### 1. Dispatch status change -> owner notifications
1. Admin dispatch save computes `statusChanged` in `DispatchForm.finalizeSubmit`.
2. After save, `notifyDispatchChange(dispatch, oldStatus, newStatus, ...)` is called.
3. Company is resolved from provided companies or fetched.
4. Active `CompanyOwner` access codes for the company are resolved from provided access codes or fetched.
5. Owners are filtered to those whose `allowed_trucks` intersect `dispatch.trucks_assigned`.
6. For each affected owner:
   - stale unread owner status notifications for the same dispatch but different status are marked read,
   - dedupe key `${dispatch.id}:${newStatus}:${ownerId}` is checked,
   - if absent, a new unread owner notification is created with `required_trucks` equal to relevant owner-visible trucks,
   - SMS eligibility is evaluated immediately.
7. Afterward, `reconcileOwnerNotificationsForDispatch` runs from the save flow to refresh current notification state.

### 2. Dispatch non-status edit -> informational owner update
1. Admin dispatch save sees `statusChanged === false`.
2. If a custom update message was supplied, `notifyDispatchInformationalUpdate` is called.
3. Company and active owner access codes are resolved.
4. Owners are filtered by truck intersection.
5. A new unread `dispatch_update_info` notification is created per eligible owner.
6. SMS eligibility is evaluated for each created informational notification.
7. Save flow still runs `reconcileOwnerNotificationsForDispatch`, but that reconciliation skips `dispatch_update_info` rows.

### 3. Truck added without status change
1. Save flow computes `addedTrucks` as trucks newly present in `trucks_assigned` when status did not change.
2. `expandCurrentStatusRequiredTrucks(dispatch, addedTrucks)` runs.
3. Added trucks are normalized/uniqued.
4. Eligible owner codes are resolved.
5. Current confirmations for `(dispatch.id, dispatch.status)` are fetched.
6. For each owner with overlap against `addedTrucks`:
   - current owner status notification is found by dedupe key,
   - existing required trucks are reconciled against current dispatch + owner permissions,
   - owner-visible added trucks are unioned in,
   - message is rebuilt,
   - `read_flag` is recomputed as all-confirmed or not,
   - existing notification is reused/updated rather than replaced, so previously “all confirmed” owner action state can move back to pending (for example `2/2 confirmed` -> `2/3 confirmed`) when the added truck is unconfirmed,
   - updated notification may trigger SMS only if newly added required trucks include at least one not already confirmed,
   - otherwise a new owner status notification is created if one did not exist, then SMS is evaluated.
7. `reconcileOwnerNotificationsForDispatch` then re-normalizes current status notification state.

### 4. Removed truck / removed driver notification flow
1. Owner/admin truck changes cause assignments for removed trucks to be set `active_flag: false` in `clearRemovedTruckDriverAssignments` or driver assignment UI removal.
2. Previous and next assignment arrays are diffed.
3. `notifyDriverAssignmentChanges(dispatch, previousAssignments, nextAssignments)` runs.
4. Removed driver ids are those present in previous active assignments but absent from next active assignments.
5. For each removed driver id with a resolvable access code, `createDriverDispatchNotification` creates or dedupes a `driver_removed` notification, storing removed trucks in `required_trucks`.
6. SMS eligibility is evaluated for newly created removal notifications.
7. When a driver opens a notification-targeted removed dispatch, `Portal` shows a removal modal instead of opening the dispatch drawer.
8. Dismissing that modal calls `markDriverRemovalNotificationSeenAsync`, which marks unread removal notifications read and creates owner `driver_dispatch_seen` notifications with `seenKind: removed`.

### 5. Driver assignment added/removed/changed flow
1. Assignment changes in admin pages or portal detail drawer compare previous active assignments to next assignments.
2. `notifyDriverAssignmentChanges` derives added vs removed driver ids using active assignments only.
3. Added drivers get `driver_assigned` notifications with next assigned trucks in `required_trucks`.
4. Removed drivers get `driver_removed` notifications with previous assigned trucks in `required_trucks`.
5. If the same driver stays assigned but their truck list changes, `notifyDriverAssignmentChanges` does nothing because it only compares driver id presence. Truck-list-only changes for still-assigned drivers are handled by `notifyDriversForDispatchEdit` when that flow is invoked.
6. For dispatch edits, `notifyDriversForDispatchEdit`:
   - notifies all assigned drivers if dispatch status changed to amended/cancelled,
   - otherwise sends `driver_updated` to all assigned drivers unless the edit was truck-assignment-only, in which case only drivers whose assigned truck lists changed are notified.

### 6. Driver opens dispatch -> seen flow
1. Notification click or other portal navigation opens `Portal?dispatchId=...&notificationId=...`.
2. When the dispatch drawer opens for a driver, `handleDispatchOpen` calls `markDriverDispatchSeenAsync({ dispatch, notificationId })`.
3. Driver unread `driver_dispatch_update` notifications for that dispatch are marked read.
4. Active assignments for that driver+dispatch that lack `receipt_confirmed_at` are updated with receipt-confirmed fields.
5. If any assignment was newly receipt-confirmed, owner `driver_dispatch_seen` notifications are created for owners whose allowed trucks overlap the matching assignment trucks.
6. Notification and assignment queries are invalidated.

### 7. Driver removed notification dismissed -> seen flow
1. A removal notification targeted in the URL causes `Portal` to show a removed-assignment modal.
2. Dismissing the modal calls `markDriverRemovalNotificationSeenAsync({ notification, dispatch })`.
3. All unread `driver_removed` notifications for that dispatch and driver recipient are marked read.
4. Owner `driver_dispatch_seen` notifications are created with `seenKind: removed` and truck list derived from notification `required_trucks` or fallback `['Removed']`.
5. Queries are invalidated.

### 8. All trucks confirmed -> admin/owner notification resolution

#### Admin side
1. On owner confirmation submit, `Portal.handleConfirm` calls confirmation mutation.
2. `notifyTruckConfirmation(dispatch, truck, companyName)` is called.
3. Current assigned trucks and current status confirmations are loaded.
4. If every assigned truck is confirmed for the current status and no existing admin all-confirmed notification exists for `(dispatch,status)`, an unread `admin_dispatch_all_confirmed` notification is created.

#### Owner side
1. In the same owner confirmation flow, if session is `CompanyOwner`, `resolveOwnerNotificationIfComplete(dispatch, null, session.id)` runs.
2. It loads the current owner's notification by dedupe key `(dispatch,status,owner)`.
3. It loads authoritative confirmations if not supplied.
4. For each unread matching notification with non-empty `required_trucks`, if every required truck is confirmed, `read_flag` is set true.
5. Independently of this write, UI owner notification state may already show resolved via `effectiveReadFlag`.

### 9. Notification creation -> SMS send eligibility path
1. A supported notification create/update path calls `sendNotificationSmsIfEligible(notification)`.
2. Non-AccessCode recipients are skipped and logged.
3. Recipient access code is resolved; missing access code is skipped and logged.
4. Access-code-type-specific SMS eligibility is computed.
5. Ineligible recipients are skipped and logged with explicit reason.
6. Eligible recipients get an SMS body composed from notification title + dispatch date/time.
7. Backend function `sendNotificationSms/entry` is invoked.
8. Result is logged to `General` as `sent`, `skipped`, or `failed`.

---

## G. Dependency map

### Presentation-only dependencies
- `NotificationBell.jsx`
- `Notifications.jsx`
- `Home.jsx` notification card handling
- `NotificationStatusBadge.jsx`
- most of `formatNotificationDetailsMessage.js`

Caution: they are presentation-facing, but some contain click-to-mark-read behavior and owner effective-read rendering, so they must still be regression tested.

### Logic-coupled dependencies
- `ownerActionStatus.js`
  - defines what counts as owner confirmation vs non-confirmation,
  - computes `effectiveReadFlag`, pending/done counts, and required truck resolution.
- `dispatchDateTimeFormat.js`
  - affects stored message text and driver-notification dedupe identity.
- `openConfirmations.js`
  - derives unresolved owner confirmation rows shown to admins.
- helper functions inside `createNotifications.jsx`:
  - `getUniqueDriverIds`
  - `buildDispatchComparableShape`
  - `didOnlyTruckAssignmentsChange`
  - `getDriverAssignedTrucks`
  - `areAssignedTruckListsEqual`
  - `getRelevantTrucks`
  - `reconcileExistingRequiredTrucks`
  - `buildOwnerDispatchMessage`
  - `parseStatusFromDedupKey`
  - `getDriverNotificationSeenKind`

### Side-effect / mutation critical dependencies
- `base44.entities.Notification.*`
- `base44.entities.DriverDispatchAssignment.*`
- `base44.entities.AccessCode.filter`
- `base44.entities.Driver.filter`
- `base44.entities.Dispatch.filter`
- `base44.entities.Company.filter`
- `base44.entities.Confirmation.*`
- `base44.entities.General.create`
- `base44.functions.invoke('sendNotificationSms/entry', ...)`
- `notificationSmsDelivery.js`
- all exported functions in `createNotifications.jsx`
- mutation helpers in `useOwnerNotifications.jsx`
- portal/admin workflows that call those exports

---

## H. Dangerous areas to move or refactor

### 1. Owner notification read semantics are split across stored and derived state
Danger:
- `read_flag` persistence is mutated in several places.
- UI unread behavior for owner status notifications depends on `getOwnerNotificationActionStatus`, not solely on stored data.
- Admin open-confirmation reporting uses a different non-confirmation category set than owner action status.

Regression risk:
- A refactor could accidentally treat `read_flag` as authoritative and change unread counts or visible badges.

### 2. Driver notification dedupe depends on message text
Danger:
- `createDriverDispatchNotification` dedupes by exact `message` plus type.
- The message includes `formatDispatchDateTimeLine(dispatch)`.

Regression risk:
- Any formatting change to dispatch date/time text can alter dedupe behavior and create extra notifications.

### 3. Owner current-status notification broadening is intentionally separated from reconciliation
Danger:
- `expandCurrentStatusRequiredTrucks` adds new trucks.
- `reconcileOwnerNotificationsForDispatch` only narrows/intersects from stored `required_trucks`.

Regression risk:
- Merging these concepts incorrectly could broaden or shrink owner obligations unexpectedly.

### 4. Driver seen flow and receipt confirmation updates are coupled
Danger:
- Opening a dispatch marks notifications read **and** updates assignment receipt fields **and** can create owner notifications.
- Removal dismissal marks notifications read but does not update assignment receipt fields.

Regression risk:
- Treating these flows as the same could change assignment receipt auditing or owner seen notices.

### 5. Filtering logic for drivers intentionally keeps driver update notifications even after assignment loss
Danger:
- Driver UI keeps all `driver_dispatch_update` notifications regardless of whether the driver still has an active assignment for the dispatch.

Regression risk:
- A seemingly harmless filter cleanup could hide removal notifications or older assignment notices.

### 6. SMS eligibility pulls data from multiple entities
Danger:
- Driver SMS state comes from `Driver`, not access code alone.
- CompanyOwner SMS phone comes from `Company`, not access code phone.
- SMS logs are part of side effects.

Regression risk:
- Centralizing SMS logic without preserving these distinctions could change who receives texts.

### 7. Non-confirmation category sets are not perfectly aligned everywhere
Observed sets:
- `createNotifications.jsx` / `ownerActionStatus.js`: `dispatch_update_info`, `driver_dispatch_seen`
- `openConfirmations.js`: only `dispatch_update_info`

This difference appears intentional or accidental, but cannot be assumed safe to unify without verification.

---

## I. Safe-first extraction candidates

### Safest extraction candidates
1. Pure status/title helpers:
   - `getDriverSeenTitle`
   - `isDispatchCanceledStatus`
   - `getDriverDispatchStatusNotification`
2. Pure array/set helpers:
   - `getUniqueDriverIds`
   - `getDriverAssignedTrucks`
   - `areAssignedTruckListsEqual`
   - `getRelevantTrucks`
3. Pure normalization/comparison helpers:
   - `normalizeComparableValue`
   - `buildDispatchComparableShape`
   - `didOnlyTruckAssignmentsChange`
4. Owner message-format helpers:
   - `buildOwnerDispatchMessage`
   - `parseStatusFromDedupKey`
5. Documentation-only / type-shape extraction around notification category constants, provided current values remain identical.

### Extraction candidates that are only moderately safe
- `resolveStaleOwnerStatusNotifications`
- `reconcileExistingRequiredTrucks`
- `buildDriverAccessCodeMap`

These are still behavior critical, but they have single-purpose boundaries.

### Candidates that should be deferred
- `createDriverDispatchNotification`
- `notifyOwnerDriverSeen`
- `expandCurrentStatusRequiredTrucks`
- `reconcileOwnerNotificationsForDispatch`
- `markDriverDispatchSeenAsync`
- `markDriverRemovalNotificationSeenAsync`
- `sendNotificationSmsIfEligible`

These functions combine business rules, side effects, dedupe, and data writes.

---

## J. Manual regression checklist

### Owner notifications
- [ ] Create a dispatch with trucks overlapping one owner access code and not another; verify only overlapping owners receive a status notification.
- [ ] Change dispatch status from Scheduled -> Dispatch -> Amended -> Cancelled; verify one owner status notification per owner per status and older unread status notifications are resolved.
- [ ] Edit dispatch without status change and with a custom update message; verify a new `dispatch_update_info` notification is created each time with no dedupe.
- [ ] Add a truck without status change; verify owner current-status notification expands `required_trucks` only for owners allowed on that truck.
- [ ] Remove a truck or revoke owner access to a truck; verify owner notification reconciliation shrinks `required_trucks` and updates pending counts.
- [ ] Confirm all required trucks for an owner; verify owner notification becomes effectively read and eventually stored `read_flag` is true.
- [ ] Click owner informational and driver-seen notifications; verify click marks them read.
- [ ] Click owner status notifications; verify click does not directly mark them read.

### Driver notifications
- [ ] Add a new driver assignment; verify the driver receives `driver_assigned` with correct required trucks.
- [ ] Remove a driver assignment; verify the driver receives `driver_removed` and still sees it despite no active assignment remaining.
- [ ] Change assigned trucks for a still-assigned driver without status change; verify driver update behavior matches current edit flow and only impacted drivers are notified in truck-only edits.
- [ ] Change status to Amended; verify assigned drivers receive amended notifications and receipt-confirmed assignment fields are reset before re-seeing.
- [ ] Change status to Cancelled; verify assigned drivers receive cancelled notifications and receipt-confirmed assignment fields are reset before re-seeing.
- [ ] Repeat the same driver notification condition without changing message/type; verify no duplicate unread driver notification is created.
- [ ] Create a different driver notification for the same dispatch; verify stale unread driver dispatch update notifications are marked read.

### Driver seen/removal flows
- [ ] Open a dispatch as a driver from a driver notification; verify unread driver notifications for that dispatch become read.
- [ ] On first open with unseen assignment receipt fields, verify `receipt_confirmed_flag/at/by_*` fields are written.
- [ ] Verify owner receives one driver-seen notification per owner per driver/dispatch/seen kind/version.
- [ ] Re-open the same dispatch without receipt reset; verify owner does not get a duplicate driver-seen notification.
- [ ] Dismiss a removal modal; verify unread `driver_removed` notifications become read and owner gets a removed-seen notification.
- [ ] Verify removal dismissal does not update `DriverDispatchAssignment.receipt_confirmed_*` fields.

### Admin notifications
- [ ] Confirm trucks one by one; verify admin all-confirmed notification appears only when all currently assigned trucks are confirmed for that status.
- [ ] Confirm all trucks again or repeat a confirmation; verify no duplicate admin all-confirmed notification for the same dispatch/status.
- [ ] Perform owner truck reassignment/change actions; verify `owner_truck_reassignment` admin notification content still matches current behavior.

### SMS behavior
- [ ] Owner with `sms_enabled` true and valid company SMS contact gets SMS for eligible owner notifications.
- [ ] Owner without opt-in or without valid company SMS phone does not get SMS; verify correct skip reason log.
- [ ] Driver with `owner_sms_enabled`, driver opt-in, and valid phone gets SMS for eligible driver notifications.
- [ ] Driver missing any SMS prerequisite does not get SMS; verify correct skip reason log.
- [ ] Admin notifications never attempt SMS and are logged as skipped if routed through SMS helper by mistake.
- [ ] Added-truck expansion triggers SMS only when newly added required trucks include at least one unconfirmed truck.
- [ ] Reused deduped driver notifications do not re-send SMS.

### Filtering / display
- [ ] Driver notification list still shows `driver_dispatch_update` entries even when driver no longer has an active assignment to the dispatch.
- [ ] Owner notification unread count uses effective read state, not raw `read_flag`.
- [ ] Admin open confirmation screens still list only unresolved owner confirmation trucks.

---

## K. Final required sections

### 1. Must-remain-identical behaviors
- Owner status notification targeting must continue to be restricted by company, active CompanyOwner access code, and `allowed_trucks` overlap.
- Owner status notification dedupe must remain one per `(dispatch, status, owner)` and must resolve older unread status notifications for that owner when status changes.
- Informational owner updates must remain non-deduped unless the product explicitly changes that behavior.
- Driver notification targeting must remain based on active driver assignments and the driver's linked access code.
- Driver notification dedupe must continue to consider message text and notification type, and stale unread driver updates for the same dispatch/driver must be marked read.
- Driver removal notifications must remain visible to drivers even after assignment removal.
- Owner effective read state for confirmation notifications must continue to depend on live pending confirmations, not only stored `read_flag`.
- Driver dispatch-open flow must continue to both mark unread driver notifications read and write assignment receipt confirmation fields.
- Driver removal dismissal flow must continue to mark removal notifications read without writing assignment receipt confirmation fields.
- Owner driver-seen notifications must remain deduped by dispatch + driver identity + seen kind + version key + owner recipient.
- Owner notification reconciliation must continue to preserve current required-truck scope semantics, including explicit expansion for truck-add flows.
- Admin all-confirmed notifications must only appear once per `(dispatch, status)` and only when all currently assigned trucks are confirmed.
- SMS eligibility distinctions between CompanyOwner and Driver recipients must remain intact.

### 2. High-risk logic areas
- Owner `effectiveReadFlag` vs stored `read_flag` split.
- `createDriverDispatchNotification` exact-message dedupe and stale-read behavior.
- `expandCurrentStatusRequiredTrucks` vs `reconcileOwnerNotificationsForDispatch` interplay.
- Driver seen flow coupling of notification reads, assignment receipt fields, and owner seen notification creation.
- Removal-seen flow using synthetic assignments and fallback dispatch data.
- SMS eligibility logic spanning `AccessCode`, `Driver`, and `Company` entities.
- Inconsistent non-confirmation category sets across helpers.

### 3. Safe-first extraction candidates
- Pure string/status helpers.
- Pure assignment comparison helpers.
- Pure owner message-building helpers.
- Constant extraction for categories/status labels, provided all call sites keep current semantics.

### 4. Sections that should not be moved yet
- `createDriverDispatchNotification`
- `notifyOwnerDriverSeen`
- `expandCurrentStatusRequiredTrucks`
- `reconcileOwnerNotificationsForDispatch`
- `markDriverDispatchSeenAsync`
- `markDriverRemovalNotificationSeenAsync`
- `sendNotificationSmsIfEligible`

### 5. Explicit uncertainties / needs manual verification
- Exact backend behavior of `sendNotificationSms/entry`, including provider retry/failure semantics.
- Exact fanout/display semantics for `recipient_type: 'Admin'` notifications beyond creation.
- Whether any non-Driver/non-CompanyOwner `AccessCode` types actually receive notifications/SMS in production.
- Whether `driver_dispatch_seen` intentionally belongs outside `openConfirmations.js` non-confirmation set or if that difference is accidental.
- Whether all UI entry points that open a driver dispatch reliably pass `notificationId`; fallback logic exists, but real navigation coverage should be manually verified.
- Whether any external automations consume `dispatch_status_key`, `admin_group_key`, `confirmation_type`, or SMS log `General` records.
