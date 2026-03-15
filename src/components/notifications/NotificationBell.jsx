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
        className="w-[min(24rem,calc(100vw-1.5rem))] max-w-sm mx-3 p-0 rounded-2xl border border-slate-200/60 bg-white/80 shadow-2xl shadow-slate-900/25 backdrop-blur-lg supports-[backdrop-filter]:bg-white/65 transition-all duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        align="end"
        sideOffset={10}
      >
        <div className="px-4 py-3 border-b border-slate-200/60 bg-gradient-to-r from-white/70 via-slate-50/40 to-white/70 rounded-t-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-semibold tracking-tight text-slate-800">Notifications</h3>
            </div>
            <Link to={createPageUrl('Notifications')}>
              <Button variant="ghost" size="sm" className="h-8 px-2 text-sm font-medium text-blue-600 hover:bg-blue-50/70 hover:text-blue-700 focus-visible:ring-blue-300">
                View all
              </Button>
            </Link>
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

              return (
                <div
                  key={n.id}
                  className={`group relative cursor-pointer border-b border-slate-100/90 px-4 py-3.5 transition-all duration-200 last:border-b-0 ${!n.read_flag ? 'bg-blue-50/40' : 'bg-white/40'} hover:bg-slate-50/80 focus-within:bg-slate-50/80`}
                  onClick={() => handleNotificationClick(n)}
                >
                  {!n.read_flag && (
                    <span className="absolute left-2.5 top-5 h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]" aria-hidden="true" />
                  )}
                  <div className="flex items-start justify-between gap-3">
                    <div className={`min-w-0 flex-1 ${!n.read_flag ? 'pl-4' : ''}`}>
                      <p className={`text-sm leading-5 text-slate-800 ${display.isOwnerDispatchStatus ? 'font-semibold' : 'font-medium'}`}>
                        {display.title}
                      </p>
                      <p className="mt-1 whitespace-pre-line text-sm leading-5 text-slate-600">{display.message}</p>
                      {n.required_trucks?.length > 0 && (
                        <div className="mt-2">
                          <NotificationStatusBadge notification={n} confirmations={confirmations} />
                        </div>
                      )}
                      <p className="mt-2 text-xs text-slate-400">
                        {format(new Date(n.created_date), 'MMM d, h:mm a')}
                      </p>
                    </div>
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
