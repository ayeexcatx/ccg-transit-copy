import { base44 } from '@/api/base44Client';

/**
 * Create (or deduplicate) owner notifications for a dispatch status change.
 * One notification per CompanyOwner code per (dispatch, status).
 * Stores required_trucks so we can compute pending count later.
 */
export async function notifyDispatchChange(dispatch, oldStatus, newStatus, companies, accessCodes) {
  try {
    const company = companies.find(c => c.id === dispatch.company_id);
    if (!company) return;

    // CompanyOwner codes whose allowed_trucks intersect dispatch
    const affectedOwnerCodes = accessCodes.filter(ac => {
      if (!ac.active_flag) return false;
      if (ac.code_type !== 'CompanyOwner') return false;
      if (ac.company_id !== company.id) return false;
      const intersection = (dispatch.trucks_assigned || []).filter(t =>
        (ac.allowed_trucks || []).includes(t)
      );
      return intersection.length > 0;
    });

    if (affectedOwnerCodes.length === 0) return;

    const statusLabels = {
      Confirmed: 'Confirmed (details to follow)',
      Dispatched: 'Dispatched',
      Amended: 'Amended',
      Canceled: 'Canceled',
    };
    const statusText = statusLabels[newStatus] || newStatus;
    const titlePrefix = `Dispatch ${statusText}`;

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

      const message = [
        `${dispatch.date} · ${dispatch.shift_time} shift · ${statusText}`,
        dispatch.client_name ? dispatch.client_name : null,
        truckSummary,
      ].filter(Boolean).join(' | ');

      await base44.entities.Notification.create({
        recipient_type: 'AccessCode',
        recipient_access_code_id: ac.id,
        recipient_company_id: company.id,
        title: titlePrefix,
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
export async function resolveOwnerNotificationIfComplete(dispatch, confirmations, accessCodes) {
  try {
    const status = dispatch.status;
    // Find all owner notifications for this dispatch+status (keys now include owner id)
    const ownerNotifs = await base44.entities.Notification.filter({
      related_dispatch_id: dispatch.id,
      recipient_type: 'AccessCode',
    }, '-created_date', 50);

    const filteredOwnerNotifs = (ownerNotifs || []).filter(n => {
      const key = n.dispatch_status_key || '';
      return key.startsWith(`${dispatch.id}:${status}:`);
    });

    if (!filteredOwnerNotifs || filteredOwnerNotifs.length === 0) return;

    const confirmedTrucksForStatus = confirmations
      .filter(c => c.dispatch_id === dispatch.id && c.confirmation_type === status)
      .map(c => c.truck_number);

    for (const notif of filteredOwnerNotifs) {
      if (notif.read_flag) continue; // already resolved

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
      message: `${dispatch.date} · ${dispatch.shift_time} shift · ${dispatch.status}${companyName ? ` | ${companyName}` : ''}${dispatch.client_name ? ` | ${dispatch.client_name}` : ''}`,
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