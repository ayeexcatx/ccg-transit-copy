 # CCG Dispatch Hub # 
---------------------------------------------------------------------

CCG Dispatch Hub is a dispatch management system built for CCG Transit using Base44 and React. It supports daily dispatch operations across administrators, company owners, and drivers.

The repository contains the frontend application code synchronized with Base44 through GitHub.
Base44 entities and backend configuration are managed within the Base44 platform and are not stored in this repository.

View and Edit  your app on [Base44.com](http://Base44.com) 

This project contains everything you need to run your app locally.
---------------------------------------------------------------------

#Overview#

The CCG Dispatch Hub manages the full operational lifecycle of dispatch logistics, including:
- Dispatch creation and assignment
- Company availability scheduling
- Dispatch confirmations
- Driver assignment workflows
- Time entry logging
- Incident reporting and tracking
- Company announcements
- Notification workflows (in-app + optional SMS delivery)
- Dispatch record archival and HTML sync to Google Drive
- Guided tutorials for company owners and dispatch drawer workflows

The system is designed for real-time operational visibility between dispatch administrators and transportation companies.
---------------------------------------------------------------------

#Key Features#

** Dispatch Management **
1. Administrators can:
- Create, edit, and cancel dispatches
- Assign dispatches to companies and trucks
- Manage multiple truck assignments
- Archive completed dispatches
- Track confirmations and time entries
- Duplicate or copy dispatch information
- Maintain dispatch template notes
- Dispatch records also support automated HTML record generation for external documentation storage.

** Dispatch Portal **
1. The dispatch portal provides company-facing views including:
- Today's dispatches
- Upcoming dispatches
- Historical dispatches
2. Portal functionality includes:
- Truck-specific filtering
- Driver assignment filtering
- Dispatch confirmation workflows
- Time entry logging
- Dispatch detail drawer view
- Deep linking via URL parameters

** Availability Management **
1. Availability is tracked at the company level rather than individual trucks.
2. Supported features include:
- Day, week, and month views
- Recurring weekly availability defaults
- Date-specific availability overrides
- Day shift and night shift tracking
- Optional truck count limits
3. Override rules always take priority over recurring defaults.

** Driver Management **
1. Company owners can manage drivers by:
- Creating and editing driver records
- Storing phone numbers and notes
- Marking drivers active or inactive
- Assigning drivers to dispatches
- Requesting driver access codes
2. Driver access allows dispatch filtering based on DriverDispatch records.

** Incident Management **
1. Incident tracking supports operational reporting across all roles.
2. Features include:
- Incident creation linked to dispatches
- Truck and company associations
- Incident update history
- Downtime tracking
- Status tracking (open/closed)
- Incident timeline updates

** Notifications **
1. Notification logic allows the system to deliver operational alerts including:
- Dispatch updates
- Confirmation reminders
- Assignment notifications
- System announcements
- Optional SMS delivery through SignalWire for AccessCode recipients
- SMS delivery logging in General entity records
2. Notifications are role-aware and filtered by recipient.

** Announcement System **
1. Administrators can publish operational announcements to:
- All users
- Specific roles
- Company owners
2. Announcements appear in user dashboards and portal views.

** Runtime Refresh System **
1. The app includes a runtime version refresh mechanism controlled by AppConfig.
2. This allows administrators to force active users to reload the application when important updates are deployed.

** Tutorial System **
1. Guided tutorials are available for company owner onboarding and dispatch drawer actions.
2. Tutorial overlays are role-aware and can be replayed from in-app tutorial triggers.
---------------------------------------------------------------------

# User Roles #
The application is role-based and dynamically adjusts visibility and workflows.

** Admin **
1. Admins have access to the full operational dashboard including:
- Dashboard
- Dispatches
- Availability Management
- Confirmations
- Incidents
- Announcements
- Companies
- Access Codes
- Template Notes
2. Admins control dispatch lifecycle and system configuration.

** Company Owner **
1. Company owners manage their company's participation in dispatch operations.
2. Accessible pages include:
- Home
- Dispatch Portal
- Availability
- Drivers
- Notifications
- Incidents

** Driver User **
1. Driver users have a limited interface showing dispatches assigned to them.
2. Accessible pages include:
- Home
- Dispatch Portal
- Incidents
3. Driver views rely on DriverDispatch records.
---------------------------------------------------------------------

# System Architecture #

** Frontend **
1. The frontend application is built using:
- React
- Vite
- React Router
- TanStack Query
- Tailwind CSS
- Radix UI
- Lucide Icons
- date-fns
- Sonner notifications

** Backend **
1. The backend is provided by Base44, which handles:
- Data entities
- Query endpoints
- Base44-authenticated user sessions with in-app access-code linking
- API services
- Entity filtering and sorting
- Serverless function execution (Deno)
- Connector-based integrations (for example Google Drive sync)
---------------------------------------------------------------------

# Base44 Entities #
** The application expects the following Base44 entities to exist: **
1. AccessCode
2. Announcement
3. AppConfig
4. Company
5. CompanyAvailabilityDefault
6. CompanyAvailabilityOverride
7. Confirmation
8. Dispatch
9. DispatchTemplateNotes
10. Driver
11. DriverDispatch
12. General
13. IncidentReport
14. IncidentUpdate
15. Notification
16. TimeEntry
** These entities are not included in the GitHub repository. **
** They must exist in the connected Base44 application. **
---------------------------------------------------------------------

# Dispatch Filtering Logic#

1. Dispatch visibility is determined using a combination of:
- Company association
- Truck assignments
- Driver assignments
- Dispatch status
- Archive state
2. Typical filtering behavior:
| Role          | Dispatch visibility                            |
| ------------- | ---------------------------------------------- |
| Admin         | All dispatches                                 |
| Company Owner | Dispatches assigned to company trucks          |
| Driver        | Dispatches assigned through driver assignments |
 ------------------------------------------------------------------


# Project Structure #

src
 ├── api
 │    └── base44Client.js
 │
 ├── components
 │    ├── admin
 │    ├── announcements
 │    ├── availability
 │    ├── notifications
 │    ├── portal
 │    ├── session
 │    ├── tutorial
 │    └── ui
 │
 ├── hooks
 ├── lib
 ├── pages
 ├── utils
 ├── Layout.jsx
 ├── pages.config.js
 └── main.jsx

functions
 ├── sendNotificationSms
 └── syncDispatchHtmlToDrive
-------------------------------------------------------------------

** Key files **

[pages.config.js]
Defines route structure and role-based navigation.

[SessionContext.jsx]
Handles linked access-code session state and workspace selection for authenticated users.

[DispatchDetailDrawer.jsx]
Main dispatch detail interface used across multiple pages.

[AvailabilityManager.jsx]
Implements company availability logic.

[dispatchDriveSync.js]
Builds dispatch HTML files and keeps dispatch record snapshots synchronized to Google Drive folders.

[notificationSmsDelivery.js]
Processes notification SMS eligibility, sends SMS through the backend function, and writes delivery logs.

[NewVersionBanner.jsx]
Checks AppConfig runtime version updates and prompts active users to reload when a new version is published.
---------------------------------------------------------------------

# Core Workflows #

** Dispatch Creation **
1. Admin creates a dispatch
2. Dispatch is assigned to one or more trucks
3. Truck users receive the dispatch in their portal
4. Trucks confirm assignment
5. Drivers perform work
6. Time entries are logged
7. Dispatch is archived once complete

** Dispatch Confirmation **
Truck users confirm assignments through the dispatch portal.
Confirmations are tracked in the Confirmation entity.


** Time Entry Logging **
Drivers or truck users log operational time entries tied to dispatches.
Entries are stored in the TimeEntry entity.

** Incident Reporting **
Incidents can be created by multiple roles and linked to dispatches.
Incident updates maintain an event history.
---------------------------------------------------------------------

# Local Development #

** Requirements **
- Node.js
- npm
- Base44 account with access to the linked app

** Installation **
1. Clone the repository:
git clone [https://github.com/ayeexcatx/base44-ccg-dispatch-hub]
2. Install dependencies:
`npm install`

** Environment Variables **
Create a .env.local file:
[VITE_BASE44_APP_ID=your_app_id]
[VITE_BASE44_APP_BASE_URL=your_base44_backend_url]

** Base44 Secrets / Connectors **
1. For SMS delivery, configure these Base44 secrets for SignalWire:
[SIGNALWIRE_PROJECT_ID]
[SIGNALWIRE_AUTH_TOKEN]
[SIGNALWIRE_SPACE_URL]
[SIGNALWIRE_FROM_PHONE]
2. For dispatch HTML sync, connect the Google Drive connector in Base44 and ensure the root folder is accessible.

** Run Development Server **
`npm run dev`

** Build for Production **
`npm run build`
- Preview build:
`npm run preview`
---------------------------------------------------------------------

# Available Scripts ** #
`npm run dev`
`npm run build`
`npm run preview`
`npm run lint`
`npm run lint:fix`
`npm run typecheck`
---------------------------------------------------------------------

# Publishing #

1. This project is synchronized with Base44's GitHub integration.
2. When code is pushed to GitHub:
- Base44 syncs the repository
- Changes appear in the Base44 builder
- Final publishing occurs through Base44
---------------------------------------------------------------------

# Troubleshooting #

** GitHub Sync Stuck **
If Base44 appears stuck syncing:
- Verify GitHub merge completed
- Refresh Base44 builder
- Log out and back in
- Trigger a manual sync from the Base44 interface

** Missing Entities **
If the app throws entity errors:
Ensure all required entities exist in Base44.
GitHub does not contain entity definitions.
---------------------------------------------------------------------

# Future Improvements #

** Potential future additions include: **
- Advanced dispatch analytics
- Driver mobile interface improvements
- Automated incident escalation workflows
- SMS template customization by role or notification type
---------------------------------------------------------------------

# References #

Base44 GitHub integration documentation:
[https://docs.base44.com/Integrations/Using-GitHub]


## Recent Refactor Summary (March 2026)

Purpose: improve maintainability and reduce duplication.

There were no intended behavior changes.

Key systems stabilized:
- notifications
- dispatch lifecycle
- confirmations
- SMS logic
- visibility rules
- deep-link handling

> ⚠️ Future changes to these systems should reference:
> - `docs/refactor-safety-rules.md`
> - baseline docs in `/docs`
