import { base44 } from '@/api/base44Client';
import { formatDispatchDateTime } from '@/lib/dispatchFormatters';

/**
 * Create (or deduplicate) owner notifications for a dispatch status change.
 * One notification per CompanyOwner code per (dispatch, status).
 * Stores required_trucks so we can compute pending count later.
 */
export async function notifyDispatchChange(dispatch, oldStatus, newStatus, companies, accessCodes) {
  try {
    if (!dispatch?.id) return;

    // Fetch company if not provided
    let company = companies ? companies.find(c => c.id === dispatch.company_id) : null;
    if (!company) {
      const fetched = await base44.entities.Company.filter({ id: dispatch.company_id }, '-created_date', 1);
      company = fetched?.[0];
    }
    if (!company) return;

    // Fetch CompanyOwner access codes if not provided
    let ownerCodes = accessCodes
      ? accessCodes.filter(ac => ac.active_flag && ac.code_type === 'CompanyOwner' && ac.company_id === company.id)
      : null;
    if (!ownerCodes || ownerCodes.length === 0) {
      ownerCodes = await base44.entities.AccessCode.filter({
        company_id: dispatch.company_id,
        active_flag: true,
        code_type: 'CompanyOwner',
      });
    }

    // CompanyOwner codes whose allowed_trucks intersect dispatch
    const affectedOwnerCodes = ownerCodes.filter(ac => {
      if (!ac.active_flag) return false;
      if (ac.code_type !== 'CompanyOwner') return false;
      if (ac.company_id !== company.id) return false;
      const intersection = (dispatch.trucks_assigned || []).filter(t =>
        (ac.allowed_trucks || []).includes(t)
      );
      return intersection.length > 0;
    });

    if (!affectedOwnerCodes || affectedOwnerCodes.length === 0) return;

    const statusLabels = {
      Scheduled: 'Scheduled (details to follow)',
      Dispatch: 'Dispatch',
      Amended: 'Amended',
      Cancelled: 'Cancelled',
    };
    const statusText = statusLabels[newStatus] || newStatus;

    for (const ac of affectedOwnerCodes) {
      const dedupKey = `${dispatch.id}:${newStatus}:${ac.id}`;

      // Check for existing notification with this dedup key for this recipient
      const existing = await base44.entities.Notification.filter({
        recipient_access_code_id: ac.id,
        dispatch_status_key: dedupKey,
      }, '-created_date', 1);

      if (existing && existing.length > 0) continue;

      const relevantTrucks = (dispatch.trucks_assigned || []).filter(t =>
        (ac.allowed_trucks || []).includes(t)
      );

      // Build truck summary: show list if ≤3, otherwise count
      const truckSummary = relevantTrucks.length <= 3
        ? `Trucks: ${relevantTrucks.join(', ')}`
        : `${relevantTrucks.length} trucks assigned`;

      const dispatchDateTimeText = formatDispatchDateTime({
        date: dispatch.date,
        start_time: dispatch.start_time,
        status: newStatus,
      });
      const title = [dispatchDateTimeText, statusText].filter(Boolean).join(' · ');
      const message = [
        dispatch.client_name ? dispatch.client_name : null,
        truckSummary,
      ].filter(Boolean).join(' | ');

      await base44.entities.Notification.create({
        recipient_type: 'AccessCode',
        recipient_access_code_id: ac.id,
        recipient_id: ac.id,
        recipient_company_id: company.id,
        title,
        message,
        related_dispatch_id: dispatch.id,
        read_flag: false,
        dispatch_status_key: dedupKey,
        required_trucks: relevantTrucks,
      });
    }
  } catch (err) {
    console.error('Error creating dispatch notifications:', err);
  }
}

/**
 * After a truck confirms, check if all required trucks for the owner's notification
 * are now confirmed. If so, mark the notification as read (resolved).
 */
/**
 * After a truck confirms, check if all required trucks for the owner's notification
 * are now confirmed. If so, mark the notification as read (resolved).
 * ownerAccessCodeId: the session.id of the CompanyOwner who confirmed.
 */
export async function resolveOwnerNotificationIfComplete(dispatch, confirmations, ownerAccessCodeId) {
  try {
    const status = dispatch.status;
    const dedupKey = `${dispatch.id}:${status}:${ownerAccessCodeId}`;

    const ownerNotifs = await base44.entities.Notification.filter({
      recipient_access_code_id: ownerAccessCodeId,
      dispatch_status_key: dedupKey,
    }, '-created_date', 5);

    if (!ownerNotifs || ownerNotifs.length === 0) return;

    const confirmedTrucksForStatus = confirmations
      .filter(c => c.dispatch_id === dispatch.id && c.confirmation_type === status)
      .map(c => c.truck_number);

    for (const notif of ownerNotifs) {
      if (notif.read_flag) continue;

      const required = notif.required_trucks || [];
      if (required.length === 0) continue;

      const allConfirmed = required.every(t => confirmedTrucksForStatus.includes(t));
      if (allConfirmed) {
        await base44.entities.Notification.update(notif.id, { read_flag: true });
      }
    }
  } catch (error) {
    console.error('Error resolving owner notifications:', error);
  }
}

/**
 * Create notification when truck confirms receipt (admin notification).
 */
export async function notifyTruckConfirmation(dispatch, truckNumber, companyName) {
  try {
    await base44.entities.Notification.create({
      recipient_type: 'Admin',
      title: `Truck ${truckNumber} Confirmed`,
      message: `${dispatch.date} · ${dispatch.shift_time} · ${dispatch.status}${companyName ? ` | ${companyName}` : ''}${dispatch.client_name ? ` | ${dispatch.client_name}` : ''}`,
      related_dispatch_id: dispatch.id,
      read_flag: false,
      // Group key so all truck confirmations for the same dispatch+status can be bulk-resolved
      admin_group_key: `${dispatch.id}:${dispatch.status}`,
      confirmation_type: dispatch.status,
    });
  } catch (err) {
    console.error('Error creating confirmation notification:', err);
  }
}
