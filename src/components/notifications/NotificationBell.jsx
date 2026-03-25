import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { createPageUrl } from '@/utils';
import { buildDispatchOpenPath } from '@/lib/dispatchOpenOrchestration';
import { useNavigate } from 'react-router-dom';
import NotificationBellItem from './NotificationBellItem';
import { useOwnerNotifications } from './useOwnerNotifications';
import { getNotificationDisplay } from './formatNotificationDetailsMessage';
import { useConfirmationsQuery } from './useConfirmationsQuery';
import {
  getNotificationEffectiveReadFlag,
  isNotificationMarkedReadOnClick,
} from './ownerActionStatus';
import {
  canUserSeeNotification,
  getDriverDispatchIdSet,
  normalizeVisibilityId,
} from '@/lib/dispatchVisibility';

const normalizeId = (value) => normalizeVisibilityId(value);

export default function NotificationBell({ session }) {
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);
  const { notifications, unreadCount, markReadAsync } = useOwnerNotifications(session);
  const isDriver = session?.code_type === 'Driver';

  const { data: driverAssignments = [] } = useQuery({
    queryKey: ['driver-dispatch-assignments', session?.driver_id],
    queryFn: () => base44.entities.DriverDispatchAssignment.filter({ driver_id: session.driver_id }, '-assigned_datetime', 500),
    enabled: isDriver && !!session?.driver_id,
  });

  const { data: dispatches = [] } = useQuery({
    queryKey: ['portal-dispatches', session?.company_id],
    queryFn: () => base44.entities.Dispatch.filter({ company_id: session.company_id }, '-date', 200),
    enabled: !!session?.company_id && session?.code_type !== 'Admin',
  });

  const dispatchMap = Object.fromEntries(
    dispatches.map((dispatch) => [normalizeId(dispatch.id), dispatch])
  );

  const dispatchIds = new Set(dispatches.map((dispatch) => normalizeId(dispatch.id)));

  const driverDispatchIds = getDriverDispatchIdSet(driverAssignments);

  const filteredNotifications = notifications.filter((notification) =>
    canUserSeeNotification(session, notification, {
      visibleDispatchIds: dispatchIds,
      driverDispatchIds,
    })
  );

  const { data: confirmations = [] } = useConfirmationsQuery(session?.code_type === 'CompanyOwner');

  const shouldMarkReadOnClick = (notification) => {
    if (notification.read_flag) return false;
    if (isDriver) return true;
    return notification.related_dispatch_id && isNotificationMarkedReadOnClick(notification);
  };

  const handleNotificationClick = async (n) => {
    if (!session) return;

    if (shouldMarkReadOnClick(n) && session?.code_type !== 'Driver') {
      try {
        await markReadAsync(n.id);
      } catch {
        return;
      }
    }

    if (n.related_dispatch_id) {
      const targetPage = session.code_type === 'Admin' ? 'AdminDispatches' : 'Portal';
      const targetPath = buildDispatchOpenPath(targetPage, {
        dispatchId: n.related_dispatch_id,
        notificationId: n.id,
        normalizeId,
      });
      setOpen(false);
      setTimeout(() => navigate(createPageUrl(targetPath)), 0);
    } else {
      navigate(createPageUrl('Notifications'));
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs bg-red-500">
              {unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        showBackdrop
        onBackdropClick={() => setOpen(false)}
        className="w-[min(24rem,calc(100vw-1.5rem))] max-w-sm mx-3 p-0 rounded-2xl border border-slate-200/60 bg-white/80 shadow-[0_25px_60px_rgba(0,0,0,0.25)] backdrop-blur-lg supports-[backdrop-filter]:bg-white/65 transition-all duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        align="end"
        sideOffset={10}
      >
        <div className="px-4 py-3 border-b border-slate-200/60 bg-gradient-to-r from-white/70 via-slate-50/40 to-white/70 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-semibold tracking-tight text-slate-800">Notifications</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-sm font-medium text-blue-600 hover:bg-blue-50/70 hover:text-blue-700 focus-visible:ring-blue-300"
              onClick={() => {
                setOpen(false);
                navigate(createPageUrl('Notifications'));
              }}
            >
              View all
            </Button>
          </div>
        </div>
        <div className="max-h-[26rem] overflow-y-auto">
          {filteredNotifications.length === 0 ? (
            <div className="p-7 text-center text-sm text-slate-500">No notifications</div>
          ) : (
            filteredNotifications.slice(0, 5).map((n) => {
              const dispatch = n.related_dispatch_id
                ? dispatchMap[normalizeId(n.related_dispatch_id)] || null
                : null;
              const display = getNotificationDisplay(n, dispatch);

              const effectiveReadFlag = getNotificationEffectiveReadFlag({
                session,
                notification: n,
                dispatch,
                confirmations,
                ownerAllowedTrucks: session?.allowed_trucks || [],
              });

              return (
                <NotificationBellItem
                  key={n.id}
                  notification={n}
                  display={display}
                  effectiveReadFlag={effectiveReadFlag}
                  dispatch={dispatch}
                  confirmations={confirmations}
                  ownerAllowedTrucks={session?.allowed_trucks || []}
                  onClick={() => handleNotificationClick(n)}
                />
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
