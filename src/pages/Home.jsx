import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../components/session/SessionContext';
import { Card, CardContent } from '@/components/ui/card';
import AnnouncementCard from '@/components/announcements/AnnouncementCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Bell, Clock, Sun, Moon, ArrowRight, AlertCircle, Truck, Megaphone } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { getDispatchBucket } from '../components/portal/dispatchBuckets';
import { createPageUrl } from '@/utils';
import { Link, useNavigate } from 'react-router-dom';
import { useOwnerNotifications } from '../components/notifications/useOwnerNotifications';
import NotificationStatusBadge from '../components/notifications/NotificationStatusBadge';
import { formatNotificationDetailsMessage } from '../components/notifications/formatNotificationDetailsMessage';
import { useConfirmationsQuery } from '../components/notifications/useConfirmationsQuery';

const dateOnly = (v) => (typeof v === 'string' ? v.slice(0, 10) : v);
const normalizeId = (value) => String(value ?? '');

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

function MiniDispatchCard({ dispatch, companyName, truckNumbers = [] }) {

  return (
    <Link to={createPageUrl(`Portal?dispatchId=${normalizeId(dispatch.id)}`)}>
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
            {dispatch.reference_tag && (
              <p className="text-xs text-slate-400 truncate">Reference Tag: {dispatch.reference_tag}</p>
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
  const isDriver = session?.code_type === 'Driver';


  // Shared notifications hook — same query key as bell + notifications page
  const { notifications, unreadCount, markReadAsync } = useOwnerNotifications(session);

  const { data: confirmations = [] } = useConfirmationsQuery(session?.code_type === 'CompanyOwner');


  const { data: driverAssignments = [] } = useQuery({
    queryKey: ['driver-dispatch-assignments', session?.driver_id],
    queryFn: () => base44.entities.DriverDispatchAssignment.filter({ driver_id: session.driver_id }, '-assigned_datetime', 500),
    enabled: isDriver && !!session?.driver_id,
  });

  const { data: dispatches = [] } = useQuery({
    queryKey: ['portal-dispatches', session?.company_id],
    queryFn: () => base44.entities.Dispatch.filter({ company_id: session.company_id }, '-date', 200),
    enabled: !!session?.company_id,
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

  const driverAssignedTrucksByDispatch = useMemo(() => {
    const map = new Map();
    driverAssignments
      .filter((assignment) => assignment?.active_flag !== false)
      .forEach((assignment) => {
        if (!assignment?.dispatch_id || !assignment?.truck_number) return;
        const dispatchId = normalizeId(assignment.dispatch_id);
        if (!map.has(dispatchId)) map.set(dispatchId, []);
        const trucks = map.get(dispatchId);
        if (!trucks.includes(assignment.truck_number)) trucks.push(assignment.truck_number);
      });
    return map;
  }, [driverAssignments]);

  const driverDispatchIds = useMemo(
    () => new Set(driverAssignedTrucksByDispatch.keys()),
    [driverAssignedTrucksByDispatch]
  );

  const getVisibleTrucksForDispatch = (dispatch) => {
    if (!dispatch?.id) return [];
    if (isDriver) return driverAssignedTrucksByDispatch.get(normalizeId(dispatch.id)) || [];
    return (dispatch.trucks_assigned || []).filter((truck) => allowedTrucks.includes(truck));
  };

  const filteredDispatches = useMemo(() => {
    if (isDriver) {
      return dispatches.filter((dispatch) => driverDispatchIds.has(normalizeId(dispatch.id)));
    }

    return dispatches.filter(d => {
      const assigned = d.trucks_assigned || [];
      return assigned.some(t => allowedTrucks.includes(t));
    });
  }, [dispatches, allowedTrucks, driverDispatchIds, isDriver]);

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
    filteredDispatches.forEach((dispatch) => {dispatchMap[normalizeId(dispatch.id)] = dispatch;});

    return notifications
      .filter((notification) => {
        if (notification.read_flag) return false;
        if (!notification.related_dispatch_id) return true;
        return Boolean(dispatchMap[normalizeId(notification.related_dispatch_id)]);
      })
      .slice(0, 8)
      .map((notification) => ({
        notification,
        dispatch: notification.related_dispatch_id ? dispatchMap[normalizeId(notification.related_dispatch_id)] : null,
      }));
  }, [notifications, filteredDispatches]);

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
      navigate(createPageUrl(`Portal?dispatchId=${normalizeId(n.related_dispatch_id)}`));
    } else {
      navigate(createPageUrl('Notifications'));
    }
  };

  const handleActionClick = async (n) => {
    await handleNotificationClick(n);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Home</h2>
        <p className="text-sm text-slate-500">
          {session?.label || session?.code_type}
        </p>
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <section>
          <Card className="rounded-lg border bg-white shadow-sm overflow-hidden">
            <div className="border-b border-slate-100 bg-blue-700 px-4 py-3">
              <div className="flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-white" />
                <h3 className="text-sm font-semibold text-white">Announcement Center</h3>
              </div>
            </div>
            <CardContent className="bg-white p-0">
              <div className="divide-y divide-slate-100 bg-white">
                {announcements.map(a => (
                  <AnnouncementCard key={a.id} announcement={a} variant="plain" />
                ))}
              </div>
            </CardContent>
          </Card>
        </section>
      )}

      {/* Action Needed — always visible for CompanyOwner */}
      {session?.code_type === 'CompanyOwner' && (
        <section>
          <Card className="border-2 border-red-600">
            <div className="border-b border-red-800 bg-red-700 px-4 py-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <AlertCircle className="h-4 w-4 text-white shrink-0" />
                <h3 className="text-sm font-semibold text-white truncate">Action Needed</h3>
                {unreadCount > 0 && (
                  <Badge className="bg-white text-red-700 text-xs px-1.5 py-0">{unreadCount}</Badge>
                )}
              </div>
              <Link to={createPageUrl('Notifications')} className="text-xs text-red-100 hover:text-white shrink-0">
                View all notifications
              </Link>
            </div>
            <CardContent className="p-0 divide-y divide-slate-100">
              {actionItems.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No actions needed</p>
              ) : (
                actionItems.map(({ notification: n, dispatch: d }) => {
                  return (
                    <div
                      key={n.id}
                      className="flex items-start gap-3 px-4 py-3 hover:bg-blue-50/40 cursor-pointer bg-blue-50/20"
                      onClick={() => handleNotificationClick(n)}
                    >
                      <Bell className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 truncate">{n.title}</p>
                        <p className="text-xs text-slate-600 mt-0.5 line-clamp-2 whitespace-pre-line">{formatNotificationDetailsMessage(n.message)}</p>
                        {d && (
                          <div className="mt-1 flex items-center gap-1 flex-wrap">
                            <Truck className="h-3 w-3 text-slate-500" />
                            {getVisibleTrucksForDispatch(d).map((truck) => (
                                <Badge key={`${n.id}-${truck}`} variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-5">
                                  {truck}
                                </Badge>
                              ))}
                          </div>
                        )}
                        <div className="mt-1">
                          <NotificationStatusBadge
                            notification={n}
                            confirmations={confirmations}
                            dispatch={d}
                            ownerAllowedTrucks={allowedTrucks}
                          />
                        </div>
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
        <Card>
          <div className="border-b border-green-800 bg-green-700 px-4 py-3">
            <div className="flex items-center gap-2">
              <Sun className="h-4 w-4 text-white" />
              <h3 className="text-sm font-semibold text-white">Today's Dispatches</h3>
              {todayDispatches.length > 0 && (
                <Badge className="bg-white text-green-700 text-xs px-1.5 py-0">{todayDispatches.length}</Badge>
              )}
            </div>
          </div>
          <CardContent className="p-1 space-y-2">
            {todayDispatches.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No dispatches today</p>
            ) : (
              todayDispatches.map(d => <MiniDispatchCard key={d.id} dispatch={d} companyName={d.company_name} truckNumbers={getVisibleTrucksForDispatch(d)} />)
            )}
          </CardContent>
        </Card>
      </section>

      {/* Upcoming Dispatches */}
      <section>
        <Card>
          <div className="border-b border-slate-900 bg-black px-4 py-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-white" />
              <h3 className="text-sm font-semibold text-white">Upcoming Dispatches</h3>
              {upcomingDispatches.length > 0 && (
                <Badge className="bg-white text-black text-xs px-1.5 py-0">{upcomingDispatches.length}</Badge>
              )}
            </div>
          </div>
          <CardContent className="p-1 space-y-2">
            {upcomingDispatches.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">No upcoming dispatches</p>
            ) : (
              upcomingDispatches.map(d => <MiniDispatchCard key={d.id} dispatch={d} companyName={d.company_name} truckNumbers={getVisibleTrucksForDispatch(d)} />)
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
