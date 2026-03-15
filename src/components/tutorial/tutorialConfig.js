import { createPageUrl } from '@/utils';

export const COMPANY_OWNER_TUTORIAL_ID = 'companyOwnerMainPortal';
export const COMPANY_OWNER_TUTORIAL_DISMISSED_KEY = 'companyOwnerTutorialDismissed';
export const COMPANY_OWNER_TUTORIAL_COMPLETED_KEY = 'companyOwnerTutorialCompleted';
export const DISPATCH_DRAWER_TUTORIAL_SEEN_KEY = 'dispatchDrawerTutorialSeen';
export const DISPATCH_DRAWER_TUTORIAL_COMPLETED_KEY = 'dispatchDrawerTutorialCompleted';

const COMPANY_OWNER_TUTORIAL_COMPLETION_STEP = {
  title: "You're all set",
  description: 'You can replay this tutorial anytime using the Tutorial button.',
};

const DISPATCH_DRAWER_TUTORIAL_COMPLETION_STEP = {
  title: 'Dispatch Tutorial Complete',
  description: 'You can replay this tutorial anytime using the Tutorial button in the dispatch drawer.',
};

export const companyOwnerTutorialSteps = [
  {
    id: 'home-screen',
    page: createPageUrl('Home'),
    target: '[data-tour="home-overview"]',
    title: 'Home Screen',
    description:
      'The Home Screen provides a quick snapshot of your pending actions and upcoming dispatches.',
  },
  {
    id: 'announcement-center',
    page: createPageUrl('Home'),
    target: '[data-tour="announcement-center"]',
    title: 'Announcement Center',
    description:
      'This is where you will receive general communications and advisories from CCG Transit.',
  },
  {
    id: 'action-needed',
    page: createPageUrl('Home'),
    target: '[data-tour="action-needed"]',
    title: 'Action Needed',
    description:
      'This section highlights dispatches that require your immediate attention, such as confirming receipt.',
    warningText: 'Items will remain in this section until you confirm receipt of your dispatch.',
  },
  {
    id: 'dispatch-preview',
    page: createPageUrl('Home'),
    target: '[data-tour="dispatch-preview"]',
    title: 'Dispatch Preview',
    description: 'This area provides a quick view of your next few assigned dispatches.',
  },
  {
    id: 'dispatches-page',
    page: createPageUrl('Home'),
    target: '[data-tour="dispatches-nav"]',
    title: 'Dispatches',
    description: 'The Dispatch page shows you your full dispatch history as well as all upcoming dispatches.',
  },
  {
    id: 'availability-page',
    page: createPageUrl('Home'),
    target: '[data-tour="availability-nav"]',
    title: 'Availability',
    description:
      'The Availability page allows you to indicate whether you are available for a specific shift and how many trucks you have available.',
  },
  {
    id: 'recurring-weekly-defaults',
    page: createPageUrl('Availability'),
    target: '[data-tour="recurring-weekly-defaults"]',
    title: 'Recurring Weekly Defaults',
    description:
      'Here you can set your default weekly availability. These settings will automatically apply to all future weeks unless changed.',
  },
  {
    id: 'availability-controls',
    page: createPageUrl('Availability'),
    target: '[data-tour="availability-controls"]',
    title: 'Availability Controls',
    description:
      'This section allows you to actively select the number of trucks you have available for each shift.',
    warningText: 'We recommend you visit this section daily or weekly to update the amount of trucks you have available for every upcoming shift.',
  },
  {
    id: 'drivers-page',
    page: createPageUrl('Home'),
    target: '[data-tour="drivers-nav"]',
    title: 'Drivers',
    description:
      'Use this section to add drivers and enter their information.',
    useWarning: 'Please read the instructions about the driver portal at the bottom of the page in full. Once you add a driver, you will need to request a password for them.',
  },
  {
    id: 'incidents-page',
    page: createPageUrl('Home'),
    target: '[data-tour="incidents-nav"]',
    title: 'Incidents',
    description: 'This is where you can create a new incident report or view your incident history.',
  },
];

export const dispatchDrawerTutorialSteps = [
  {
    id: 'report-incident',
    target: '[data-tour="dispatch-report-incident"]',
    title: 'Report Incident',
    description:
      'Click here to report breakdowns, accidents, delays, or any other incident related to this dispatch.',
    warningText: 'This should be done after informing the dispatcher of your incident and is for record-keeping purposes. We encourage you to create reports immediately and visit the Incidents page to record your updates as you resolve the incident.',
  },
  {
    id: 'screenshot-dispatch',
    target: '[data-tour="dispatch-screenshot"]',
    title: 'Screenshot Dispatch',
    description:
      'Click here to take a clean screenshot of your dispatch without the any of the action buttons or editable sections.',
  },
  {
    id: 'edit-trucks',
    target: '[data-tour="dispatch-edit-trucks"]',
    title: 'Edit Trucks',
    description: 'Click here to edit the truck numbers assigned to this dispatch.',
  },
  {
    id: 'driver-assignments',
    target: '[data-tour="dispatch-driver-assignments"]',
    title: 'Driver Assignments',
    description: 'Click the dropdown menu to assign drivers to your dispatch.',
    warningText: 'Please familiarize yourself with the instructions on the Drivers page before using this feature.',
  },
  {
    id: 'assignment-details',
    target: '[data-tour="dispatch-assignment-details"]',
    title: 'Assignment Details',
    description: 'This section shows the standard details and instructions of the assignment.',
  },
  {
    id: 'dispatch-notes',
    target: '[data-tour="dispatch-notes"]',
    title: 'Dispatch Notes',
    description: 'These are dispatch notes and reminders that are included every dispatch.',
  },
  {
    id: 'confirm-receipt',
    target: '[data-tour="dispatch-confirm-receipt"]',
    title: 'Confirm Receipt',
    description:
      'Click here to confirm receipt of the dispatch.',
    warningText: 'You must confirm any time you receive: a new dispatch, a new schedule, an amendment, a cancellation, or another important update.',
  },
  {
    id: 'time-log',
    target: '[data-tour="dispatch-time-log"]',
    title: 'Time Log',
    description:
      'This is where you enter the check-in and check-out times for yourself or your drivers. The time log is for informational purposes only.',
  },
];

export const tutorialRegistry = {
  [COMPANY_OWNER_TUTORIAL_ID]: {
    steps: companyOwnerTutorialSteps,
    completionStep: COMPANY_OWNER_TUTORIAL_COMPLETION_STEP,
    storageKeys: {
      dismissed: COMPANY_OWNER_TUTORIAL_DISMISSED_KEY,
      completed: COMPANY_OWNER_TUTORIAL_COMPLETED_KEY,
    },
  },
  dispatchDrawer: {
    steps: dispatchDrawerTutorialSteps,
    completionStep: DISPATCH_DRAWER_TUTORIAL_COMPLETION_STEP,
    storageKeys: {
      seen: DISPATCH_DRAWER_TUTORIAL_SEEN_KEY,
      completed: DISPATCH_DRAWER_TUTORIAL_COMPLETED_KEY,
    },
  },
};
