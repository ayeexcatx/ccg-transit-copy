import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';

export default function NotificationBell({ session }) {
  const queryClient = useQueryClient();

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', session?.id],
    queryFn: async () => {
      if (!session) return [];
      if (session.code_type === 'Admin') {
        return base44.entities.Notification.filter({ recipient_type: 'Admin' }, '-created_date', 20);
      }
      return base44.entities.Notification.filter({ 
        recipient_type: 'AccessCode',
        recipient_access_code_id: session.id 
      }, '-created_date', 20);
    },
    enabled: !!session,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { read_flag: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadCount = notifications.filter(n => !n.read_flag).length;

  return (
    <Popover>
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
              <Button variant="ghost" size="sm" className="text-xs h-7">
                View All
              </Button>
            </Link>
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">No notifications</div>
          ) : (
            notifications.slice(0, 5).map(n => (
              <div
                key={n.id}
                className={`p-3 border-b hover:bg-slate-50 cursor-pointer ${!n.read_flag ? 'bg-blue-50/30' : ''}`}
                onClick={() => !n.read_flag && markAsReadMutation.mutate(n.id)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{n.title}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
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