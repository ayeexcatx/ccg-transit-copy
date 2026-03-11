import { addDays, format } from 'date-fns';

export const VIEW_MODES = ['day', 'week', 'month'];
export const STATUS_AVAILABLE = 'Available';
export const STATUS_UNAVAILABLE = 'Unavailable';

export const WEEKDAY_LABELS = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
};

export function getOperationalShifts(weekday) {
  if (weekday >= 1 && weekday <= 5) return ['Day', 'Night'];
  if (weekday === 0) return ['Night'];
  return [];
}

export function buildShiftLabel(availability) {
  if (availability.status === STATUS_UNAVAILABLE) return STATUS_UNAVAILABLE;
  if (availability.available_truck_count) return `${STATUS_AVAILABLE} (${availability.available_truck_count})`;
  return STATUS_AVAILABLE;
}

export function getStatusClass(status) {
  return status === STATUS_UNAVAILABLE ? 'text-red-700' : 'text-green-700';
}

export function normalizeCount(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function toDateKey(date) {
  return format(date, 'yyyy-MM-dd');
}

export function resolveAvailabilityForCompanyShift({ companyId, date, shift, defaultMap, overrideMap }) {
  const override = overrideMap.get(`${companyId}-${toDateKey(date)}-${shift}`);
  if (override) return override;

  const recurring = defaultMap.get(`${companyId}-${date.getDay()}-${shift}`);
  if (recurring) return recurring;

  return { status: STATUS_AVAILABLE, available_truck_count: null };
}

export function getAvailabilitySummaryTargets(today = new Date()) {
  const isFriday = today.getDay() === 5;
  if (isFriday) {
    const sunday = addDays(today, 2);
    const monday = addDays(today, 3);
    return [
      { label: "Today's Day Shift", date: today, shift: 'Day' },
      { label: "Today's Night Shift", date: today, shift: 'Night' },
      { label: "Sunday's Night Shift", date: sunday, shift: 'Night' },
      { label: "Monday's Day Shift", date: monday, shift: 'Day' },
      { label: "Monday's Night Shift", date: monday, shift: 'Night' },
    ];
  }

  const tomorrow = addDays(today, 1);
  return [
    { label: "Today's Day Shift", date: today, shift: 'Day' },
    { label: "Today's Night Shift", date: today, shift: 'Night' },
    { label: "Tomorrow's Day Shift", date: tomorrow, shift: 'Day' },
    { label: "Tomorrow's Night Shift", date: tomorrow, shift: 'Night' },
  ];
}

export function normalizeDispatchShift(shiftTime) {
  if (shiftTime === 'Day' || shiftTime === 'Day Shift') return 'Day';
  if (shiftTime === 'Night' || shiftTime === 'Night Shift') return 'Night';
  return null;
}

export function countUsedTrucksForCompanyShift(dispatches, companyId, dateKey, shift) {
  return (dispatches || []).reduce((total, dispatch) => {
    if (!dispatch) return total;
    if (dispatch.company_id !== companyId) return total;
    if (dispatch.date !== dateKey) return total;
    if (dispatch.status === 'Completed' || dispatch.status === 'Cancelled') return total;
    if (normalizeDispatchShift(dispatch.shift_time) !== shift) return total;
    return total + (dispatch.trucks_assigned || []).length;
  }, 0);
}
