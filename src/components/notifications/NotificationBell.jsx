import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';
import { Link, useNavigate } from 'react-router-dom';
import NotificationStatusBadge from './NotificationStatusBadge';
import { useOwnerNotifications } from './useOwnerNotifications';
import { getNotificationDisplay } from './formatNotificationDetailsMessage';
import { useConfirmationsQuery } from './useConfirmationsQuery';

const normalizeId = (value) => String(value ?? '');

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

  const driverDispatchIds = new Set(
    driverAssignments
      .filter((assignment) => assignment?.active_flag !== false)
      .map((assignment) => normalizeId(assignment.dispatch_id))
      .filter(Boolean)
  );

  const filteredNotifications = notifications.filter((notification) => {
    if (!notification.related_dispatch_id) return true;
    if (session?.code_type === 'Admin') return true;
    const relatedDispatchId = normalizeId(notification.related_dispatch_id);
    if (isDriver) {
      if (notification.notification_category === 'driver_dispatch_update') return true;
      return driverDispatchIds.has(relatedDispatchId);
    }
    return dispatchIds.has(relatedDispatchId);
  });

  const { data: confirmations = [] } = useConfirmationsQuery(session?.code_type === 'CompanyOwner');

  const isInformationalUpdateNotification = (notification) =>
    notification?.notification_category === 'dispatch_update_info';

  const shouldMarkReadOnClick = (notification) => {
    if (notification.read_flag) return false;
    if (isDriver) return true;
    return notification.related_dispatch_id && isInformationalUpdateNotification(notification);
  };

  const handleNotificationClick = async (n) => {
    if (!session) return;

    if (shouldMarkReadOnClick(n)) {
      try {
        await markReadAsync(n.id);
      } catch {
        return;
      }
    }

    if (n.related_dispatch_id) {
      const targetPage = session.code_type === 'Admin' ? 'AdminDispatches' : 'Portal';
      setOpen(false);
      setTimeout(() => navigate(createPageUrl(`${targetPage}?dispatchId=${normalizeId(n.related_dispatch_id)}`)), 0);
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
        className="w-[min(22rem,calc(100vw-1.25rem))] max-w-[calc(100vw-1.25rem)] p-0 rounded-2xl border border-slate-200/90 bg-white/95 shadow-2xl shadow-slate-900/20 backdrop-blur supports-[backdrop-filter]:bg-white/90"
        align="end"
        sideOffset={10}
      >
        <div className="px-4 py-3.5 border-b border-slate-200 bg-slate-50/70 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                <Bell className="h-4 w-4" />
              </div>
              <h3 className="font-semibold text-sm text-slate-900">Notifications</h3>
            </div>
            <Link to={createPageUrl('Notifications')}>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700"
              >
                View all
              </Button>
            </Link>
          </div>
        </div>
        <div className="max-h-[26rem] overflow-y-auto">
          {filteredNotifications.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">No notifications</div>
          ) : (
            filteredNotifications.slice(0, 5).map((n) => {
              const dispatch = n.related_dispatch_id
                ? dispatchMap[normalizeId(n.related_dispatch_id)] || null
                : null;
              const display = getNotificationDisplay(n, dispatch);

              return (
                <div
                  key={n.id}
                  className={`group px-4 py-3.5 cursor-pointer border-b border-slate-100/90 transition-colors ${!n.read_flag ? 'bg-blue-50/50' : 'bg-white'} hover:bg-slate-50/85 last:border-b-0`}
                  onClick={() => handleNotificationClick(n)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-5 text-slate-900 ${display.isOwnerDispatchStatus ? 'font-semibold' : 'font-medium'}`}>
                        {display.title}
                      </p>
                      <p className="text-xs leading-5 text-slate-600 mt-1 whitespace-pre-line">{display.message}</p>
                      {n.required_trucks?.length > 0 && (
                        <div className="mt-2">
                          <NotificationStatusBadge notification={n} confirmations={confirmations} />
                        </div>
                      )}
                      <p className="text-[11px] text-slate-400 mt-2">
                        {format(new Date(n.created_date), 'MMM d, h:mm a')}
                      </p>
                    </div>
                    {!n.read_flag && (
                      <div className="h-2.5 w-2.5 rounded-full bg-blue-500 shrink-0 mt-1.5 ring-2 ring-blue-100" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
