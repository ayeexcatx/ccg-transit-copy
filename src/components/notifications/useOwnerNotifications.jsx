import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

export function useOwnerNotifications(session) {
  const queryClient = useQueryClient();

  const queryKey = ['notifications', session?.id];

  const { data: rawNotifications = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!session) return [];
      if (session.code_type === 'Admin') {
        return base44.entities.Notification.filter({ recipient_type: 'Admin' }, '-created_date', 200);
      }
      // Fetch all AccessCode notifications then client-filter to tolerate either recipient field
      const all = await base44.entities.Notification.filter({ recipient_type: 'AccessCode' }, '-created_date', 200);
      return all.filter(n =>
        n.recipient_access_code_id === session.id || n.recipient_id === session.id
      );
    },
    enabled: !!session,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Unread first, then newest first
  const notifications = [...rawNotifications].sort((a, b) => {
    if (a.read_flag !== b.read_flag) return a.read_flag ? 1 : -1;
    return new Date(b.created_date) - new Date(a.created_date);
  });

  const unreadCount = rawNotifications.filter(n => !n.read_flag).length;

  const markReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { read_flag: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unread = rawNotifications.filter(n => !n.read_flag);
      await Promise.all(unread.map(n => base44.entities.Notification.update(n.id, { read_flag: true })));
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey });

  const markRead = (id) => markReadMutation.mutate(id);
  const markAllRead = () => markAllReadMutation.mutate();

  return {
    notifications,
    unreadCount,
    isLoading,
    refresh,
    markRead,
    markAllRead,
    markAllReadPending: markAllReadMutation.isPending,
  };
}
