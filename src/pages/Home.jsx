import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../components/session/SessionContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell, Clock, Sun, Moon, ArrowRight, AlertCircle, Megaphone, Truck } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { getDispatchBucket } from '../components/portal/dispatchBuckets';
import { createPageUrl } from '@/utils';
import { Link, useNavigate } from 'react-router-dom';
import { useOwnerNotifications } from '../components/notifications/useOwnerNotifications';
import NotificationStatusBadge from '../components/notifications/NotificationStatusBadge';
import { formatNotificationDetailsMessage } from '../components/notifications/formatNotificationDetailsMessage';

const dateOnly = (v) => (typeof v === 'string' ? v.slice(0, 10) : v);

const statusColors = {
  Scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  Dispatch: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Amended: 'bg-amber-50 text-amber-700 border-amber-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
};

const formatDispatchDate = (dateValue) => (dateValue ? format(parseISO(dateValue), 'EEE, MMM d, yyyy') : '');

const formatDispatchTime = (startTime) => {
  if (!startTime) return '';

  const time = String(startTime).trim();
  if (!time) return '';

  const amPmMatch = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])$/);
  if (amPmMatch) {
    const [, hourRaw, minute, periodRaw] = amPmMatch;
    let hour = Number(hourRaw);
    if (!Number.isFinite(hour) || hour < 1) hour = 12;
    if (hour > 12) hour = hour % 12 || 12;
    return `${hour}:${minute} ${periodRaw.toUpperCase()}`;
  }

  const hhMmMatch = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!hhMmMatch) return '';

  let hour24 = Number(hhMmMatch[1]);
  const minute = hhMmMatch[2];
  if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) return '';

  const period = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${minute} ${period}`;
};

function MiniDispatchCard({ dispatch, companyName }) {
  const truckNumbers = dispatch.trucks_assigned || [];

  return (
    <Link to={createPageUrl(`Portal?dispatchId=${dispatch.id}`)}>
      <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 transition-all cursor-pointer">
        <div className="shrink-0 mt-0.5">
          {dispatch.shift_time === 'Day Shift'
            ? <Sun className="h-4 w-4 text-amber-400" />
            : <Moon className="h-4 w-4 text-slate-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="min-w-0">
              <Badge className={`${statusColors[dispatch.status]} border text-xs`}>{dispatch.status}</Badge>
            </div>
            <div className="shrink-0 text-right text-xs text-slate-500 leading-tight">
              <div className="whitespace-nowrap">{formatDispatchDate(dispatch.date)}</div>
              {dispatch.start_time && (
                <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                  <Clock className="h-3 w-3" />
                  <span>{formatDispatchTime(dispatch.start_time)}</span>
                </div>
              )}
            </div>
          </div>
          <div className="mt-0.5 space-y-0.5 min-w-0">
            {dispatch.client_name && (
              <p className="text-sm font-medium text-slate-700 truncate">{dispatch.client_name}</p>
            )}
            {dispatch.job_number && (
              <p className="text-xs text-slate-600 truncate">Job #{dispatch.job_number}</p>
            )}
            {companyName && (
              <p className="text-xs text-slate-600 truncate">{companyName}</p>
            )}
            {truckNumbers.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap pt-0.5">
                <Truck className="h-3 w-3 text-slate-600" />
                {truckNumbers.map((truck) => (
                  <Badge key={truck} variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-5">
                    {truck}
                  </Badge>
                ))}
              </div>
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
  const navigate = useNavigate();
  const allowedTrucks = session?.allowed_trucks || [];

  // Shared notifications hook — same query key as bell + notifications page
  const { notifications, unreadCount, markRead } = useOwnerNotifications(session);

  const { data: confirmations = [] } = useQuery({
    queryKey: ['confirmations-home'],
    queryFn: () => base44.entities.Confirmation.list('-confirmed_at', 500),
    enabled: session?.code_type === 'CompanyOwner',
    refetchInterval: 30000,
  });

  const { data: dispatches = [] } = useQuery({
    queryKey: ['portal-dispatches', session?.company_id],
    queryFn: () => base44.entities.Dispatch.filter({ company_id: session.company_id }, '-date', 200),
    enabled: !!session?.company_id,
    refetchInterval: 30000,
    refetchOnWindowFocus: true,
  });

  const { data: allAnnouncements = [] } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => base44.entities.Announcement.filter({ active_flag: true }, 'priority', 50),
    enabled: !!session,
    refetchInterval: 60000,
  });

  const announcements = useMemo(() => {
    return allAnnouncements.filter(a => {
      if (a.target_type === 'All') return true;
      if (a.target_type === 'Companies') return (a.target_company_ids || []).includes(session?.company_id);
      if (a.target_type === 'AccessCodes') return (a.target_access_code_ids || []).includes(session?.id);
      return false;
    }).sort((a, b) => (a.priority || 3) - (b.priority || 3));
  }, [allAnnouncements, session]);

  const filteredDispatches = useMemo(() => {
    return dispatches.filter(d => {
      const assigned = d.trucks_assigned || [];
      return assigned.some(t => allowedTrucks.includes(t));
    });
  }, [dispatches, allowedTrucks]);

  const todayDispatches = useMemo(() =>
    filteredDispatches
      .filter(d => getDispatchBucket(d) === 'today')
      .sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''))
      .slice(0, 5),
    [filteredDispatches]
  );

  const upcomingDispatches = useMemo(() =>
    filteredDispatches
      .filter(d => getDispatchBucket(d) === 'upcoming')
      .sort((a, b) => parseISO(dateOnly(a.date)) - parseISO(dateOnly(b.date)))
      .slice(0, 5),
    [filteredDispatches]
  );

  // Build action items: unread dispatch-change notifications enriched with dispatch data
  const actionItems = useMemo(() => {
    const dispatchMap = {};
    dispatches.forEach(d => { dispatchMap[d.id] = d; });

    const unread = notifications.filter(n => !n.read_flag);
    return unread.slice(0, 8).map(n => ({
      notification: n,
      dispatch: n.related_dispatch_id ? (dispatchMap[n.related_dispatch_id] || null) : null,
    }));
  }, [notifications, dispatches]);

  const handleActionClick = (n) => {
    if (n.related_dispatch_id) {
      navigate(createPageUrl(`Portal?dispatchId=${n.related_dispatch_id}`));
    } else {
      navigate(createPageUrl('Notifications'));
    }
  };

  const priorityBg = { 1: 'bg-red-50 border-red-200', 2: 'bg-orange-50 border-orange-200', 3: 'bg-yellow-50 border-yellow-200', 4: 'bg-blue-50 border-blue-200', 5: 'bg-slate-50 border-slate-200' };
  const priorityText = { 1: 'text-red-800', 2: 'text-orange-800', 3: 'text-yellow-800', 4: 'text-blue-800', 5: 'text-slate-700' };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Home</h2>
        <p className="text-sm text-slate-500">
          {session?.label || session?.code_type} · Trucks: {allowedTrucks.join(', ') || '—'}
        </p>
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <section className="space-y-2">
          {announcements.map(a => (
            <div key={a.id} className={`rounded-lg border px-4 py-3 flex gap-3 items-start ${priorityBg[a.priority] || priorityBg[3]}`}>
              <Megaphone className={`h-4 w-4 shrink-0 mt-0.5 ${priorityText[a.priority] || priorityText[3]}`} />
              <div>
                <p className={`text-sm font-semibold ${priorityText[a.priority] || priorityText[3]}`}>{a.title}</p>
                <p className={`text-xs mt-0.5 whitespace-pre-wrap ${priorityText[a.priority] || priorityText[3]} opacity-90`}>{a.message}</p>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Action Needed — always visible for CompanyOwner */}
      {session?.code_type === 'CompanyOwner' && (
        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-red-500" />
              Action Needed
              {unreadCount > 0 && (
                <Badge className="bg-red-500 text-white text-xs px-1.5 py-0">{unreadCount}</Badge>
              )}
            </h3>
            <Link to={createPageUrl('Notifications')} className="text-xs text-slate-400 hover:text-slate-600">
              View all notifications
            </Link>
          </div>
          <Card className="border-red-100">
            <CardContent className="p-0 divide-y divide-slate-100">
              {actionItems.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No actions needed</p>
              ) : (
                actionItems.map(({ notification: n, dispatch: d }) => {
                  const liveRequiredTrucks = d
                    ? (d.trucks_assigned || []).filter(t => allowedTrucks.includes(t))
                    : undefined;

                  return (
                    <div
                      key={n.id}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-blue-50/40 cursor-pointer bg-blue-50/20"
                      onClick={() => handleActionClick(n)}
                    >
                      <Bell className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{n.title}</p>
                        <p className="text-xs text-slate-600 mt-0.5 line-clamp-2 whitespace-pre-line">{formatNotificationDetailsMessage(n.message)}</p>
                        {(liveRequiredTrucks ?? n.required_trucks)?.length > 0 && (
                          <div className="mt-1">
                            <NotificationStatusBadge
                              notification={n}
                              confirmations={confirmations}
                              requiredTrucks={liveRequiredTrucks}
                            />
                          </div>
                        )}
                      </div>
                      <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                    </div>
                  );
                })
              )}
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
          <CardContent className="p-1 space-y-2">
            {todayDispatches.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No dispatches today</p>
            ) : (
              todayDispatches.map(d => <MiniDispatchCard key={d.id} dispatch={d} companyName={d.company_name} />)
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
          <CardContent className="p-1 space-y-2">
            {upcomingDispatches.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No upcoming dispatches</p>
            ) : (
              upcomingDispatches.map(d => <MiniDispatchCard key={d.id} dispatch={d} companyName={d.company_name} />)
            )}
          </CardContent>
        </Card>
      </section>

      <Link to={createPageUrl('Portal')}>
        <Button className="w-full bg-slate-900 hover:bg-slate-800">
          View All Dispatches
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </Link>
    </div>
  );
}
