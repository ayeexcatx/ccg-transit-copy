import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle2 } from 'lucide-react';

/**
 * Shows "Pending confirmations: X/Y trucks" for owner notifications,
 * or nothing for resolved / non-owner notifications.
 */
export default function NotificationStatusBadge({ notification, confirmations = [], dispatch }) {
  const required =
    Array.isArray(dispatch?.trucks_assigned) && dispatch.trucks_assigned.length > 0
      ? dispatch.trucks_assigned
      : (notification.required_trucks || []);
  if (!required || required.length === 0) return null;

  // Parse the status from dedup key: "{dispatch_id}:{status}"
  const dispatchId = notification.related_dispatch_id;
  const dedupKey = notification.dispatch_status_key || '';
  const status = dedupKey.includes(':') ? dedupKey.slice(dedupKey.indexOf(':') + 1) : '';

  if (!dispatchId || !status) return null;

  const confirmed = required.filter(truck =>
    confirmations.some(c =>
      c.dispatch_id === dispatchId &&
      c.truck_number === truck &&
      c.confirmation_type === status
    )
  );

  const total = required.length;
  const done = confirmed.length;
  const isResolved = (total > 0 && done === total);

  if (isResolved) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
        <CheckCircle2 className="h-3 w-3" />All confirmed
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
      <Clock className="h-3 w-3" />
      Pending confirmations: {done}/{total} trucks
    </span>
  );
}
