import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useSession } from '@/components/session/SessionContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';

export default function Notifications() {
  const { session } = useSession();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', session?.id],
    queryFn: async () => {
      if (!session) return [];
      if (session.code_type === 'Admin') {
        return base44.entities.Notification.filter({ recipient_type: 'Admin' }, '-created_date', 100);
      }
      return base44.entities.Notification.filter({ 
        recipient_type: 'AccessCode',
        recipient_access_code_id: session.id 
      }, '-created_date', 100);
    },
    enabled: !!session,
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { read_flag: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter(n => !n.read_flag);
      await Promise.all(unread.map(n => base44.entities.Notification.update(n.id, { read_flag: true })));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unreadCount = notifications.filter(n => !n.read_flag).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Notifications</h2>
          <p className="text-sm text-slate-500">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => markAllAsReadMutation.mutate()}
            disabled={markAllAsReadMutation.isPending}
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
      ) : notifications.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Bell className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No notifications yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <Card 
              key={n.id} 
              className={`hover:shadow-sm transition-shadow cursor-pointer ${!n.read_flag ? 'border-blue-200 bg-blue-50/30' : ''}`}
              onClick={() => !n.read_flag && markAsReadMutation.mutate(n.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-sm text-slate-900">{n.title}</h3>
                      {!n.read_flag && <Badge className="bg-blue-500 text-xs">New</Badge>}
                    </div>
                    <p className="text-sm text-slate-600">{n.message}</p>
                    <p className="text-xs text-slate-400 mt-2">
                      {format(new Date(n.created_date), 'MMM d, yyyy h:mm a')}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}