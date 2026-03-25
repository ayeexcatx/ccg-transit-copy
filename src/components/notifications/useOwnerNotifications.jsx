import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useConfirmationsQuery } from './useConfirmationsQuery';
import { getNotificationEffectiveReadFlag } from './ownerActionStatus';
import { notifyOwnerDriverSeen } from './createNotifications';
import {
  canUserSeeNotification,
  getDriverDispatchIdSet,
  normalizeVisibilityId,
} from '@/lib/dispatchVisibility';

function getDriverNotificationSeenKind(notification, dispatch = null) {
  const notificationType = String(notification?.notification_type || '').toLowerCase();
  if (notificationType === 'driver_removed') return 'removed';
  if (notificationType === 'driver_amended') return 'amended';
  if (notificationType === 'driver_cancelled') return 'cancelled';

  const normalizedStatus = String(dispatch?.status || '').toLowerCase();
  if (normalizedStatus === 'amended') return 'amended';
  if (normalizedStatus === 'cancelled' || normalizedStatus === 'canceled') return 'cancelled';
  return 'assigned';
}

export function useOwnerNotifications(session) {
  const queryClient = useQueryClient();
  const pendingDriverSeenKeysRef = useRef(new Set());

  const queryKey = ['notifications', session?.id];

  const { data: rawNotifications = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!session) return [];
      if (session.code_type === 'Admin') {
        return base44.entities.Notification.filter({ recipient_type: 'Admin' }, '-created_date', 200);
      }
      const all = await base44.entities.Notification.filter({ recipient_type: 'AccessCode' }, '-created_date', 200);
      return all.filter(n =>
        n.recipient_access_code_id === session.id || n.recipient_id === session.id
      );
    },
    enabled: !!session,
    refetchInterval: 30000,
  });

  const { data: driverAssignments = [] } = useQuery({
    queryKey: ['driver-dispatch-assignments', session?.driver_id],
    queryFn: () => base44.entities.DriverDispatchAssignment.filter({ driver_id: session.driver_id }, '-assigned_datetime', 500),
    enabled: session?.code_type === 'Driver' && !!session?.driver_id,
  });

  const { data: confirmations = [] } = useConfirmationsQuery(session?.code_type === 'CompanyOwner');

  const { data: dispatches = [] } = useQuery({
    queryKey: ['portal-dispatches', session?.company_id],
    queryFn: () => base44.entities.Dispatch.filter({ company_id: session.company_id }, '-date', 200),
    enabled: !!session?.company_id && session?.code_type !== 'Admin',
  });

  const driverDispatchIds = getDriverDispatchIdSet(driverAssignments);
  const validDispatchIds = new Set(dispatches.map((dispatch) => normalizeVisibilityId(dispatch.id)));

  const notifications = rawNotifications
    .filter((notification) => canUserSeeNotification(session, notification, {
      visibleDispatchIds: validDispatchIds,
      driverDispatchIds,
    }))
    .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));

  const notificationsWithStatus = notifications.map((notification) => ({
    ...notification,
    effectiveReadFlag: getNotificationEffectiveReadFlag({
      session,
      notification,
      dispatch: notification.related_dispatch_id ? dispatches.find((dispatch) => dispatch.id === notification.related_dispatch_id) || null : null,
      confirmations,
      ownerAllowedTrucks: session?.allowed_trucks || [],
    }),
  }));

  const unreadCount = notificationsWithStatus.filter((notification) => !notification.effectiveReadFlag).length;

  const invalidateNotificationQueries = () => Promise.all([
    queryClient.invalidateQueries({ queryKey }),
    queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    queryClient.invalidateQueries({ queryKey: ['portal-dispatches', session?.company_id] }),
    queryClient.invalidateQueries({ queryKey: ['driver-dispatch-assignments', session?.driver_id] }),
  ]);

  const markReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { read_flag: true }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });

      const previousNotifications = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (current = []) =>
        current.map((notification) =>
          notification.id === id ? { ...notification, read_flag: true } : notification
        )
      );

      return { previousNotifications };
    },
    onError: (_error, _id, context) => {
      if (context?.previousNotifications) {
        queryClient.setQueryData(queryKey, context.previousNotifications);
      }
    },
    onSettled: invalidateNotificationQueries,
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter(n => !n.read_flag);
      await Promise.all(unread.map(n => base44.entities.Notification.update(n.id, { read_flag: true })));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey }),
    queryClient.invalidateQueries({ queryKey: ['portal-dispatches', session?.company_id] }),
  ]);

  const markRead = (id) => markReadMutation.mutate(id);
  const markReadAsync = (id) => markReadMutation.mutateAsync(id);
  const markAllRead = () => markAllReadMutation.mutate();

  const markDispatchRelatedReadAsync = async (dispatchId) => {
    if (session?.code_type !== 'Driver' || !dispatchId) return [];

    const normalizedDispatchId = String(dispatchId);
    const matchingNotifications = notifications.filter((notification) =>
      !notification.read_flag &&
      notification.notification_category === 'driver_dispatch_update' &&
      String(notification.related_dispatch_id ?? '') === normalizedDispatchId &&
      (notification.recipient_access_code_id === session.id || notification.recipient_id === session.id)
    );

    if (!matchingNotifications.length) return [];

    await Promise.all(
      matchingNotifications.map((notification) =>
        base44.entities.Notification.update(notification.id, { read_flag: true })
      )
    );

    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    ]);

    return matchingNotifications.map((notification) => notification.id);
  };

  const markDriverDispatchSeenAsync = async ({ dispatch, notificationId = null } = {}) => {
    if (session?.code_type !== 'Driver' || !dispatch?.id || !session?.driver_id) return;

    const matchingAssignments = driverAssignments.filter((assignment) =>
      assignment?.active_flag !== false &&
      String(assignment.dispatch_id ?? '') === String(dispatch.id)
    );

    const unseenAssignments = matchingAssignments.filter((assignment) => !assignment?.receipt_confirmed_at);
    const matchingNotifications = notifications
      .filter((notification) =>
        notification.notification_category === 'driver_dispatch_update' &&
        String(notification.related_dispatch_id ?? '') === String(dispatch.id) &&
        (notification.recipient_access_code_id === session.id || notification.recipient_id === session.id)
      )
      .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));

    const targetNotification = notificationId
      ? matchingNotifications.find((notification) => String(notification.id) === String(notificationId)) || null
      : null;
    const currentRelevantNotification = targetNotification || matchingNotifications[0] || null;
    const unreadNotifications = matchingNotifications.filter((notification) => !notification.read_flag);
    const seenKind = getDriverNotificationSeenKind(currentRelevantNotification, dispatch);
    const seenVersionKey = String(currentRelevantNotification?.id || `${dispatch.id}:${seenKind}`).trim();
    const seenActionKey = `${dispatch.id}:${session.driver_id}:${seenKind}:${seenVersionKey}`;

    if (!unseenAssignments.length && !unreadNotifications.length) return;
    if (pendingDriverSeenKeysRef.current.has(seenActionKey)) return;

    pendingDriverSeenKeysRef.current.add(seenActionKey);

    try {
      const seenAt = new Date().toISOString();

      if (unreadNotifications.length) {
        await Promise.all(unreadNotifications.map((notification) =>
          base44.entities.Notification.update(notification.id, { read_flag: true })
        ));
      }

      if (unseenAssignments.length) {
        await Promise.all(unseenAssignments.map((assignment) =>
          base44.entities.DriverDispatchAssignment.update(assignment.id, {
            receipt_confirmed_flag: true,
            receipt_confirmed_at: seenAt,
            receipt_confirmed_by_driver_id: session.driver_id,
            receipt_confirmed_by_name: session?.label || session?.driver_name || session?.name || assignment?.driver_name || undefined,
          })
        ));

        await notifyOwnerDriverSeen({
          dispatch,
          assignments: matchingAssignments,
          driverId: session.driver_id,
          driverName: session?.label || session?.driver_name || session?.name || matchingAssignments[0]?.driver_name,
          seenKind,
          seenVersionKey,
        });
      }

      await invalidateNotificationQueries();
      await queryClient.invalidateQueries({ queryKey: ['driver-dispatch-assignments', dispatch.id] });
    } finally {
      pendingDriverSeenKeysRef.current.delete(seenActionKey);
    }
  };

  const markDriverRemovalNotificationSeenAsync = async ({ notification, dispatch = null } = {}) => {
    if (session?.code_type !== 'Driver' || !notification?.id) return;

    const seenActionKey = `${notification.related_dispatch_id || 'removed'}:${session.driver_id}:removed:${notification.id}`;
    if (pendingDriverSeenKeysRef.current.has(seenActionKey)) return;
    pendingDriverSeenKeysRef.current.add(seenActionKey);

    try {
      const relatedRemovalNotifications = notifications.filter((entry) =>
        entry.notification_category === 'driver_dispatch_update' &&
        String(entry.related_dispatch_id ?? '') === String(notification.related_dispatch_id ?? '') &&
        (entry.recipient_access_code_id === session.id || entry.recipient_id === session.id) &&
        String(entry.notification_type || '').toLowerCase() === 'driver_removed' &&
        !entry.read_flag
      );

      const notificationsToMarkRead = relatedRemovalNotifications.length ? relatedRemovalNotifications : (!notification.read_flag ? [notification] : []);
      if (notificationsToMarkRead.length) {
        await Promise.all(notificationsToMarkRead.map((entry) =>
          base44.entities.Notification.update(entry.id, { read_flag: true })
        ));
      }

      await notifyOwnerDriverSeen({
        dispatch: dispatch || {
          id: notification.related_dispatch_id,
          company_id: notification.recipient_company_id || session?.company_id,
          status: 'Dispatch',
          shift_time: null,
          reference_tag: null,
          job_number: null,
        },
        assignments: (notification?.required_trucks || ['Removed']).map((truckNumber) => ({
          active_flag: true,
          truck_number: truckNumber,
        })),
        driverId: session.driver_id,
        driverName: session?.label || session?.driver_name || session?.name || 'Driver',
        seenKind: 'removed',
        seenVersionKey: String(notification.id),
      });

      await invalidateNotificationQueries();
    } finally {
      pendingDriverSeenKeysRef.current.delete(seenActionKey);
    }
  };

  return {
    notifications: notificationsWithStatus,
    unreadCount,
    isLoading,
    refresh,
    markRead,
    markReadAsync,
    markDispatchRelatedReadAsync,
    markDriverDispatchSeenAsync,
    markDriverRemovalNotificationSeenAsync,
    markAllRead,
    markAllReadPending: markAllReadMutation.isPending,
  };
}
