import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../components/session/SessionContext';
import { useAuth } from '@/lib/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import AnnouncementCard from '@/components/announcements/AnnouncementCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, Sun, Moon, ArrowRight, Megaphone, Truck } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { getDispatchBucket } from '../components/portal/dispatchBuckets';
import { createPageUrl } from '@/utils';
import { buildDispatchOpenPath } from '@/lib/dispatchOpenOrchestration';
import { Link, useNavigate } from 'react-router-dom';
import ActionNeededSection from '@/components/notifications/ActionNeededSection';
import { useOwnerNotifications } from '../components/notifications/useOwnerNotifications';
import { useConfirmationsQuery } from '../components/notifications/useConfirmationsQuery';
import { getActiveCompanyId, getEffectiveView, getWorkspaceDisplayLabel } from '../components/session/workspaceUtils';
import {
  getNotificationEffectiveReadFlag,
  isNotificationMarkedReadOnClick,
} from '../components/notifications/ownerActionStatus';
import {
  buildDriverAssignedTrucksByDispatch,
  canUserSeeDispatch,
  getVisibleTrucksForDispatch as getVisibleDispatchTrucks,
  normalizeVisibilityId,
} from '@/lib/dispatchVisibility';
import { listDriverDispatchesForDriver } from '@/lib/driverDispatch';
import { resolveDriverIdentity } from '@/services/currentAppIdentityService';

const dateOnly = (v) => (typeof v === 'string' ? v.slice(0, 10) : v);
const normalizeId = (value) => normalizeVisibilityId(value);

const statusColors = {
  Scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  Dispatch: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Amended: 'bg-amber-50 text-amber-700 border-amber-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200',
};

const homeSectionCardClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden';
const homeSectionHeaderClass = 'flex min-h-14 items-center justify-between gap-2 border-b border-slate-200 px-4 py-3';

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

const getEasternHour = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: false,
    timeZone: 'America/New_York',
  }).formatToParts(new Date());

  const hourPart = parts.find((part) => part.type === 'hour')?.value;
  const hour = Number(hourPart);

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error('Invalid Eastern hour');
  }

  return hour;
};

const getHomeGreeting = (userName) => {
  const safeName = typeof userName === 'string' ? userName.trim() : '';

  try {
    const hour = getEasternHour();
    let greeting = 'Good morning';

    if (hour >= 12 && hour <= 16) greeting = 'Good afternoon';
    else if (hour >= 17 && hour <= 20) greeting = 'Good evening';
    else if (hour >= 21 || hour <= 2) greeting = 'Good night';

    return safeName ? `${greeting}, ${safeName}!` : `${greeting}!`;
  } catch {
    return safeName ? `Welcome back, ${safeName}!` : 'Welcome back!';
  }
};

function MiniDispatchCard({ dispatch, companyName, truckNumbers = [] }) {

  return (
    <Link to={createPageUrl(buildDispatchOpenPath('Portal', { dispatchId: dispatch.id, normalizeId }))}>
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
  const { currentAppIdentity } = useAuth();
  const navigate = useNavigate();
  const effectiveView = getEffectiveView(session);
  const activeCompanyId = getActiveCompanyId(session);
  const isOwner = effectiveView === 'CompanyOwner';
  const isDriver = effectiveView === 'Driver';
  const driverIdentity = useMemo(
    () => resolveDriverIdentity({ currentAppIdentity, session }),
    [currentAppIdentity, session],
  );
  const { data: companies = [] } = useQuery({
    queryKey: ['companies-home-workspace-label'],
    queryFn: () => base44.entities.Company.list(),
    enabled: !!session,
  });

  const activeCompanyName =
    companies.find((company) => String(company.id) === String(activeCompanyId))?.name ||
    session?.company_name ||
    (typeof session?.company === 'object' ? session.company?.name : null) ||
    (!activeCompanyId && typeof session?.company === 'string' ? session.company : null);

  const workspaceDisplayLabel = getWorkspaceDisplayLabel(session, activeCompanyName);
  const homeHeading = getHomeGreeting(workspaceDisplayLabel || session?.code_type);


  // Shared notifications hook — same query key as bell + notifications page
  const { notifications, unreadCount, markReadAsync } = useOwnerNotifications(session);

  const { data: confirmations = [] } = useConfirmationsQuery(isOwner);


  const { data: driverAssignments = [] } = useQuery({
    queryKey: ['driver-dispatch-assignments', driverIdentity],
    queryFn: () => listDriverDispatchesForDriver(driverIdentity),
    enabled: isDriver && !!driverIdentity,
  });

  const { data: dispatches = [] } = useQuery({
    queryKey: ['portal-dispatches', activeCompanyId],
    queryFn: () => base44.entities.Dispatch.filter({ company_id: activeCompanyId }, '-date', 200),
    enabled: !!activeCompanyId,
  });
  const { data: ownerCompany = null } = useQuery({
    queryKey: ['owner-company-notification-scope', activeCompanyId],
    queryFn: async () => {
      if (!activeCompanyId) return null;
      const companies = await base44.entities.Company.filter({ id: activeCompanyId }, '-created_date', 1);
      return companies?.[0] || null;
    },
    enabled: isOwner && !!activeCompanyId,
  });
  const ownerScopeTrucks = Array.isArray(ownerCompany?.trucks) ? ownerCompany.trucks : [];

  const { data: allAnnouncements = [] } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => base44.entities.Announcement.filter({ active_flag: true }, 'priority', 50),
    enabled: !!session,
    refetchInterval: 60000,
  });

  const announcements = useMemo(() => {
    return allAnnouncements.filter(a => {
      if (a.target_type === 'All') return true;
      if (a.target_type === 'Companies') return (a.target_company_ids || []).includes(activeCompanyId);
      if (a.target_type === 'AccessCodes') return (a.target_access_code_ids || []).includes(session?.id);
      return false;
    }).sort((a, b) => (a.priority || 3) - (b.priority || 3));
  }, [allAnnouncements, activeCompanyId, session]);

  const driverAssignedTrucksByDispatch = useMemo(
    () => buildDriverAssignedTrucksByDispatch(driverAssignments),
    [driverAssignments]
  );

  const driverDispatchIds = useMemo(
    () => new Set(driverAssignedTrucksByDispatch.keys()),
    [driverAssignedTrucksByDispatch]
  );

  const getVisibleTrucksForDispatch = (dispatch) => {
    if (!dispatch?.id) return [];
    return getVisibleDispatchTrucks(session, dispatch, {
      driverAssignedTrucks: driverAssignedTrucksByDispatch.get(normalizeId(dispatch.id)) || [],
    });
  };

  const filteredDispatches = useMemo(() => {
    return dispatches.filter((dispatch) => canUserSeeDispatch(session, dispatch, { driverDispatchIds }));
  }, [dispatches, driverDispatchIds, session]);

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
  const actionItemsSource = useMemo(() => {
    const dispatchMap = {};
    filteredDispatches.forEach((dispatch) => {dispatchMap[normalizeId(dispatch.id)] = dispatch;});

    return notifications
      .filter((notification) => {
        const effectiveReadFlag = typeof notification?.effectiveReadFlag === 'boolean'
          ? notification.effectiveReadFlag
          : getNotificationEffectiveReadFlag({
            session,
            notification,
            dispatch: notification.related_dispatch_id ? dispatchMap[normalizeId(notification.related_dispatch_id)] : null,
            confirmations,
            ownerAllowedTrucks: ownerScopeTrucks,
          });
        if (effectiveReadFlag) return false;
        if (!notification.related_dispatch_id) return true;
        return Boolean(dispatchMap[normalizeId(notification.related_dispatch_id)]);
      })
      .map((notification) => ({
        notification,
        dispatch: notification.related_dispatch_id ? dispatchMap[normalizeId(notification.related_dispatch_id)] : null,
      }));
  }, [notifications, filteredDispatches, session?.code_type, confirmations, ownerScopeTrucks]);
  const actionItems = actionItemsSource.slice(0, 8);
  const actionNeededCount = actionItemsSource.length;

  const handleNotificationClick = async (n) => {
    if (!session) return;

    if (!isDriver && n.related_dispatch_id && isNotificationMarkedReadOnClick(n) && !n.read_flag) {
      try {
        await markReadAsync(n.id);
      } catch {
        return;
      }
    }

    if (n.related_dispatch_id) {
      const targetPath = buildDispatchOpenPath('Portal', {
        dispatchId: n.related_dispatch_id,
        notificationId: n.id,
        normalizeId,
      });
      navigate(createPageUrl(targetPath));
    } else {
      navigate(createPageUrl('Notifications'));
    }
  };
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900" data-tour="home-overview">{homeHeading}</h2>
      </div>

      {/* Announcements */}
      {announcements.length > 0 && (
        <section data-tour="announcement-center">
          <Card className={homeSectionCardClass}>
            <div className={`${homeSectionHeaderClass} bg-blue-700`}>
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
      {isOwner && (
        <ActionNeededSection
          unreadCount={actionNeededCount || unreadCount}
          actionItems={actionItems}
          confirmations={confirmations}
          ownerAllowedTrucks={ownerScopeTrucks}
          getVisibleTrucksForDispatch={getVisibleTrucksForDispatch}
          onNotificationClick={handleNotificationClick}
        />
      )}

      {/* Today's Dispatches */}
      <section data-tour="dispatch-preview">
        <Card className={homeSectionCardClass}>
          <div className={`${homeSectionHeaderClass} bg-green-700`}>
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
        <Card className={homeSectionCardClass}>
          <div className={`${homeSectionHeaderClass} bg-indigo-700`}>
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-white" />
              <h3 className="text-sm font-semibold text-white">Upcoming Dispatches</h3>
              {upcomingDispatches.length > 0 && (
                <Badge className="bg-white text-indigo-700 text-xs px-1.5 py-0">{upcomingDispatches.length}</Badge>
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
