import { base44 } from '@/api/base44Client';
import { clearRemovedTruckDriverAssignments } from '@/services/driverAssignmentMutationService';
import {
  notifyOwnerTruckReassignment,
  reconcileOwnerNotificationsForDispatch,
  expandCurrentStatusRequiredTrucks,
} from '@/components/notifications/createNotifications';
import { getConfirmationsForDispatchStatus } from '@/components/notifications/confirmationStateHelpers';

function formatConflictDispatchSummary(dispatch) {
  const parts = [
    dispatch?.job_number ? `JOB #${dispatch.job_number}` : dispatch?.job_number,
    dispatch?.start_time,
    dispatch?.reference_tag,
  ].filter((value) => value && String(value).trim());
  return parts.join(' • ');
}

function getOwnerDisplayName(session) {
  if (!session) return 'Company owner';
  return session.label || session.name || session.code || 'Company owner';
}

/**
 * Orchestrates owner truck replacement and swap behavior for a dispatch.
 * Keeps existing mutation ordering and side effects intact.
 */
export async function runOwnerTruckEditMutation({
  dispatch,
  nextTrucks,
  session,
  confirmations,
  actorMetadata,
  requestTruckSwapConfirmation,
}) {
  if (!dispatch?.id) throw new Error('Dispatch missing');

  const normalizedNext = [...new Set((nextTrucks || []).filter(Boolean))];
  if (!normalizedNext.length) throw new Error('Please assign at least one truck.');

  const ownerCompanyId = dispatch.company_id || session?.company_id || null;
  const companies = ownerCompanyId
    ? await base44.entities.Company.filter({ id: ownerCompanyId }, '-created_date', 1)
    : [];
  const companyTrucks = Array.isArray(companies?.[0]?.trucks) ? companies[0].trucks : [];
  const allowedSet = new Set(companyTrucks);
  const hasUnauthorizedTruck = normalizedNext.some((truck) => !allowedSet.has(truck));
  if (hasUnauthorizedTruck) throw new Error('You can only assign trucks from your own company.');

  const previousTrucks = dispatch.trucks_assigned || [];
  if (normalizedNext.length !== previousTrucks.length) {
    throw new Error(`Truck count must remain ${previousTrucks.length}. You can only replace trucks one-for-one.`);
  }

  const removedTrucks = previousTrucks.filter((truck) => !normalizedNext.includes(truck));
  const addedTrucks = normalizedNext.filter((truck) => !previousTrucks.includes(truck));
  const hasChanges = addedTrucks.length > 0 || removedTrucks.length > 0;

  if (!hasChanges) return { updated: false };

  const sameCompanyDispatches = await base44.entities.Dispatch.filter({
    company_id: dispatch.company_id,
    date: dispatch.date,
    shift_time: dispatch.shift_time,
  }, '-created_date', 500);

  const conflictByTruck = new Map();
  (sameCompanyDispatches || []).forEach((candidate) => {
    if (!candidate?.id || candidate.id === dispatch.id) return;
    (candidate.trucks_assigned || []).forEach((truck) => conflictByTruck.set(truck, candidate));
  });

  const conflictingAdded = addedTrucks.filter((truck) => conflictByTruck.has(truck));
  if (conflictingAdded.length > 1) {
    throw new Error('Unable to swap multiple conflicting trucks in one save. Please update one truck at a time.');
  }

  const actorName = getOwnerDisplayName(session);
  const currentStatus = dispatch.status;

  if (conflictingAdded.length === 1) {
    const incomingTruck = conflictingAdded[0];
    const conflictingDispatch = conflictByTruck.get(incomingTruck);
    const outgoingTruck = removedTrucks[0];

    if (!outgoingTruck) {
      throw new Error('No removable truck is available to complete this swap. Please remove one truck first.');
    }

    const conflictSummary = formatConflictDispatchSummary(conflictingDispatch);
    const confirmed = await requestTruckSwapConfirmation({
      incomingTruck,
      outgoingTruck,
      conflictSummary,
    });
    if (!confirmed) return { updated: false, cancelled: true };

    const conflictingCurrent = conflictingDispatch.trucks_assigned || [];
    if (!conflictingCurrent.includes(incomingTruck)) {
      throw new Error(`${incomingTruck} is no longer assigned on the other dispatch. Please refresh and try again.`);
    }

    const conflictingNext = conflictingCurrent
      .filter((truck) => truck !== incomingTruck)
      .concat(outgoingTruck);

    const dedupConflicting = [...new Set(conflictingNext.filter(Boolean))];
    if (dedupConflicting.length !== conflictingNext.length) {
      throw new Error('Swap would create duplicate trucks on the conflicting dispatch.');
    }

    const updatedDispatch = await base44.entities.Dispatch.update(dispatch.id, {
      trucks_assigned: normalizedNext,
      admin_activity_log: [
        {
          timestamp: new Date().toISOString(),
          actor_type: 'CompanyOwner',
          actor_id: session?.id,
          actor_name: actorName,
          action: 'owner_swapped_trucks',
          message: `${actorName} swapped ${outgoingTruck} for ${incomingTruck}`,
        },
        ...(Array.isArray(dispatch.admin_activity_log) ? dispatch.admin_activity_log : []),
      ],
    });

    const updatedConflictingDispatch = await base44.entities.Dispatch.update(conflictingDispatch.id, {
      trucks_assigned: dedupConflicting,
      admin_activity_log: [
        {
          timestamp: new Date().toISOString(),
          actor_type: 'CompanyOwner',
          actor_id: session?.id,
          actor_name: actorName,
          action: 'owner_swap_received_truck',
          message: `${actorName} swapped ${incomingTruck} with ${outgoingTruck}`,
        },
        ...(Array.isArray(conflictingDispatch.admin_activity_log) ? conflictingDispatch.admin_activity_log : []),
      ],
    });

    await clearRemovedTruckDriverAssignments({
      dispatch: updatedDispatch,
      removedTrucks,
      session,
    });
    await clearRemovedTruckDriverAssignments({
      dispatch: updatedConflictingDispatch,
      removedTrucks: [incomingTruck],
      session,
    });

    const currentStatusConfirmations = getConfirmationsForDispatchStatus({
      confirmations,
      dispatchId: dispatch.id,
      status: currentStatus,
    });

    const conflictingStatus = conflictingDispatch.status;
    const conflictingStatusConfirmations = getConfirmationsForDispatchStatus({
      confirmations,
      dispatchId: conflictingDispatch.id,
      status: conflictingStatus,
    });

    const removeConfirmationIds = currentStatusConfirmations
      .filter((confirmation) => removedTrucks.includes(confirmation.truck_number))
      .map((confirmation) => confirmation.id)
      .filter(Boolean);

    if (removeConfirmationIds.length > 0) {
      await Promise.all(removeConfirmationIds.map((id) => base44.entities.Confirmation.delete(id)));
    }

    await Promise.all(addedTrucks.map((truck) =>
      base44.entities.Confirmation.create({
        dispatch_id: dispatch.id,
        access_code_id: session.id,
        truck_number: truck,
        confirmation_type: currentStatus,
        confirmed_at: new Date().toISOString(),
        confirmed_by_name: actorMetadata.actorName || undefined,
        confirmed_by_type: actorMetadata.actorType || undefined,
      })
    ));

    const conflictingRemovedConfirmationIds = conflictingStatusConfirmations
      .filter((confirmation) => confirmation.truck_number === incomingTruck)
      .map((confirmation) => confirmation.id)
      .filter(Boolean);

    if (conflictingRemovedConfirmationIds.length > 0) {
      await Promise.all(conflictingRemovedConfirmationIds.map((id) => base44.entities.Confirmation.delete(id)));
    }

    const outgoingAlreadyConfirmedOnConflicting = conflictingStatusConfirmations
      .some((confirmation) => confirmation.truck_number === outgoingTruck);
    const incomingWasConfirmedOnConflicting = conflictingStatusConfirmations
      .some((confirmation) => confirmation.truck_number === incomingTruck);

    if (!outgoingAlreadyConfirmedOnConflicting && incomingWasConfirmedOnConflicting) {
      await base44.entities.Confirmation.create({
        dispatch_id: conflictingDispatch.id,
        access_code_id: session.id,
        truck_number: outgoingTruck,
        confirmation_type: conflictingStatus,
        confirmed_at: new Date().toISOString(),
        confirmed_by_name: actorMetadata.actorName || undefined,
        confirmed_by_type: actorMetadata.actorType || undefined,
      });
    }

    await expandCurrentStatusRequiredTrucks(updatedDispatch, addedTrucks);
    await expandCurrentStatusRequiredTrucks(updatedConflictingDispatch, [outgoingTruck]);
    await reconcileOwnerNotificationsForDispatch(updatedDispatch);
    await reconcileOwnerNotificationsForDispatch(updatedConflictingDispatch);

    await notifyOwnerTruckReassignment({
      dispatch: updatedDispatch,
      actorName,
      swapDetails: {
        fromTruck: outgoingTruck,
        toTruck: incomingTruck,
        conflictingDispatchStatus: conflictingDispatch.status,
      },
    });

    return { updated: true, affectedDispatchIds: [dispatch.id, conflictingDispatch.id] };
  }

  const updatedDispatch = await base44.entities.Dispatch.update(dispatch.id, {
    trucks_assigned: normalizedNext,
    admin_activity_log: [
      {
        timestamp: new Date().toISOString(),
        actor_type: 'CompanyOwner',
        actor_id: session?.id,
        actor_name: actorName,
        action: 'owner_updated_truck_assignments',
        message: `${actorName} updated truck assignments`,
      },
      ...(Array.isArray(dispatch.admin_activity_log) ? dispatch.admin_activity_log : []),
    ],
  });

  await clearRemovedTruckDriverAssignments({
    dispatch: updatedDispatch,
    removedTrucks,
    session,
  });

  const currentStatusConfirmations = getConfirmationsForDispatchStatus({
    confirmations,
    dispatchId: dispatch.id,
    status: currentStatus,
  });

  const removeConfirmationIds = currentStatusConfirmations
    .filter((confirmation) => removedTrucks.includes(confirmation.truck_number))
    .map((confirmation) => confirmation.id)
    .filter(Boolean);

  if (removeConfirmationIds.length > 0) {
    await Promise.all(removeConfirmationIds.map((id) => base44.entities.Confirmation.delete(id)));
  }

  await Promise.all(addedTrucks.map((truck) =>
    base44.entities.Confirmation.create({
      dispatch_id: dispatch.id,
      access_code_id: session.id,
      truck_number: truck,
      confirmation_type: currentStatus,
      confirmed_at: new Date().toISOString(),
      confirmed_by_name: actorMetadata.actorName || undefined,
      confirmed_by_type: actorMetadata.actorType || undefined,
    })
  ));

  await expandCurrentStatusRequiredTrucks(updatedDispatch, addedTrucks);
  await reconcileOwnerNotificationsForDispatch(updatedDispatch);

  await notifyOwnerTruckReassignment({
    dispatch: updatedDispatch,
    actorName,
    changeDetails: {
      fromTruck: removedTrucks[0],
      toTruck: addedTrucks[0],
    },
  });

  return { updated: true, affectedDispatchIds: [dispatch.id] };
}
