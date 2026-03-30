# AdminDispatches.jsx behavior baseline

## Scope and intent
This baseline documents the current page-level behavior of `src/pages/AdminDispatches.jsx` and the directly coupled workflow it drives so the page can be refactored later without changing behavior. It covers the admin dispatch list, live board, dispatch create/edit/copy/delete/archive flows, edit locking, notification-triggering behavior, Google Drive sync hooks, drawer preview behavior, and the directly related form/drawer components and helpers that the page depends on.

## 1) Purpose of the page
- `AdminDispatches` is the admin-only dispatch operations page.
- It serves four major purposes at once:
  1. browse dispatches by date bucket (`Live Dispatch Board`, `Today`, `Upcoming`, `History`),
  2. create/edit/copy/delete/archive/unarchive dispatch records,
  3. preview a dispatch in the shared `DispatchDetailDrawer`, and
  4. manage live-board-only operational overlays (per-truck live status and requested slot counts).
- The page does **not** itself perform company-owner confirmation actions or time-entry saves. In admin mode it passes no-op handlers for confirmation/time-entry actions to the drawer, so the drawer becomes primarily a read/assignment/inspection surface for admins.

## 2) Route access / visibility / enforcement
### Route guard
- `Layout.jsx` treats `AdminDispatches` as an admin-only page. Non-admin users are redirected to `Home` before using this page.
- `pages.config.js` registers `AdminDispatches` as a normal routed page under the shared layout.
- The admin nav includes a dedicated Dispatches tab linking here.

### Deep-link entry points into this page
Repo-wide callers that intentionally land users on `AdminDispatches`:
- `AdminDashboard` can navigate here and pass `{ openNewDispatch: true }` to open the create modal immediately.
- `AdminConfirmations`, `Incidents`, `Notifications`, and `NotificationBell` can navigate here with `?dispatchId=...` and sometimes `?notificationId=...` so the target dispatch auto-opens in the drawer.

### Enforcement map summary
- **Route guard:** enforced in `Layout.jsx` for admin-only page access.
- **Client filtering:** most page logic is client-side filtering/grouping over broad entity lists.
- **Entity/backend rule:** entity schemas define fields and enum shapes, but this repo snapshot does **not** show hard backend permission logic for AdminDispatches-specific mutations.
- **Backend function:** Google Drive HTML sync is enforced by `base44.functions.invoke('syncDispatchHtmlToDrive/entry', payload)`.
- **Unknown / needs verification:** whether Base44 entity endpoints have additional server-side role validation beyond the route guard is not visible in this repo snapshot and needs manual verification.

## 3) State managed by AdminDispatches
### React state
- `open`: whether the create/edit dialog is open.
- `editing`: the dispatch being edited, or a copy-template object for copy flow, or `null` for new dispatch.
- `previewDispatch`: the dispatch currently shown in the drawer.
- `drawerConfirmations`: confirmations loaded specifically for the drawer preview.
- `drawerTimeEntries`: time entries loaded specifically for the drawer preview.
- `drawerMountKey`: remount key used when deep-linking/opening a different preview.
- `deleteTarget`: dispatch selected for deletion confirmation.
- `deleteCode`: admin access code typed into delete confirmation dialog.
- `deleteError`: delete-code validation error string.
- `filters`: `{ status, company_id, truck, dateFrom, dateTo, query }` for list tabs.
- `showFilters`: whether filter controls are visible.
- `tab`: current tab; defaults to `live-board`.
- `liveBoardCenterDate`: selected live-board date window center; defaults to local start of today.
- `boardSearch`: live-board search query.
- `statusUpdatingKey`: identifies which live status row is currently saving.
- `requestUpdatingKey`: identifies which requested slot control is currently saving.

### Refs / non-render state
- `dispatchRefs`: DOM refs used for scroll-to-target after deep-link open.
- `pendingOpenIdRef`: stores a target dispatch id while the page switches tabs before opening the drawer.
- `activeEditLockDispatchIdRef`: tracks which dispatch this admin session currently has edit-locked.

### Derived URL/navigation state
- `targetDispatchId` from `location.search`.
- `targetNotificationId` from `location.search`.
- `openNewDispatch` from `location.state?.openNewDispatch`.

## 4) Data loaded by the page
AdminDispatches eagerly loads broad admin datasets with React Query:
- `Dispatch` list (`['dispatches-admin']`) ordered by `-date`, limit 500.
- `Company` list (`['companies']`).
- `AccessCode` list (`['access-codes']`).
- `Confirmation` list (`['confirmations-admin']`) ordered by `-confirmed_at`, limit 500.
- `TimeEntry` list (`['time-entries-admin']`) ordered by `-created_date`, limit 500.
- `LiveDispatchBoardRequest` list (`['live-dispatch-board-requests']`) ordered by `-created_date`, limit 500.
- `DriverDispatch` list (`['driver-dispatch-assignments-admin']`) ordered by `-created_date`, limit 2000.
- `DispatchTemplateNotes` filtered to `active_flag: true` (`['template-notes']`).

### Extra loads triggered on drawer open
When a dispatch drawer opens, the page also fetches:
- confirmations for that dispatch,
- time entries for that dispatch,
- admin notifications for that dispatch.

Unread admin notifications for the same dispatch/status group are then bulk-marked read.

### Extra loads triggered in mutations/helpers
The page also performs targeted reads during mutations, including:
- latest dispatch record before lock acquire/release,
- current active driver assignments for a dispatch,
- confirmations/time entries/driver assignments before Google Drive HTML sync,
- owner/driver notifications and confirmations during notification reconciliation or deletion cleanup.

## 5) Imported dependency map (page-level)
### Core page imports
- `useLocation`, `useNavigate` from router for deep-linking and query-param cleanup.
- `base44` entity/function client for all CRUD and function invokes.
- React Query hooks for data loads/mutations/cache invalidation.
- shared UI atoms (`Card`, `Button`, `Input`, `Badge`, `Select`, `Dialog`, `Tabs`, `Label`).
- `date-fns` helpers for date math and formatting.
- icon set from `lucide-react`.

### Logic-coupled imports
- `getDispatchBucket` from `components/portal/dispatchBuckets`:
  - decides whether a dispatch is in `today`, `upcoming`, or `history`.
  - archived dispatches always route to `history` regardless of date.
- `DispatchForm`:
  - owns most create/edit validation, amendment-history generation, and owner notification prompts.
- `DispatchDetailDrawer`:
  - shared detail drawer; in admin mode used mostly for preview, confirmation history viewing, and driver assignment controls.
- `useSession`:
  - required for admin identity, locking, activity log actor values, and delete-code validation.
- `statusBadgeColors`, `statusBorderAccent`, `scheduledStatusMessage` from `statusConfig`:
  - drive visual status rendering.
- `reconcileOwnerNotificationsForDispatch`, `notifyDriversForDispatchEdit`, `notifyDriverAssignmentChanges` from `createNotifications`:
  - tightly coupled side-effect helpers.
- `syncDispatchHtmlToDrive` from `lib/dispatchDriveSync`:
  - tightly coupled sync after create/edit/archive.
- `toast` from `sonner`:
  - user-facing success/error/warning messages.

### Internal page-local helpers
- truck normalization / equality helpers for determining removed trucks and activity changes.
- admin activity-log helper builders.
- live-board line key, time formatting, start-time derivation, and shift/job accent helpers.
- `clearRemovedTruckDriverAssignments()` helper which deactivates driver assignments for removed trucks and sends driver reassignment notifications.
- `syncDispatchRecordHtml()` wrapper which loads related entities and calls `syncDispatchHtmlToDrive()`.

## 6) Repo-wide directly related dependencies and references
### Direct behavior dependencies used by AdminDispatches
- `src/components/admin/DispatchForm.jsx`
- `src/components/portal/DispatchDetailDrawer.jsx`
- `src/components/portal/dispatchBuckets.jsx`
- `src/components/portal/statusConfig.jsx`
- `src/components/notifications/createNotifications.jsx`
- `src/lib/dispatchDriveSync.js`
- `src/lib/dispatchHtml.js`
- `base44/functions/syncDispatchHtmlToDrive/entry/entry.ts`
- entity schemas:
  - `CopyOfEntities/Dispatch.json`
  - `CopyOfEntities/DriverDispatch.json`
  - `CopyOfEntities/LiveDispatchBoardRequest.json`

### Repo-wide incoming references / navigation into AdminDispatches
- `src/Layout.jsx`
- `src/pages.config.js`
- `src/pages/AdminDashboard.jsx`
- `src/pages/AdminConfirmations.jsx`
- `src/pages/Incidents.jsx`
- `src/pages/Notifications.jsx`
- `src/components/notifications/NotificationBell.jsx`

### Related workflows outside this page that touch the same records
- `src/pages/Portal.jsx` also uses `DispatchDetailDrawer` and owner truck-change flows.
- `src/components/notifications/useOwnerNotifications.jsx` updates driver assignment receipt flags based on notification acknowledgement.
- `src/pages/Home.jsx` and `Notifications.jsx` interpret notification categories created by AdminDispatches-triggered mutations.

## 7) Filters, sorts, groupings, and bucket rules
### Main-list filtering
The list tabs share one filtered dispatch set using these rules:
- status filter: exact status match unless `all`.
- company filter: exact `company_id` unless `all`.
- truck filter: substring match against any truck in `trucks_assigned`.
- date range: inclusive string comparison on `YYYY-MM-DD` values.
- query filter: case-insensitive substring search over:
  - `client_name`,
  - `job_number`,
  - primary `reference_tag`,
  - additional assignment `job_number` and `reference_tag` values.

### Bucketing rules
Via `getDispatchBucket()`:
- archived dispatches are always `history`.
- otherwise date-only comparison determines `today`, `upcoming`, or `history`.
- cancelled dispatches stay in today/upcoming/history strictly by date; cancellation alone does not force them into history.

### Main-list sorting
- `upcoming`: by ascending date, then ascending `start_time`.
- `today`: by ascending `start_time`.
- `history`: by descending date.

### Live Dispatch Board inclusion rules
The live board:
- excludes statuses `Cancelled` and `Scheduled`.
- only shows dispatches whose `date` exactly equals the selected live-board date.
- groups jobs by `date + shift + job_number`.
- splits output into fixed shift groups: `Day Shift`, `Night Shift`.
- sorts jobs within each shift by job number string ascending.
- sorts truck lines inside a job by derived truck start time.

### Live board composition rules
For each matching dispatch:
- every truck in `trucks_assigned` becomes one visible line.
- driver names come from active `DriverDispatch` rows keyed by `dispatch_id + truck_number`.
- line start time comes from the earliest matching assignment start time for that truck; otherwise the dispatch primary start time.
- extra per-truck assignments beyond the first appear as `Additional assignment` sub-lines.
- live status comes from `dispatch.live_truck_statuses[truck]` and defaults to `Running`.

### Requested-slot overlay rules
- `LiveDispatchBoardRequest` records add or override the requested slot count for a job group.
- `requestedCount` is always at least `assignedCount`.
- if requested slots exceed assigned trucks, placeholder rows are appended.
- search on live board matches either:
  - job number/client name, or
  - truck number/driver name on non-placeholder lines.

## 8) User actions allowed by the page
### List / board actions
- switch between live board, today, upcoming, history tabs.
- toggle filter panel.
- change filters.
- navigate live-board date backward/forward by one day.
- search live board.
- open dispatch drawer from a card or live-board line.

### Dispatch record actions
- create a new dispatch.
- edit an existing dispatch.
- copy an existing dispatch into a new draft with company/trucks cleared and status reset to `Scheduled`.
- delete a dispatch after admin code validation.
- archive a dispatch.
- unarchive a dispatch.

### Live board actions
- change live truck status per truck line.
- increase/decrease requested slot count per job group.

### Drawer actions available in admin mode
Inside `DispatchDetailDrawer`, admin mode still exposes:
- preview of dispatch details,
- confirmation history by truck,
- driver assignment information and controls (through the shared drawer logic),
- activity log viewing.

Admin mode does **not** provide real confirmation/time-entry mutation handlers from this page; they are passed as empty callbacks.

## 9) Callbacks and handlers in AdminDispatches
### Dialog / local UI handlers
- `openNew()` opens a blank create form.
- `openEdit(dispatch)` acquires an edit lock first, then opens the edit form.
- `copyShift(dispatch)` clones operational fields into a new unsaved draft with status reset to `Scheduled`.
- `openDelete(dispatch)` opens delete confirmation state.
- `handleDeleteConfirm()` validates the typed admin access code against the current session id/code record before deleting.
- `handleDrawerClose()` closes preview and strips `dispatchId`/`notificationId` query params.
- `shiftLiveBoardWindow(direction)` changes the selected live-board date.
- `handleSave(formData)` wraps `saveMutation` in a Promise for `DispatchForm`.

### Drawer open handler
`openDrawer(dispatch)`:
- sets preview dispatch immediately,
- fetches confirmations/time entries/admin notifications for that dispatch,
- bulk-marks unread related admin notifications as read,
- invalidates notifications cache if read state changed.

### Locking handlers
- `acquireEditLock(dispatchId)`:
  - reloads latest dispatch,
  - blocks editing if locked by another session,
  - writes lock metadata if available,
  - invalidates admin/portal dispatch caches.
- `releaseEditLock(dispatchId)`:
  - reloads latest dispatch,
  - only unlocks if the current admin session owns the lock,
  - clears lock metadata,
  - invalidates admin/portal dispatch caches.

### Important effects
- deep-link auto-open effect opens the requested dispatch and scrolls it into view after tab correction.
- `openNewDispatch` effect auto-opens create modal from dashboard state.
- cleanup effect releases any active edit lock on unmount/session change.
- preview refresh effect replaces `previewDispatch` with the freshest dispatch object after list refreshes.

## 10) Mutations performed by this page
### A. Create dispatch
Primary entity mutation:
- `Dispatch.create({...data, admin_activity_log, edit_lock fields cleared})`

Additional side effects:
- Google Drive sync attempted immediately after create.
- if sync fails, dispatch is updated with failed sync status/error and a warning toast is shown.
- no owner/driver notifications are sent directly by `AdminDispatches` create flow.
- owner notifications for newly created dispatches depend on `DispatchForm.finalizeSubmit()` calling `notifyDispatchChange()` because create is always treated as a status change from `null` to the selected status.

### B. Edit dispatch
Primary entity mutation:
- `Dispatch.update(editing.id, {...data, admin_activity_log appended, lock fields cleared})`

Potential follow-up mutations:
- deactivate removed-truck `DriverDispatch` rows.
- reset `receipt_confirmed_*` fields on active driver assignments when status changes into `Amended` or `Cancelled`.
- update notification records via `reconcileOwnerNotificationsForDispatch()`.
- create/update driver notifications via `notifyDriversForDispatchEdit()`.
- update Drive sync metadata on success/failure.

### C. Delete dispatch
Primary entity mutation:
- `Dispatch.delete(id)`

Cleanup mutations:
- delete related `Notification` rows for `related_dispatch_id = id`.
- delete related `Confirmation` rows for `dispatch_id = id`.
- **Needs manual verification:** related `TimeEntry`, `DriverDispatch`, and `LiveDispatchBoardRequest` cleanup is not performed here.

### D. Archive / unarchive
Primary entity mutation:
- archive: `Dispatch.update(dispatch.id, { archived_flag: true, archived_at, archived_reason: 'Admin archived', admin_activity_log appended })`
- unarchive: `Dispatch.update(dispatch.id, { archived_flag: false, archived_at: null, archived_reason: null, dispatch_html_drive_sync_finalized_at: null })`

Archive-only side effect:
- if archiving and `dispatch_html_drive_sync_finalized_at` is not already set, a final Google Drive sync runs with `finalizeAfterSync: true`.
- if that final sync fails, the dispatch is updated with failed sync status/error and a warning toast is shown.

### E. Live status mutation
- updates `Dispatch.live_truck_statuses` object for one truck line.
- no notification helper is called.
- cache invalidates `['dispatches-admin']` afterward.

### F. Live requested slot mutation
Against `LiveDispatchBoardRequest`:
- if record exists and next count equals assigned count: delete the request row.
- if record exists and next count remains above assigned count: update `requested_count`, `client_name`, `start_location`.
- if no record exists and delta is positive: create a new request row.
- if no record exists and delta is negative: no-op.

## 11) Mutation / side-effect sequence maps
### Create dispatch
1. `DispatchForm` validates required fields.
2. `DispatchForm.finalizeSubmit()` calls `onSave(finalForm)`.
3. `AdminDispatches.saveMutation` creates the dispatch and prepends a `created_dispatch` admin activity entry.
4. `AdminDispatches` attempts Drive HTML sync.
5. `DispatchForm.finalizeSubmit()` treats create as a status change and calls `notifyDispatchChange()`.
6. `DispatchForm.finalizeSubmit()` calls `reconcileOwnerNotificationsForDispatch()`.
7. page invalidates dispatch/notification/portal-related queries and closes the dialog.

### Edit dispatch
1. admin must acquire edit lock.
2. `DispatchForm` validates fields.
3. if editing with no status change and no added trucks, form pauses for optional informational owner-notification message.
4. `Dispatch.update()` runs with appended activity entry and lock cleared.
5. previous active driver assignments are read.
6. removed trucks cause matching active driver assignments to be deactivated via `clearRemovedTruckDriverAssignments()`.
7. if status became `Amended` or `Cancelled`, active driver assignments have receipt-confirmation fields reset.
8. owner notifications are reconciled.
9. driver notifications are created/updated through `notifyDriversForDispatchEdit()`.
10. Drive HTML sync runs; failure writes error metadata and shows warning toast.
11. `DispatchForm.finalizeSubmit()` may also:
   - call `notifyDispatchChange()` if status changed, or
   - call `expandCurrentStatusRequiredTrucks()` if trucks were added without status change, or
   - call `notifyDispatchInformationalUpdate()` if admin opted into an informational update without status change.
12. form then calls `reconcileOwnerNotificationsForDispatch()` again.

### Amend dispatch
Amendment is an edit whose resulting status is `Amended`.
Sequence differences from generic edit:
- `DispatchForm` requires `canceled_reason` as amendment reason.
- if prior status was not already `Amended`, amendment history records a change summary for location/time/instructions/trucks differences.
- `AdminDispatches` resets active driver assignment receipt-confirmation fields.
- `notifyDriversForDispatchEdit()` sends amended notifications to assigned drivers.
- `DispatchForm.finalizeSubmit()` treats it as a status change and calls `notifyDispatchChange()` for owners.

### Cancel dispatch
Cancellation is an edit whose resulting status is `Cancelled`.
Sequence differences from generic edit:
- `DispatchForm` requires `canceled_reason` as cancellation reason.
- admin activity log action becomes `cancelled_dispatch` instead of generic update.
- `AdminDispatches` resets active driver assignment receipt-confirmation fields.
- `notifyDriversForDispatchEdit()` sends cancelled notifications to assigned drivers.
- `DispatchForm.finalizeSubmit()` treats it as a status change and calls `notifyDispatchChange()` for owners.
- cancelled dispatches remain on live list tabs by date, but are excluded from the live board.

### Archive / unarchive dispatch
Archive:
1. mark dispatch archived and append archive activity entry.
2. if not already finalized, run final Drive HTML sync.
3. if sync fails, write failed metadata and warn.
4. invalidate admin dispatch list.

Unarchive:
1. clear archive fields and clear `dispatch_html_drive_sync_finalized_at`.
2. do **not** run a sync immediately.
3. invalidate admin dispatch list.

### Truck changes touched by this page
Admin page truck-change effects are split across flows:
- **edit form truck reassignment:** if trucks are removed during dispatch edit, matching active driver assignments are deactivated and `notifyDriverAssignmentChanges()` is called.
- **edit form added trucks:** owner notification requirements may expand via `expandCurrentStatusRequiredTrucks()` if status did not change.
- **drawer truck editing:** admin page does **not** supply `onOwnerTruckUpdate`; owner-only truck swap logic lives elsewhere (`Portal.jsx`). So shared drawer truck-edit UI is not active for admin from this page.
- **live board truck state:** per-truck live status updates only mutate `live_truck_statuses`; they do not modify assignments.

### Driver assignment related effects touched by this page
Through the shared admin drawer, this page can indirectly trigger driver assignment changes:
- assigning a driver creates or updates a `DriverDispatch` row with receipt flags reset to false.
- removing a driver marks the existing assignment inactive.
- owner-style activity entries are only appended when the actor is `CompanyOwner`; admin assignment changes in the drawer do **not** create those activity entries.
- driver assignment notifications are sent on add/remove via `notifyDriverAssignmentChanges()`.
- conflicting same-shift driver assignment checks are enforced in drawer logic only for owner assignment flow; admin-path behavior through the same shared handler needs manual verification because the query/mutation path is shared but the UI condition is role-based.

## 12) Notifications and other side effects
### Toasts from AdminDispatches itself
- error toast if edit lock cannot be acquired.
- error toast if edit lock cannot be released.
- message toast if the dispatch is already open for editing in the same session.
- success toast when a standard edit saves and releases the lock.
- warning toast if create/edit/archive succeeds but Drive sync fails.

### Notification helpers reachable from this page or its form/drawer
- `notifyDispatchChange()` for owner notifications on status change / initial create.
- `notifyDispatchInformationalUpdate()` for optional owner informational edits.
- `expandCurrentStatusRequiredTrucks()` when trucks are added without status change.
- `reconcileOwnerNotificationsForDispatch()` after create/edit and inside AdminDispatches edit flow.
- `notifyDriversForDispatchEdit()` after admin edit saves.
- `notifyDriverAssignmentChanges()` when removed trucks drop assignments and when drawer assignment changes occur.

### Google Drive side effects
- `syncDispatchRecordHtml()` loads confirmations, time entries, and active driver assignments for the dispatch and calls `syncDispatchHtmlToDrive()`.
- `syncDispatchHtmlToDrive()` builds per-truck HTML files using `buildDispatchHtml()`, invokes the backend function `syncDispatchHtmlToDrive/entry`, and stores sync metadata back on the dispatch.
- archived finalized records are skipped unless explicitly allowed.

## 13) Role-based differences affecting this page
### Admin vs non-admin route access
- Only admins can access `AdminDispatches` via route guard.

### Admin behavior inside the shared drawer
When `AdminDispatches` renders `DispatchDetailDrawer`, it passes:
- `session={{ code_type: 'Admin', allowed_trucks: previewDispatch?.trucks_assigned || [] }}`
- `onConfirm={() => {}}`
- `onTimeEntry={() => {}}`
- no `onOwnerTruckUpdate`

Effects of that admin drawer mode:
- admin sees all assigned trucks because `myTrucks` resolves to all preview trucks.
- admin sees per-truck confirmation history section.
- admin sees driver assignment data/controls in the shared drawer path.
- owner-only truck edit UI is not actionable because `isOwner` is false.
- confirmation/time-entry action buttons may still render according to shared child-component logic and need manual verification for exact no-op UX because handlers are empty callbacks.

### CompanyOwner-specific logic that matters indirectly
- `DispatchForm` and notification helpers are designed around owner notification requirements and allowed-truck intersections.
- `DispatchDetailDrawer` contains owner-only driver assignment and truck-edit behaviors shared with portal flows, but those are mostly dormant on AdminDispatches.

## 14) Conditionals and edge cases
- same-session edit reopen is blocked with a toast instead of reacquiring lock.
- other-session edit lock blocks edit and shows locker name if available.
- release lock only clears if the current session owns the lock.
- copy flow clears `company_id`, clears trucks, resets status to `Scheduled`, clears amendment history, clears cancellation reason, and sets `_isCopy`.
- scheduled dispatches require fewer fields in `DispatchForm`; non-scheduled statuses require full operational details.
- amended/cancelled status requires `canceled_reason` even though the same field serves both amendment and cancellation reasons.
- truck availability in the form blocks trucks already assigned on another non-archived same-company same-date same-shift dispatch in statuses `Scheduled`, `Dispatch`, or `Amended`.
- cancelled dispatches are excluded from live board but not forced into history tabs.
- archived dispatches are forced to history.
- unarchiving clears sync-finalized timestamp but does not resync immediately.
- delete flow validates the current session's admin access code against `accessCodes.find(ac => ac.id === session?.id)` rather than using any arbitrary admin code.
- live request decrease cannot reduce requested count below assigned count.
- live request deletion occurs automatically when requested count falls back to assigned count.
- live status for an unassigned truck key would use `'unassigned'` in internal keying.
- `DispatchForm` automatically suggests `reference_tag` from the latest prior matching job number in dispatches/additional assignments.
- admin assignment activity logging for drawer-based driver changes appears owner-only by code path and needs manual verification if admins can change drivers from this page in production.

## 15) Child components split by coupling level
### Presentation-only or near-presentation-only
- `AdminConfirmationsPanel` (defined inside the page) — mostly read-only grouping/rendering for confirmations; not currently used elsewhere from this file.
- shared UI atoms (`Card`, `Button`, `Input`, `Badge`, `Select`, `Dialog`, `Tabs`, `Label`).
- most icon imports.

### Logic-coupled child components
- `LiveDispatchBoard` — tightly coupled to page-derived grouped data and mutation callbacks.
- `DispatchForm` — highly coupled to dispatch creation/edit rules, notification prompts, required-field logic, copy-from-previous logic, and amendment tracking.
- `DispatchDetailDrawer` — highly coupled shared workflow surface with its own queries, assignment logic, confirmation/time log visibility rules, and activity sections.
- nested shared drawer sections (`DispatchDriverConfirmationSection`, `DispatchDriverAssignmentsSection`, `DispatchTimeLogSection`, `DispatchActivityLogSection`, etc.) — logic-coupled via role and mutation behavior.

## 16) Safest sections to extract first
1. **Pure formatting helpers**
   - `formatDispatchTime`, `formatActivityPreviewTimestamp`, live status class mapping, line-key helpers, job accent helpers.
2. **Pure derivation helpers**
   - live-board grouping/derivation functions, truck assignment normalization/equality helpers, activity entry builders.
3. **Stateless live-board rendering**
   - `LiveDispatchBoard` can be extracted more safely if all callbacks/data are passed in unchanged.
4. **Filter bar rendering**
   - mostly UI around already-derived filter state.
5. **Card rendering for list tabs**
   - presentation extraction is relatively safe if click/mutation handlers stay injected.

## 17) Dangerous areas to move or refactor
1. **Save flow split across `AdminDispatches` + `DispatchForm`**
   - behavior is intentionally shared across page mutation code and form-side notification prompting.
   - moving only one side risks duplicate/missed notifications or incorrect sequencing.
2. **Edit lock lifecycle**
   - acquisition, release, modal close, and unmount cleanup are tightly related.
3. **Removed-truck driver assignment cleanup**
   - deactivates assignments and sends notifications; easy to break silently.
4. **Owner notification reconciliation timing**
   - currently occurs both in page save logic and again in form finalize logic.
   - this duplication may be intentional or accidental; changing it is risky without verification.
5. **Drive sync invocation and failure handling**
   - create/edit/archive each have different sync timing and error paths.
6. **Deep-link drawer opening**
   - tab switching, pending-open ref, notification read marking, and scrolling are coordinated.
7. **Shared drawer driver assignment behavior**
   - AdminDispatches relies on behavior inside `DispatchDetailDrawer`; role-based side effects are non-obvious.

## 18) Visibility / enforcement source map
### Route guard
- `Layout.jsx` admin-page redirect.

### Client filtering
- dispatch tab buckets and filters in `AdminDispatches`.
- live board exclusion of `Scheduled` and `Cancelled`.
- truck availability blocking in `DispatchForm`.
- owner notification filtering by allowed-truck intersections in notification helpers.
- drawer visibility rules by `code_type` and status in `DispatchDetailDrawer` / `statusConfig`.

### Entity / backend rule
- entity schemas define dispatch/assignment/request field shape and enums.
- lock fields, archive fields, drive sync metadata fields, and live-board fields exist on the `Dispatch` entity.
- receipt confirmation fields exist on `DriverDispatch`.
- **Needs manual verification:** backend-level ACL enforcement is not present in this repo snapshot.

### Backend function
- `syncDispatchHtmlToDrive/entry` performs Drive file syncing.

### Unknown / needs verification
- whether Base44 entity APIs enforce admin-only mutation authorization server-side.
- whether there are database triggers or server workflows outside this repo for dispatch delete/archive/change propagation.

## 19) Manual regression checklist for AdminDispatches
### Access / navigation
- [ ] non-admin cannot access `AdminDispatches` directly.
- [ ] admin nav still links to this page.
- [ ] dashboard `openNewDispatch` state still opens new-dispatch modal.
- [ ] `dispatchId` deep links still switch to correct tab, open drawer, and scroll into view.
- [ ] `notificationId` deep links still mark the notification read.

### List filtering / bucketing
- [ ] archived dispatches always appear only in History.
- [ ] cancelled dispatches still stay in Today/Upcoming by date.
- [ ] truck, company, date, status, and query filters still match current behavior.
- [ ] additional assignment job/reference values are still included in query search.

### Create / copy / edit
- [ ] new Scheduled dispatch still allows minimal field set.
- [ ] Dispatch/Amended/Cancelled still require full details.
- [ ] copy flow still clears company and trucks, resets status to Scheduled, and keeps copied operational fields.
- [ ] latest job-number reference tag auto-suggestion still works for primary and additional assignments.
- [ ] edit lock is acquired before edit and released on save/cancel/unmount.
- [ ] second admin cannot open an actively locked dispatch for editing.

### Save side effects
- [ ] admin activity log entry type/message remains unchanged for each edit scenario.
- [ ] removed trucks still deactivate active driver assignments.
- [ ] added trucks without status change still expand owner notification required trucks.
- [ ] optional informational update prompt still appears only for edits with no status change and no added trucks.
- [ ] amended/cancelled status changes still reset driver receipt-confirmation fields.
- [ ] assigned drivers still receive the correct updated/amended/cancelled notifications.
- [ ] Drive sync still runs on create/edit and writes failure metadata on failure.

### Delete / archive
- [ ] delete still requires the current admin session's access code.
- [ ] delete still removes related notifications and confirmations.
- [ ] archive still appends archive activity log and runs final sync once.
- [ ] unarchive still clears archive metadata and finalized-sync timestamp without immediate resync.

### Live board
- [ ] only non-Scheduled/non-Cancelled dispatches show on live board.
- [ ] job grouping remains by date + shift + job number.
- [ ] per-truck lines still show derived earliest assignment start time.
- [ ] additional assignments still render below the primary truck line.
- [ ] per-truck live status persists correctly.
- [ ] requested slot adjustments still create/update/delete `LiveDispatchBoardRequest` rows as before.
- [ ] placeholder open-slot rows still appear when requested count exceeds assigned trucks.

### Drawer / related workflows
- [ ] admin drawer still shows confirmation history and activity log.
- [ ] admin drawer still reflects assigned driver names and seen badges.
- [ ] if admin driver assignment controls are intended to work, add/remove flows still create/update/deactivate assignment rows and notify drivers.
- [ ] confirmation/time-entry controls in admin drawer should be manually verified because AdminDispatches passes empty handlers.

## 20) Must-remain-identical behaviors
1. Admin-only route access and admin nav entry.
2. Date-based bucketing rules, especially:
   - archived => history,
   - cancelled does **not** auto-move to history.
3. Edit-lock acquisition/release semantics and cross-session blocking.
4. `DispatchForm` validation differences between Scheduled and non-Scheduled statuses.
5. Copy flow field resets.
6. Activity-log entry precedence/order when editing.
7. Removed-truck driver assignment deactivation and resulting driver notifications.
8. Driver receipt-confirmation reset on Amended/Cancelled status changes.
9. Notification branching between status changes, added trucks, and optional informational updates.
10. Drive sync timing and failure behavior for create/edit/archive.
11. Live board inclusion/exclusion rules, grouping, default status value, and requested-slot placeholder behavior.
12. Deep-link drawer opening and notification read-marking flow.

## 21) High-risk logic areas
- save path split between `DispatchForm` and `AdminDispatches`.
- owner-notification reconciliation timing/duplication.
- removed-truck cleanup and driver notification coupling.
- admin drawer shared driver-assignment behavior.
- edit-lock lifecycle.
- archive final-sync behavior.
- delete cleanup incompleteness vs expected production behavior.

## 22) Safe-first extraction candidates
- pure helper functions (time formatting, key builders, activity formatters).
- live-board derivation into a selector/helper module.
- filter bar UI.
- dispatch card presentation component.
- admin activity preview rendering.

## 23) Sections that should not be moved yet
- combined save/edit flow until notification + sync sequencing is fully covered by tests.
- edit-lock functions/effects.
- deep-link auto-open effect.
- removed-truck driver-assignment cleanup helper.
- archive mutation.
- any shared-drawer driver assignment logic until admin-vs-owner expectations are manually verified.

## 24) Explicit uncertainty / needs manual verification
- backend/server authorization and ACL behavior for entity mutations.
- whether admin users are intended to change driver assignments from the admin drawer in production, and if so whether all expected activity logging currently occurs.
- whether admin drawer confirmation/time-entry UI renders actionable controls that now no-op because empty handlers are passed.
- whether deleting a dispatch should also clean up time entries, driver assignments, and live-board request rows.
- whether duplicate owner-notification reconciliation calls are intentionally required.
