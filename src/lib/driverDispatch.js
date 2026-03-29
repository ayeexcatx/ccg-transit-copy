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
  const driverDispatchRows = await base44.entities.DriverDispatch.filter({ driver_id: driverId }, '-created_date', 1000);

  return (driverDispatchRows || []).map(normalizeDriverDispatchRecord).filter(Boolean);
}
