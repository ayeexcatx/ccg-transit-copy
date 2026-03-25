# **App Baseline – Global Access & Admin Dashboard**

---

## **1\. Application Entry (Login Page)**

* Navigating to **app.ccgnj.com** (desktop or mobile) directs the user to the **Access Code Login Page**
* Users must enter a valid **access code** to log in
* **Mobile behavior:** A popup appears suggesting the user install the app, including instructions
* **Desktop behavior:** No install prompt is shown

---

## **2\. Admin User Flow**

* Logging in as an **Admin** routes the user to the **Admin Dashboard** by default

---

## **3\. Global Header (All Pages)**

* A **persistent header** is displayed across all pages and does not change
* **Left side:**
  * Company logo
  * Line 1: Company name
    * Admin → always “CCG Transit”
    * Company Owner → their company name
    * Driver → their assigned company
  * Line 2: Workspace identity label (usually user name). For Admin view this is shown as `Name (Admin)`; company owner/driver/truck views show role-specific identity labels without exposing internal workspace fields.
  * Note: added after code-backed review (2026-03-24).
* **Right side:**
  * Notification bell
  * Menu button (contains Profile)
  * Logout button

---

## **4\. Admin Navigation**

* Pages available in the navigation bar:
  * Dashboard
  * Dispatches
  * Availability
  * Confirmations.
  * Incidents
  * Announcements
  * Companies
  * Access Codes
  * Notes
* **Expected backend route names:**
  * AdminDashboard
  * AdminDispatches
  * AdminAvailability
  * AdminConfirmations
  * Incidents
  * AdminAnnouncements
  * AdminCompanies
  * AdminAccessCodes
  * AdminTemplateNotes

---

## **5\. Admin Dashboard**

### **5.1 Top Summary Cards (4 total)**

* **Pending Confirmations:** Shows number of pending confirmations → navigates to Admin Confirmations page
* **Create Dispatch:** Quick action to create a new dispatch
* **Today’s Dispatches:** Shows assigned trucks for day shift and night shift → navigates to Admin Dispatches
* **Upcoming Dispatches:** Shows next operational truck counts (day \+ night)
* **Weekend rollover logic:**
  * If today is **Friday, Saturday, or Sunday**, show **Monday’s** day/night totals instead of the next calendar day
  * If Sunday night dispatches exist, display a Sunday-night indicator
  * Note: updated after code-backed review (2026-03-24).

---

### **5.2 Active Announcements**

* Displays **all active announcements**, regardless of audience or user role
* Purpose: allows admins to see what is currently visible across user homepages
* Each announcement shows:
  * Audience
  * Date added
* This is effectively a **global version** of the user announcements center

---

### **5.3 Quick Actions**

* **Manage Dispatches** → Admin Dispatches
* **Manage Companies** → Admin Companies
* **Access Codes** → Admin Access Codes
* **Template Notes** → Admin Template Notes

---

### **5.4 Force App Refresh**

* A dedicated card with a **Force App Refresh** button
* Admin must enter a valid active **Admin access code** in a confirmation modal before the refresh trigger continues
* Triggering refresh rotates a runtime version token in app config
* Client sessions compare their runtime version to the latest token and show a blocking refresh/update prompt on mismatch
* Note: updated after code-backed review (2026-03-24).

---

## **6\. Scope Note**

* This section covers **Admin Dashboard behavior only**
* Other admin pages will be defined separately

# **Admin Dispatches Page Baseline**

---

## **1\. Top Controls**

* **Filters Button**
  * Allows filtering by:
    * Status
    * Company
    * Truck Number
    * Job Number or Reference Tag
    * Date or Date Range
* **New Dispatch Button**
  * Opens the **Create Dispatch modal**

---

## **2\. Create / Edit Dispatch Modal**

### **2.1 Default State (Scheduled)**

* Default status: **Scheduled**
* Required fields (marked with asterisk):
  * Company
  * Date
  * Shift (Day Shift or Night Shift)
* Additional fields:
  * Copy Details From (reuse previous dispatch details)
  * Trucks Assigned (populates after selecting a company)

---

### **2.2 Status: Dispatched**

* Expands modal to include assignment details
* **Assignment 1 fields:**
  * Job Number (required)
  * Start Time
  * Start Location
  * Instructions
  * Toll Status
  * Reference Tag
  * Notes
* **Add Assignment Button**
  * Adds additional assignment sections with the same fields
* Bottom actions:
  * Cancel
  * Create Dispatch / Update Dispatch

---

### **2.3 Status: Amended**

* Same fields as **Dispatched**, plus:
  * **Amendment Reason (required)**

---

### **2.4 Status: Canceled**

* Same fields as **Dispatched**, plus:
  * **Cancellation Reason (required)**

---

### **2.5 Status Definitions**

* **Scheduled:** Work is planned, but full details are not yet available
* **Dispatched:** Full job details and instructions are available
* **Amended:** Changes were made to an existing dispatch (time, location, instructions, etc.)
* **Canceled:** Job is no longer moving forward
* Key distinction:
  * Same job with changes → **Amended**
  * Job no longer happening → **Canceled**

---

### **2.6 Create / Update Dispatch Behavior**

* Button label:
  * **Create Dispatch** (new)
  * **Update Dispatch** (existing)
* When submitted:
  * Dispatch is created/updated in system
  * Dispatch detail drawer becomes available
  * Dispatch is synced to **Google Drive**
  * Dispatch becomes visible to the selected company
* Notifications:
  * Company owner receives:
    * New dispatch or updated dispatch notification
  * Assigned drivers (if any) receive:
    * Corresponding notification based on status

---

### **2.7 Editing Without Status Change**

* Admin is prompted:
  * Whether to send a notification
  * If yes → must enter a **custom message (character-limited)**
* Notification behavior:
  * Company owner sees custom message
  * Drivers (if assigned) receive:
    * Generic “Dispatch Updated” notification

---

### **2.8 Special Notification Exception**

* If the **only change** is:
  * Adding a truck number
* Then:
  * No prompt is shown
  * Notification is automatically sent to company owner

---

### **2.9 Dispatch Locking**

* While a dispatch is being edited:
  * It is **locked**
  * Other admin users cannot open/edit it

---

### **2.10 Truck Assignment Rules**

* A truck number:
  * Can only be assigned **once per shift per day**
* Allowed:
  * Same truck → Day Shift and Night Shift (same day)
* Not allowed:
  * Same truck assigned to multiple dispatches within the same shift
* System behavior:
  * If conflict exists → admin is **blocked from selecting that truck**

---

## **3\. Tab Navigation**

* **Live Dispatch Board**
* **Today (with count)**
* **Upcoming (with count)**
* **History (with count)**

---

## **4\. Live Dispatch Board**

### **4.1 Controls**

* Date selector with:
  * Left arrow → previous date
  * Right arrow → next date
* Search bar:
  * Supports Job Number, Truck Number, Driver

---

### **4.2 Layout**

* Two sections:
  * Day Shift
  * Night Shift
* Dispatches are:
  * **Grouped by Job Number** (within same date \+ shift)

---

### **4.3 Job Group Details**

Each group contains:

* Individual truck entries with:
  * Truck Number
  * Start Time
* **Live Status Dropdown (per truck):**
  * Default: Running
  * Options:
    * Broken Down
    * Delayed
    * At Plant
    * Switched
    * Waiting
    * Off-Route
    * Other

---

### **4.4 Slot Management**

* **Plus Slot (+)**
  * Adds open slot (requested truck not yet assigned)
* **Minus Slot (-)**
  * Removes open slot
* Applies to both:
  * Day Shift and Night Shift

---

## **5\. Today Tab**

* Displays all dispatches for the current day as **dispatch cards**

---

### **5.1 Dispatch Card Details**

**Left side:**

* Status
* Shift
* Date
* Start Time
* Client
* Job Number
* Company
* Truck Numbers

**Right side (Actions):**

* Preview → opens Dispatch Detail Drawer
* Copy Shift → copies all data except:
  * Company
  * Date
  * Status
  * Trucks Assigned
* Archive → moves dispatch to History
* Edit → locked to one admin at a time
* Delete → requires:
  * Confirmation modal
  * Admin must enter access code

---

### **5.2 Activity Summary**

* Shows last activity:
  * Action performed
  * User who performed it
  * Timestamp
* Examples:
  * Dispatch created
  * Dispatch canceled
  * Trucks changed by company owner

---

## **6\. Google Drive Sync Logic**

* Triggered on:
  * Create
  * Edit
  * Archive

---

### **6.1 Folder Structure**

* Predefined root folder (via folder ID)
* Auto-creates:
  * Company folder (if not exists)
  * Truck folder inside company (if not exists)

---

### **6.2 File Creation**

* Generates **HTML file per dispatch per truck**
* Naming format:
  * Date\_TruckNumber\_JobNumber.HTML
* File must be downloaded to view properly

---

### **6.3 Sync Behavior**

* Always updates latest dispatch version
* If a truck is removed:
  * Corresponding file is **deleted**
* On archive:
  * Final version is synced

---

### **6.4 HTML Template Contents**

* Status
* Dispatch Date
* Client
* Shift
* Reference Tag
* **Hauler Info:**
  * Company
  * Truck Number
  * Driver (if assigned)
* **Assignments:**
  * Job Number
  * Start Time
  * Start Location
  * Instructions
  * Toll Status
  * Notes
  * Repeated for multiple assignments
* **Confirmations:**
  * Truck Number
  * Dispatch type (Dispatched / Amended / Canceled)
  * Confirmed by
  * Timestamp
* Time Log (if recorded)
* Activity Log
* Generated timestamp (record creation time)

---

## **7\. Dispatch Detail Drawer (Admin View)**

### **7.1 Header**

* Back button (top left)
* Status badge, shift, date (includes day of week)

---

### **7.2 Dispatch Info**

* Client
* Job Number
* Static message: “Working for CCG Transit”
* Truck numbers with:
  * Driver name (if assigned)
  * Seen status badge

---

### **7.3 Conditional Section**

* Shows only if applicable:
  * Amendment Reason
  * Cancellation Reason

---

### **7.4 Assignments Section**

* Displays:
  * Start Time
  * Start Location
  * Instructions
  * Notes
  * Toll Status
  * Reference Tag
* Multiple assignments appear as separate sections

---

### **7.5 Notes Sections**

* **Box Notes** (from Admin Template Notes)
* **General Notes** (from Admin Template Notes)
* Both:
  * Standard across all dispatches
  * Visible to all users

---

### **7.6 Confirmations Log**

* Card per truck number
* Shows:
  * Status confirmations
  * User who confirmed
  * Timestamp

---

### **7.7 Time Log**

* Entered by company owner
* Shows:
  * Whether time was logged
  * Logged data per truck

---

### **7.8 Activity Log (Admin Only)**

* Includes:
  * Dispatch edits
  * Driver assignments
  * All changes with timestamps
* Only visible to **admins**

---

## **8\. Upcoming Tab**

* Same structure and logic as **Today tab**

---

## **9\. History Tab**

* Same structure and logic as Today/Upcoming
* Behavior:
  * At **12:00 AM**, Today’s dispatches move to History
* Important:
  * Dispatches are **not automatically archived**
  * Admin must manually archive them

# **Admin Availability Page Baseline**

---

## **1\. Top Summary Cards**

* Four cards displayed at the top:
  * Today Day Shift
  * Today Night Shift
  * Tomorrow Day Shift
  * Tomorrow Night Shift
* **Friday logic:**
  * Displays additional cards to include:
    * Sunday Night
    * Monday Day
    * Monday Night

---

### **1.1 Card Data Structure**

Each card displays three main columns:

* Left: **Total Trucks Available**
* Middle: **Dispatched Trucks**
* Right: **Remaining Trucks**

---

### **1.2 Company Breakdown**

* Under each card:
  * Availability is further broken down **by company**
  * Each company shows:
    * Total available
    * Dispatched
    * Remaining

---

## **2\. Company Availability Selector**

* Admin can:
  * Search for a company
  * Select a company from a dropdown
* Once selected:
  * Displays that company’s **availability calendar**

---

## **3\. Availability Calendar**

### **3.1 View Modes**

* **Day View**
  * Centers on today
  * Displays:
    * Yesterday
    * Today
    * Tomorrow
  * Includes navigation arrows (move day-by-day)
* **Week View (Default)**
  * Displays full week:
    * Sunday through Saturday
* **Month View**
  * Displays entire month

---

### **3.2 Calendar Structure**

* Organized by **day**
* Displays actual date numbers based on selected view
* Each day includes:
  * Day Shift
  * Night Shift

---

### **3.3 Day Override Editing**

* Clicking a day opens **Edit Day Override modal**
* Modal includes:
  * Date
* **Day Shift Section:**
  * Status dropdown:
    * Available
    * Unavailable
  * Available Trucks (optional but strongly encouraged)
* **Night Shift Section:**
  * Same fields as Day Shift:
    * Status (Available / Unavailable)
    * Available Trucks (optional)
* User can save changes and continue editing other days

---

## **4\. Recurring Weekly Defaults**

* Section located below the calendar
* Displays:
  * Days of the week (Monday–Sunday)
  * Two columns:
    * Day Shift
    * Night Shift
* Shows default availability:
  * Yes (available)
  * No (unavailable)

---

### **4.1 Edit Weekly Defaults**

* Clicking **Edit Defaults** opens modal
* Modal structure:
  * Each day (row)
  * Two columns:
    * Day
    * Night
* User selects availability via checkboxes for each shift
* Saved values become:
  * **Weekly default availability**

---

## **5\. Availability Logic**

* **Weekly Defaults**
  * Represent the **standard recurring schedule**
  * What a company is typically available for every week
* **Calendar Overrides**
  * Used for:
    * Specific dates
    * Short-term adjustments
  * Allows input of:
    * Exact number of available trucks
* Intended workflow:
  * Defaults \= baseline
  * Calendar \= real-time adjustments

---

## **6\. Admin Role Behavior**

* Admin does **not create availability for themselves**
* Availability data is:
  * Entered by **company owners**
* Admin capabilities:
  * View all company availability
  * Edit/update availability if needed

# **Admin Confirmations Page Baseline**

---

## **1\. Page Structure**

* The page consists of **two sections:**
  * Open Confirmations
  * Confirmation History Log

---

## **2\. Open Confirmations**

* Displays all **pending confirmations**
* Only includes confirmations required from **company owners**

---

### **2.1 Purpose**

* Tracks whether company owners have:
  * Received
  * Acknowledged
  * Confirmed dispatches or dispatch updates
* Background logic:
  * Every time a dispatch is:
    * Created, or
    * Updated with a status change
  * A **Confirm Receipt button** is generated for each truck number
  * Company owner must confirm each truck individually

---

### **2.2 Row Data**

Each row includes:

* Company
* Dispatch Date
* Truck Number
* Client
* Job Number
* Dispatch Status

---

### **2.3 Time Tracking Fields**

* Instead of “Confirmed” / “Confirmed By” (used in history), this section shows:
* **Notification Time**
  * Timestamp of when the notification was sent
* **Pending**
  * Calculated field showing:
    * How much time has passed since the notification was sent
    * Remains active until confirmation is completed

---

## **3\. Confirmation History Log**

* Displays all **completed confirmations**

---

### **3.1 Row Data**

Includes all fields from Open Confirmations:

* Company
* Dispatch Date
* Truck Number
* Client
* Job Number
* Dispatch Status

---

### **3.2 Additional Fields**

* **Confirmed At**
  * Timestamp of when confirmation was completed
* **Confirmed By**
  * Name of the user who completed the confirmation

---

## **4\. Core Behavior Summary**

* Open Confirmations:
  * Active, pending acknowledgements
  * Time-based tracking (notification → pending duration)
* History Log:
  * Completed confirmations
  * Includes confirmation metadata (who \+ when)
* Overall purpose:
  * Provides admins with visibility into whether dispatch communications have been **received and acknowledged by company owners**

# **Admin Incidents Page Baseline**

---

## **1\. Page Overview**

* Admin can view **all incident reports** created by all users
* Page is primarily **read-focused**, but admin has full access to:
  * Create incidents
  * Add updates to any incident

---

## **2\. Top Controls**

* **Create Incident Button**
  * Allows admin to create a new incident report
* **Filters**
  * Status:
    * Open
    * Completed
  * Incident Type
  * Truck Number

---

## **3\. Incident List**

* Displays all incident reports as **cards**

---

### **3.1 Card Summary Information**

Each card includes:

* Top left:
  * Incident Type badge
  * Truck Number (if applicable)
  * Status badge (Open or Completed)
* Below:
  * Summary of the incident
  * Timestamp
* If linked to a dispatch:
  * Dispatch reference
  * Dispatch details:
    * Date
    * Start Time
    * Dispatch Status

---

## **4\. Incident Detail Modal**

* Opens when an incident card is clicked

---

### **4.1 Information Displayed**

* All summary information from the card
* Additional details:
  * Created By (user who submitted the report)
  * Full incident details

---

### **4.2 Add Update Section**

* Located in the center of the modal
* Allows users (including admin) to:
  * Add updates to the incident report

---

### **4.3 Incident Timeline**

* Located at the bottom
* Displays chronological updates and activity related to the incident

---

## **5\. Editing Restrictions**

* Incident reports **cannot be edited after submission**
* Users (including admin) are restricted to:
  * Viewing the report
  * Adding updates only

---

## **6\. Status Management**

* **Mark Completed Button**
  * Marks the incident as completed
* **Reopen Option**
  * Allows reopening a completed incident
* Important behavior:
  * Changing status does **not restrict or change functionality**
  * Status is used only for:
    * Tracking
    * Visibility (Open vs Completed)

---

## **7\. Admin Capabilities Summary**

* View all incidents across all users
* Create new incidents
* Add updates to any incident
* Change status (Complete / Reopen)

---

## **8\. Scope Note**

* Page is primarily for:
  * Monitoring incidents
  * Tracking updates
  * Managing incident lifecycle status

# **Admin Announcements Page Baseline**

---

## **1\. Top Controls**

* **New Announcement Button** (top right)
  * Opens **Create Announcement modal**

---

## **2\. Create / Edit Announcement Modal**

* Fields included:
  * **Title**
  * **Message**
  * **Priority**
    * Determines:
      * Importance level
      * How prominently the announcement appears
  * **Targets Dropdown**
    * Default: **All Users** (visible to all users)
    * Other options:
      * **Specific Companies**
        * Displays list of companies
        * Admin selects one or more companies
      * **Specific Access Codes**
        * Displays list of users by access code
        * Admin selects specific users
  * **Active Toggle**
    * Active → announcement is visible
    * Inactive → announcement is hidden without being deleted

---

## **3\. Announcements List (Card View)**

* After closing the modal, announcements appear as **preview cards**

---

### **3.1 Card Header**

* **Priority Badge** (top left)
  * Displays priority level
* **Audience Badge**
  * Indicates who can see the announcement
* **Date Created**

---

### **3.2 Card Content**

* Preview of:
  * Title
  * Message

---

### **3.3 Card Controls (Right Side)**

* **Active Toggle**
  * Enables/disables the announcement
* **Edit Button (Pencil Icon)**
  * Opens modal to edit announcement

---

### **3.4 Activity Log**

* Located at the bottom of each card
* Displays:
  * Timestamp
  * User name
  * Action performed
* Example actions:
  * Announcement created
  * Announcement content updated
  * Announcement activated
  * Announcement deactivated
  * Note: structured per-announcement activity tracking confirmed from code (added 2026-03-24).

---

## **4\. Behavior Summary**

* Announcements can be:
  * Targeted globally or to specific users/companies
  * Activated or deactivated without deletion
* All changes are:
  * Tracked in the activity log
  * Visible per announcement card

# **Admin Companies Page Baseline**

---

## **1\. Top Controls**

* **Add Company Button** (top right)
  * Opens **New Company modal**

---

## **2\. Create / Edit Company Modal**

* Fields included:
  * **Company Name** (required)
  * Address
  * **Contact Info**
    * Types include:
      * Office
      * Cell
      * Email
      * Fax
      * Other
    * Option to **add multiple contact entries**
  * **Status**
    * Active
    * Inactive
  * **Truck Numbers**
    * Entered and managed **only by admin**
* Key logic:
  * Only admin can:
    * Create companies
    * Add/edit truck numbers

---

## **3\. Tab Navigation**

* Company Info
* Company Scoring

---

## **4\. Company Info Tab**

* Each company is displayed as a **card**

---

### **4.1 Card Actions**

* Edit
* Delete
  * Delete triggers confirmation modal

---

### **4.2 Company Details**

* Company Name
* Status badge (Active / Inactive)
* Address
* Contact information (all entries)
* Truck Numbers (list)

---

### **4.3 SMS Number**

* Displays **company SMS number**
* Source:
  * Entered by company owner in their profile
* Used for:
  * SMS notifications

---

### **4.4 Drivers Section**

* Displayed only if company has drivers
* Each driver card includes:
  * Driver Name
  * Phone Number (used as SMS number)
  * SMS Status badge (Active / Off)
* Data source:
  * Company Owner’s Drivers Page
* Admin permissions:
  * View only
  * Cannot edit driver data

---

## **5\. Company Scoring Tab**

* Each company displayed as a **scoring card**

---

### **5.1 Global Filter (Top of Section)**

* Dropdown options:
  * 30 Days
  * 90 Days
  * Year to Date
  * Last 12 Months
* Selection updates all scoring metrics

---

### **5.2 Company Score Card**

* Displays:
  * Company Name
  * Overall Score (calculated)
* Key metrics preview:
  * Average Confirmation Time
  * Breakdown Rate
  * Completion Rate
* Badges for notable issues:
  * Slow Confirmations
  * High Breakdown Rate
  * Frequent Late Issues
  * Other performance indicators

---

### **5.3 Scoring Detail Modal**

* Opens when a company card is selected

---

#### **5.3.1 Core Metrics**

* Company Reliability Score
* Average Confirmation Speed
* Missed Confirmations
* Completion Rate
  * Logic:
    * Dispatch is marked complete once it passes into the next day
    * Applies to all trucks still on that dispatch
* Truck Utilization
  * Trucks available vs trucks used
* Breakdown Rate
  * Derived from incident reports containing:
    * “Breakdown” or “Mechanical”
* Late Issue Rate
  * Based on manually logged late events
* Cancellation Rate
  * Based on:
    * Company removing trucks from dispatch
  * Not based on dispatch status changing to Canceled
* Scheduled Confirmation Performance
  * Based on:
    * Scheduled dispatches confirmed by company
  * Example:
    * 2 trucks assigned → 2 confirmations expected

---

### **5.4 Scoring Explanation Section**

* Expandable section describing scoring logic:
* Reliability score combines:
  * Confirmation speed
  * Missed confirmations
  * Completion rate
  * Truck utilization
  * Breakdown incidents
  * Manual late events
  * Cancellations
  * Scheduled confirmation performance
* Truck score:
  * Based on:
    * Mechanical/breakdown incidents
    * Manual scoring entries
* Driver score:
  * Based only on:
    * Manual scoring entries
* Breakdown logic:
  * Only true mechanical/breakdown incidents count automatically
* Delay incidents:
  * Do not automatically count as late issues
* Accident incidents:
  * Do not automatically affect completion or reliability
* Completion logic:
  * Defaults to complete for past dispatches unless:
    * Manual non-completion flag exists
    * Breakdown incident is attached
* Manual event controls:
  * Impacts completion rate → reduces completion
  * Include in trend analysis → affects trend calculations
* Exceptional performance:
  * Small positive adjustment
  * Intentionally limited impact
* Period selection:
  * Updates:
    * Metrics
    * Trends
    * Warnings
    * Truck/Driver summaries
    * Event history
* Current vs previous period:
  * Always aligned with selected timeframe

---

## **6\. Truck Performance Section**

* Lists all truck numbers for the company
* Each truck includes:
  * Score
  * Number of dispatches
  * Number of breakdowns
  * Completion rate
  * Late events associated with that truck

---

## **7\. Driver Performance Section**

* Displays only if company has drivers
* Each driver includes:
  * Score
  * Number of dispatches
  * Logged performance events
* Note:
  * Confirmation rate logic is no longer applicable and should be excluded

---

## **8\. Manual Reliability Log**

* Section for admin to manually log performance events

---

### **8.1 Event Entry Fields**

* Event Type:
  * Company Cancellation
  * Last-Minute Cancellation
  * Late Arrival
  * No Show
  * Truck Issue
  * Driver Issue
  * Customer Complaint
  * Exceptional Performance
  * Other
* Date
* Dispatch (optional link to specific dispatch)
* Truck Number (optional)
* Driver (optional)
  * Selecting truck/driver affects individual scoring
* Severity:
  * Low
  * Medium
  * High
* Notes:
  * Description of event

---

### **8.2 Event Impact Controls**

* Impacts Completion Rate
* Include in Trend Analysis

---

### **8.3 Actions**

* **Add Performance Event Button**
  * Saves the entry
* **Event Log**
  * Displays all manual reliability entries

---

## **9\. Admin Role Summary**

* Full control over:
  * Companies
  * Truck numbers
  * Scoring inputs (manual log)
* View-only access for:
  * Drivers and their data

# **Admin Access Codes Page Baseline**

---

## **1\. Page Overview**

* Displays a **card for each access code/user**
* Each card represents a single user account tied to an access code

---

## **2\. Access Code Cards**

### **2.1 Card Header**

* **Access Code**
  * Includes **Copy Button**
* **Status Badge**
  * Active
  * Inactive
* **Role**
  * Admin
  * Company Owner
  * Driver
  * Truck (currently exists but planned for removal)

---

### **2.2 User Details**

* User Name
* Company (if applicable)
  * Not shown for Admin users

---

### **2.3 SMS Information**

* SMS Enabled (Yes / No)
* SMS Phone Number
* Source of SMS data:
  * Company Owner → from Owner Profile
  * Driver → from Driver Profile
  * Admin → set directly in Access Code modal

---

### **2.4 Company Owner Additional Info**

* If role is **Company Owner**:
  * Displays **associated truck numbers**

---

### **2.5 Card Actions**

* **Edit (Pencil Icon)**
  * Opens edit modal
* **Delete (Trash Icon)**
  * Opens confirmation modal:
    * Message: deletion cannot be undone
    * Options: Delete or Cancel

---

## **3\. Create Access Code (Top Controls)**

* Four buttons at top of page:
  * Admin
  * Driver
  * Company Owner
  * Truck (planned for removal)
* Clicking any button opens **Create Access Code modal**

---

## **4\. Create / Edit Access Code Modal**

### **4.1 Common Fields (All Roles)**

* Access Code:
  * Can be:
    * Auto-generated
    * Manually entered
* User Name
* Role (Code Type):
  * Admin
  * Company Owner
  * Driver
  * Truck

---

### **4.2 Admin-Specific Fields**

* **Available Workspaces**
  * Allows admin to also act as a Company Owner
  * Enables dual-role access under one login
* **Linked Companies**
  * Defines which company-owner workspaces are available when Company Owner view is enabled
  * Note: added after code-backed review (2026-03-24).
* **SMS Enabled Toggle**
  * Determines if admin receives SMS notifications
* **SMS Phone Number**
  * Used for admin SMS notifications

---

### **4.3 Company Owner & Driver Modal Differences**

* Do **not** include:
  * SMS Enabled toggle
  * SMS Phone field
  * Available Workspaces
* SMS configuration for these roles:
  * Managed through their respective profile pages

---

## **5\. Phone Number Formatting Logic**

* All phone numbers:
  * Entered in standard readable format:
    * Example: (732) 123-4567
* System behavior:
  * Automatically converts to SMS format behind the scenes:
    * Example: \+17321234567

---

## **6\. Role Behavior Notes**

* Truck role:
  * Currently exists
  * Planned for future removal
* Admin role:
  * Only role where SMS settings are controlled directly in this page
* Company Owner & Driver:
  * SMS settings controlled externally (profile-based)

---

## **7\. Scope Note**

* Page is responsible for:
  * User creation
  * Role assignment
  * Access management
  * Admin-level SMS configuration

# **Admin Template Notes Page Baseline**

---

## **1\. Top Controls**

* **Add Note Button** (top right)
  * Opens **Template Note modal**

---

## **2\. Notes List (Card View)**

* Displays a **card for each template note**

---

### **2.1 Card Header**

* **Note Type**
  * Box Note
  * General Note

---

### **2.2 Card Details**

* Preview of the note content
* **Status Badge**
  * Active
  * Inactive
* **Priority**
  * Determines display order
* **Width Badge**
  * Auto
  * Manual (Half or Full)

---

## **3\. Create / Edit Template Note Modal**

### **3.1 Note Type Selection**

* First field:
  * General Note
  * Box Note

---

## **4\. General Note Configuration**

* **Title (optional)**
  * Displays as:
    * Bold
    * Underlined
* **Bullet Lines**
  * Input field for bullet-style content
  * **Add Bullet Button**
    * Adds additional bullet lines
* **Display Width**
  * Default: Auto
  * Manual options:
    * Half (allows multiple notes per row)
    * Full (single note per row)
* **Priority**
  * Determines order of appearance
* **Status Toggle**
  * Active / Inactive

---

## **5\. Box Note Configuration**

* **Title**
  * Displays:
    * Bold
    * Underlined
* **Content Box**
  * Free-form text content
* **Border Color**
  * Selected via color palette
* **Text Color**
  * Selected via color palette
* **Display Width**
  * Default: Auto
  * Can be manually adjusted (Half or Full)
* **Priority**
  * Determines order of appearance
* **Status Toggle**
  * Active / Inactive

---

## **6\. Display Logic**

* Notes are:
  * Ordered by **priority**
  * Shown only if **active**
* Width behavior:
  * Auto → system determines layout
  * Manual → admin controls layout (Half vs Full)

---

## **7\. Scope Note**

* These notes are:
  * Standardized content blocks
  * Used across dispatch-related views
  * Visible to all users depending on configuration

# **Admin Profile Page Baseline**

---

## **1\. Access**

* Accessed via:
  * **Menu Button → Profile**

---

## **2\. Profile Overview**

* Displays basic admin user information:
  * Name
  * Phone Number

---

## **3\. Edit Profile**

* **Edit Profile Option**
  * Opens **Edit Profile modal**

---

### **3.1 Edit Profile Modal Fields**

* Name
* Phone Number
* **SMS Opt-In Toggle**
  * Allows admin to opt in/out of SMS notifications

---

### **3.2 Phone Number Logic**

* Entered in standard readable format:
  * Example: (732) 123-4567
* Automatically converted behind the scenes to:
  * SMS format (e.g., \+17321234567)

---

## **4\. SMS Notifications Section**

* Displays current SMS configuration:
  * **Opt-In Toggle**
    * Enables/disables SMS notifications
  * **SMS Phone Number**
    * Number used for SMS delivery

---

## **5\. Behavior Summary**

* Admin can:
  * Update name
  * Update phone number
  * Control SMS opt-in
* SMS settings here work in conjunction with:
  * Access Codes configuration (source of truth for admin SMS eligibility)

---

## **6\. Scope Note**

* Page is limited to:
  * Personal profile management
  * SMS preference control for admin user

**Admin – System Responsibilities (Addendum)**

* Admin is responsible for:
  * Creating and managing dispatch lifecycle
  * Managing companies and truck numbers
  * Managing access codes
  * Overseeing confirmations
  * Viewing all incidents
  * Managing announcements

---

### **Admin Notification Role**

* Admin receives:
  * “All trucks confirmed” notifications
* Admin controls:
  * Whether update notifications are sent (non-status edits)

---

### **Admin Dispatch Control Notes**

* Only one admin can edit a dispatch at a time
* Dispatch edits are locked during active editing

# **Company Owner – Home Page Baseline**

---

## **1\. Login & Landing**

* User logs in using **access code**
* Company Owner lands on the **Home Page (default page)**

---

## **2\. Global Header**

* Same structure as all users:
* **Left side:**
  * Company logo
  * Line 1: Company name
  * Line 2: User name
* **Right side:**
  * Notification bell
  * Menu button (three ხაზ icon → Profile)
  * Logout

---

## **3\. Navigation Bar**

* Home
* Dispatches
* Availability
* Drivers
* Notifications
* Incidents

---

## **4\. Greeting Logic**

* Displayed below navigation bar
* Format: Greeting \+ User Name
* Time-based logic:
  * 9:00 PM – 2:59 AM → **Good Night**
  * 3:00 AM – 11:59 AM → **Good Morning**
  * 12:00 PM – 4:59 PM → **Good Afternoon**
  * 5:00 PM – 8:59 PM → **Good Evening**

---

## **5\. Announcement Center**

* Displays announcements created by admin
* Visibility logic:
  * Shown if:
    * Target \= All Users
    * Target includes Company Owners
    * Target includes this specific company

---

## **6\. Action Needed Section**

* Displays items requiring **user action**
* Top right:
  * **View All Notifications**

---

### **6.1 Purpose**

* Primarily used for:
  * **Dispatch confirmation (Confirm Receipt)**

---

### **6.2 Confirmation System (Core Logic)**

* Triggered when:
  * Dispatch is created
  * Dispatch status changes
* For each dispatch:
  * A **Confirm Receipt button is created per truck number**
* Company owner must:
  * Confirm **each truck individually**

---

### **6.3 Card Content (Action Needed)**

Each card includes:

* Message based on status:
  * Example: “Your truck has been scheduled”
* Line 2:
  * Dispatch date
* Line 3:
  * Shift \+ Truck Numbers
* Truck number badges
* **Pending Confirmation Indicator:**
  * Orange text:
    * Example: “Pending confirmations: 0 of 2 trucks”

---

### **6.4 Confirmation Progress Logic**

* As confirmations occur:
  * Updates dynamically:
    * Example: “1 of 2 trucks confirmed”
* When all trucks confirmed:
  * Changes to:
    * **Green text: “All Confirmed”**

---

### **6.5 Completion Behavior**

* Notification becomes **read only when ALL trucks are confirmed**
* When complete:
  * Removed from **Action Needed section**
  * Marked as read in **Notification Bell**

---

### **6.6 Reset Behavior (Critical Logic)**

* Confirmations reset when:
  * Status changes:
    * Scheduled → Dispatched
    * Dispatched → Amended
    * Amended → Canceled
* Each status change:
  * Requires **new confirmations for all trucks**

---

### **6.7 Notification Scope**

* Action Needed shows:
  * Only items requiring confirmation
* Other notifications:
  * May appear in Notification Bell
  * Do **not necessarily appear in Action Needed**

---

### **6.8 Interaction Behavior**

* Clicking card (Action Needed or Notification Bell):
  * Opens **Dispatch Detail Drawer**

---

### **6.9 Confirmation Reliability Logic**

* System ensures:
  * Rapid clicking of multiple Confirm Receipt buttons is handled correctly
  * No confirmations are missed due to speed

---

## **7\. Notification System (General)**

* Notification Bell:
  * Mirrors **Notifications Page**
  * Same data and logic
* Notifications clear when:
  * Required action is completed (all confirmations done)
* Admin receives:
  * Single notification when:
    * All trucks on a dispatch are confirmed

---

## **8\. Today’s Dispatches (Quick View)**

* Displays simplified dispatch cards for **today**

---

### **8.1 Card Layout**

* **Top left:**
  * Shift icon:
    * Yellow sun (Day)
    * Gray moon (Night)
  * Status badge
* **Top right:**
  * Day of week \+ Date
* Below:
  * Start Time
* Left side:
  * Client name (bold)
  * Job number
  * Truck number badges

---

## **9\. Upcoming Dispatches (Quick View)**

* Same layout and logic as **Today’s Dispatches**
* Displays future dispatches

---

## **10\. Data Visibility Rules (Critical)**

* Company Owner can only see:
  * Dispatches assigned to their company
  * Their own truck numbers
* Cannot see:
  * Other companies
  * Other companies’ dispatches
  * Other companies’ trucks

---

## **11\. Dispatch Assignment Rule**

* Each dispatch:
  * Can only be assigned to **one company**

---

## **12\. Confirmation Flow Example**

* Dispatch created (Scheduled) → confirmation required
* Company confirms all trucks → marked complete
* Status changes to Dispatched → confirmation resets
* Status changes to Amended → confirmation resets
* Status changes to Canceled → confirmation required again

---

## **13\. Scope Note**

* Home page focuses on:
  * Announcements
  * Required actions (confirmations)
  * Quick dispatch visibility

# **Company Owner – Tutorials, Dispatches Page, and Dispatch Detail Drawer Baseline**

---

## **1\. Home Page Tutorial (First Login)**

* On first login:
  * A **tutorial modal automatically appears**
* Options:
  * Start Tour (English)
  * Start Tour (Portuguese – direct translation)
  * Skip for Now
  * Don’t Show Again
* Note:
  * Unclear if completion is mandatory at least once
* Persistent access:
  * **Floating tutorial button** (bottom right on all pages)

---

### **1.1 Tutorial Steps (10 Total)**

1. Home Page overview
2. Announcement Center
3. Action Needed section
4. Dispatch preview (home cards)
5. Dispatches page
6. Availability page
7. Weekly Defaults (Availability)
8. Daily Controls (Availability)
9. Drivers page
10. Incidents page

---

## **2\. Dispatch Detail Drawer Tutorial (Company Owner Only)**

* Trigger:
  * Automatically appears the **first time a dispatch is opened**
* Manual access:
  * **Blue tutorial button (top right of drawer)**
* Includes:
  * Welcome message
  * Portuguese version option

---

### **2.1 Tutorial Steps (8 Total)**

1. Report Incident button
2. Screenshot Dispatch button
3. Edit Trucks button
4. Assignment details
5. Dispatch notes
6. Confirm Receipt section
7. Driver Assignments
8. Time Log
* End options:
  * Finish
  * Replay

---

## **3\. Dispatches Page (Portal)**

* Backend name: **Portal**

---

### **3.1 Page Header**

* Title: **My Dispatches**
* Below title:
  * Displays **all truck number badges** for that company

---

### **3.2 Tab Navigation**

* Today
* Upcoming
* History
* All tabs:
  * Use identical **card layout and behavior**

---

## **4\. Dispatch Cards (All Tabs)**

### **4.1 Card Layout**

* **Top left:**
  * Status badge
  * Shift
* **Top right:**
  * Day of week
  * Date
  * Start time (AM/PM format)
* **Left content:**
  * Client name (bold)
  * Job number
  * Company name
  * Truck number badges
* Interaction:
  * Clicking card (down arrow visual) opens **Dispatch Detail Drawer**

---

### **4.2 Time Format Rule**

* All times throughout the app:
  * Must use **AM/PM format**

---

## **5\. Dispatch Detail Drawer (Company Owner View)**

---

### **5.1 Header**

* Back button (top left)
* Status badge \+ Shift (left)
* Day of week \+ Date (right)
* **Blue tutorial button (top right)**

---

### **5.2 Top Action Buttons**

* **Report Incident**
  * Opens Incidents page
  * Automatically opens Create Incident modal
  * Pre-links the dispatch
  * Required inputs:
    * Truck Number
    * Incident Type
    * Location
    * Time Stopped
    * Time Restarted
    * Summary
    * Details
  * Visibility restriction:
    * Only company’s own trucks and dispatches

---

* **Screenshot Dispatch**
  * Captures clean image of dispatch (no action buttons)
  * Includes:
    * From top → through General Notes
  * Excludes:
    * Buttons (Edit Trucks, Confirm, etc.)
    * Logs below notes
  * After capture:
    * Opens system **share menu** (mobile/desktop)

---

### **5.3 Dispatch Info Section**

* Client name (bold)
* Job number (badge)
* Static text: “Working for CCG Transit”
* Truck numbers:
  * Displayed vertically
  * Each shows:
    * Driver name (if assigned)
    * “No driver assigned” if none
    * Blank if no drivers exist in system

---

### **5.4 Edit Trucks**

* Allows company owner to:
  * Replace truck numbers with other trucks from their company

---

#### **5.4.1 Selection Rules**

* Cannot select more trucks than originally assigned
* Must match exact quantity
* If mismatch:
  * Error message shown
  * Selection resets

---

#### **5.4.2 One-at-a-Time Logic**

* Only one truck swap allowed per save
* Multiple changes require:
  * Separate edits

---

#### **5.4.3 Conflict Handling**

* If new truck is already assigned elsewhere (same shift):
  * Warning modal appears
  * Shows conflicting dispatch details
  * Option to **confirm swap**

---

#### **5.4.4 Confirmation Behavior**

* New trucks:
  * Automatically marked as **confirmed**
  * No re-confirmation required if dispatch was already confirmed

---

#### **5.4.5 Driver Assignment Impact**

* Drivers do **not follow truck changes**
* When trucks are changed:
  * Driver assignments reset
  * Must be reassigned manually
* Applies to:
  * Both current dispatch
  * Any swapped dispatch

---

## **6\. Status Reason Section**

* Displays only if applicable:
* Amended → Yellow box (Amendment Reason)
* Canceled → Red box (Cancellation Reason)
* Not shown for:
  * Scheduled
  * Dispatched

---

## **7\. Assignments Section**

* Displays:
  * Start Time
  * Start Location
  * Instructions
  * Notes
  * Toll Status

---

### **7.1 Multiple Assignments Logic**

* If multiple assignments:
  * Each assignment shown in separate section
* Job number placement:
  * Single assignment → shown near top
  * Multiple assignments → shown inside each assignment box

---

## **8\. Template Notes Section**

* Includes:
  * Box Notes
  * General Notes
* Behavior:
  * Ordered by priority
  * Width based on configuration (Auto / Half / Full)
  * Same for all users

---

## **9\. Confirm Receipt Section**

* Contains:
  * One button per truck

---

### **9.1 Behavior**

* Clicking button:
  * Changes to **Confirmed**
  * Records timestamp
* Admin view includes:
  * Name \+ timestamp of confirmation

---

### **9.2 Reset Logic**

* Required again when:
  * Truck added
  * Status changes:
    * Scheduled
    * Dispatched
    * Amended
    * Canceled

---

## **10\. Driver Assignments**

* Displays:
  * Dropdown per truck
* Default:
  * No driver assigned

---

### **10.1 Assignment Logic**

* Selecting driver:
  * Driver gains access to dispatch
  * Driver receives notification
* Removing driver:
  * Driver loses access
  * Receives removal notification
* Replacing driver:
  * Old driver removed (notification sent)
  * New driver assigned (notification sent)

---

### **10.2 Availability Restriction**

* Driver cannot be assigned to:
  * Multiple dispatches in same shift

---

### **10.3 Driver Visibility Rules**

* Driver sees:
  * Only their assigned truck
* Driver cannot see:
  * Other trucks
  * Other drivers
  * Logs (confirmations, assignments, etc.)

---

### **10.4 Seen Indicator**

* When driver views dispatch:
  * “Seen” badge appears next to their name

---

### **10.5 Update Notification Logic**

* Drivers receive updates if:
  * They are assigned
* Includes:
  * Status changes
  * Admin-triggered updates
* Exception:
  * No notification if:
    * Change only affects other trucks

---

## **11\. Time Log**

* Input per truck:
  * Start time
  * End time
* **Copy to All Button**
  * Copies first truck’s times to all others

---

## **12\. Scope Note**

* Dispatch Detail Drawer enables:
  * Full operational control for company owner
  * Confirmation tracking
  * Driver assignment
  * Incident reporting
  * Time tracking

# **Company Owner – Availability Page Baseline**

---

## **1\. Page Overview**

* Functionally similar to **Admin Availability Page**
* Key difference:
  * Company owner can **only view and edit their own company’s availability**
  * No ability to search or switch between companies

---

## **2\. Top Summary Cards**

* Four cards displayed:
  * Today Day Shift
  * Today Night Shift
  * Tomorrow Day Shift
  * Tomorrow Night Shift
* **Friday logic:**
  * Includes extended view (e.g., Sunday Night, Monday Day, Monday Night)

---

### **2.1 Card Data Structure**

Each card displays:

* Total Trucks Available
* Dispatched Trucks
* Remaining Trucks

---

## **3\. Availability Section (Calendar)**

* Same structure and behavior as Admin Availability

---

### **3.1 Purpose**

* Used by company owner to:
  * Define availability
  * Update truck counts
* Expected usage:
  * Updated **daily or weekly**

---

### **3.2 Calendar Interaction**

* Clicking a day opens **Edit Day Override modal**

---

### **3.3 Edit Day Override Modal**

* Fields:
  * Date
  * **Day Shift**
    * Status:
      * Available
      * Unavailable
    * Available Trucks (optional but encouraged)
  * **Night Shift**
    * Status:
      * Available
      * Unavailable
    * Available Trucks (optional)

---

## **4\. Recurring Weekly Defaults**

* Located below calendar

---

### **4.1 Display**

* Days of the week (Monday–Sunday)
* Two columns:
  * Day Shift
  * Night Shift
* Shows default availability

---

### **4.2 Edit Defaults**

* Clicking **Edit Defaults** opens modal
* Modal allows:
  * Checkbox selection for:
    * Day Shift availability
    * Night Shift availability
* Saved values become:
  * **Weekly baseline availability**

---

## **5\. Availability Logic**

* **Weekly Defaults**
  * Represents standard recurring schedule
* **Daily Overrides**
  * Used for specific dates
  * Includes actual truck counts
* Combined behavior:
  * Defaults \= baseline
  * Overrides \= real-time adjustments

---

## **6\. Permission Constraints**

* Company owner:
  * Can only view their own company’s data
  * Can only edit their own availability
* Cannot:
  * View other companies
  * Modify other companies’ availability

---

## **7\. Scope Note**

* Page is responsible for:
  * Company availability planning
  * Truck count input
  * Scheduling visibility for admin

# **Company Owner – Drivers Page Baseline**

---

## **1\. Page Overview**

* Only accessible to **Company Owners**
* Used to:
  * Add and manage drivers for their company
  * Control SMS eligibility for drivers
* Scope restriction:
  * Company owner can only manage **their own company’s drivers**

---

## **2\. Add Driver**

* **Add Driver Button** (top of page)
  * Opens **Add Driver modal**

---

### **2.1 Add Driver Modal Fields**

* **Driver Name (required)**
* **Phone Number (required)**
  * Used as the driver’s **SMS number**

---

### **2.2 SMS Permission (Owner Layer)**

* Toggle:
  * “Do you want this driver to receive SMS notifications?”

---

#### **If Toggle \= OFF**

* Behavior:
  * Driver will NOT receive SMS notifications
  * Driver will only see notifications **inside the app**
* Message shown:
  * “This driver will not receive notifications on their phone. They will only see pending notifications when they open the app.”

---

#### **If Toggle \= ON**

* Additional instruction appears:
  * Driver must **opt in themselves** via:
    * Menu → Profile → Enable SMS
* This creates a **dual opt-in system**:
  * Owner approval
  * Driver opt-in

---

### **2.3 Additional Fields**

* Notes (optional)
* Status:
  * Active
  * Inactive

---

## **3\. Driver Cards**

* Each driver displayed as a **card**

---

### **3.1 Card Header**

* Driver Name
* Status Badge (Active / Inactive)
* Access Code Status:
  * Requested
  * Created
* SMS Status Badge:
  * Active
  * Not Active

---

### **3.2 Driver Details**

* Phone Number (SMS number)

---

### **3.3 SMS Status Breakdown**

Three indicators:

* **Owner Enabled**
  * Yes / No
* **Driver Opted In**
  * Yes / No
* **SMS Enabled (Final Status)**
  * Yes / No
  * Only true if both conditions are met

---

### **3.4 Bottom Messages (Conditional)**

* If SMS not enabled:
  * If owner enabled but driver not opted in:
    * “Please have your driver opt in to SMS notifications by clicking the menu button, then going to profile and enabling SMS notifications.”
  * If owner disabled:
    * “This driver will not receive notifications on their phone. They will only see pending notifications when they open the app.”

---

### **3.5 Card Actions (Right Side)**

* Edit
* Delete
  * Confirmation modal required
* **Request Code**
  * Sends request to admin for driver access code

---

### **3.6 Access Code Behavior**

* Before code is created:
  * Button shows: **Request Code**
* After admin creates code:
  * Button becomes:
    * Disabled
    * Label changes to: **Created**

---

## **4\. Driver SMS Reminder Section**

* Informational section below driver cards
* Message:
  * Owner enables SMS permission
  * Driver must still opt in via profile

---

## **5\. Instructional Guide Section**

* Includes tab bar:
  * English
  * Portuguese (translated version)

---

### **5.1 Driver Portal Capabilities**

* Drivers can:
  * View assigned dispatches
  * View driver-specific announcements
  * Report incidents
* Drivers cannot:
  * See other drivers
  * See other trucks
  * See confirmation logs
  * Access unrelated data

---

### **5.2 Driver Assignment Logic**

* Driver sees dispatch:
  * Only when assigned to a truck
* On assignment:
  * Driver receives notification:
    * “Dispatch Assigned: You have been assigned to a dispatch”

---

### **5.3 Update Behavior**

* Drivers receive updates if:
  * They remain assigned
* Includes:
  * Amendments
  * Cancellations

---

### **5.4 Removal Behavior**

* If removed:
  * Driver receives:
    * “Dispatch Removed / No Longer Available”
  * Loses access immediately

---

### **5.5 Driver Switching**

* Switching drivers:
  * Old driver:
    * Receives removal notification
  * New driver:
    * Receives assignment notification

---

### **5.6 Truck Change Impact**

* If truck is changed:
  * Driver assignment resets
* Example:
  * Truck with driver → switched → driver removed
  * Driver must be reassigned

---

### **5.7 Truck Swap Impact**

* If two trucks are swapped:
  * Both driver assignments reset
  * Both drivers receive removal notifications
  * Must reassign drivers

---

### **5.8 Responsibility Reminder**

* Company owner must:
  * Verify drivers received and understand dispatch
  * Follow up if needed

---

### **5.9 Passive Notification Behavior**

* If driver is assigned:
  * Receives notifications and updates
* If no driver assigned:
  * Driver cannot see dispatch
* Visibility rule:
  * What owner sees (assignment-wise) \= what driver sees

---

## **6\. SMS System Summary**

* SMS requires **two conditions**:
  * Owner enables SMS
  * Driver opts in
* If either is missing:
  * SMS is not active

---

## **7\. Scope Note**

* Page handles:
  * Driver management
  * SMS eligibility control
  * Driver assignment education

# **Company Owner – Notifications, Incidents, and Profile Page Baseline**

---

## **1\. Notifications Page**

### **1.1 Overview**

* This page is a **full-page version of the Notification Bell**
* Behavior:
  * Same structure
  * Same data
  * Same logic

---

### **1.2 Key Behavior**

* Displays all notifications
* Clicking a notification:
  * Opens the corresponding **Dispatch Detail Drawer**
* Notification states:
  * Unread → requires action (if applicable)
  * Read/effectively read → completed or acknowledged
* Owner dispatch-confirmation notifications use computed effective-read behavior (not only stored `read_flag`) based on truck confirmations.
  * Note: added after code-backed review (2026-03-24).
* Sync behavior:
  * Fully mirrors Notification Bell in real time

---

## **2\. Incidents Page (Company Owner)**

### **2.1 Overview**

* Same structure and functionality as **Admin Incidents Page**

---

### **2.2 Visibility Restrictions**

* Company owner can only see:
  * Incidents tied to:
    * Their company’s truck numbers
  * Incidents created by:
    * The company owner
    * Their drivers
  * Incidents created by admin:
    * Only if related to their company’s trucks

---

### **2.3 Behavior Summary**

* Company owner can:
  * View relevant incidents
  * Create incidents
  * Add updates to incidents
  * Mark incidents as completed or reopen
* Cannot:
  * View incidents unrelated to their company

---

## **3\. Profile Page (Company Owner)**

---

### **3.1 Company Profile Section**

* Header: **Company Profile**
* Message:
  * “Profile information is view only here. Use edit to submit changes for admin approval.”

---

### **3.2 Data Source**

* All displayed company information comes from:
  * **Admin Companies Page**
* Includes:
  * Company details
  * Address
  * Contact info
  * Truck numbers

---

### **3.3 Edit Company Profile**

* **Edit Button**
  * Opens edit modal
* Allows company owner to:
  * Propose changes to company information
  * Edit structured typed contact methods (Office/Cell/Email/Fax/Other)
  * Select which contact method is designated for SMS
  * Note: updated after code-backed review (2026-03-24).

---

### **3.4 Submit for Approval**

* **Submit Changes for Approval Button** (red)
* Behavior:
  * Sends request to admin
* Admin experience:
  * Sees **side-by-side comparison**:
    * Old data vs New data
  * Can:
    * Approve
    * Reject

---

### **3.5 Access Code Controls**

* **View Access Code Button**
  * Displays current access code
* **Request New Code / Regenerate Code**
  * Allows company owner to request a new code

---

## **4\. SMS Notifications Section**

### **4.1 Section Title**

* **Your SMS Notifications**

---

### **4.2 Opt-In Control**

* **Receive SMS Notifications Toggle**
  * Primary opt-in control

---

### **4.3 SMS Information Display**

* Three info boxes:
  * **Used for SMS**
    * Selected number for SMS notifications
  * **Number Used for SMS**
    * Previously used number (typically same as above)
  * **SMS Active**
    * Yes / No (final status)

---

### **4.4 SMS Logic Summary**

* SMS is active only if:
  * User has opted in
  * Valid phone number is set

---

## **5\. Scope Note**

* Notifications Page:
  * Full visibility of all notifications
* Incidents Page:
  * Restricted to company-related incidents
* Profile Page:
  * Company data is controlled by admin
  * Company owner can request updates (approval required)
  * SMS preferences managed at user level

# **Company Owner – Driver Seen Notifications (Addendum)**

---

## **1\. Overview**

* When a **driver is assigned to a dispatch**:
  * They receive a notification
  * They gain access to the dispatch
* When the driver:
  * Clicks the notification, or
  * Opens the dispatch
* The system registers this as:
  * The driver has **“seen” the dispatch**

---

## **2\. Company Owner Notification Trigger**

* When a driver **views a dispatch (seen state)**:
  * The **Company Owner receives a notification**

---

## **3\. Notification Content**

* Notification includes:
  * Driver Name
  * Action performed (seen)
  * Dispatch context (status \+ details)
  * Timestamp

---

## **4\. Status-Based Messaging**

* Message content varies depending on dispatch status:

---

### **4.1 Canceled Dispatch**

* Example message:
  * “\[Driver Name\] has seen the canceled dispatch”
* Includes:
  * Dispatch details
  * Timestamp

---

### **4.2 Driver Removed from Assignment**

* Trigger:
  * Company owner removes driver from dispatch
* Driver behavior:
  * Receives “No Longer Available” notification
  * Opens/views it
* Company owner receives notification:
  * Example message:
    * “\[Driver Name\] has seen that the dispatch assignment is no longer available”

---

## **5\. Behavior Summary**

* Driver “seen” actions generate **feedback notifications** to company owner
* Applies to:
  * Status changes (e.g., canceled)
  * Assignment removal
* Purpose:
  * Confirms that the driver has:
    * Received
    * Viewed
    * Acknowledged the update

---

## **6\. Scope Note**

* This is separate from:
  * Company owner **Confirm Receipt system**
* This is specifically:
  * **Driver acknowledgment tracking → Company owner visibility**

## **Company Owner – Operational Rules (Addendum)**

## ---

### **1\. Confirmation Responsibility**

* ## Company owner must:

  * ## Confirm receipt for each truck

  * ## Confirm after every status change

## ---

### **2\. Dispatch Visibility**

* ## Can only view:

  * ## Dispatches assigned to their company

## ---

### **3\. Driver Management Responsibility**

* ## Responsible for:

  * ## Assigning drivers

  * ## Reassigning drivers after truck changes

  * ## Ensuring drivers understand dispatch

## ---

### **4\. Notification Responsibility**

* ## Must act on:

  * ## Action Needed (confirmations)

* ## Receives:

  * ## Driver seen notifications

## ---

### **5\. SMS Responsibility**

* ## Controls:

  * ## Whether drivers are allowed SMS

* ## Must ensure:

  * ## Drivers opt in if SMS is desired

# **Driver Portal Baseline**

---

## **1\. Overview**

* Driver portal is a **restricted version of the Company Owner portal**
* Available pages:
  * Home
  * Dispatches (Portal)
  * Incidents
  * Profile
* Not available:
  * Availability
  * Drivers
  * Notifications page (only notification bell behavior exists implicitly)
* Key principle:
  * Driver can only see and interact with **dispatches they are currently assigned to**

---

## **2\. Global Header**

* Same as all users:
* **Left side:**
  * Company logo
  * Company name
  * Driver name
* **Right side:**
  * Notification bell
  * Menu button (Profile)
  * Logout

---

## **3\. Navigation Bar**

* Home
* Dispatches
* Incidents

---

## **4\. Tutorials**

* Drivers **do NOT have tutorials**
  * No onboarding tutorial
  * No dispatch detail tutorial

---

## **5\. Home Page**

### **5.1 Shared Layout (Same as Company Owner)**

* Greeting (same time-based logic)
* Announcement Center (if part of audience)
* Today’s Dispatches (quick view)
* Upcoming Dispatches (quick view)

---

### **5.2 Key Restrictions**

* Driver only sees:
  * Dispatches they are assigned to
* If assigned:
  * Dispatch appears:
    * On Home Page
    * On Dispatches Page
* If removed:
  * Dispatch is:
    * Removed from view
  * Driver receives notification:
    * “Dispatch assignment is no longer available”

---

## **6\. Dispatch Assignment Logic (Core Rule)**

* Driver visibility is strictly tied to assignment:
  * Assigned → Can see dispatch
  * Removed → Cannot see dispatch

---

### **6.1 Assignment Behavior**

* When assigned:
  * Driver receives notification:
    * “Dispatch Assigned”
  * Gains access immediately
* When removed:
  * Driver receives notification:
    * “No Longer Available”
  * Loses access immediately

---

### **6.2 Update Behavior**

* If driver remains assigned:
  * Receives all updates:
    * Dispatched
    * Amended
    * Canceled
    * General updates
* Updates are reflected in:
  * Dispatch Detail Drawer

---

## **7\. Dispatches Page (Portal)**

* Same structure as Company Owner portal

---

### **7.1 Page Layout**

* Title: My Dispatches
* Truck badges (only their assigned truck implicitly)
* Tabs:
  * Today
  * Upcoming
  * History

---

### **7.2 Dispatch Cards**

* Same layout as Company Owner cards
* Key difference:
  * Only displays:
    * Driver’s assigned truck number
  * Does NOT show:
    * Other trucks
    * Other drivers

---

## **8\. Dispatch Detail Drawer (Driver View)**

* Layout is largely the same as Company Owner, with restrictions

---

### **8.1 Available Features**

* View:
  * Dispatch details
  * Assignments
  * Notes
  * Status updates
* **Report Incident Button**
  * Opens Incidents page
  * Pre-links dispatch
  * Pre-selects assigned truck

---

### **8.2 Restricted / Hidden Features**

* Not visible to driver:
  * Screenshot Dispatch button
  * Edit Trucks button
  * Driver names next to truck badges
  * Seen badges
  * Driver Assignments section
  * Confirm Receipt section
  * Confirmation logs
  * Time logs

---

### **8.3 Visibility Rules**

* Driver sees:
  * Only their assigned truck
* Cannot see:
  * Other trucks
  * Other drivers
  * Internal logs

---

## **9\. Incidents Page (Driver)**

### **9.1 Creation Flow**

* From Dispatch Detail Drawer:
  * Click **Report Incident**
  * Opens Create Incident modal
* Pre-filled:
  * Dispatch
  * Truck is prefilled only when uniquely resolvable from the dispatch/session context (not guaranteed in multi-truck ambiguity).
  * Note: updated after code-backed review (2026-03-24).
* Driver completes:
  * Incident type
  * Location
  * Time stopped / restarted
  * Summary
  * Details

---

### **9.2 Visibility Rules**

* Driver can see:
  * Incidents they created
  * Incidents created by admin/company owner:
    * Only if related to:
      * Their assigned truck
      * A shift they were assigned to

---

## **10\. Profile Page (Driver)**

### **10.1 Overview**

* Displays:
  * Name
  * Phone number (SMS number)
* Data source:
  * Controlled by **Company Owner (Drivers Page)**
  * Not editable by driver

---

### **10.2 SMS Opt-In**

* **Receive SMS Notifications Toggle**
* This is the driver’s:
  * **Required opt-in step**

---

### **10.3 SMS Logic**

* SMS is active only if:
  * Company Owner enables SMS for driver
  * Driver opts in via profile

---

## **11\. Global Visibility Rule (Critical)**

* Driver access is strictly limited to:
  * Dispatches they are assigned to
  * Incidents related to their assigned truck
  * Notifications related to their assignments

---

## **12\. Deprecated Role Note**

* Truck user role:
  * Exists partially in system
  * Incomplete implementation
  * Planned for full removal
* Final system roles:
  * Admin
  * Company Owner
  * Driver

---

## **13\. Scope Note**

* Driver portal is:
  * A simplified, restricted interface
  * Focused on:
    * Viewing assignments
    * Receiving updates
    * Reporting incidents

---

## **Driver – System Rules (Addendum)**

---

### **1\. Dispatch Access Rule (CRITICAL)**

* Driver can ONLY see:
  * Dispatches they are currently assigned to

---

### **2\. Assignment Dependency**

* Assigned:
  * Can view dispatch
  * Receives notifications
* Removed:
  * Loses access immediately

---

### **3\. Visibility Limitations**

* Cannot see:
  * Other trucks
  * Other drivers
  * Confirmation logs
  * Assignment logs
  * Time logs

---

### **4\. Incident Responsibility**

* Can:
  * Create incidents
  * View incidents related to their assigned truck

---

### **5\. SMS Requirement**

* Must opt in via profile
* SMS only works if:
  * Owner enabled \+ driver opted in

# **App-Wide Systems & Core Logic**

---

## **1\. Dispatch Lifecycle (Global)**

* Dispatch statuses:
  * Scheduled
  * Dispatched
  * Amended
  * Canceled
* Status changes:
  * Trigger notifications
  * Reset confirmation requirements
  * Update all user views (admin, company owner, driver)

---

## **2\. Confirmation System (Global)**

* Created when:
  * Dispatch is created
  * Dispatch status changes
* Generated:
  * One confirmation per **truck number**

---

### **2.1 Confirmation States**

* Pending
* Partially Confirmed
* Fully Confirmed

---

### **2.2 Completion Rule**

* A dispatch is only considered fully confirmed when:
  * **All truck numbers are confirmed**

---

### **2.3 Effects of Full Confirmation**

* Notification becomes read
* Removed from Action Needed
* Admin receives:
  * “All trucks confirmed” notification

---

### **2.4 Reset Logic**

* Confirmations reset when:
  * Dispatch status changes:
    * Scheduled → Dispatched
    * Dispatched → Amended
    * Amended → Canceled

---

## **3\. Notification System (Global)**

---

### **3.1 Notification Types**

* Dispatch Created
* Dispatch Updated
* Status Change (Scheduled / Dispatched / Amended / Canceled)
* Driver Assigned
* Driver Removed
* Driver Seen Dispatch
* Confirmation Complete

---

### **3.2 Notification Display Layers**

* Notification Bell:
  * Full notification list
* Notifications Page:
  * Mirror of notification bell
* Action Needed Section:
  * Only notifications requiring action (confirm receipt)

---

### **3.3 Read / Clear Logic**

* Dispatch-related notifications:
  * Only marked as read when:
    * All confirmations are completed

---

### **3.4 Driver Seen Notifications**

* Trigger:
  * Driver opens or views a dispatch
* Result:
  * Company owner receives notification:
    * Includes driver name
    * Dispatch context
    * Timestamp

---

## **4\. Driver Assignment System (Global)**

---

### **4.1 Core Rule**

* A driver can only:
  * See a dispatch
  * Receive notifications

IF AND ONLY IF:

* They are assigned to a truck on that dispatch

---

### **4.2 Assignment Events**

* Assign driver:
  * Gains access
  * Receives notification
* Remove driver:
  * Loses access
  * Receives removal notification
* Replace driver:
  * Old driver removed
  * New driver assigned

---

### **4.3 Truck Change Impact**

* If a truck is:
  * Changed or swapped

Then:

* Driver assignments reset
* Drivers must be reassigned

---

### **4.4 Driver Restrictions**

* Cannot be assigned to:
  * Multiple dispatches in the same shift

---

## **5\. SMS System (Global)**

---

### **5.1 Phone Number Handling**

* Input format:
  * (XXX) XXX-XXXX
* Stored format:
  * \+1XXXXXXXXXX

---

### **5.2 Driver SMS Logic (Dual Opt-In)**

SMS is active ONLY if:

1. Company owner enables SMS for driver
2. Driver opts in via profile

---

### **5.3 Company Owner SMS**

* Controlled via:
  * Profile settings

---

### **5.4 Admin SMS**

* Controlled via:
  * Access Codes
  * Profile settings

---

## **6\. Visibility Rules (Global)**

---

### **6.1 Admin**

* Full visibility across:
  * All companies
  * All dispatches
  * All drivers
  * All incidents

---

### **6.2 Company Owner**

* Can only see:
  * Their company
  * Their trucks
  * Their drivers
  * Their dispatches

---

### **6.3 Driver**

* Can only see:
  * Dispatches they are assigned to
  * Their assigned truck
  * Related incidents

---

## **7\. Time Format (Global)**

* All times across the app:
  * Must be displayed in **AM/PM format**

---

## **8\. Google Drive Sync (Global)**

* Triggered when:
  * Dispatch created
  * Dispatch updated
  * Dispatch archived
* Behavior:
  * Creates/updates HTML file
  * Organized by:
    * Company → Truck → File

---

## **9\. Tutorials (Global)**

---

### **9.1 Company Owner**

* Home tutorial:
  * First login
  * Optional replay
* Dispatch drawer tutorial:
  * First open
  * Manual replay available

---

### **9.2 Driver**

* No tutorials

---

## **10\. Deprecated / Future Removal**

* Truck user role:
  * Exists partially
  * Will be removed
* Final roles:
  * Admin
  * Company Owner
  * Driver
