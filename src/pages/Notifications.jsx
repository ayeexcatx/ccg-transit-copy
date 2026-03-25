import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useSession } from '@/components/session/SessionContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell, CheckCircle2 } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { buildDispatchOpenPath } from '@/lib/dispatchOpenOrchestration';
import { useNavigate } from 'react-router-dom';
import { useOwnerNotifications } from '@/components/notifications/useOwnerNotifications';
import { getNotificationDisplay } from '@/components/notifications/formatNotificationDetailsMessage';
import { useConfirmationsQuery } from '@/components/notifications/useConfirmationsQuery';
import {
  getNotificationEffectiveReadFlag,
  isNotificationMarkedReadOnClick,
} from '@/components/notifications/ownerActionStatus';
import {
  canUserSeeNotification,
  normalizeVisibilityId,
} from '@/lib/dispatchVisibility';
import NotificationsPageItem from '@/components/notifications/NotificationsPageItem';

export default function Notifications() {
  const { session } = useSession();
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, markReadAsync, markAllRead, markAllReadPending } = useOwnerNotifications(session);

  const { data: confirmations = [] } = useConfirmationsQuery(session?.code_type === 'CompanyOwner');

  const { data: dispatches = [] } = useQuery({
    queryKey: ['portal-dispatches', session?.company_id],
    queryFn: () => base44.entities.Dispatch.filter({ company_id: session.company_id }, '-date', 200),
    enabled: !!session?.company_id,
  });

  const dispatchMap = Object.fromEntries(dispatches.map((dispatch) => [dispatch.id, dispatch]));
  const visibleDispatchIds = new Set(dispatches.map((dispatch) => normalizeVisibilityId(dispatch.id)));
  const filteredNotifications = notifications.filter((notification) =>
    canUserSeeNotification(session, notification, {
      visibleDispatchIds,
      driverDispatchIds: visibleDispatchIds,
    })
  );
  const allowedTrucks = session?.allowed_trucks || [];
  
  const handleNotificationClick = async (n) => {
    if (!session) return;

    if (session?.code_type !== 'Driver' && n.related_dispatch_id && isNotificationMarkedReadOnClick(n) && !n.read_flag) {
      try {
        await markReadAsync(n.id);
      } catch {
        return;
      }
    }

    if (n.related_dispatch_id) {
      const targetPage = session?.code_type === 'Admin' ? 'AdminDispatches' : 'Portal';
      const targetPath = buildDispatchOpenPath(targetPage, {
        dispatchId: n.related_dispatch_id,
        notificationId: n.id,
      });
      navigate(createPageUrl(targetPath));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Notifications</h2>
          <p className="text-sm text-slate-500">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={markAllRead}
            disabled={markAllReadPending}
          >
            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
            Mark All Read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-slate-300 border-t-slate-700 rounded-full" />
        </div>
      ) : filteredNotifications.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Bell className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No notifications yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredNotifications.map(n => {
            const dispatch = dispatchMap[n.related_dispatch_id] || null;
            const display = getNotificationDisplay(n, dispatch);
            const effectiveReadFlag = getNotificationEffectiveReadFlag({
              session,
              notification: n,
              dispatch,
              confirmations,
              ownerAllowedTrucks: allowedTrucks,
            });

            return (
              <NotificationsPageItem
                key={n.id}
                notification={n}
                display={display}
                effectiveReadFlag={effectiveReadFlag}
                dispatch={dispatch}
                confirmations={confirmations}
                ownerAllowedTrucks={allowedTrucks}
                onClick={() => handleNotificationClick(n)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
