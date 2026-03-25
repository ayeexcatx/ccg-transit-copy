import React, { useState, useMemo, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../components/session/SessionContext';
import DispatchCard from '../components/portal/DispatchCard';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Truck, Inbox } from 'lucide-react';
import { startOfDay, parseISO } from 'date-fns';
import { areAllAssignedTrucksTimeComplete } from '@/lib/timeLogs';
import { getDispatchBucket } from '../components/portal/dispatchBuckets';
import { sortTemplateNotesForDispatch } from '@/lib/templateNotes';
import {
  notifyTruckConfirmation,
  resolveOwnerNotificationIfComplete,
  notifyOwnerTruckReassignment,
  reconcileOwnerNotificationsForDispatch,
  expandCurrentStatusRequiredTrucks,
} from '../components/notifications/createNotifications';
import { clearRemovedTruckDriverAssignments } from '@/services/driverAssignmentMutationService';
import { useConfirmationsQuery, confirmationsQueryKey } from '../components/notifications/useConfirmationsQuery';
import { useOwnerNotifications } from '../components/notifications/useOwnerNotifications';
import {
  buildDriverAssignedTrucksByDispatch,
  canUserSeeDispatch,
  normalizeVisibilityId,
} from '@/lib/dispatchVisibility';
import { buildConfirmedTruckSetForStatus, getConfirmationsForDispatchStatus } from '@/components/notifications/confirmationStateHelpers';


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

function getSessionActorMetadata(session) {
  const actorName = session?.label || session?.name || session?.driver_name || session?.code || '';
  return {
    actorName,
    actorType: session?.code_type || '',
  };
}

const normalizeId = (value) => normalizeVisibilityId(value);
function myTrucksForHistory(dispatch, timeEntries, session) {
  const trucks = (session?.allowed_trucks || []).filter(t => (dispatch.trucks_assigned || []).includes(t));
  if (trucks.length === 0) return false;
  const dispatchEntries = timeEntries.filter((te) => te.dispatch_id === dispatch.id && trucks.includes(te.truck_number));
  return areAllAssignedTrucksTimeComplete({ trucks_assigned: trucks }, dispatchEntries);
}

export default function Portal() {
  const { session } = useSession();
  const [tab, setTab] = useState('today');
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatchRefs = useRef({});
  const [drawerDispatchId, setDrawerDispatchId] = useState('');
  const pendingOpenIdRef = useRef('');
  const lastHandledDispatchIdRef = useRef('');
  const drawerDispatchIdRef = useRef('');
  const pendingOwnerConfirmationKeysRef = useRef(new Set());
  const swapConfirmationResolverRef = useRef(null);

  const urlParams = new URLSearchParams(location.search);
  const targetDispatchId = normalizeId(urlParams.get('dispatchId'));
  const targetNotificationId = normalizeId(urlParams.get('notificationId'));
  const actorMetadata = getSessionActorMetadata(session);

  const { data: dispatches = [] } = useQuery({
    queryKey: ['portal-dispatches', session?.company_id],
    queryFn: () => base44.entities.Dispatch.filter({ company_id: session.company_id }, '-date', 200),
    enabled: !!session?.company_id,
  });

  const { data: driverAssignments = [] } = useQuery({
    queryKey: ['driver-dispatch-assignments', session?.driver_id],
    queryFn: () => base44.entities.DriverDispatchAssignment.filter({ driver_id: session.driver_id }, '-assigned_datetime', 500),
    enabled: session?.code_type === 'Driver' && !!session?.driver_id,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.list(),
  });

  const { data: confirmations = [] } = useConfirmationsQuery(true);
  const [swapConfirmationState, setSwapConfirmationState] = useState({
    open: false,
    incomingTruck: '',
    outgoingTruck: '',
    conflictSummary: '',
  });
  const [removedAssignmentModalState, setRemovedAssignmentModalState] = useState({
    open: false,
    notificationId: '',
    title: 'Dispatch assignment no longer available',
    message: '',
  });

  const { data: timeEntries = [] } = useQuery({
    queryKey: ['time-entries'],
    queryFn: () => base44.entities.TimeEntry.list('-created_date', 500),
  });

  const { data: templateNotes = [] } = useQuery({
    queryKey: ['template-notes'],
    queryFn: () => base44.entities.DispatchTemplateNotes.filter({ active_flag: true }),
  });
  const { notifications, markDriverDispatchSeenAsync, markDriverRemovalNotificationSeenAsync } = useOwnerNotifications(session);

  const confirmMutation = useMutation({
    mutationFn: (data) => base44.entities.Confirmation.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: confirmationsQueryKey }),
  });

  const requestTruckSwapConfirmation = ({ incomingTruck, outgoingTruck, conflictSummary }) =>
    new Promise((resolve) => {
      swapConfirmationResolverRef.current = resolve;
      setSwapConfirmationState({
        open: true,
        incomingTruck,
        outgoingTruck,
        conflictSummary,
      });
    });

  const closeTruckSwapConfirmation = (confirmed) => {
    setSwapConfirmationState((current) => ({ ...current, open: false }));
    if (swapConfirmationResolverRef.current) {
      swapConfirmationResolverRef.current(confirmed);
      swapConfirmationResolverRef.current = null;
    }
  };

  const today = startOfDay(new Date());

  const timeEntryMutation = useMutation({
    mutationFn: async ({ dispatch, entries }) => {
      const savedEntries = [];

      for (const { truck, start, end } of entries) {
        const existing = timeEntries.find(te =>
          te.dispatch_id === dispatch.id && te.truck_number === truck && te.access_code_id === session.id
        );

        if (existing) {
          const updated = await base44.entities.TimeEntry.update(existing.id, {
            start_time: start !== undefined ? start : existing.start_time,
            end_time: end !== undefined ? end : existing.end_time,
            entered_by_name: existing.entered_by_name || actorMetadata.actorName || undefined,
            entered_by_type: existing.entered_by_type || actorMetadata.actorType || undefined,
          });
          savedEntries.push(updated);
          continue;
        }

        const created = await base44.entities.TimeEntry.create({
          dispatch_id: dispatch.id,
          access_code_id: session.id,
          truck_number: truck,
          start_time: start,
          end_time: end,
          entered_by_name: actorMetadata.actorName || undefined,
          entered_by_type: actorMetadata.actorType || undefined,
        });
        savedEntries.push(created);
      }

      const dispatchEntries = timeEntries
        .filter((te) => te.dispatch_id === dispatch.id)
        .map((te) => {
          const update = entries.find((entry) => entry.truck === te.truck_number);
          if (!update) return te;
          return {
            ...te,
            start_time: update.start !== undefined ? update.start : te.start_time,
            end_time: update.end !== undefined ? update.end : te.end_time,
          };
        });

      for (const entry of entries) {
        if (dispatchEntries.some((te) => te.truck_number === entry.truck)) continue;
        dispatchEntries.push({
          dispatch_id: dispatch.id,
          truck_number: entry.truck,
          start_time: entry.start,
          end_time: entry.end,
        });
      }

      const allComplete = areAllAssignedTrucksTimeComplete(dispatch, dispatchEntries);
      const dispatchDate = dispatch.date ? startOfDay(parseISO(dispatch.date)) : null;
      const isPastOrToday = dispatchDate && dispatchDate <= today;
      if (allComplete && isPastOrToday && !dispatch.archived_flag) {
        await base44.entities.Dispatch.update(dispatch.id, {
          archived_flag: true,
          archived_at: new Date().toISOString(),
          archived_reason: 'Time logged',
        });
        queryClient.invalidateQueries({ queryKey: ['portal-dispatches', session?.company_id] });
      }

      return savedEntries;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['time-entries'] }),
  });

  const updateOwnerTrucksMutation = useMutation({
    mutationFn: async ({ dispatch, nextTrucks }) => {
      if (!dispatch?.id) throw new Error('Dispatch missing');

      const normalizedNext = [...new Set((nextTrucks || []).filter(Boolean))];
      if (!normalizedNext.length) throw new Error('Please assign at least one truck.');

      const allowedSet = new Set(session?.allowed_trucks || []);
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
          log: (stage, payload) => console.log(`[clearRemovedTruckDriverAssignments] ${stage}`, payload),
        });
        await clearRemovedTruckDriverAssignments({
          dispatch: updatedConflictingDispatch,
          removedTrucks: [incomingTruck],
          log: (stage, payload) => console.log(`[clearRemovedTruckDriverAssignments] ${stage}`, payload),
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
        log: (stage, payload) => console.log(`[clearRemovedTruckDriverAssignments] ${stage}`, payload),
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
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['portal-dispatches', session?.company_id] });
      queryClient.invalidateQueries({ queryKey: ['dispatches-admin'] });
      queryClient.invalidateQueries({ queryKey: ['driver-dispatch-assignments'] });
      queryClient.invalidateQueries({ queryKey: ['driver-dispatch-assignments', variables?.dispatch?.id] });
      queryClient.invalidateQueries({ queryKey: ['driver-dispatch-assignments', session?.driver_id] });
      queryClient.invalidateQueries({ queryKey: ['incident-driver-dispatch-assignments', session?.driver_id] });
      (result?.affectedDispatchIds || []).forEach((dispatchId) => {
        queryClient.invalidateQueries({ queryKey: ['driver-dispatch-assignments', dispatchId] });
      });
      queryClient.invalidateQueries({ queryKey: confirmationsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['confirmations-admin'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleOwnerTruckUpdate = (dispatch, nextTrucks) => updateOwnerTrucksMutation.mutateAsync({ dispatch, nextTrucks });

  const driverAssignedTrucksByDispatch = useMemo(
    () => buildDriverAssignedTrucksByDispatch(driverAssignments),
    [driverAssignments]
  );

  const driverDispatchIds = useMemo(
    () => new Set(driverAssignedTrucksByDispatch.keys()),
    [driverAssignedTrucksByDispatch]
  );

  const isDriverUser = session?.code_type === 'Driver';

  const filteredDispatches = useMemo(
    () => dispatches.filter((dispatch) => canUserSeeDispatch(session, dispatch, { driverDispatchIds })),
    [dispatches, driverDispatchIds, session]
  );

  const upcomingDispatches = useMemo(() => filteredDispatches
    .filter(d => getDispatchBucket(d) === 'upcoming')
    .sort((a, b) => {
      // String compare on YYYY-MM-DD is safe — no Date parsing needed
      const dateDiff = a.date.localeCompare(b.date);
      if (dateDiff !== 0) return dateDiff;
      return (a.start_time || 'zzz').localeCompare(b.start_time || 'zzz');
    }), [filteredDispatches]);

  const todayDispatches = useMemo(() => filteredDispatches
    .filter(d => getDispatchBucket(d) === 'today')
    .sort((a, b) => {
      if (!a.start_time && !b.start_time) return 0;
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      return a.start_time.localeCompare(b.start_time);
    }), [filteredDispatches]);

  const historyDispatches = useMemo(() => filteredDispatches
    .filter(d => {
      if (getDispatchBucket(d) !== 'history') return false;
      if (!d.archived_flag) return myTrucksForHistory(d, timeEntries, session);
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date)),
  [filteredDispatches, timeEntries]);

  const companyMap = {};
  companies.forEach(c => { companyMap[c.id] = c.name; });

  const handleConfirm = async (dispatch, truck, confType) => {
    const confirmationKey = `${dispatch.id}:${truck}:${confType}`;
    const confirmedTruckSet = buildConfirmedTruckSetForStatus({
      confirmations,
      dispatchId: dispatch.id,
      status: confType,
    });
    const alreadyConfirmed = confirmedTruckSet.has(truck);
    if (alreadyConfirmed || pendingOwnerConfirmationKeysRef.current.has(confirmationKey)) return;

    pendingOwnerConfirmationKeysRef.current.add(confirmationKey);

    try {
      await confirmMutation.mutateAsync({
      dispatch_id: dispatch.id,
      access_code_id: session.id,
      truck_number: truck,
      confirmation_type: confType,
      confirmed_at: new Date().toISOString(),
      confirmed_by_name: actorMetadata.actorName || undefined,
      confirmed_by_type: actorMetadata.actorType || undefined,
    });

      const companyName = companyMap[dispatch.company_id];
      notifyTruckConfirmation(dispatch, truck, companyName);

      if (session?.code_type === 'CompanyOwner') {
        await resolveOwnerNotificationIfComplete(dispatch, null, session.id);
        await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
    } finally {
      pendingOwnerConfirmationKeysRef.current.delete(confirmationKey);
    }
  };

  const handleTimeEntry = async (dispatch, entries) => timeEntryMutation.mutateAsync({ dispatch, entries });

  const currentListBase = tab === 'upcoming' ? upcomingDispatches : tab === 'today' ? todayDispatches : historyDispatches;
  const normalizedDrawerDispatchId = normalizeId(drawerDispatchId);
  drawerDispatchIdRef.current = normalizedDrawerDispatchId;
  const currentOpenDispatch = normalizedDrawerDispatchId
    ? filteredDispatches.find((d) => normalizeId(d.id) === normalizedDrawerDispatchId)
    : null;
  const currentList = currentOpenDispatch && !currentListBase.some((d) => normalizeId(d.id) === normalizeId(currentOpenDispatch.id))
    ? [currentOpenDispatch, ...currentListBase]
    : currentListBase;
  const sortedNotes = sortTemplateNotesForDispatch(templateNotes);

  const targetNotification = notifications.find((notification) => normalizeId(notification.id) === targetNotificationId) || null;
  const removalNotification = session?.code_type === 'Driver' && targetNotification?.notification_type === 'driver_removed' ? targetNotification : null;
  const removalNotificationDispatch = removalNotification?.related_dispatch_id
    ? dispatches.find((dispatch) => normalizeId(dispatch.id) === normalizeId(removalNotification.related_dispatch_id)) || null
    : null;

  const dispatchNotFound = targetDispatchId && dispatches.length > 0 &&
    !dispatches.find(d => normalizeId(d.id) === targetDispatchId);


  const handleDrawerClose = () => {
    setDrawerDispatchId('');
    drawerDispatchIdRef.current = '';
    pendingOpenIdRef.current = '';
    lastHandledDispatchIdRef.current = '';

    if (!targetDispatchId) return;

    const nextParams = new URLSearchParams(location.search);
    nextParams.delete('dispatchId');
    nextParams.delete('notificationId');
    navigate({ search: nextParams.toString() ? `?${nextParams.toString()}` : '' }, { replace: true });
  };

  const openDrawer = (dispatchId) => {
    const normalizedId = normalizeId(dispatchId);
    if (!normalizedId) return false;
    if (drawerDispatchIdRef.current === normalizedId) return false;

    setDrawerDispatchId(normalizedId);
    drawerDispatchIdRef.current = normalizedId;

    setTimeout(() => {
      const el = dispatchRefs.current[normalizedId];
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);

    return true;
  };

  const handleDispatchOpen = (dispatch) => {
    if (session?.code_type !== 'Driver' || !dispatch?.id) return;
    markDriverDispatchSeenAsync({ dispatch, notificationId: targetNotificationId || null }).catch(() => {});
  };

  useEffect(() => {
    if (!targetDispatchId) {
      pendingOpenIdRef.current = '';
      lastHandledDispatchIdRef.current = '';
      return;
    }

    if (normalizeId(lastHandledDispatchIdRef.current) !== targetDispatchId) {
      pendingOpenIdRef.current = targetDispatchId;
    }
  }, [targetDispatchId]);

  useEffect(() => {
    const idToOpen = normalizeId(targetDispatchId || pendingOpenIdRef.current);
    if (!idToOpen || dispatches.length === 0) return;

    if (removalNotification && normalizeId(removalNotification.related_dispatch_id) === idToOpen) {
      pendingOpenIdRef.current = '';
      lastHandledDispatchIdRef.current = idToOpen;
      setRemovedAssignmentModalState({
        open: true,
        notificationId: removalNotification.id,
        title: 'Dispatch assignment no longer available',
        message: removalNotification.message || 'This dispatch assignment is no longer available.',
      });
      return;
    }

    if (normalizeId(lastHandledDispatchIdRef.current) === idToOpen &&
      normalizeId(drawerDispatchIdRef.current) === idToOpen) {
      return;
    }

    const target = dispatches.find(d => normalizeId(d.id) === idToOpen);
    if (!target) return;

    const filteredTarget = filteredDispatches.find(d => normalizeId(d.id) === idToOpen);
    if (!filteredTarget) return;

    const inUpcoming = upcomingDispatches.some(d => normalizeId(d.id) === idToOpen);
    const inToday = todayDispatches.some(d => normalizeId(d.id) === idToOpen);
    const inHistory = historyDispatches.some(d => normalizeId(d.id) === idToOpen);

    const correctTab = inUpcoming ? 'upcoming' : inToday ? 'today' : inHistory ? 'history' : null;
    if (!correctTab) return;

    if (tab !== correctTab) {
      pendingOpenIdRef.current = idToOpen;
      setTab(correctTab);
      return;
    }

    pendingOpenIdRef.current = '';
    if (normalizeId(drawerDispatchIdRef.current) === idToOpen) {
      lastHandledDispatchIdRef.current = idToOpen;
      return;
    }

    if (openDrawer(idToOpen)) {
      lastHandledDispatchIdRef.current = idToOpen;
    }
  }, [location.search, filteredDispatches, tab, upcomingDispatches, todayDispatches, historyDispatches, removalNotification, dispatches]);


  const handleRemovedAssignmentModalDismiss = async () => {
    if (removedAssignmentModalState.notificationId) {
      const notification = notifications.find((entry) => normalizeId(entry.id) === normalizeId(removedAssignmentModalState.notificationId)) || removalNotification;
      await markDriverRemovalNotificationSeenAsync({ notification, dispatch: removalNotificationDispatch });
    }

    setRemovedAssignmentModalState((current) => ({ ...current, open: false }));
    handleDrawerClose();
  };


  return (
    <div className="space-y-6">
      {dispatchNotFound && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
          Dispatch no longer available.
        </div>
      )}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-2xl font-semibold text-slate-900">My Dispatches</h2>
        </div>
        {!isDriverUser && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-slate-500">Trucks:</span>
            {(session?.allowed_trucks || []).map(t => (
              <Badge key={t} variant="outline" className="font-mono text-xs">
                <Truck className="h-3 w-3 mr-1" />{t}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-100">
          <TabsTrigger value="today" className="text-xs">
            Today ({todayDispatches.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="text-xs">
            Upcoming ({upcomingDispatches.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs">
            History ({historyDispatches.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {currentList.length === 0 ? (
        <div className="text-center py-16">
          <Inbox className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            {tab === 'today' ? 'No dispatches today' : tab === 'upcoming' ? 'No upcoming dispatches' : 'No history'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {currentList.map(d => {
            const isForcedOpenCard = normalizeId(drawerDispatchId) === normalizeId(d.id);

            return (
              <div
                key={d.id}
                ref={(el) => {
                  dispatchRefs.current[normalizeId(d.id)] = el;
                }}
              >
                <DispatchCard
                  dispatch={d}
                  session={session}
                  confirmations={confirmations}
                  timeEntries={timeEntries}
                  templateNotes={sortedNotes}
                  onConfirm={handleConfirm}
                  onTimeEntry={handleTimeEntry}
                  onOwnerTruckUpdate={handleOwnerTruckUpdate}
                  companyName={companyMap[d.company_id]}
                  forceOpen={isForcedOpenCard}
                  onDrawerClose={handleDrawerClose}
                  onOpenDispatch={handleDispatchOpen}
                  visibleTrucksOverride={isDriverUser ? (driverAssignedTrucksByDispatch.get(normalizeId(d.id)) || []) : undefined}
                />
              </div>
            );
          })}
        </div>
      )}
      <AlertDialog open={removedAssignmentModalState.open}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{removedAssignmentModalState.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 whitespace-pre-line text-sm text-slate-600">
                <p>This dispatch assignment is no longer available.</p>
                {removedAssignmentModalState.message && (
                  <p>{removedAssignmentModalState.message}</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleRemovedAssignmentModalDismiss}>Close</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemovedAssignmentModalDismiss}>OK</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={swapConfirmationState.open}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Truck Swap</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4 text-left text-sm leading-6 text-slate-600">
                <div>
                  <p>{swapConfirmationState.incomingTruck} is currently assigned to another dispatch:</p>
                  <p className="font-medium text-slate-900">{swapConfirmationState.conflictSummary}</p>
                </div>
                <p>Would you like to swap {swapConfirmationState.outgoingTruck} for {swapConfirmationState.incomingTruck}?</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => closeTruckSwapConfirmation(false)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => closeTruckSwapConfirmation(true)}>Swap</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
