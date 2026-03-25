# Behavior Preservation Baseline

Generated from repository code review on 2026-03-23. This document is intentionally conservative: when behavior was not explicit in code, it is labeled **likely inferred from code** or **needs manual verification**.

## Legend
- **Confirmed from code** — directly supported by current repository code.
- **Likely inferred from code** — strongly suggested by the implementation, but not guaranteed without runtime validation.
- **Needs manual verification** — unclear, environment-dependent, or not fully provable from static review alone.

**((NOTE))** `Truck` were originally added to be a user, but will eventually be removed as a user, leaving only 3 remaining user types: `Admin`, `CompanyOwner`, `Driver`.
---

## A. App-Level Core Rules

### Role-based visibility and access
- **Confirmed from code:** The app has four active access-code types in data and UI logic: `Admin`, `CompanyOwner`, `Truck`, and `Driver`. `available_views` / `linked_company_ids` extend admin workspaces, while truck and driver sessions stay locked to their own role view.
- **Confirmed from code:** Admin-only pages are `AdminDashboard`, `AdminCompanies`, `AdminConfirmations`, `AdminAccessCodes`, `AdminDispatches`, `AdminTemplateNotes`, `AdminAnnouncements`, and `AdminAvailability`. Non-admin sessions attempting those pages are redirected away.
- **Confirmed from code:** Company-owner-only pages are `Availability` and `Drivers`. Non-owner sessions are redirected away.
- **Confirmed from code:** `Profile` and `Notifications` are available only to `Admin`, `CompanyOwner`, and `Driver`, not truck users.
- **Confirmed from code:** `Portal` / `Home` are the main non-admin workspace pages; admins are redirected from those routes to `AdminDashboard`.
- **Confirmed from code:** `Incidents` is visible in both admin and portal-style navigation and is accessible to all role types, with role-specific filtering inside the page.
- **Likely inferred from code:** Truck users appear to be intentionally limited to operational dispatch / incident flows and do not get a general notifications page or profile page.

### Admin / company owner / driver / truck differences
- **Confirmed from code:** Admins can manage dispatches, companies, access codes, announcements, template notes, availability, confirmations, and incident records.
- **Confirmed from code:** Company owners can view company-facing dispatches, edit their company availability, manage drivers, update trucks on existing dispatches from the drawer, manage their SMS preference, request access codes, and submit company profile changes for admin approval.
- **Confirmed from code:** Drivers can only see dispatches tied to their active `DriverDispatchAssignment` records, can mark dispatch/removal notifications as seen, can manage their own SMS opt-in, and can view/add incident updates to incidents they can access.
- **Confirmed from code:** Truck users can view dispatches filtered by their allowed trucks, confirm truck-level dispatch statuses, log time, and create/view incidents within their truck scope.
- **Confirmed from code:** Driver management UI is company-owner only, and truck / driver assignment controls in the dispatch drawer are primarily admin / owner capabilities.

### Access-code session behavior
- **Confirmed from code:** Access-code login uses `AccessCode.filter({ code })`, accepts the first active match, and rejects inactive or missing codes with “Invalid or inactive access code.”
- **Confirmed from code:** Successful login stores `access_code_id` in local storage and also stores workspace mode/company selection in local storage.
- **Confirmed from code:** On app load, the session layer restores the saved access code by ID, re-fetches the record, and discards the session if the record no longer exists or is inactive.
- **Confirmed from code:** Logout clears the access-code ID and workspace local-storage entries.
- **Likely inferred from code:** Access-code sessions are entirely client-restored; there is no separate server-side session check for access-code logins.

### Workspace / view switching behavior
- **Confirmed from code:** Workspace switching exists only when `getAvailableWorkspaces` yields more than one option, currently driven by `available_views` and `linked_company_ids` on the access code.
- **Confirmed from code:** Admin-capable access codes default to the admin workspace when multiple workspaces are available, unless a valid stored workspace selection exists.
- **Confirmed from code:** Switching workspaces immediately updates local storage and forces a hard redirect to `AdminDashboard` for admin mode or `Home` for company-owner mode.
- **Confirmed from code:** Company-owner workspace labels are company-specific; a multi-company admin/company-owner hybrid can switch into specific linked companies.
- **Needs manual verification:** Whether any non-admin/non-owner access codes are intentionally meant to support multiple workspaces beyond what current UI enforces.


### App shell / header / install prompt behavior
- **Confirmed from code:** A persistent shared header is rendered on all routed pages except `AccessCodeLogin`; it contains logo + title on the left and role/workspace identity on a second line.
- **Confirmed from code:** Header identity uses role icon + `getWorkspaceDisplayLabel(...)` output (for example admin/company workspace labels), and shows a workspace picker only when multiple workspace options are available.
- **Confirmed from code:** Header actions always include logout; notification bell and profile menu are shown for `Admin`, `CompanyOwner`, and `Driver` only.
- **Confirmed from code:** Admin navigation tabs in the header include `Dashboard`, `Dispatches`, `Availability`, `Confirmations`, `Incidents`, `Announcements`, `Companies`, `Access Codes`, and `Notes`.
- **Confirmed from code:** `InstallPromptBanner` is mounted app-wide (including login route) but suppresses itself in standalone mode and desktop-class environments; mobile/tablet eligible clients can see install guidance or prompt controls.
- **Needs manual verification:** Exact timing/frequency of install-prompt display across browsers and repeated visits.

### Dispatch lifecycle behavior
- **Confirmed from code:** Dispatch statuses used by the app are `Scheduled`, `Dispatch`, `Amended`, and `Cancelled`.
- **Confirmed from code:** Creating or editing a dispatch can trigger owner notifications, driver notifications, edit-lock changes, admin activity-log entries, and Google Drive HTML sync.
- **Confirmed from code:** Truck removals from a dispatch automatically deactivate related active `DriverDispatchAssignment` records for those removed trucks and notify affected drivers.
- **Confirmed from code:** Changing a dispatch status to `Amended` or `Cancelled` resets driver assignment receipt-confirmation fields (`receipt_confirmed_*`) on active driver assignments for that dispatch.
- **Confirmed from code:** Dispatches can be archived manually by admins or automatically when all assigned trucks have complete time logs on or before the dispatch date; archive reasons are recorded.
- **Confirmed from code:** Archived dispatches can be unarchived by admins; unarchiving clears archive metadata and clears the “finalized” Drive-sync marker.
- **Likely inferred from code:** Archived dispatches remain readable in the UI but are treated differently for history / sync finalization.

### Notification behavior
- **Confirmed from code:** Owner status notifications are one-notification-per-owner-per-dispatch-per-status using `dispatch_status_key = {dispatch}:{status}:{ownerId}` deduping.
- **Confirmed from code:** Owner notification required trucks are stored on the notification and later reconciled against current dispatch trucks and owner-allowed trucks to determine whether action is still needed.
- **Confirmed from code:** Informational owner notifications (`dispatch_update_info`) are separate from confirmation-required status notifications.
- **Confirmed from code:** Driver notifications use `driver_dispatch_update`; unread duplicates are deduped / collapsed by recipient, dispatch, type, and message.
- **Confirmed from code:** Driver “seen” notifications sent to owners use `driver_dispatch_seen` and are deduped by dispatch, driver identity, seen-kind, version key, and owner.
- **Confirmed from code:** Owner notifications can show as effectively read once all required trucks are confirmed, even if the stored `read_flag` is still false.
- **Confirmed from code:** Notifications lists for owners/drivers are filtered against dispatch visibility, with special handling so drivers still retain `driver_dispatch_update` entries.

### Confirmation behavior
- **Confirmed from code:** Confirmations are truck-level records tied to a `dispatch_id`, `truck_number`, and `confirmation_type` matching the dispatch status (`Dispatch`, `Amended`, or `Cancelled`).
- **Confirmed from code:** Owner “open confirmations” are not computed from dispatch records directly; they are derived from unresolved owner notifications plus missing matching truck confirmations.
- **Confirmed from code:** When trucks are added to a dispatch without changing status, owner notifications’ `required_trucks` can be expanded to include newly added trucks.
- **Confirmed from code:** Changing dispatch status reconciles owner notifications, marks stale status notifications read, and creates a new owner notification for the new status if needed.
- **Likely inferred from code:** Truck confirmations are the key preservation mechanism behind owner action badges and the admin confirmations page.

### Incident reporting behavior
- **Confirmed from code:** Incident reports can be created by Admin, CompanyOwner, and Truck users from the Incidents page UI; Driver users do not get the Incidents-page “Create Incident” button.
- **Confirmed from code:** Drivers can still initiate incident creation from `DispatchDetailDrawer` via the in-drawer **Report Incident** action, which navigates to `Incidents?create=1&fromDispatch=1&dispatchId=...` and includes dispatch/company context.
- **Confirmed from code:** In drawer-initiated incident creation, dispatch/company context is prefilled and truck prefill is conditional; truck is auto-prefilled only when a single clear truck can be resolved for the current session/dispatch.
- **Confirmed from code:** An incident can optionally link to a dispatch and always stores truck number, incident type, summary, reporter metadata, and timestamps.
- **Confirmed from code:** Restart time (`time_stopped_to`) can be added later; the UI explicitly tells users to save restart time before marking completed, but the mutation itself does not hard-block completion in code.
- **Confirmed from code:** Incident updates are separate records with their own author metadata and timeline ordering.
- **Needs manual verification:** Whether back-end validation prevents incident completion without restart time, since the front-end only warns and disables the button conditionally by UX.

### SMS-related behavior
- **Confirmed from code:** SMS delivery is attempted only for `Notification.recipient_type === 'AccessCode'`; non-access-code recipients are skipped and logged.
- **Confirmed from code:** Company-owner SMS requires both an opted-in owner access code and a valid SMS-designated company phone contact.
- **Confirmed from code:** Driver SMS requires three conditions simultaneously: owner enabled on the driver record, driver opted in, and a valid driver phone.
- **Confirmed from code:** Truck/admin access codes use their own `sms_enabled` and `sms_phone` directly, though admin profile copy says admin SMS is not enabled yet in current behavior.
- **Confirmed from code:** SMS send attempts are logged to `General` records as `sms_log` with statuses such as `skipped`, `sent`, `failed`, and webhook-updated delivery states.
- **Confirmed from code:** SMS provider integration is SignalWire, with a status webhook that updates the matching `General` log by `provider_message_id`.
- **Likely inferred from code:** Company owners and drivers are the primary intended SMS recipients for notification flows; admin SMS preference is stored for future support rather than active app behavior.

### Google Drive / screenshot / export behavior
- **Confirmed from code:** Every dispatch create/edit/archive flow attempts to sync truck-specific HTML records to Google Drive under a fixed Dispatch Records root folder.
- **Confirmed from code:** Sync creates one HTML file per truck, nested by company folder and truck folder, and deletes stale files whose `path_key` is no longer desired.
- **Confirmed from code:** Final archive sync marks records as `finalized` and stores `dispatch_html_drive_sync_finalized_at`; later normal syncs are skipped once a dispatch is both archived and finalized, unless explicitly allowed.
- **Confirmed from code:** Sync failures do not block dispatch save/archive; the dispatch is updated with failure metadata and the UI shows a warning toast.
- **Confirmed from code:** Dispatch-detail screenshots are generated client-side with `html2canvas`, excluding nodes marked with `data-screenshot-exclude="true"`, and either shared via `navigator.share` or downloaded as PNG.
- **Confirmed from code:** Screenshot creation is blocked while company owners are editing truck assignments in the drawer.
- **Needs manual verification:** Whether generated Drive HTML exactly matches screenshot-visible content in all browsers/device sizes.

### Archived / inactive / hidden data behavior
- **Confirmed from code:** Inactive access codes cannot be used to restore or start a session.
- **Confirmed from code:** Companies listed in the dispatch form are filtered to `status === 'active'`.
- **Confirmed from code:** Driver visibility commonly uses `active_flag !== false` for active assignments and current driver mapping.
- **Confirmed from code:** Notifications and confirmations linked to deleted dispatches are excluded from admin review lists by filtering against still-existing dispatch IDs.
- **Confirmed from code:** Driver assignment visibility for drivers depends on active `DriverDispatchAssignment` rows, not the dispatch’s `trucks_assigned` alone.
- **Likely inferred from code:** Archived dispatches are still present and queryable, but some workflows treat them as history rather than current work.

---

## B. Workflow Baseline

### Access code login
- **Confirmed from code:** User enters a raw access code on `AccessCodeLogin`.
- **Confirmed from code:** The code is looked up by exact `code` field; the first active match is used.
- **Confirmed from code:** On success, the session is stored locally and initial workspace is chosen from access-code capabilities.
- **Confirmed from code:** Admin-capable logins redirect to `AdminDashboard`; everyone else redirects to `Home`.
- **Needs manual verification:** Behavior when duplicate active `AccessCode.code` values exist, because the UI uses the first active match returned by the query.

### Session restore on refresh
- **Confirmed from code:** On refresh, the app reads `access_code_id` from local storage and re-fetches that access code.
- **Confirmed from code:** If the saved code is inactive or missing, local storage is cleared and the user is effectively logged out.
- **Confirmed from code:** Stored workspace selection is reused only if it still matches an available workspace for that access code.
- **Confirmed from code:** Otherwise, admin workspace is preferred, then the first available workspace.

### Switching between admin and company views
- **Confirmed from code:** Only multi-workspace sessions show the workspace selector.
- **Confirmed from code:** Changing the workspace immediately persists the choice and hard-redirects to the landing page for that workspace.
- **Confirmed from code:** Effective `session.code_type` is rewritten to `CompanyOwner` when an admin-capable access code is switched into company-owner mode.
- **Needs manual verification:** Cross-page state retention across workspace switches beyond local storage and query refetch behavior.

### Creating a dispatch
- **Confirmed from code:** Required fields depend on status. `Company`, `Date`, `Shift`, and `Trucks Assigned` are always required; detailed dispatch fields are required unless status is effectively a confirmation-only/scheduled case.
- **Confirmed from code:** Company choices are limited to active companies.
- **Confirmed from code:** Trucks already assigned to the same company/date/shift are treated as unavailable in the form.
- **Confirmed from code:** A newly created dispatch gets an admin activity-log entry, unlocked edit-lock fields, and then attempts Drive HTML sync.
- **Confirmed from code:** The notification layer treats creation as a status change from null to the selected status and can create owner notifications accordingly.
- **Likely inferred from code:** Creating a dispatch in `Scheduled` status is intentionally lighter-weight than `Dispatch` / `Amended` / `Cancelled`.

### Editing a dispatch
- **Confirmed from code:** Editing a dispatch first acquires a record-level edit lock tied to the current session.
- **Confirmed from code:** Saving an edit appends one admin activity-log entry chosen by change priority (status change first, then date, start time, trucks, instructions, notes, location, client, job, shift, else generic update).
- **Confirmed from code:** If the edit does not change status and does not add trucks, the form interrupts submission to ask whether to send an owner informational update with a short custom message.
- **Confirmed from code:** After save, owner notifications are reconciled, driver notifications may be sent, removed-truck driver assignments may be deactivated, and Drive sync is attempted.
- **Confirmed from code:** Edit locks are cleared when save succeeds.
- **Needs manual verification:** Edit-lock conflict handling across multiple live users, since static review shows acquisition/release flow but not full concurrent UX.

### Amending a dispatch
- **Confirmed from code:** Setting status to `Amended` requires an amendment reason in `canceled_reason`.
- **Confirmed from code:** On first transition into `Amended`, the form appends an `amendment_history` entry when location/time/instructions/trucks changed.
- **Confirmed from code:** Saving an amended dispatch resets all active driver assignment receipt-confirmation fields on that dispatch.
- **Confirmed from code:** Owners receive a new status notification and drivers receive amended-dispatch notifications.

### Cancelling a dispatch
- **Confirmed from code:** Setting status to `Cancelled` requires a cancellation reason in `canceled_reason`.
- **Confirmed from code:** Admin activity logging uses a specific `cancelled_dispatch` action when the new status is cancelled.
- **Confirmed from code:** Saving a cancelled dispatch resets active driver assignment receipt-confirmation fields.
- **Confirmed from code:** Owners receive cancelled status notifications and assigned drivers receive cancelled-dispatch notifications.
- **Likely inferred from code:** Cancelled dispatches still remain visible historically, rather than being deleted automatically.

### Assigning a driver
- **Confirmed from code:** Driver assignment happens in the dispatch detail drawer per truck.
- **Confirmed from code:** A driver cannot be assigned if they already have an active assignment on another same-company, same-date, same-shift dispatch whose status is not `Cancelled`.
- **Confirmed from code:** Assigning or replacing a driver creates/updates a `DriverDispatchAssignment` record with `receipt_confirmed_*` fields reset to false/null.
- **Confirmed from code:** Assignment changes append dispatch activity-log entries and send driver assignment notifications.
- **Confirmed from code:** After save, relevant dispatch and assignment queries are invalidated/refetched.

### Removing / replacing a driver
- **Confirmed from code:** Choosing the unassigned option marks the active assignment inactive rather than deleting it.
- **Confirmed from code:** Removing or replacing a driver generates specific dispatch activity-log messages (assigned, removed, changed from X to Y).
- **Confirmed from code:** Driver assignment-change notifications compare previous and next active assignments and notify removed drivers with `Dispatch Removed` and added drivers with `Dispatch Assigned`.
- **Likely inferred from code:** Historical driver assignments are preserved as inactive records for auditing.

### Truck assignment changes
- **Confirmed from code:** Admins can edit `trucks_assigned` from the main dispatch form; company owners can edit truck assignments from the drawer but must keep truck count exactly the same.
- **Confirmed from code:** Owner truck editing is a one-for-one replacement flow; if the truck count changes, the UI rejects the save and resets the draft trucks.
- **Confirmed from code:** Removing a truck from a dispatch deactivates any active driver assignment on that truck and sends driver removal notifications.
- **Confirmed from code:** Owner truck updates also handle conflicts with other dispatches and can trigger owner truck-reassignment notifications.
- **Needs manual verification:** Exact UX around owner swap confirmation and conflict resolution in all multi-dispatch edge cases.

### Notification sending rules
- **Confirmed from code:** Owner status notifications are created on status changes and require truck confirmations for the owner’s intersecting allowed trucks.
- **Confirmed from code:** Owner informational notifications are optional on non-status edits and require a custom message.
- **Confirmed from code:** When trucks are added without changing status, required-trucks expansion happens on current owner notifications instead of necessarily creating a fresh status notification.
- **Confirmed from code:** Driver notifications are sent for initial assignment, removal, amended/cancelled dispatch status changes, and general dispatch updates.
- **Confirmed from code:** Driver notifications are narrowed on truck-only edits so only drivers whose assigned truck list changed are notified.
- **Likely inferred from code:** Owner notification resolution is intentionally decoupled from `read_flag` and depends on confirmation completeness.

### Driver confirmation flow
- **Confirmed from code:** Drivers do not create `Confirmation` records; they mark dispatch/removal notifications as seen.
- **Confirmed from code:** Opening a dispatch as a driver triggers `markDriverDispatchSeenAsync`, which marks unread driver dispatch notifications read and stamps active assignment records with receipt-confirmed metadata.
- **Confirmed from code:** Driver removal acknowledgements similarly mark unread removal notifications read and notify owners that the driver saw the removal; dismissing the removed-assignment modal is treated as seen.
- **Confirmed from code:** Owners receive “driver seen” notifications keyed to dispatch/driver/version to avoid duplicates.
- **Needs manual verification:** Whether drivers consider “opening the dispatch drawer” sufficient acknowledgment in all UX cases, since that is how code currently records it.

### Incident report flow
- **Confirmed from code:** Incidents can be created from the Incidents page or prefilled from the dispatch drawer via query params (`create=1`, `fromDispatch=1`, `dispatchId`, `companyId`, `truckNumber`).
- **Confirmed from code:** Dispatch-linked incident creation pre-opens the create modal and prefills dispatch/company/truck where possible and allowed.
- **Confirmed from code:** Incident visibility is role-scoped: admins see all; truck users see incidents they reported; drivers see incidents they reported or incidents tied to their assigned dispatches; owners see incidents they reported or incidents for their company trucks.
- **Confirmed from code:** Incident detail allows adding updates, setting restart time, marking completed, and reopening.
- **Needs manual verification:** Whether additional back-end authorization limits exist beyond front-end filtering.

### Screenshot / dispatch copy / Drive sync flow
- **Confirmed from code:** Dispatch-detail screenshot captures a cloned drawer section plus a summary block and exports a PNG by share sheet or file download.
- **Confirmed from code:** “Copy Shift” in admin dispatches opens the dispatch form with copied values, clears amendment history/cancel reason semantics, and behaves like a new record.
- **Confirmed from code:** Drive sync runs after create/edit and on first archive finalization, using current dispatch/confirmation/time-entry/driver-assignment data.
- **Confirmed from code:** Sync metadata is written back onto the dispatch record after successful sync.
- **Needs manual verification:** Whether copied dispatches preserve every intended field exactly, since some copy behavior depends on form-level logic not exhaustively validated here.

### Availability-related workflows
- **Confirmed from code:** Availability is maintained through recurring weekly defaults and date-specific overrides, each per company and per `Day` / `Night` shift.
- **Confirmed from code:** Operational shifts are hard-coded: Monday–Friday have Day and Night, Sunday has Night only, Saturday has none.
- **Confirmed from code:** An override takes precedence over a recurring default; absent both, availability defaults to Available with no count limit.
- **Confirmed from code:** Available-truck count must be a whole number greater than 0 if provided.
- **Confirmed from code:** Admin availability can select any company; company-owner availability is limited to their current company.
- **Likely inferred from code:** Availability is advisory / planning data; direct dispatch-creation blocking based on availability was not confirmed in the inspected code.

### Announcements / portal visibility workflows
- **Confirmed from code:** Home shows only active announcements, filtered by `target_type` (`All`, `Companies`, `AccessCodes`) against the current session.
- **Confirmed from code:** Portal/Home dispatch lists are filtered differently by role: truck users by allowed trucks, drivers by active driver assignments.
- **Confirmed from code:** Notification, announcement, and dispatch cards route to the correct admin or portal destination depending on session role.
- **Likely inferred from code:** Announcement priority affects visual styling and display order but not routing or access.

---

## C. Role Matrix

| Role | View | Create | Edit | Confirm | Report | Receive notifications for | Receive SMS for | Switch into | Access in portal views |
|---|---|---|---|---|---|---|---|---|---|
| Admin | **Confirmed from code:** All admin pages, incidents, notifications, profile. | **Confirmed from code:** Dispatches, companies, access codes, announcements, template notes, scoring events, availability configs. | **Confirmed from code:** Dispatches, company records/reviews, access codes, announcements, availability, likely template notes. | **Confirmed from code:** Can review confirmations; **needs manual verification** whether admins directly create truck confirmations in UI. | **Confirmed from code:** Can create incidents and updates. | **Confirmed from code:** Admin notification stream if any records use `recipient_type: Admin`. | **Likely inferred from code:** Preference can be stored, but admin SMS delivery is described as not enabled yet. | **Confirmed from code:** Can switch between Admin and CompanyOwner workspaces when configured. | **Confirmed from code:** Not normally kept in portal routes; redirected to admin dashboard. |
| Company owner | **Confirmed from code:** Home, Portal, Availability, Drivers, Notifications, Incidents, Profile. | **Confirmed from code:** Drivers, incident reports, owner access codes (via profile), company profile change requests, truck reassignment changes in drawer. | **Confirmed from code:** Driver records, owner SMS preference, company profile request draft, truck swaps on dispatches, availability. | **Confirmed from code:** Truck-level confirmations for their allowed trucks from portal dispatches. | **Confirmed from code:** Can create incidents and updates. | **Confirmed from code:** Owner dispatch status notifications, optional dispatch update notifications, driver-seen notifications. | **Confirmed from code:** Yes, only when opted in and company SMS contact is valid. | **Confirmed from code:** Current company-owner workspace; possibly multiple linked companies if access code allows. | **Confirmed from code:** Yes. |
| Driver | **Confirmed from code:** Home, Portal, Notifications, Incidents, Profile, limited to assigned dispatch scope. | **Confirmed from code:** No Incidents-page create button; can still initiate incident creation from dispatch drawer `Report Incident` flow; can add incident updates. | **Confirmed from code:** Their own SMS opt-in only. | **Confirmed from code:** No truck confirmation records; they acknowledge by seeing assignments/removals. | **Confirmed from code:** Can add incident updates; drawer-initiated incident flow pre-fills truck only when uniquely resolvable (not guaranteed in multi-truck ambiguity). | **Confirmed from code:** Driver dispatch assigned/updated/amended/cancelled/removed notifications. | **Confirmed from code:** Yes, only if owner enabled + driver opted in + valid phone. | **Confirmed from code:** No workspace switching. | **Confirmed from code:** Yes, but only for assigned dispatches/trucks. |
| Truck user / portal user | **Confirmed from code:** Home, Portal, Incidents; no Notifications/Profile pages. | **Confirmed from code:** Incident reports and time entries. | **Confirmed from code:** Time entries only; no driver/profile/admin editing UI. | **Confirmed from code:** Yes, creates truck confirmations for visible trucks and current dispatch status. | **Confirmed from code:** Can create incidents and likely view incident details within scope. | **Likely inferred from code:** No dedicated notifications page/bell; status awareness comes mainly from portal dispatches. | **Confirmed from code:** Possible if truck access code has `sms_enabled` and `sms_phone`, but actual notification creation targets for trucks need manual verification. | **Confirmed from code:** No workspace switching. | **Confirmed from code:** Yes, for allowed trucks only. |

### Additional role notes
- **Confirmed from code:** `allowed_trucks` is the main filtering primitive for truck users and company owners.
- **Confirmed from code:** Driver visibility depends on `DriverDispatchAssignment`, not only `allowed_trucks`.
- **Needs manual verification:** Whether any hybrid access-code patterns beyond admin↔owner switching are used in production data.

---

## D. Logic-Sensitive Areas

### Dispatch assignment logic
- **Confirmed from code:** Removing trucks can cascade into inactive driver assignments and driver removal notifications.
- **Confirmed from code:** Owner truck swap logic can also affect a conflicting dispatch at the same time.
- **Risk note:** Small refactors could easily break multi-record consistency between dispatch trucks, driver assignments, and notifications.

### Notification targeting
- **Confirmed from code:** Owner notifications depend on overlapping `allowed_trucks`, current dispatch trucks, status-dedup keys, and notification categories.
- **Confirmed from code:** Driver notifications depend on active assignments, access-code lookup through driver records, and dedupe/update semantics.
- **Risk note:** This logic is cross-cutting and reused by save, edit, assignment, and seen flows.

### Confirmation reset logic
- **Confirmed from code:** Status changes to `Amended` or `Cancelled` reset driver assignment receipt-confirmation fields.
- **Confirmed from code:** Owner confirmation resolution is derived from notifications + confirmations rather than a single source of truth field.
- **Risk note:** It would be easy to accidentally preserve stale “seen” or “confirmed” state after edits.

### Access / session logic
- **Confirmed from code:** Local-storage restoration, workspace normalization, and effective session rewriting are tightly coupled.
- **Risk note:** Refactoring session shape or routing guards could accidentally change who lands on which page or which company context they see.

### Cross-role filtering
- **Confirmed from code:** Dispatch, incident, and notification visibility are all role-specific and not implemented in one single shared policy layer.
- **Risk note:** Similar-looking filters differ between truck, owner, and driver cases; consolidating without careful tests could change visibility.

### Visibility rules
- **Confirmed from code:** Hidden/archived/inactive behavior is implemented through a mix of query filtering, client filtering, and redirect rules.
- **Risk note:** UI extraction could accidentally broaden visibility to deleted-dispatch notifications, inactive codes, or out-of-scope incidents.

### Backend side effects
- **Confirmed from code:** Dispatch save/archive flows call side effects beyond CRUD: notifications, assignment deactivation, receipt resets, Drive sync, query invalidation, and toasts.
- **Confirmed from code:** SMS sending and webhook delivery tracking are separate side-effect systems attached to notification creation.
- **Risk note:** Any refactor that changes mutation ordering could create duplicate or missing side effects.

---

## E. Safer vs Riskier Refactor Areas

### 1. Safer to extract first (presentation / layout only)
- **Confirmed from code:** Pure visual wrappers and UI primitives under `src/components/ui/`.
- **Confirmed from code:** Static card/presentation components like announcement display, status badges, and non-mutating layout sections.
- **Likely inferred from code:** Read-only formatting helpers that do not decide permissions or side effects, such as display-only date/label formatting.

### 2. Medium risk
- **Confirmed from code:** Home-page composition and summary cards, because they combine filtering with presentation.
- **Confirmed from code:** Availability UI extraction, as long as recurring/override precedence and shift-operational rules remain untouched.
- **Confirmed from code:** Admin list/table layouts that render already-prepared data without changing mutation flow.
- **Likely inferred from code:** Notification list rendering components, provided owner effective-read logic remains centralized and unchanged.

### 3. High risk / should not be touched without deeper review
- **Confirmed from code:** `useAccessSession` / workspace utilities / layout redirects.
- **Confirmed from code:** Dispatch save/edit/archive mutation flow in `AdminDispatches`.
- **Confirmed from code:** Driver-assignment mutations and related drawer logic.
- **Confirmed from code:** Notification creation / reconciliation helpers in `createNotifications`.
- **Confirmed from code:** Owner notification status derivation and open-confirmation derivation.
- **Confirmed from code:** Incident visibility filtering across roles.
- **Confirmed from code:** SMS eligibility + sending + webhook status tracking.
- **Confirmed from code:** Google Drive HTML sync and finalized-archive behavior.

---

## F. Manual Verification Checklist

### Authentication / session / workspace
- [ ] Log in with an inactive, invalid, and valid access code; verify only valid active codes succeed. **Confirmed from code / needs runtime verification.**
- [ ] Refresh after login; verify the session restores and the same workspace/company remains selected when still allowed. **Confirmed from code / needs runtime verification.**
- [ ] Switch from Admin to Company Owner workspace and back; verify redirects and company context are correct. **Confirmed from code / needs runtime verification.**
- [ ] Disable an access code in admin data, refresh, and verify the session is cleared. **Confirmed from code / needs runtime verification.**

### Dispatch lifecycle
- [ ] Create dispatches in each status (`Scheduled`, `Dispatch`, `Amended`, `Cancelled`) and verify required fields match current form behavior. **Confirmed from code / needs runtime verification.**
- [ ] Edit a dispatch without changing status and choose both notification paths (send informational update vs skip). **Confirmed from code / needs runtime verification.**
- [ ] Amend a dispatch and verify amendment history, owner notifications, and driver receipt reset behavior. **Confirmed from code / needs runtime verification.**
- [ ] Cancel a dispatch and verify cancellation reason requirement, owner notification, and driver receipt reset behavior. **Confirmed from code / needs runtime verification.**
- [ ] Delete a dispatch and verify linked notifications/confirmations disappear from review surfaces. **Confirmed from code / needs runtime verification.**
- [ ] Archive and unarchive a dispatch and verify archive metadata plus final Drive sync behavior. **Confirmed from code / needs runtime verification.**

### Truck / driver assignment workflows
- [ ] Assign a driver to a truck, then remove the driver, then replace the driver; verify activity log and driver notifications each time. **Confirmed from code / needs runtime verification.**
- [ ] Attempt to assign the same driver to two same-shift dispatches and verify the conflict block. **Confirmed from code / needs runtime verification.**
- [ ] Remove a truck from a dispatch and verify active driver assignments on that truck are deactivated and the driver receives a removal notification. **Confirmed from code / needs runtime verification.**
- [ ] As a company owner, replace trucks one-for-one and verify count-preservation enforcement. **Confirmed from code / needs runtime verification.**
- [ ] Exercise owner truck swap conflicts between two dispatches and confirm both dispatches end in the current expected state. **Needs manual verification.**

### Notifications / confirmations / SMS
- [ ] Verify owner notifications appear once per dispatch-status-owner combination and do not duplicate on repeated saves. **Confirmed from code / needs runtime verification.**
- [ ] Confirm trucks from portal as truck/owner users and verify owner notification badges/counts resolve correctly. **Confirmed from code / needs runtime verification.**
- [ ] Add a truck to an existing dispatch without changing status and verify owner required-truck expectations expand correctly. **Confirmed from code / needs runtime verification.**
- [ ] Open a driver dispatch notification and verify it marks notifications read, stamps assignment receipt fields, and sends owner “driver seen” notification. **Confirmed from code / needs runtime verification.**
- [ ] Test SMS eligibility combinations: owner opted out, invalid company phone, driver owner-disabled, driver opted out, valid opted-in recipient. **Confirmed from code / needs runtime verification.**
- [ ] Verify SignalWire webhook updates `sms_log` records from sent to delivered/failed states. **Confirmed from code / needs runtime verification.**

### Incidents
- [ ] Create an incident from the Incidents page and from a dispatch drawer; verify prefilled dispatch/company/truck behavior. **Confirmed from code / needs runtime verification.**
- [ ] Verify each role only sees incidents within its current scope. **Confirmed from code / needs runtime verification.**
- [ ] Add updates, save restart time, mark completed, and reopen an incident. **Confirmed from code / needs runtime verification.**
- [ ] Try to mark an incident completed without restart time to confirm whether the current system truly blocks it or only warns. **Needs manual verification.**

### Availability / announcements / profile
- [ ] Verify recurring availability defaults and date overrides resolve with override precedence. **Confirmed from code / needs runtime verification.**
- [ ] Verify Friday summary boxes include Sunday night and Monday shifts while non-Friday behavior shows tomorrow only. **Confirmed from code / needs runtime verification.**
- [ ] Verify announcement filtering by `All`, `Companies`, and `AccessCodes`. **Confirmed from code / needs runtime verification.**
- [ ] Verify company-owner profile edits create pending requests without changing live company data until admin review. **Confirmed from code / needs runtime verification.**
- [ ] Verify driver and owner SMS preference changes sync the related access-code SMS fields as currently implemented. **Confirmed from code / needs runtime verification.**

### Drive / export / screenshot
- [ ] Verify dispatch create/edit/archive triggers the current Drive sync behavior and file naming/folder placement. **Confirmed from code / needs runtime verification.**
- [ ] Verify stale Drive files are removed when trucks are removed or renamed in the current record set. **Confirmed from code / needs runtime verification.**
- [ ] Verify dispatch screenshot output excludes interactive controls marked for exclusion and works on both share-capable and non-share browsers. **Confirmed from code / needs runtime verification.**

---

## Final Section

### 1. Top 10 app behaviors that must not change
1. **Access-code login must continue to restore and invalidate sessions exactly as it does now.**
2. **Workspace switching must preserve admin/company-owner context and redirect destinations exactly as now.**
3. **Dispatch status changes must continue to drive owner notifications, driver notifications, and receipt resets.**
4. **Truck confirmation logic must continue to resolve owner action state from notifications + confirmations.**
5. **Driver visibility must remain based on active driver assignments, not broad company access.**
6. **Removing trucks must continue to deactivate related active driver assignments and notify affected drivers.**
7. **Owner truck edits must preserve one-for-one truck count behavior.**
8. **Incident visibility must remain role-filtered exactly as currently implemented.**
9. **SMS eligibility must keep the current owner/driver opt-in rules and logging behavior.**
10. **Drive sync must remain best-effort, non-blocking to dispatch saves, with archive finalization semantics intact.**

### 2. Top 10 highest-risk areas
1. `createNotifications` cross-role notification logic.
2. `AdminDispatches` save/edit/archive mutation flow.
3. Dispatch drawer driver-assignment and owner truck-swap logic.
4. Session/workspace restoration and routing guards.
5. Owner effective-read / pending-confirmation derivation.
6. Driver receipt-confirmation reset and “seen” flows.
7. Incident role-based filtering rules.
8. SMS eligibility + send + webhook status chain.
9. Google Drive HTML sync and finalized archive handling.
10. Any filtering that mixes `allowed_trucks`, `company_id`, and active assignment state.

### 3. Recommended order for creating page-level baselines next
1. **AdminDispatches** — highest side-effect density and dispatch lifecycle risk.
2. **Portal / DispatchDetailDrawer** — truck confirmations, driver assignments, screenshots, time logs.
3. **Notifications + notification helpers** — owner pending logic and driver seen flows.
4. **Incidents** — role filtering and completion/update workflow.
5. **Profile** — owner profile requests, access-code generation, SMS consent sync.
6. **Drivers** — owner-managed driver lifecycle and SMS state.
7. **AdminAccessCodes** — workspace permissions and cross-role access setup.
8. **AdminCompanies** — company status, pending profile review, and scoring side effects.
9. **Availability / AdminAvailability** — recurrence and override rules.
10. **Home / AdminConfirmations / AdminAnnouncements** — lower mutation risk, still important for visibility baselines.

## Implementation Note (Post-Refactor)

Internal structure has been refactored into shared helpers/services.

All behaviors defined in this document remain unchanged; refactor was structural only.

Logic may now be located in shared modules instead of page components.
