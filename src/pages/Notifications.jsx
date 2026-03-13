import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useSession } from '@/components/session/SessionContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, CheckCircle2, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';
import NotificationStatusBadge from '@/components/notifications/NotificationStatusBadge';
import { useOwnerNotifications } from '@/components/notifications/useOwnerNotifications';
import { getNotificationDisplay } from '@/components/notifications/formatNotificationDetailsMessage';
import { useConfirmationsQuery } from '@/components/notifications/useConfirmationsQuery';

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
  const filteredNotifications = notifications.filter((notification) => {
    if (!notification.related_dispatch_id) return true;
    if (session?.code_type === 'Admin') return true;
    return Boolean(dispatchMap[notification.related_dispatch_id]);
  });
  const allowedTrucks = session?.allowed_trucks || [];
  
  const isInformationalUpdateNotification = (notification) =>
    notification?.notification_category === 'dispatch_update_info';

  const handleNotificationClick = async (n) => {
    if (!session) return;

    if (n.related_dispatch_id && isInformationalUpdateNotification(n) && !n.read_flag) {
      try {
        await markReadAsync(n.id);
      } catch {
        return;
      }
    }

    if (n.related_dispatch_id) {
      const targetPage = session?.code_type === 'Admin' ? 'AdminDispatches' : 'Portal';
      navigate(createPageUrl(`${targetPage}?dispatchId=${n.related_dispatch_id}`));
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
            const display = getNotificationDisplay(n);

            return (
              <Card
                key={n.id}
                className={`hover:shadow-sm transition-shadow cursor-pointer ${!n.read_flag ? 'border-blue-200 bg-blue-50/30' : ''}`}
                onClick={() => handleNotificationClick(n)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className={`text-sm text-slate-900 ${display.isOwnerDispatchStatus ? 'font-semibold' : ''}`}>{display.title}</h3>
                        {!n.read_flag && <Badge className="bg-blue-500 text-xs">New</Badge>}
                        {n.related_dispatch_id && (
                          <ExternalLink className="h-3.5 w-3.5 text-slate-400 ml-auto shrink-0" />
                        )}
                      </div>
                      <p className="text-sm text-slate-600 whitespace-pre-line">{display.message}</p>
                      <div className="mt-1.5">
                        <NotificationStatusBadge
                          notification={n}
                          confirmations={confirmations}
                          dispatch={dispatchMap[n.related_dispatch_id] || null}
                          ownerAllowedTrucks={allowedTrucks}
                        />
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
                        {format(new Date(n.created_date), 'MMM d, yyyy h:mm a')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
