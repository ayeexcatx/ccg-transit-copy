export const statusBadgeColors = {
  Scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  Dispatch: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Amended: 'bg-amber-50 text-amber-700 border-amber-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
};

// Left border accent for dispatch cards
export const statusBorderAccent = {
  Scheduled: 'border-l-4 border-l-blue-400',
  Dispatch: 'border-l-4 border-l-emerald-400',
  Amended: 'border-l-4 border-l-amber-400',
  Cancelled: 'border-l-4 border-l-red-400',
};

export const scheduledStatusMessage = 'Your truck has been scheduled, details will follow.';

export const scheduledDispatchNote =
  'Note: The assignment is subject to cancellation by the customer. Your acknowledgement constitutes acceptance of the assignment and a commitment to perform as scheduled.';
