import { base44 } from '@/api/base44Client';

/**
 * Create notifications for dispatch status changes
 */
export async function notifyDispatchChange(dispatch, oldStatus, newStatus, companies, accessCodes) {
  try {
    const company = companies.find(c => c.id === dispatch.company_id);
    if (!company) return;

    const affectedAccessCodes = accessCodes.filter(ac => {
      if (!ac.active_flag) return false;
      if (ac.company_id !== company.id) return false;
      
      // Check if this access code has any trucks in the dispatch
      const intersection = (dispatch.trucks_assigned || []).filter(t => 
        (ac.allowed_trucks || []).includes(t)
      );
      return intersection.length > 0;
    });

    const statusText = {
      Confirmed: 'confirmed',
      Dispatched: 'dispatched',
      Amended: 'amended',
      Canceled: 'canceled'
    }[newStatus] || newStatus;

    const notifications = affectedAccessCodes.map(ac => ({
      recipient_type: 'AccessCode',
      recipient_access_code_id: ac.id,
      recipient_company_id: company.id,
      title: `Dispatch ${statusText}`,
      message: `Dispatch for ${dispatch.date} (${dispatch.shift_time} shift) has been ${statusText}${dispatch.client_name ? ` - ${dispatch.client_name}` : ''}`,
      related_dispatch_id: dispatch.id,
      read_flag: false
    }));

    if (notifications.length > 0) {
      await base44.entities.Notification.bulkCreate(notifications);
    }
  } catch (error) {
    console.error('Error creating dispatch notifications:', error);
  }
}

/**
 * Create notification when truck confirms receipt
 */
export async function notifyTruckConfirmation(dispatch, truckNumber, companyName) {
  try {
    await base44.entities.Notification.create({
      recipient_type: 'Admin',
      title: 'Truck Confirmed Receipt',
      message: `Truck ${truckNumber} confirmed dispatch for ${dispatch.date} (${dispatch.shift_time} shift)${dispatch.job_number ? ` - Job #${dispatch.job_number}` : ''}${companyName ? ` (${companyName})` : ''}`,
      related_dispatch_id: dispatch.id,
      read_flag: false
    });

    // Optional: Email/SMS integration (Base44 integrations)
    // Uncomment if email is needed
    /*
    try {
      const adminEmails = await getAdminEmails(); // You'd need to implement this
      if (adminEmails.length > 0) {
        await base44.integrations.Core.SendEmail({
          to: adminEmails.join(','),
          subject: `Truck ${truckNumber} Confirmed Receipt`,
          body: `Truck ${truckNumber} has confirmed receipt of dispatch for ${dispatch.date} (${dispatch.shift_time} shift)${dispatch.job_number ? ` - Job #${dispatch.job_number}` : ''}`
        });
      }
    } catch (emailError) {
      console.error('Failed to send email notification:', emailError);
    }
    */
  } catch (error) {
    console.error('Error creating confirmation notification:', error);
  }
}