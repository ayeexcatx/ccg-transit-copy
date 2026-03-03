import { startOfDay, parseISO, isSameDay, isAfter, isBefore } from 'date-fns';

/**
 * Returns 'today', 'upcoming', or 'history' for a dispatch.
 * Bucketing is purely calendar-date based (local timezone).
 * Canceled status does NOT auto-route to History — it stays in Today/Upcoming by date.
 * archived_flag always goes to History.
 */
export function getDispatchBucket(d) {
  if (!d.date) return null;
  if (d.archived_flag) return 'history';

  const todayStart = startOfDay(new Date());
  const dispatchDateStart = startOfDay(parseISO(d.date));

  if (isSameDay(dispatchDateStart, todayStart)) return 'today';
  if (isAfter(dispatchDateStart, todayStart)) return 'upcoming';
  if (isBefore(dispatchDateStart, todayStart)) return 'history';
  return null;
}