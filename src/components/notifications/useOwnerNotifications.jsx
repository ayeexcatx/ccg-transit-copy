import { useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { useConfirmationsQuery } from './useConfirmationsQuery';
import { getNotificationEffectiveReadFlag } from './ownerActionStatus';
import { notifyOwnerDriverSeen } from './createNotifications';
import { getActiveCompanyId, getEffectiveView } from '@/components/session/workspaceUtils';
import {
  canUserSeeNotification,
  getDriverDispatchIdSet,
  normalizeVisibilityId,
} from '@/lib/dispatchVisibility';
import { resolveDriverIdentity } from '@/services/currentAppIdentityService';
import { listDriverDispatchesForDriver } from '@/lib/driverDispatch';

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
  const { currentAppIdentity } = useAuth();
  const queryClient = useQueryClient();
  const pendingDriverSeenKeysRef = useRef(new Set());
  const driverIdentity = resolveDriverIdentity({ currentAppIdentity, session });
  const effectiveView = getEffectiveView(session);
  const activeCompanyId = getActiveCompanyId(session);
  const isDriver = effectiveView === 'Driver';
  const isOwner = effectiveView === 'CompanyOwner';
  const isAdmin = effectiveView === 'Admin';

  const queryKey = ['notifications', session?.id];

  const { data: rawNotifications = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!session) return [];
      if (!['Admin', 'CompanyOwner', 'Driver'].includes(effectiveView)) return [];
      if (isAdmin) {
        return base44.entities.Notification.filter({ recipient_type: 'Admin' }, '-created_date', 200);
      }

      const isAdminOwnerWorkspace = isOwner && session.raw_code_type === 'Admin';
      if (isAdminOwnerWorkspace && activeCompanyId) {
        const [allAccessCodeNotifications, ownerCodes] = await Promise.all([
          base44.entities.Notification.filter({ recipient_type: 'AccessCode' }, '-created_date', 200),
          base44.entities.AccessCode.filter({
            code_type: 'CompanyOwner',
            active_flag: true,
            company_id: activeCompanyId,
          }, '-created_date', 500),
        ]);

        const ownerCodeIdSet = new Set((ownerCodes || []).map((code) => String(code.id)));
        return (allAccessCodeNotifications || []).filter((notification) => {
          const recipientId = String(notification.recipient_access_code_id || notification.recipient_id || '');
          return ownerCodeIdSet.has(recipientId);
        });
      }

      const all = await base44.entities.Notification.filter({ recipient_type: 'AccessCode' }, '-created_date', 200);
      return all.filter((notification) => {
        const recipientAccessCodeId = String(notification?.recipient_access_code_id || '');
        const recipientId = String(notification?.recipient_id || '');
        const sessionId = String(session?.id || '');
        return recipientAccessCodeId === sessionId || recipientId === sessionId;
      });
    },
    enabled: !!session,
    refetchInterval: 30000,
  });

  const { data: driverAssignments = [] } = useQuery({
    queryKey: ['driver-dispatch-assignments', driverIdentity],
    queryFn: () => listDriverDispatchesForDriver(driverIdentity),
    enabled: isDriver && !!driverIdentity,
  });

  const { data: confirmations = [] } = useConfirmationsQuery(isOwner);
  const { data: ownerCompany = null } = useQuery({
    queryKey: ['owner-company-notification-scope', activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return null;
      const companies = await base44.entities.Company.filter({ id: activeCompanyId }, '-created_date', 1);
      return companies?.[0] || null;
    },
    enabled: isOwner && !!activeCompanyId,
  });

  const { data: dispatches = [] } = useQuery({
    queryKey: ['portal-dispatches', activeCompanyId],
    queryFn: () => base44.entities.Dispatch.filter({ company_id: activeCompanyId }, '-date', 200),
    enabled: !!activeCompanyId && !isAdmin,
  });

  const driverDispatchIds = getDriverDispatchIdSet(driverAssignments);
  const validDispatchIds = new Set(dispatches.map((dispatch) => normalizeVisibilityId(dispatch.id)));

  const dispatchById = new Map(
    dispatches.map((dispatch) => [normalizeVisibilityId(dispatch.id), dispatch])
  );

  const notifications = rawNotifications
    .filter((notification) => canUserSeeNotification(session, notification, {
      visibleDispatchIds: validDispatchIds,
      driverDispatchIds,
    }))
    .sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0));

  const ownerScopeTrucks = Array.isArray(ownerCompany?.trucks) ? ownerCompany.trucks : [];

  const notificationsWithStatus = notifications.map((notification) => ({
    ...notification,
    effectiveReadFlag: getNotificationEffectiveReadFlag({
      session,
      notification,
      dispatch: notification.related_dispatch_id
        ? dispatchById.get(normalizeVisibilityId(notification.related_dispatch_id)) || null
        : null,
      confirmations,
      ownerAllowedTrucks: ownerScopeTrucks,
    }),
  }));

  const unreadCount = notificationsWithStatus.filter((notification) => !notification.effectiveReadFlag).length;

  const invalidateNotificationQueries = () => Promise.all([
    queryClient.invalidateQueries({ queryKey }),
    queryClient.invalidateQueries({ queryKey: ['notifications'] }),
    queryClient.invalidateQueries({ queryKey: ['portal-dispatches', activeCompanyId] }),
    queryClient.invalidateQueries({ queryKey: ['driver-dispatch-assignments', driverIdentity] }),
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
    queryClient.invalidateQueries({ queryKey: ['portal-dispatches', activeCompanyId] }),
  ]);

  const markRead = (id) => markReadMutation.mutate(id);
  const markReadAsync = (id) => markReadMutation.mutateAsync(id);
  const markAllRead = () => markAllReadMutation.mutate();

  const markDispatchRelatedReadAsync = async (dispatchId) => {
    if (!isDriver || !dispatchId) return [];

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
    if (!isDriver || !dispatch?.id || !driverIdentity) return;

    const matchingAssignments = driverAssignments.filter((assignment) =>
      assignment?.active_flag !== false &&
      assignment?.is_visible_to_driver !== false &&
      ['sent', 'seen'].includes(String(assignment?.delivery_status || 'sent').toLowerCase()) &&
      String(assignment.dispatch_id ?? '') === String(dispatch.id)
    );

    const unseenAssignments = matchingAssignments.filter((assignment) => !assignment?.last_seen_at);
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
    const seenActionKey = `${dispatch.id}:${driverIdentity}:${seenKind}:${seenVersionKey}`;

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
        await Promise.all(unseenAssignments.map((assignment) => {
          if (!assignment?.id) return Promise.resolve();
          return base44.entities.DriverDispatch.update(assignment.id, {
            delivery_status: 'seen',
            last_seen_at: seenAt,
            last_opened_at: seenAt,
          });
        }));

        await notifyOwnerDriverSeen({
          dispatch,
          assignments: matchingAssignments,
          driverId: driverIdentity,
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
    if (!isDriver || !notification?.id) return;

    const seenActionKey = `${notification.related_dispatch_id || 'removed'}:${driverIdentity}:removed:${notification.id}`;
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
          company_id: notification.recipient_company_id || activeCompanyId,
          status: 'Dispatch',
          shift_time: null,
          reference_tag: null,
          job_number: null,
        },
        assignments: (notification?.required_trucks || ['Removed']).map((truckNumber) => ({
          active_flag: true,
          truck_number: truckNumber,
        })),
        driverId: driverIdentity,
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
