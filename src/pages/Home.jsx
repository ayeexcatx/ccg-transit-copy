import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../components/session/SessionContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell, Clock, MapPin, Sun, Moon, ArrowRight, CheckCircle2, AlertCircle, Megaphone } from 'lucide-react';
import { format, isToday, startOfDay } from 'date-fns';
import { createPageUrl } from '@/utils';
import { Link, useNavigate } from 'react-router-dom';
import NotificationStatusBadge from '../components/notifications/NotificationStatusBadge';

const statusColors = {
  Confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  Dispatched: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Amended: 'bg-amber-50 text-amber-700 border-amber-200',
  Canceled: 'bg-red-50 text-red-700 border-red-200',
};

function MiniDispatchCard({ dispatch, companyName }) {
  return (
    <Link to={createPageUrl(`Portal?dispatchId=${dispatch.id}`)}>
      <div className="flex items-start gap-3 p-3 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-all cursor-pointer">
        <div className="shrink-0 mt-0.5">
          {dispatch.shift_time === 'Day'
            ? <Sun className="h-4 w-4 text-amber-400" />
            : <Moon className="h-4 w-4 text-slate-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge className={`${statusColors[dispatch.status]} border text-xs`}>{dispatch.status}</Badge>
            <span className="text-xs text-slate-500">{dispatch.date && format(new Date(dispatch.date), 'MMM d')}</span>
          </div>
          {dispatch.status === 'Confirmed' ? (
            <p className="text-sm font-medium text-slate-700">Confirmed Dispatch</p>
          ) : (
            <p className="text-sm font-medium text-slate-700 truncate">{dispatch.client_name || 'Dispatch'}</p>
          )}
          <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-500 flex-wrap">
            {dispatch.start_time && (
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{dispatch.start_time}</span>
            )}
            {dispatch.start_location && (
              <span className="flex items-center gap-1 truncate max-w-[160px]">
                <MapPin className="h-3 w-3 shrink-0" />{dispatch.start_location}
              </span>
            )}
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-300 shrink-0 mt-1" />
      </div>
    </Link>
  );
}

export default function Home() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const today = startOfDay(new Date());

  const { data: dispatches = [] } = useQuery({
    queryKey: ['portal-dispatches', session?.company_id],
    queryFn: () => base44.entities.Dispatch.filter({ company_id: session.company_id }, '-date', 200),
    enabled: !!session?.company_id,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', session?.id],
    queryFn: () => base44.entities.Notification.filter({
      recipient_type: 'AccessCode',
      recipient_access_code_id: session.id,
    }, '-created_date', 30),
    enabled: !!session,
    refetchInterval: 30000,
  });

  const { data: confirmations = [] } = useQuery({
    queryKey: ['confirmations'],
    queryFn: () => base44.entities.Confirmation.list('-confirmed_at', 500),
    enabled: session?.code_type === 'CompanyOwner',
  });

  const markAsReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { read_flag: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const allowedTrucks = session?.allowed_trucks || [];

  const filteredDispatches = useMemo(() => {
    return dispatches.filter(d => {
      const assigned = d.trucks_assigned || [];
      return assigned.some(t => allowedTrucks.includes(t));
    });
  }, [dispatches, allowedTrucks]);

  const todayDispatches = useMemo(() =>
    filteredDispatches
      .filter(d => !d.archived_flag && d.status !== 'Canceled' && d.date && isToday(new Date(d.date)))
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
      .slice(0, 5),
    [filteredDispatches]
  );

  const upcomingDispatches = useMemo(() =>
    filteredDispatches
      .filter(d => !d.archived_flag && d.status !== 'Canceled' && d.date && new Date(d.date) > today)
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 5),
    [filteredDispatches, today]
  );

  const unreadNotifications = useMemo(() =>
    notifications.filter(n => !n.read_flag).sort((a, b) => new Date(b.created_date) - new Date(a.created_date)),
    [notifications]
  );

  // Pending confirmations: dispatches where not all trucks have confirmed the current status
  const pendingConfirmationsCount = useMemo(() => {
    if (session?.code_type !== 'CompanyOwner') return 0;
    return filteredDispatches.filter(d => {
      if (d.archived_flag || d.status === 'Canceled') return false;
      const trucks = (d.trucks_assigned || []).filter(t => allowedTrucks.includes(t));
      if (trucks.length === 0) return false;
      return trucks.some(t => !confirmations.some(c =>
        c.dispatch_id === d.id && c.truck_number === t && c.confirmation_type === d.status
      ));
    }).length;
  }, [filteredDispatches, confirmations, allowedTrucks, session]);

  const handleNotificationClick = (n) => {
    if (n.related_dispatch_id) {
      const notifParam = !n.read_flag ? `&notificationId=${n.id}` : '';
      navigate(createPageUrl(`Portal?dispatchId=${n.related_dispatch_id}${notifParam}`));
    } else {
      if (!n.read_flag) markAsReadMutation.mutate(n.id);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900">Home</h2>
        <p className="text-sm text-slate-500">
          {session?.label || session?.code_type} · Trucks: {allowedTrucks.join(', ') || '—'}
        </p>
      </div>

      {/* Action Needed */}
      {(unreadNotifications.length > 0 || pendingConfirmationsCount > 0) && (
        <section>
          <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-500" />
            Action Needed
          </h3>
          <Card className="border-red-100">
            <CardContent className="p-0 divide-y divide-slate-100">
              {/* Pending confirmations banner */}
              {pendingConfirmationsCount > 0 && (
                <Link to={createPageUrl('Portal')}>
                  <div className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 cursor-pointer">
                    <CheckCircle2 className="h-4 w-4 text-amber-500 shrink-0" />
                    <p className="text-sm font-medium text-slate-800 flex-1">
                      Pending confirmations: <span className="text-amber-600">{pendingConfirmationsCount}</span>
                    </p>
                    <ArrowRight className="h-4 w-4 text-slate-300 shrink-0" />
                  </div>
                </Link>
              )}
              {/* Unread notifications */}
              {unreadNotifications.map(n => (
                <div
                  key={n.id}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-blue-50/40 cursor-pointer bg-blue-50/20"
                  onClick={() => handleNotificationClick(n)}
                >
                  <Bell className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{n.title}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                    {n.required_trucks?.length > 0 && (
                      <div className="mt-1">
                        <NotificationStatusBadge notification={n} confirmations={confirmations} />
                      </div>
                    )}
                    <p className="text-xs text-slate-400 mt-1">{format(new Date(n.created_date), 'MMM d, h:mm a')}</p>
                  </div>
                  <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Today's Dispatches */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
          <Sun className="h-4 w-4 text-amber-400" />
          Today's Dispatches
          {todayDispatches.length > 0 && (
            <Badge variant="outline" className="text-xs">{todayDispatches.length}</Badge>
          )}
        </h3>
        <Card>
          <CardContent className="p-1">
            {todayDispatches.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No dispatches today</p>
            ) : (
              todayDispatches.map(d => <MiniDispatchCard key={d.id} dispatch={d} />)
            )}
          </CardContent>
        </Card>
      </section>

      {/* Upcoming Dispatches */}
      <section>
        <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-400" />
          Upcoming Dispatches
          {upcomingDispatches.length > 0 && (
            <Badge variant="outline" className="text-xs">{upcomingDispatches.length}</Badge>
          )}
        </h3>
        <Card>
          <CardContent className="p-1">
            {upcomingDispatches.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No upcoming dispatches</p>
            ) : (
              upcomingDispatches.map(d => <MiniDispatchCard key={d.id} dispatch={d} />)
            )}
          </CardContent>
        </Card>
      </section>

      {/* View All */}
      <Link to={createPageUrl('Portal')}>
        <Button className="w-full bg-slate-900 hover:bg-slate-800">
          View All Dispatches
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </Link>
    </div>
  );
}