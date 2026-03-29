import { base44 } from '@/api/base44Client';

const ACTIVE_DRIVER_STATUSES = new Set(['sent', 'seen']);

export function normalizeDriverDispatchRecord(record = {}) {
  if (!record) return null;
  return {
    ...record,
    delivery_status: String(record.delivery_status || '').toLowerCase(),
    active_flag: record.active_flag !== false,
    is_visible_to_driver: record.is_visible_to_driver === true,
  };
}

export function isDriverDispatchVisibleToDriver(record = {}) {
  const normalized = normalizeDriverDispatchRecord(record);
  if (!normalized) return false;
  return normalized.active_flag && normalized.is_visible_to_driver && ACTIVE_DRIVER_STATUSES.has(normalized.delivery_status);
}

export async function listDriverDispatchesForDriver(driverId) {
  if (!driverId) return [];
  const [driverDispatchRows, legacyAssignments] = await Promise.all([
    base44.entities.DriverDispatch.filter({ driver_id: driverId }, '-created_date', 1000),
    base44.entities.DriverDispatchAssignment.filter({ driver_id: driverId }, '-assigned_datetime', 1000),
  ]);

  const normalizedRows = (driverDispatchRows || []).map(normalizeDriverDispatchRecord).filter(Boolean);
  const seenKeys = new Set(normalizedRows.map((row) => `${row.dispatch_id}:${row.truck_number}:${row.driver_id}`));

  const legacyCompatRows = (legacyAssignments || [])
    .filter((assignment) => assignment?.active_flag !== false)
    .map((assignment) => ({
      dispatch_id: assignment.dispatch_id,
      company_id: assignment.company_id,
      driver_id: assignment.driver_id,
      driver_name: assignment.driver_name,
      truck_number: assignment.truck_number,
      delivery_status: assignment.receipt_confirmed_at ? 'seen' : 'sent',
      is_visible_to_driver: true,
      sent_at: assignment.assigned_datetime || assignment.created_date,
      last_seen_at: assignment.receipt_confirmed_at || null,
      last_opened_at: assignment.receipt_confirmed_at || null,
      active_flag: true,
      _source: 'legacy_assignment_compat',
      _legacy_assignment_id: assignment.id,
    }))
    .filter((row) => !seenKeys.has(`${row.dispatch_id}:${row.truck_number}:${row.driver_id}`));

  return [...normalizedRows, ...legacyCompatRows];
}
