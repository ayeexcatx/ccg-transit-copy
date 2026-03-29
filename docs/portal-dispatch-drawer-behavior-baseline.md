# Portal page + DispatchDetailDrawer behavior baseline

_Last reviewed: 2026-03-23_

This document is a conservative, workflow-specific baseline for:

- `src/pages/Portal.jsx`
- `src/components/portal/DispatchDetailDrawer.jsx`

It also traces the directly related imported helpers, subcomponents, hooks, entities, notification helpers, and navigation/route behavior that materially affect this workflow.

## Baseline intent

This baseline exists so the Portal page and shared dispatch drawer can be refactored later **without changing current behavior** around:

- role-based visibility
- dispatch filtering and bucketing
- truck visibility
- owner confirmation logic
- driver “seen” / acknowledgement logic
- notifications and confirmation side effects
- time log behavior
- incident creation entry points
- screenshot behavior
- owner truck editing / replacement behavior
- driver assignment behavior
- deep-link / notification-driven drawer opening

When behavior cannot be proven from the current client code, this document marks it as **needs manual verification** instead of guessing.

---

# A. Purpose / scope

## Portal.jsx overall purpose

`Portal.jsx` is the main non-admin dispatch surface for the portal workspace. It:

- loads the current session-scoped dispatch dataset
- filters dispatches differently for driver vs non-driver users
- groups dispatches into Today / Upcoming / History buckets
- resolves deep-link opening using `dispatchId` and `notificationId` query params
- handles company-owner confirmation, time log persistence, owner truck reassignment, and owner notification reconciliation side effects
- routes dispatch interaction into `DispatchCard`, which embeds the shared `DispatchDetailDrawer`
- handles a driver-only removed-assignment modal for `driver_removed` notifications

Although the page renders for truck, driver, and company-owner style portal users, route-level behavior also affects admin access:

- the app nav exposes Portal tabs only for owner / truck / driver workspaces
- `Layout.jsx` redirects admins away from `Home` and `Portal` to `AdminDashboard`
- `Portal.jsx` still contains some admin-aware code paths, but in normal routing admins should not stay on this page

**Classification**
- Route availability: **route guard / layout redirect**
- Dispatch visibility within the page: **client filtering**
- Data loads and mutations: **client + entity/backend storage calls**

## DispatchDetailDrawer.jsx overall purpose

`DispatchDetailDrawer.jsx` is the shared details workflow used by portal dispatch cards. It renders dispatch details and conditionally exposes actions depending on role and dispatch status.

It is the primary shared workflow for:

- viewing dispatch details
- owner confirming dispatch receipt per truck
- owner viewing and editing truck assignments
- owner assigning/removing drivers from trucks
- owner entering time logs for owned trucks
- driver viewing assigned trucks and read-only time logs
- driver opening incident creation from a dispatch context
- owner/truck opening incident creation from a dispatch context
- owner creating a screenshot of dispatch details
- admin-style review rendering if the drawer is used elsewhere with an admin session

The drawer is **presentation-heavy but logic-coupled** because it contains:

- role-derived visibility decisions
- owner driver assignment mutation logic
- owner screenshot generation logic
- owner incident link construction
- owner truck-edit draft workflow
- driver receipt/seen indicators (rendered from assignment receipt state)

## How the shared drawer differs by role

### Company owner
- sees only trucks from `session.allowed_trucks` that intersect the dispatch
- can confirm receipt per visible truck
- can edit assigned trucks, subject to one-for-one replacement rules and allowed truck restrictions
- can assign/remove drivers when status allows owner assignment/time-log sections
- can add/edit time logs for visible trucks except on cancelled dispatches
- can report incidents
- can take screenshots
- sees “Seen” badges when an active driver assignment for a truck has `receipt_confirmed_at`

### Driver
- sees only trucks actively assigned to that driver on that dispatch
- cannot confirm owner-style truck confirmations
- cannot add/edit time logs; sees read-only time logs for assigned trucks
- can report incidents
- triggers seen/acknowledgement behavior when opening dispatches through Portal
- does not get screenshot controls
- does not get truck editing or driver assignment controls

### Truck user
- sees trucks based on `session.allowed_trucks` intersection, typically one truck for truck access codes
- can report incidents
- does **not** get owner confirmation, time-log editing, driver assignment, or screenshot controls inside the drawer
- can still view the dispatch details body

### Admin
- Portal route is normally redirected away by layout, so admin behavior here is mostly a latent/shared code path
- if drawer is rendered with an admin session, admin can see confirmation history, all assigned-truck time logs read-only, and admin activity log
- admin cannot use owner-only controls from this drawer

**Important:** because `DispatchCard` and `DispatchDetailDrawer` contain admin branches, they are shared enough that refactors must not assume “portal drawer == owner/driver only.” That said, **normal access to Portal for admin is blocked by layout redirect**, not by file-local logic.

## Which workflows depend on this shared drawer

Within the traced scope, the drawer is reached through:

1. `Portal.jsx` → list of `DispatchCard`s → embedded `DispatchDetailDrawer`
2. forced open flow from Portal query params (`dispatchId`, optional `notificationId`)
3. links into Portal from:
   - `Home.jsx`
   - `Notifications.jsx`
   - `NotificationBell.jsx`
   - `Incidents.jsx` back-links
4. owner tutorial instrumentation (`DispatchDrawerTutorial`)

This baseline only documents the drawer as used by Portal, but notes where Home/Notifications deep-links affect behavior.

---

# B. State and data loading

## Portal.jsx state

Portal manages the following local state/refs:

- `tab` (`today` default)
- `drawerDispatchId`
- `swapConfirmationState`
  - owner truck-swap confirmation modal state
- `removedAssignmentModalState`
  - driver removed-assignment modal state
- refs:
  - `dispatchRefs`
  - `pendingOpenIdRef`
  - `lastHandledDispatchIdRef`
  - `drawerDispatchIdRef`
  - `pendingOwnerConfirmationKeysRef`
  - `swapConfirmationResolverRef`

### Portal derived URL inputs
- `targetDispatchId` from `dispatchId` query param
- `targetNotificationId` from `notificationId` query param
- `actorMetadata` derived from session label/name/driver_name/code and code_type

## Portal.jsx data loads

### 1. Dispatch list
- Query key: `['portal-dispatches', session?.company_id]`
- Source: `base44.entities.Dispatch.filter({ company_id: session.company_id }, '-date', 200)`
- Enabled when `session.company_id` exists

**Implication:** Portal dispatch loading is company-scoped on the client query. It does **not** itself query by allowed trucks or driver assignment. Those restrictions happen after load.

**Classification:**
- Company scoping: **client query filter** (backed by entity call)
- Allowed-truck / driver-specific visibility: **client filtering**
- Backend enforcement of tenant/company isolation: **unknown / needs manual verification**

### 2. Driver assignments for current driver (Portal-level)
- Query key: `['driver-dispatch-assignments', session?.driver_id]`
- Source: active and inactive assignments for the logged-in driver, sorted by `assigned_datetime`
- Enabled only for `session.code_type === 'Driver'`

Used to determine which dispatch IDs a driver can see in Portal.

### 3. Companies
- Query key: `['companies']`
- Source: `base44.entities.Company.list()`
- Used to build `companyMap` for confirmation notifications and card labels

### 4. Confirmations
- Source hook: `useConfirmationsQuery(true)`
- Query key: `['confirmations']`
- Source: `base44.entities.Confirmation.list('-confirmed_at', 500)`
- Refetches every 30 seconds

Used for:
- owner confirm button state
- owner truck replacement confirmation recreation/removal
- owner notification resolution
- card/drawer confirmation history sections

### 5. Time entries
- Query key: `['time-entries']`
- Source: `base44.entities.TimeEntry.list('-created_date', 500)`

Used for:
- history visibility logic for owners/truck users
- owner time log editing
- read-only time log display
- archive-after-time-log completion flow

### 6. Template notes
- Query key: `['template-notes']`
- Source: active `DispatchTemplateNotes`

Used for notes rendering in the drawer after `sortTemplateNotesForDispatch` and `normalizeTemplateNote`.

### 7. Notifications helper hook
- `useOwnerNotifications(session)` returns:
  - `notifications`
  - `markDriverDispatchSeenAsync`
  - `markDriverRemovalNotificationSeenAsync`

Despite the hook name, it supports owner/admin/driver notification filtering and driver seen/removal acknowledgement flows.

## DispatchDetailDrawer.jsx state

The drawer manages the following state:

- `draftTimeEntries`
- `isSavingAll`
- `isEditingTrucks`
- `draftTrucks`
- `isSavingTrucks`
- `truckEditMessage`
- `isCreatingScreenshot`
- `selectedDriverByTruck`
- `driverAssignmentErrors`
- refs:
  - `drawerScrollRef`
  - `timeLogSectionRef`
  - `screenshotSectionRef`

It also updates a module-level `openDispatchDrawerCount` and broadcasts drawer-open state through:

- `window.__dispatchDetailDrawerOpen`
- custom event: `dispatch-detail-drawer-state`

This is a hidden side effect that could break tutorials/other listeners if moved casually.

## DispatchDetailDrawer.jsx targeted data loads

### 1. Company drivers
Loaded only when:
- drawer open
- current role = company owner
- dispatch has `company_id`

Query:
- `base44.entities.Driver.filter({ company_id: dispatch.company_id }, '-driver_name', 500)`

Then further filtered client-side into `eligibleDrivers` requiring:
- `active_flag !== false`
- `(status || 'Active') === 'Active'`
- `access_code_status === 'Created'`

### 2. Active driver assignments for dispatch (owner/admin drawer view)
Loaded only when:
- drawer open
- role is owner or admin
- dispatch has id

Query:
- `base44.entities.DriverDispatch.filter({ dispatch_id: dispatch.id, active_flag: true }, '-created_date', 500)`

Used for:
- owner driver assignment UI
- admin/owner truck “Seen” badges
- owner assignment mutations
- activity log append context

### 3. Driver-specific assignments for this dispatch (driver drawer view)
Loaded only when:
- drawer open
- role is driver
- dispatch id and session.driver_id exist

Query:
- `base44.entities.DriverDispatch.filter({ dispatch_id: dispatch.id, driver_id: session.driver_id }, '-created_date', 200)`

Used to compute driver-visible trucks in drawer.

### 4. Same-shift driver conflicts map
Loaded only when:
- drawer open
- role is owner
- dispatch has id/company/date/shift_time

Flow:
1. load all same-company, same-date, same-shift dispatches
2. exclude current dispatch and cancelled dispatches
3. load active assignments on each conflicting dispatch
4. create a map from `driver_id` to an example conflicting assignment

Used to disable owner selection of drivers already assigned to another dispatch in the same shift.

## Portal- and drawer-level derived values that affect behavior

### Portal derived visibility values
- `allowedTrucks = session.allowed_trucks || []`
- `driverAssignedTrucksByDispatch`: active assignments grouped by dispatch for current driver
- `driverDispatchIds`: set of dispatch IDs from active driver assignments
- `filteredDispatches`
  - driver: only dispatches in `driverDispatchIds`
  - non-driver: only dispatches with at least one truck in `allowedTrucks`
- `upcomingDispatches`, `todayDispatches`, `historyDispatches`
- `currentOpenDispatch`
- `dispatchNotFound`
- `targetNotification`, `removalNotification`, `removalNotificationDispatch`

### Drawer derived role values
- `myTrucks`: owner/truck intersection of `session.allowed_trucks` and `dispatch.trucks_assigned`
- `isOwner`, `isAdmin`, `isTruckUser`, `isDriverUser`
- `driverAssignedTrucks`: driver-only active assigned trucks on this dispatch
- `visibleTrucks`
  - driver: unique active assigned trucks on this dispatch
  - otherwise: `myTrucks`
- `activeAssignmentsByTruck`
  - owner/admin: from dispatch active assignments query
  - driver: from current driver’s dispatch assignments query
- `hasTruckSeenStatus(truck)` based on assignment `receipt_confirmed_at`
- `assignedDriverNameByTruck`
- `eligibleDriverNameById`
- `companyHasDrivers`
- `shouldShowDriverAssignmentControls = !isOwner || companyHasDrivers`
  - because only owner renders driver assignment controls, this effectively means owner controls disappear when company has zero drivers
- `showOwnerAssignmentsAndTimeLogs = !isOwner || canCompanyOwnerViewAssignmentsAndTimeLogs(dispatch.status)`
  - owner assignment/time-log sections only appear for statuses in `statusConfig`: `Dispatch`, `Amended`, `Cancelled`
- `requiredTruckCount` for owner truck editing
- `hasTruckDraftChanges`
- `entriesToSave`
- `hasUnsavedChanges`
- confirmation helpers for current dispatch status only

**Important nuance:**
- owner confirmation section does **not** use `showOwnerAssignmentsAndTimeLogs`
- owner driver assignment and owner time-log sections **do** use it
- therefore, owner can still confirm receipt for visible trucks even when owner assignment/time-log sections are hidden (for example, scheduled dispatches)

This appears intentional in current code and must remain unchanged unless explicitly redesigned.

---

# C. Role-based visibility and behavior matrix

## Summary matrix

| Behavior | Admin | CompanyOwner | Driver | Truck user |
|---|---|---|---|---|
| Can normally access Portal route | No, redirected by layout | Yes | Yes | Yes |
| Dispatches visible in Portal list | N/A in normal flow | Dispatches with at least one allowed truck | Dispatches with active assignment to that driver | Dispatches with at least one allowed truck |
| Trucks visible in drawer | All assigned trucks if drawer rendered as admin | Intersection of dispatch trucks and allowed trucks | Active assigned trucks for that driver on that dispatch | Intersection of dispatch trucks and allowed trucks |
| Confirm receipt | No | Yes, per visible truck | No | No |
| Add/edit time entries | No, read-only only | Yes for visible trucks when status allows and not cancelled | No, read-only only | No |
| Report incident | Not from Portal drawer in normal flow | Yes | Yes | Yes |
| Assign/remove drivers | No | Yes when status allows and there are eligible drivers | No | No |
| Edit truck assignments | No | Yes | No | No |
| Take screenshot | No | Yes | No | No |
| Mark seen / acknowledge | N/A here | Owner gets notification resolution indirectly, but no explicit seen action | Yes, on open/removal modal flow | No |
| Activity log visible | Yes, if drawer rendered | No | No | No |

## Admin behavior

### What dispatches they can see
- In normal app flow, admins are redirected away from Portal/Home to `AdminDashboard` by `Layout.jsx`.
- Therefore admin Portal list behavior is not part of the normal user-facing route.
- If Portal were forced to render for admin, `filteredDispatches` would use the non-driver branch and rely on `allowedTrucks`. That is a latent path, but **needs manual verification** because normal routing prevents it.

**Enforced by:**
- Portal access restriction: **route guard / layout redirect**
- Any latent filtering if rendered: **client filtering**

### What trucks they can see
- In drawer admin mode, time logs and confirmation history use `dispatch.trucks_assigned` directly.
- Admin truck badges in the main info section are also shown via the `(isAdmin || isOwner)` branch and `visibleTrucks`; however `visibleTrucks` for admin resolves to `myTrucks`, not all trucks, because admin is not driver and `myTrucks` is based on `allowed_trucks`.
- This is inconsistent with admin-only lower sections, but largely irrelevant because Portal is redirected.

**Status:** needs manual verification if anyone intentionally renders Portal drawer with admin session.

### Confirm / time entries / incidents / assignments / screenshots / seen
- Confirm receipt: hidden
- Time logs: read-only section shown if assigned trucks exist
- Report incident: not exposed from the Portal drawer admin branches
- Assign/remove drivers: hidden
- Edit truck assignments: hidden
- Screenshot: hidden
- Acknowledge/seen: no admin-specific flow in this drawer

### Sections visible
- dispatch details body
- admin confirmation history section
- admin time log section (read-only, all assigned trucks)
- admin activity log section

## Company owner behavior

### What dispatches they can see
- Portal loads company dispatches, then filters to dispatches where `dispatch.trucks_assigned` intersects `session.allowed_trucks`.
- Dispatch visibility is **not** based on driver assignments.
- If a dispatch has no trucks intersecting `allowed_trucks`, owner does not see it.

**Enforced by:**
- Route access: **layout/nav allows owner**
- Dispatch list filtering: **client filtering**
- Whether backend also restricts access to same-company data: **unknown / needs verification**

### How dispatches are filtered
- company-scoped query by `session.company_id`
- then keep only dispatches containing at least one allowed truck

### What trucks they can see
- `myTrucks = session.allowed_trucks ∩ dispatch.trucks_assigned`
- most owner actions operate only on `myTrucks`
- owner can still edit the full truck assignment set using allowed truck options, but initial visible chips/confirm/time-log controls are scoped to `myTrucks`

### Whether they can confirm
Yes.
- owner sees `DispatchConfirmReceiptLogSection` whenever `myTrucks.length > 0`
- one button per visible truck
- confirmation type is always current `dispatch.status`
- duplicate confirmations are blocked client-side by existing confirmation check and pending key set

### Whether they can add time entries
Yes, but only when all of the following are true:
- role is owner
- `showOwnerAssignmentsAndTimeLogs` is true
- `myTrucks.length > 0`
- dispatch status is not `Cancelled`

`showOwnerAssignmentsAndTimeLogs` is true only for statuses:
- `Dispatch`
- `Amended`
- `Cancelled`

That means owner time-log UI is currently:
- shown for `Dispatch`
- shown for `Amended`
- hidden from saving on `Cancelled` because time-log section separately blocks cancelled dispatches
- hidden for `Scheduled`

### Whether they can report incidents
Yes.
- button shown near top of drawer
- sends user to `Incidents?create=1&fromDispatch=1&dispatchId=...`
- also includes `companyId` when present
- includes `truckNumber` only if `visibleTrucks.length === 1`

### Whether they can assign/remove drivers
Yes, when:
- owner
- dispatch has at least one assigned truck
- `showOwnerAssignmentsAndTimeLogs` is true
- `shouldShowDriverAssignmentControls` is true

`shouldShowDriverAssignmentControls` for owners depends on company having at least one loaded driver record. If the company has zero drivers, the whole driver assignment section is hidden and instead the owner only sees the rest of the drawer.

Eligible drivers are further limited to:
- active flag not false
- status `Active` (defaulting missing status to `Active`)
- `access_code_status === 'Created'`

Additional same-shift conflict prevention is enforced client-side by:
- disabling conflicting drivers in the select list using `conflictingDriverAssignmentsById`
- mutation-time recheck against current same-shift active assignments

### Whether they can edit truck assignments
Yes.
- owner-only “Edit Trucks” button
- can only choose from `session.allowed_trucks`
- must keep exact original truck count
- supports one-for-one replacement
- multiple conflicting swaps in one save are blocked
- if replacing with a truck already used on another same-company, same-date, same-shift dispatch, a swap-confirmation dialog is required and a two-dispatch swap can occur

### Whether they can take screenshots
Yes.
- owner-only screenshot button
- disabled while editing trucks or while screenshot generation is in progress

### Whether they can acknowledge/mark seen
No explicit owner acknowledgement action exists in drawer.
Owner-related seen behavior is indirect:
- owner sees “Seen” badge per truck when active driver assignment has `receipt_confirmed_at`
- owner notifications may be resolved as read after confirmations are complete
- driver seen events generate owner notifications through backend/entity calls

### What drawer sections owners can see
Depending on dispatch status and data presence, owner can see:
- details body
- incident button
- screenshot button
- trucks list with optional driver summary labels and Seen badges
- truck edit UI
- cancellation/amendment reason banner
- assignment details / additional assignments
- box notes / general notes
- confirm receipt section
- driver assignments section (status-gated)
- time log section (status-gated and not cancelled)

### Intentionally disabled or hidden owner actions
- screenshot hidden during truck editing? Not hidden, but disabled
- screenshot blocked with toast if truck editing is active
- driver assignment choices disabled for same-shift conflicts
- save truck assignments disabled when count mismatch, no changes, or saving
- driver assignment section hidden if no drivers exist for company
- time log section hidden on statuses outside owner-visible status set

## Driver behavior

### What dispatches they can see
- only dispatches whose IDs appear in active `DriverDispatch` records for `session.driver_id`
- dispatch must also exist in company dispatch query result

**Enforced by:**
- list filtering: **client filtering** using active assignment-derived dispatch IDs
- assignment source: **entity/backend stored records**
- backend restriction for direct dispatch fetches: **unknown / needs verification**

### How dispatches are filtered
1. load all company dispatches
2. load driver assignments for the current driver
3. include only dispatches where there is an active assignment for this driver

### What trucks they can see
- only active assigned trucks for that driver on the current dispatch
- not all dispatch trucks
- Portal passes `visibleTrucksOverride` into `DispatchCard` for driver cards
- drawer recomputes driver-visible trucks from driver-specific assignment query

### Whether they can confirm
No owner-style confirmation UI is shown for drivers.

### Whether they can add time entries
No.
- drivers do not see the Time Log section at all (no editable and no read-only subsection)
- this remains true even if owner-entered time log data exists for the same dispatch/truck set

### Whether they can report incidents
Yes.
- report incident button shown
- incident URL includes dispatch/company and single truck if only one visible truck
- **Needs manual verification:** Product verification indicates the assigned truck is prefilled for drivers in this flow; code-level prefill is explicit for single-visible-truck cases and may rely on incident-form selection rules in multi-truck cases.

### Whether they can assign/remove drivers
No.

### Whether they can edit truck assignments
No.

### Whether they can take screenshots
No.

### Whether they can acknowledge/mark seen
Yes, indirectly and automatically.

When a driver opens a dispatch in Portal:
- `Portal.handleDispatchOpen` calls `markDriverDispatchSeenAsync({ dispatch, notificationId })`
- all matching unread `driver_dispatch_update` notifications for that dispatch are marked read
- all active unseen assignments for that dispatch are updated with receipt-confirmation fields
- owner “driver seen” notifications may be created

When a driver deep-links to a removed assignment notification:
- Portal shows a removed-assignment modal instead of opening the drawer
- dismissing the modal calls `markDriverRemovalNotificationSeenAsync`
- related unread removal notifications are marked read
- an owner “driver seen removed assignment” notification may be created

### What drawer sections drivers can see
- incident button
- details body
- truck chips for only their assigned trucks
- no time log section
- no confirmation section
- no driver assignment section
- no admin activity log

### Intentionally disabled or hidden driver actions
- no confirm receipt
- no screenshot
- no truck editing
- no driver assignment changes
- no time log section (editable or read-only)

## Truck user behavior

### What dispatches they can see
- same Portal list rule as owner/non-driver branch: dispatch must contain at least one `allowed_trucks` value

### What trucks they can see
- intersection of `session.allowed_trucks` and `dispatch.trucks_assigned`
- in card summary, truck user explicitly shows only `myTrucks[0]`
- in drawer main truck section, visible trucks are `myTrucks`

**Needs manual verification:** whether truck users are always provisioned with exactly one allowed truck. Client code seems to assume that in some views but does not strictly enforce single-truck allowed lists here.

### Whether they can confirm
No.

### Whether they can add time entries
No.

### Whether they can report incidents
Yes.

### Whether they can assign/remove drivers
No.

### Whether they can edit truck assignments
No.

### Whether they can take screenshots
No.

### Whether they can acknowledge/mark seen
No explicit truck-user acknowledgement flow exists in Portal/drawer.

### What drawer sections truck users can see
- incident button
- details body
- visible truck chips
- notes / assignment details / cancellation banner
- no confirm/time-log/assignment/screenshot/admin sections

---

# D. Filters / grouping / bucket rules

## Portal dispatch filtering rules

### Non-driver users (owner / truck; latent admin path if rendered)
- keep dispatches where any assigned truck is in `session.allowed_trucks`
- no extra status filter applied at this stage

### Driver users
- keep dispatches whose `dispatch.id` is present in the set of active driver assignment dispatch IDs
- driver filtering does **not** additionally intersect allowed trucks

This means driver visibility is assignment-driven, while owner/truck visibility is truck-list-driven.

## Bucket rules (`getDispatchBucket`)

Dispatch bucket is determined by:
- `archived_flag` first → always `history`
- else compare `dispatch.date` to local today using `parseISO` + `startOfDay`
  - same day → `today`
  - future → `upcoming`
  - past → `history`

Important current rules:
- cancelled dispatches do **not** auto-move to history by status alone
- scheduled dispatches do not get a special bucket; date decides
- archived dispatches always go to history even if future/today

## History-specific owner/truck rule

For `historyDispatches`, after bucket is `history`:
- if dispatch is already archived, include it
- if not archived, include it only if `myTrucksForHistory(dispatch, timeEntries, session)` returns true

`myTrucksForHistory`:
- computes owner/truck-visible trucks = allowed-truck intersection
- returns `false` if intersection is empty
- filters time entries for this dispatch and those trucks
- requires `areAllAssignedTrucksTimeComplete({ trucks_assigned: trucks }, dispatchEntries)`

So for owner/truck users, an unarchived historical dispatch appears in History only when **all of that user’s visible trucks** have complete time logs.

This is a subtle behavior and should remain identical.

## Active assignments and driver visibility

Driver list visibility is based on active assignments only:
- Portal-level dispatch visibility uses active assignments when building `driverAssignedTrucksByDispatch`
- drawer-level driver-visible trucks also filter to active assignments
- removed/inactive assignments stop making a truck/dispatch visible to the driver

## `allowed_trucks` impact on owner/truck visibility

`allowed_trucks` is used to determine:
- which dispatches owners/truck users can see on Portal
- which trucks owners/truck users see on cards/drawers
- which trucks owner notifications care about (`required_trucks` reconciliation functions)
- whether an owner can save truck edits to a new truck set
- which owner codes receive seen/confirmation notifications

## Archived / cancelled / scheduled status effects on visibility

### Archived
- archived dispatches go straight to History
- time-log save can auto-archive a dispatch once all assigned trucks are complete and dispatch date is today or past

### Cancelled
- not auto-hidden from today/upcoming/history buckets
- can still appear by date unless archived or filtered out by role rules
- owner assignment section status-gate says owners can view assignment/time-log sections for Cancelled, but time-log subsection separately blocks cancelled dispatches
- driver same-shift conflict detection excludes cancelled dispatches from conflict set

### Scheduled
- not hidden from buckets
- details body collapses into scheduled messaging instead of normal assignment details
- owner assignment/time-log sections hidden because `canCompanyOwnerViewAssignmentsAndTimeLogs('Scheduled')` is false
- owner confirm section still appears if owner has visible trucks

## Differences between Home and Portal surfaces relevant here

Relevant deep-link behavior only:
- Home can navigate to `Portal?dispatchId=...`
- Notifications and bell can navigate to `Portal?dispatchId=...&notificationId=...`
- Portal then selects the correct bucket tab and opens the drawer if the dispatch remains visible to the user

This baseline does **not** fully document Home card filtering, but a refactor must preserve the deep-link contract Portal expects.

---

# E. Callbacks / handlers / mutations

## Portal: opening the drawer

### Manual card open
- `DispatchCard.handleOpen()` sets local `drawerOpen=true`
- calls `onOpenDispatch?.(dispatch)`
- in Portal, `onOpenDispatch` is `handleDispatchOpen`
- for driver users only, `handleDispatchOpen` calls `markDriverDispatchSeenAsync`

### Forced open from Portal state/query params
- Portal tracks `drawerDispatchId`
- card receives `forceOpen={normalizeId(drawerDispatchId) === normalizeId(d.id)}`
- card effect opens local drawer when `forceOpen` becomes true and calls `onOpenDispatch`

## Portal: closing the drawer

`handleDrawerClose()`:
- clears drawer state refs/ids
- if page was opened with `dispatchId` in URL, removes `dispatchId` and `notificationId` query params using `navigate(..., { replace: true })`

Drawer component also has its own close wrapper that resets truck-edit local state before calling parent `onClose`.

## Confirming dispatches

### UI entry
- owner-only `DispatchConfirmReceiptLogSection`
- one button per owner-visible truck (`myTrucks`)
- confirmation type = current dispatch status

### Portal handler: `handleConfirm(dispatch, truck, confType)`
1. build de-dup key `${dispatch.id}:${truck}:${confType}`
2. if confirmation already exists for that dispatch/truck/type, abort
3. if same key is already pending in `pendingOwnerConfirmationKeysRef`, abort
4. create confirmation record with session/actor metadata
5. invalidate confirmations query via mutation success
6. call `notifyTruckConfirmation(dispatch, truck, companyName)`
7. if session is company owner:
   - call `resolveOwnerNotificationIfComplete(dispatch, null, session.id)`
   - invalidate `['notifications']`
8. clear pending key in `finally`

### Side effects
- admin “all confirmed” notification may be created only when all assigned trucks for that status are now confirmed
- owner notification may be marked read when required trucks for that owner/status are all confirmed

## Creating truck confirmations implicitly during owner truck updates

Owner truck editing can create/delete confirmation records without pressing the confirm button.

### Non-swap owner truck update
- delete current-status confirmations for removed trucks
- create current-status confirmations for added trucks immediately
- expand owner notification required trucks
- reconcile owner notifications
- notify admin of owner truck reassignment

### Swap owner truck update (two dispatches)
- update both dispatches’ truck arrays
- clear removed-truck driver assignments on both sides
- delete current-status confirmations for removed truck on first dispatch
- create current-status confirmation for added truck on first dispatch
- delete conflicting current-status confirmation for incoming truck on other dispatch
- if outgoing truck was not already confirmed on conflicting dispatch and incoming truck had been confirmed there, create confirmation for outgoing truck on conflicting dispatch
- expand/reconcile owner notifications on both dispatches
- create admin reassignment notification

This implicit confirmation preservation/carry-forward behavior is extremely fragile and must remain identical unless explicitly redesigned.

## Marking driver notifications as seen / acknowledging dispatches

### On dispatch open
`handleDispatchOpen(dispatch)` for driver only:
- calls `markDriverDispatchSeenAsync({ dispatch, notificationId: targetNotificationId || null })`

`markDriverDispatchSeenAsync` then:
1. find active assignments for this driver on this dispatch
2. find matching dispatch-update notifications for this dispatch and this driver
3. choose a relevant notification based on optional `notificationId` or latest matching one
4. derive `seenKind` from notification type or dispatch status
5. deduplicate using `pendingDriverSeenKeysRef`
6. mark unread matching notifications read
7. update unseen assignments with receipt fields:
   - `receipt_confirmed_flag: true`
   - `receipt_confirmed_at`
   - `receipt_confirmed_by_driver_id`
   - `receipt_confirmed_by_name`
8. call `notifyOwnerDriverSeen(...)`
9. invalidate notifications, portal dispatches, and assignment queries

### Removed assignment modal dismissal
`handleRemovedAssignmentModalDismiss()`:
- resolves notification object
- calls `markDriverRemovalNotificationSeenAsync({ notification, dispatch })`
- closes modal
- calls `handleDrawerClose()` to clear URL params/state

`markDriverRemovalNotificationSeenAsync`:
- marks unread related `driver_removed` notifications read
- calls `notifyOwnerDriverSeen(...)` with removed/placeholder dispatch context
- invalidates notification/portal-related queries

## Adding time entries

### UI entry
- owner-only editable time log section
- per visible truck row
- “Copy to all” only on first row
- save-all button disabled unless unsaved changes exist and there is at least one entry to save

### Portal mutation `timeEntryMutation`
For each submitted `{ truck, start, end }` entry:
1. look for existing time entry matching dispatch, truck, and `access_code_id === session.id`
2. if found, update existing entry
3. else create a new entry
4. preserve or set actor metadata fields on save
5. recompute effective dispatch entries from existing + submitted changes
6. if all assigned trucks are complete and dispatch date is today/past and dispatch is not archived:
   - update dispatch with `archived_flag: true`
   - set `archived_at`
   - set `archived_reason: 'Time logged'`
   - invalidate portal dispatch query
7. on success invalidate `['time-entries']`

**Important:** owner time-log save checks completion against **all assigned trucks on the dispatch**, not just owner-visible trucks, during archive mutation. History visibility for a specific owner later uses only that owner’s visible trucks.

This asymmetry should be preserved unless intentionally changed.

## Creating incidents from the drawer

`handleReportIncident()`:
1. build query params:
   - `create=1`
   - `fromDispatch=1`
   - `dispatchId`
   - optional `companyId`
   - optional `truckNumber` if exactly one visible truck
2. close drawer via `handleDrawerClose()`
3. hard navigate with `window.location.href = createPageUrl(...)`

Because this uses `window.location.href`, it is a full browser navigation rather than router `navigate`.

## Taking screenshots

Owner-only `handleScreenshotDispatch()`:
1. block if currently editing trucks
2. require `screenshotSectionRef.current`
3. set `isCreatingScreenshot=true`
4. create off-screen fixed DOM root
5. inject summary block (date/shift/status)
6. clone screenshot section and remove all `[data-screenshot-exclude="true"]` nodes
7. append off-screen root to document body
8. call `html2canvas(...)`
9. convert canvas to PNG blob
10. create `File`
11. if `navigator.share` + `navigator.canShare({ files })` are supported, use native share
12. else create object URL and trigger download
13. show success toast
14. cleanup temporary DOM and reset in finally

Excluded-from-screenshot areas include:
- incident buttons
- owner edit-trucks button / truck edit section
- driver assignment section

## Editing truck assignments as owner

Entry point: owner-only “Edit Trucks” button.

Local behavior:
- toggles `isEditingTrucks`
- draft is initialized from current `dispatch.trucks_assigned`
- only trucks from `session.allowed_trucks` are selectable
- checkbox additions are disabled once draft count reaches required count
- save requires exact original truck count

Mutation path: `Portal.updateOwnerTrucksMutation`

Common validation:
- dispatch id required
- at least one truck required
- all trucks must belong to owner `allowed_trucks`
- truck count must remain identical to original count
- if no changes, return `{ updated: false }`

Then either:
- standard update flow, or
- same-shift conflicting truck swap flow with modal confirmation

Side effects include:
- dispatch `admin_activity_log` updates
- clearing active driver assignments for removed trucks
- `notifyDriverAssignmentChanges`
- deleting/recreating relevant confirmations
- expanding/reconciling owner notifications
- admin reassignment notifications
- invalidating portal/admin/assignment/confirmation/notification queries

## Assigning/removing drivers through the drawer

### Owner assign driver
Mutation `assignDriverMutation`:
1. capture previous assignments
2. resolve selected driver from `eligibleDrivers`
3. load same-shift dispatches for company/date/shift
4. exclude current dispatch and cancelled dispatches
5. load active assignments for selected driver
6. if driver already assigned on another same-shift dispatch, throw conflict error
7. update existing assignment for this truck or create new one
8. write driver assignment activity entries into dispatch `admin_activity_log`
9. call `notifyDriverAssignmentChanges(dispatch, previousAssignments, nextAssignments)`
10. refetch driver assignments and invalidate related queries
11. success toast

### Owner remove driver
In `handleDriverSelection` when selected value is `UNASSIGNED_DRIVER_VALUE`:
1. find existing active assignment for that truck
2. if none, return
3. capture previous assignments
4. update assignment `active_flag: false`
5. append activity log entry
6. notify driver assignment changes with removed next state
7. refetch / invalidate related queries
8. success toast

### Error handling
- assign mutation displays toast on error
- if selection fails, local selected value is reverted
- shift conflict error is also stored in `driverAssignmentErrors[truckNumber]`

## Query-param driven drawer open flows

Portal deep-link flow handles:
- `dispatchId`
- `notificationId`

Behavior:
1. when `dispatchId` appears, store it in `pendingOpenIdRef`
2. after dispatches/filtering/buckets are ready:
   - if notification is a driver removal for that same dispatch, show removal modal instead of drawer
   - else verify dispatch exists and is still visible to current user
   - determine correct tab (today/upcoming/history)
   - switch tabs if needed
   - finally open drawer for matching dispatch card
3. opening the card triggers `onOpenDispatch`, which for drivers marks seen/acknowledged

If dispatch no longer exists in raw dispatch list, Portal shows “Dispatch no longer available.”

If dispatch exists in raw dispatch list but is not in `filteredDispatches`, the deep-link simply does not open it. There is no alternate error message for “exists but not visible to this user.”

## Cache invalidations / refetches touched by this workflow

### Portal confirm
- invalidate `confirmationsQueryKey`
- invalidate notifications for owner confirm completion

### Portal time entry save
- invalidate `['time-entries']`
- potentially invalidate `['portal-dispatches', session.company_id]` on archive

### Owner truck update success
- invalidate portal dispatches
- invalidate admin dispatches
- invalidate broad driver assignment keys and specific dispatch keys
- invalidate confirmations/admin confirmations
- invalidate notifications

### Owner assign/remove driver
- refetch drawer driver assignments
- invalidate portal dispatches
- invalidate admin dispatches
- invalidate dispatch assignment queries

### Driver seen/removal acknowledgement
- invalidate notifications
- invalidate portal dispatches
- invalidate driver assignment queries

---

# F. Mutation / side-effect sequence maps

## 1. Truck/company-owner confirmation flow

1. Owner clicks **Confirm Receipt** for one visible truck.
2. Portal checks existing confirmations and pending-key dedupe.
3. `Confirmation.create(...)` is called with current dispatch status as `confirmation_type`.
4. Confirmations query is invalidated.
5. `notifyTruckConfirmation(...)` checks whether **all assigned trucks** for current status are now confirmed.
6. If all confirmed and no prior admin all-confirmed notification exists, admin notification is created.
7. If current session is company owner, `resolveOwnerNotificationIfComplete(...)` checks owner notification `required_trucks` for this owner/status.
8. If owner-required trucks are all confirmed, owner notification is marked read.
9. Notifications query is invalidated.

## 2. Driver seen / acknowledgment flow

1. Driver opens a dispatch card or forced-open drawer.
2. Portal calls `markDriverDispatchSeenAsync(...)`.
3. Hook loads matching active assignments + matching driver dispatch notifications.
4. Hook derives seen-kind (`assigned`, `amended`, `cancelled`, or `removed`-style logic depending on path).
5. Hook marks unread driver dispatch notifications read.
6. Hook updates unseen active assignment rows with receipt-confirmation metadata.
7. Hook calls `notifyOwnerDriverSeen(...)`.
8. Owner seen notifications are created per owner access code whose `allowed_trucks` intersect the driver’s active assigned trucks.
9. Notifications and assignment queries are invalidated.
10. Drawer UI can now show per-truck **Seen** badges for owner/admin views.

## 3. Time entry submission flow

1. Owner edits one or more draft time rows.
2. Drawer computes `entriesToSave` and `hasUnsavedChanges`.
3. Owner clicks **Save All Time Logs**.
4. Portal mutation updates or creates `TimeEntry` rows for each submitted truck using current session `access_code_id`.
5. Actor metadata fields are written/preserved.
6. Mutation rebuilds the effective dispatch time-entry view.
7. If all assigned trucks are complete and dispatch date is today/past and dispatch is not archived, dispatch is auto-archived with reason `Time logged`.
8. `time-entries` query is invalidated.
9. Drawer resets draft state and restores/maintains scroll position.

## 4. Incident-report-from-drawer flow

1. User clicks **Report Incident**.
2. Drawer builds `Incidents` query params with `create=1`, `fromDispatch=1`, `dispatchId`, optional `companyId`, optional single visible `truckNumber`.
3. Drawer closes itself.
4. Browser hard-navigates to Incidents page URL.
5. Downstream incident prefill behavior is outside this file pair and needs separate verification if refactoring across pages.

## 5. Screenshot flow

1. Owner clicks **Screenshot Dispatch**.
2. Drawer blocks if truck edit mode is active.
3. Drawer clones screenshot content and removes `data-screenshot-exclude` elements.
4. `html2canvas` renders off-screen content.
5. PNG file is created.
6. If file sharing is supported, native share sheet opens; otherwise a download starts.
7. Success/error toast displays.
8. Temporary DOM is removed and loading state resets.

## 6. Owner truck replacement flow

### Standard replacement
1. Owner enters truck edit mode.
2. Owner selects a new exact-count truck set from allowed trucks.
3. Save validates company ownership and identical truck count.
4. Dispatch truck list is updated.
5. Activity log entry is prepended.
6. Driver assignments for removed trucks are deactivated.
7. Driver assignment change notifications are sent.
8. Current-status confirmations for removed trucks are deleted.
9. Current-status confirmations for added trucks are created.
10. Owner notification `required_trucks` are expanded/reconciled.
11. Admin owner-truck-reassignment notification is created.
12. Relevant caches are invalidated.

### Conflicting same-shift swap
1. Owner tries to add a truck already assigned to another same-company, same-date, same-shift dispatch.
2. Flow requires exactly one conflicting added truck.
3. Swap confirmation modal is shown with incoming/outgoing truck and dispatch summary.
4. If confirmed, both dispatches are updated.
5. Activity logs are prepended on both dispatches.
6. Driver assignments on removed trucks are deactivated on both dispatches.
7. Driver assignment change notifications are sent.
8. Current-status confirmations are deleted/recreated/translated across both dispatches according to existing confirmation state.
9. Required trucks are expanded/reconciled on both dispatches.
10. Admin reassignment notification is created.
11. Portal/admin/notification/confirmation caches are invalidated.

## 7. Driver assignment change flow if reachable here

1. Owner changes a driver select value for one truck.
2. If selecting a driver:
   - same-shift conflict checks run
   - assignment row is created or updated active
3. If selecting “No driver assigned”:
   - existing assignment is updated inactive
4. Dispatch activity log entry is prepended describing assign/remove/change.
5. `notifyDriverAssignmentChanges(...)` sends:
   - `driver_removed` notifications to removed drivers
   - `driver_assigned` notifications to added drivers
6. Queries refetch/invalidate and a toast is shown.

## 8. Drawer open via deep link / notification flow

1. User lands on Portal with `dispatchId` and optionally `notificationId`.
2. Portal waits for dispatches and filtered lists.
3. If target notification is a driver removal for current driver and related dispatch matches target, removal modal opens instead of drawer.
4. Otherwise Portal finds which bucket contains the dispatch.
5. If current tab differs, tab changes first.
6. Once tab matches, Portal sets `drawerDispatchId`.
7. Matching `DispatchCard` receives `forceOpen=true`.
8. Card opens drawer and fires `onOpenDispatch`.
9. For drivers, this marks notifications/assignments seen.
10. Closing the drawer clears query params from the URL.

---

# G. Dependency map

## Direct imports from Portal.jsx

### Presentation-only
- `DispatchCard`
- `Tabs`, `TabsList`, `TabsTrigger`
- `Badge`
- `AlertDialog*`
- `Truck`, `Inbox`

### Logic-coupled
- `useSession`
- `getDispatchBucket`
- `sortTemplateNotesForDispatch`
- `areAllAssignedTrucksTimeComplete`
- `useConfirmationsQuery`
- `useOwnerNotifications`
- `useLocation`, `useNavigate`
- `startOfDay`, `parseISO`

### Side-effect / mutation critical
- `base44`
- `useMutation`, `useQueryClient`
- `notifyTruckConfirmation`
- `resolveOwnerNotificationIfComplete`
- `notifyOwnerTruckReassignment`
- `reconcileOwnerNotificationsForDispatch`
- `expandCurrentStatusRequiredTrucks`
- `notifyDriverAssignmentChanges`

## Direct imports from DispatchDetailDrawer.jsx

### Presentation-only
- `Sheet`, `SheetContent`, `SheetHeader`, `SheetTitle`
- `Badge`
- `Button`
- `Input`
- `Checkbox`
- icon components
- `DispatchDrawerTutorial`
- `DispatchActivityLogSection`
- `DispatchTimeLogSection`
- `DispatchDriverConfirmationSection`

### Logic-coupled
- `createPageUrl`
- `statusConfig` helpers/constants
- `templateNotes` helpers/constants
- `timeLogs` helpers
- `format`, `parseISO`
- `toast`

### Side-effect / mutation critical
- `base44`
- `useMutation`, `useQuery`, `useQueryClient`
- `notifyDriverAssignmentChanges`
- `html2canvas`

## Directly related downstream helpers/components traced

### `dispatchBuckets.jsx`
- logic-coupled
- bucket selection affects Portal tabs and deep-link opening

### `statusConfig.jsx`
- logic-coupled
- owner assignment/time-log visibility depends on `canCompanyOwnerViewAssignmentsAndTimeLogs`

### `timeLogs.js`
- logic-coupled
- time-log completeness gates history visibility and auto-archive behavior

### `templateNotes.js`
- logic-coupled for rendering shape/order, but not mutation-critical

### `DispatchCard.jsx`
- logic-coupled
- contains local drawer open state and force-open effect that triggers driver seen behavior

### `DispatchConfirmReceiptLogSection.jsx`
- presentation + action trigger wrapper
- owner confirmation UI surface

### `DispatchDriverAssignmentsSection.jsx`
- presentation + action trigger wrapper
- owner driver assignment UI with conflict-disabling behavior

### `DispatchTimeLogSection.jsx`
- presentation + action trigger wrapper
- role-based editable vs read-only time-log rendering

### `DispatchActivityLogSection.jsx`
- presentation-only for admin activity display

### `useConfirmationsQuery.js`
- side-effect/refresh critical shared data source

### `useOwnerNotifications.jsx`
- side-effect/mutation critical
- despite name, contains driver seen/removal acknowledgement logic

### `createNotifications.jsx`
Critical downstream side-effect functions used here:
- `notifyTruckConfirmation`
- `resolveOwnerNotificationIfComplete`
- `notifyOwnerTruckReassignment`
- `reconcileOwnerNotificationsForDispatch`
- `expandCurrentStatusRequiredTrucks`
- `notifyDriverAssignmentChanges`
- indirectly via hook: `notifyOwnerDriverSeen`

### Route/workspace dependencies
- `Layout.jsx`: route guard / redirect critical
- `useAccessSession.jsx`: role shaping critical because workspace mode can change effective `session.code_type`

---

# H. Dangerous areas to move or refactor

## 1. Role-based visibility is split across multiple layers
Fragility:
- layout route redirects
- Portal list filtering
- `DispatchCard` role-specific visible truck summary
- drawer role flags
- status-gated owner sections
- hidden driver seen behavior on open

Risk:
A seemingly simple “centralize role checks” refactor could easily change:
- which dispatches appear for drivers vs owners
- whether scheduled/cancelled owner sections show
- whether deep-link driver openings still mark seen

## 2. Owner vs driver vs truck behavior diverges using different source-of-truth data
- owner/truck dispatch visibility: allowed trucks
- driver dispatch visibility: active driver assignments
- owner visible trucks: allowed truck intersection
- driver visible trucks: current assignment rows

Risk:
Attempting to normalize all roles onto one “visibleTrucks” helper could accidentally make drivers see too much or owners see too little.

## 3. Confirmation creation is coupled to owner truck editing
Owner truck edit flow implicitly deletes/creates confirmations and preserves confirmation semantics across swaps.

Risk:
Any extraction that treats confirmations as independent from truck edits could change notification resolution and admin all-confirmed behavior.

## 4. Driver seen tracking is not just notification read-state
Driver acknowledgement updates both:
- notifications (`read_flag`)
- assignment receipt fields (`receipt_confirmed_*`)
- owner seen notifications

Risk:
If someone refactors this to “mark notification read” only, owner Seen badges and owner seen notifications will silently break.

## 5. Assignment behavior is entwined with notifications and activity log
Driver assign/remove/change does all of the following:
- updates assignment entity
- appends admin activity log
- emits driver notifications
- invalidates multiple query scopes
- shows toast/error state

Risk:
Extracting only the entity mutation without carrying notifications/activity log will cause behavior drift.

## 6. Screenshot/export behavior depends on DOM structure and exclusion attributes
The screenshot flow relies on:
- off-screen DOM cloning
- `data-screenshot-exclude` markers
- a specific summary block injected outside the live UI
- `html2canvas` compatibility
- share-vs-download branching

Risk:
Moving markup or removing exclusion markers can change screenshot contents without obvious UI regressions.

## 7. Time-entry behavior has two separate completeness concepts
- history visibility for owner/truck: checks only visible trucks
- auto-archive on save: checks all assigned trucks

Risk:
Replacing these with one “is dispatch time-complete” helper may unintentionally change history lists or archive timing.

## 8. Shared drawer logic changes by status
For owners:
- confirm section appears based on `myTrucks.length`
- assignment/time-log sections appear based on status allowlist
- time-log save section additionally blocks cancelled status

Risk:
A cleanup that “makes all owner action sections consistent” would change current behavior.

## 9. Deep-link open flow is stateful and tab-aware
The Portal deep-link logic depends on:
- raw dispatch load
- filtered dispatch load
- bucket calculation
- pending refs
- last-handled refs
- removal-notification modal override

Risk:
Small timing changes can break deep-link opening, duplicate opens, or URL cleanup.

---

# I. Safe-first extraction candidates

These are the safest candidates to extract first while preserving behavior.

## 1. Pure formatting helpers
Safe candidates:
- conflict summary formatting
- actor metadata formatting
- display time formatting helpers
- note layout helpers
- activity timestamp helpers

Why safe:
- mostly pure functions
- low side-effect coupling
- easy to snapshot-test

## 2. Static rendering blocks with existing prop boundaries
Safe candidates:
- scheduled dispatch header/body block
- cancellation/amendment banner block
- additional assignments rendering block
- box/general notes rendering block

Why safe:
- largely presentational
- already data-driven
- less mutation coupling

## 3. Read-only time-log rendering helpers
Safe candidates:
- `TruckTimeRow` read-only branch
- admin activity log section already extracted
- driver/admin read-only time-log wrappers

Why safe:
- limited mutation behavior
- mostly display-only

## 4. Query-param normalization helpers
Safe candidates:
- normalize id / truck helper functions
- dispatch-not-found / target dispatch resolution helpers

Why safe:
- pure or near-pure
- easier to unit test

## 5. Owner truck-edit validation helpers only
Safe candidates:
- count validation
- unauthorized truck validation
- conflict detection helper

Why only partially safe:
- pure validation is safe
- the mutation side effects themselves are **not** safe to extract casually

---

# J. Manual regression checklist

Use this checklist after any refactor.

## Portal access / routing
- [ ] Admin visiting `Portal` is redirected away to `AdminDashboard`.
- [ ] Company owner can access `Portal` normally.
- [ ] Driver can access `Portal` normally.
- [ ] Truck user can access `Portal` normally.

## Dispatch list visibility
- [ ] Owner only sees dispatches containing at least one allowed truck.
- [ ] Truck user only sees dispatches containing at least one allowed truck.
- [ ] Driver only sees dispatches with an active driver assignment.
- [ ] Cancelled dispatches still remain in date-based buckets unless archived.
- [ ] Archived dispatches always appear in History.

## Bucket behavior
- [ ] Today/Upcoming/History match local calendar date behavior.
- [ ] A past unarchived owner dispatch appears in History only when the owner-visible trucks have complete time logs.
- [ ] Scheduled dispatches still bucket by date, not by status.

## Deep-link behavior
- [ ] `Portal?dispatchId=<id>` opens the correct dispatch drawer.
- [ ] Deep link switches to the correct tab before opening.
- [ ] Closing the drawer removes `dispatchId` and `notificationId` from the URL.
- [ ] If target dispatch no longer exists, “Dispatch no longer available” appears.
- [ ] Driver removal notification deep-link opens the removed-assignment modal instead of the drawer.

## Owner confirmation behavior
- [ ] Owner sees confirm buttons only for visible trucks.
- [ ] Re-clicking confirm does not create duplicate confirmations.
- [ ] Confirmations use current dispatch status as confirmation type.
- [ ] Admin all-confirmed notification is only created once all assigned trucks are confirmed.
- [ ] Owner action notification resolves when all owner-required trucks are confirmed.

## Driver seen behavior
- [ ] Opening a driver dispatch marks matching driver notifications read.
- [ ] Opening a driver dispatch writes assignment receipt fields.
- [ ] Owner sees “Seen” badges on trucks after driver opens dispatch.
- [ ] Owner receives driver-seen notification.
- [ ] Dismissing a removed-assignment modal marks removal notifications read.

## Time-log behavior
- [ ] Owner can edit time logs only on allowed statuses and not when cancelled.
- [ ] Driver sees read-only time logs only for assigned trucks.
- [ ] Admin read-only time log section still works if drawer is rendered in admin context.
- [ ] Save All only enables when there are real unsaved changes.
- [ ] Auto-archive happens only when all assigned trucks are complete and dispatch date is today/past.
- [ ] History visibility rules do not change after time-log refactors.

## Incident flow
- [ ] Driver report-incident button exists.
- [ ] Owner report-incident button exists.
- [ ] Truck-user report-incident button exists.
- [ ] Incident URL includes `dispatchId` and `fromDispatch=1`.
- [ ] Incident URL includes `truckNumber` only when exactly one visible truck exists.

## Screenshot behavior
- [ ] Owner screenshot button exists.
- [ ] Screenshot is disabled while truck editing is active.
- [ ] Screenshot excludes controls marked with `data-screenshot-exclude`.
- [ ] Screenshot still uses share sheet on supported devices and download on unsupported ones.

## Owner truck-edit behavior
- [ ] Owner can only select trucks from allowed trucks.
- [ ] Truck count must remain identical.
- [ ] Save blocks invalid count.
- [ ] Removed-truck driver assignments are deactivated.
- [ ] Confirmation rows are deleted/recreated exactly as before.
- [ ] Swap confirmation dialog appears when replacing with a conflicting same-shift truck.
- [ ] Two-dispatch swap flow updates both dispatches correctly.
- [ ] Admin owner-truck-reassignment notification is still created.

## Driver assignment behavior
- [ ] Owner can assign eligible active drivers with created access codes only.
- [ ] Same-shift conflicting drivers are disabled in the picker.
- [ ] Mutation-time conflict still blocks race-condition conflicts.
- [ ] Unassigning a driver deactivates the assignment instead of deleting it.
- [ ] Dispatch activity log entries still append for assign/remove/change.
- [ ] Added drivers receive assigned notifications.
- [ ] Removed drivers receive removed notifications.

---

# K. Final required sections

## 1. Must-remain-identical behaviors

- Portal list filtering must stay **assignment-driven for drivers** and **allowed-truck-driven for owners/truck users**.
- Owner visible trucks must remain `allowed_trucks ∩ dispatch.trucks_assigned`.
- Driver visible trucks in drawer must remain based on active driver assignments for that dispatch.
- Owner confirm buttons must remain available per visible truck and use current dispatch status as confirmation type.
- Owner assignment/time-log sections must remain status-gated by `canCompanyOwnerViewAssignmentsAndTimeLogs`, while the owner confirmation section remains separately gated.
- Driver dispatch opening must continue to mark both notifications and assignment receipt fields as seen.
- Owner Seen badges must continue to depend on assignment `receipt_confirmed_at`.
- Owner truck-edit flow must keep exact truck-count preservation and allowed-truck restriction.
- Owner truck-edit flow must keep implicit confirmation deletion/creation and notification reconciliation behavior.
- Time-entry saves must preserve actor metadata behavior and auto-archive rules.
- Screenshot generation must preserve exclusion markers and share/download fallback behavior.
- Deep-link opening must remain tab-aware and must clear URL params on close.

## 2. High-risk logic areas

- Deep-link / notification-driven drawer opening
- Driver seen / acknowledgement flow
- Owner truck replacement + swap logic
- Confirmation recreation during owner truck edits
- Role split between owner/truck/driver visibility sources
- Status-gated owner sections
- Driver assignment mutation + notifications + activity log bundle
- Time-log completion vs archive/history asymmetry
- Screenshot DOM cloning/exclusion behavior

## 3. Safe-first extraction candidates

- Pure formatting helpers
- Static detail rendering blocks
- Notes rendering helpers
- Read-only time-log display helpers
- Query-param normalization helpers
- Pure owner truck-edit validation helpers

## 4. Sections that should not be moved yet

- Portal deep-link useEffects and drawer-open refs
- `handleConfirm` + notification resolution chain
- `timeEntryMutation` archive logic
- `updateOwnerTrucksMutation` entire mutation flow
- `markDriverDispatchSeenAsync` and removal acknowledgement coupling
- drawer owner driver assignment mutation and removal handler
- screenshot creation workflow until it has dedicated regression coverage

## 5. Explicit uncertainties / needs manual verification

- Whether backend/entity rules independently enforce company/user scoping beyond the client filters shown here.
- Whether Portal drawer is ever intentionally rendered for admin in production despite layout redirect.
- Whether truck access codes are guaranteed to have exactly one `allowed_trucks` entry.
- Whether any external listener depends on `window.__dispatchDetailDrawerOpen` or the `dispatch-detail-drawer-state` event beyond tutorials.
- Whether Incidents page consumes every query param generated here exactly as assumed; this file pair only proves that those params are sent.
- Whether owner/admin notification UX elsewhere depends on ordering or exact message text beyond what is visible in current helper code.
- Whether there are backend automations tied to confirmation/time-entry/assignment entity changes outside the traced client code.
