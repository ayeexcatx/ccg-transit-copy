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
import { formatNotificationDetailsMessage } from './formatNotificationDetailsMessage';
import { useConfirmationsQuery } from './useConfirmationsQuery';

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

  const dispatchIds = new Set(dispatches.map((dispatch) => dispatch.id));

  const driverDispatchIds = new Set(
    driverAssignments
      .filter((assignment) => assignment?.active_flag !== false)
      .map((assignment) => assignment.dispatch_id)
      .filter(Boolean)
  );

  const filteredNotifications = notifications.filter((notification) => {
    if (!notification.related_dispatch_id) return true;
    if (session?.code_type === 'Admin') return true;
    if (isDriver) return driverDispatchIds.has(notification.related_dispatch_id);
    return dispatchIds.has(notification.related_dispatch_id);
  });

  const { data: confirmations = [] } = useConfirmationsQuery(session?.code_type === 'CompanyOwner');

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
      const targetPage = session.code_type === 'Admin' ? 'AdminDispatches' : 'Portal';
      setOpen(false);
      setTimeout(() => navigate(createPageUrl(`${targetPage}?dispatchId=${n.related_dispatch_id}`)), 0);
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
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b bg-slate-50">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Notifications</h3>
            <Link to={createPageUrl('Notifications')}>
              <Button variant="ghost" size="sm" className="text-xs h-7">View All</Button>
            </Link>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {filteredNotifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">No notifications</div>
          ) : (
            filteredNotifications.slice(0, 5).map(n => (
              <div
                key={n.id}
                className={`p-3 border-b hover:bg-slate-50 cursor-pointer ${!n.read_flag ? 'bg-blue-50/30' : ''}`}
                onClick={() => handleNotificationClick(n)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-900">{n.title}</p>
                    <p className="text-xs text-slate-600 mt-0.5 whitespace-pre-line">{formatNotificationDetailsMessage(n.message)}</p>
                    {n.required_trucks?.length > 0 && (
                      <div className="mt-1">
                        <NotificationStatusBadge notification={n} confirmations={confirmations} />
                      </div>
                    )}
                    <p className="text-xs text-slate-400 mt-1">
                      {format(new Date(n.created_date), 'MMM d, h:mm a')}
                    </p>
                  </div>
                  {!n.read_flag && (
                    <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}