import React, { useState, useMemo, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../components/session/SessionContext';
import DispatchCard from '../components/portal/DispatchCard';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Truck, Inbox } from 'lucide-react';
import { startOfDay, parseISO } from 'date-fns';
import { getDispatchBucket } from '../components/portal/dispatchBuckets';
import { sortTemplateNotesForDispatch } from '@/lib/templateNotes';
import { notifyTruckConfirmation, resolveOwnerNotificationIfComplete } from '../components/notifications/createNotifications';

function myTrucksForHistory(dispatch, timeEntries, session) {
  const trucks = (session?.allowed_trucks || []).filter(t => (dispatch.trucks_assigned || []).includes(t));
  return trucks.some(t => timeEntries.some(te => te.dispatch_id === dispatch.id && te.truck_number === t));
}

export default function Portal() {
  const { session } = useSession();
  const [tab, setTab] = useState('today');
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const dispatchRefs = useRef({});
  const [drawerDispatchId, setDrawerDispatchId] = useState(null);
  const [drawerMountKey, setDrawerMountKey] = useState('');
  const pendingOpenIdRef = useRef(null);

  const urlParams = new URLSearchParams(location.search);
  const targetDispatchId = urlParams.get('dispatchId');

  const { data: dispatches = [] } = useQuery({
    queryKey: ['portal-dispatches', session?.company_id],
    queryFn: () => base44.entities.Dispatch.filter({ company_id: session.company_id }, '-date', 200),
    enabled: !!session?.company_id,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.list(),
  });

  const { data: confirmations = [] } = useQuery({
    queryKey: ['confirmations'],
    queryFn: () => base44.entities.Confirmation.list('-confirmed_at', 500),
  });

  const { data: timeEntries = [] } = useQuery({
    queryKey: ['time-entries'],
    queryFn: () => base44.entities.TimeEntry.list('-created_date', 500),
  });

  const { data: templateNotes = [] } = useQuery({
    queryKey: ['template-notes'],
    queryFn: () => base44.entities.DispatchTemplateNotes.filter({ active_flag: true }),
  });

  const confirmMutation = useMutation({
    mutationFn: (data) => base44.entities.Confirmation.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['confirmations'] }),
  });

  const today = startOfDay(new Date());

  const timeEntryMutation = useMutation({
    mutationFn: async ({ dispatch, truck, start, end }) => {
      const existing = timeEntries.find(te =>
        te.dispatch_id === dispatch.id && te.truck_number === truck && te.access_code_id === session.id
      );
      let savedEntry;
      if (existing) {
        savedEntry = await base44.entities.TimeEntry.update(existing.id, {
          start_time: start !== undefined ? start : existing.start_time,
          end_time: end !== undefined ? end : existing.end_time,
        });
      } else {
        savedEntry = await base44.entities.TimeEntry.create({
          dispatch_id: dispatch.id,
          access_code_id: session.id,
          truck_number: truck,
          start_time: start,
          end_time: end,
        });
      }

      // Auto-archive if both times set and dispatch date is today or past
      const effectiveStart = start || existing?.start_time;
      const effectiveEnd = end || existing?.end_time;
      const dispatchDate = dispatch.date ? startOfDay(parseISO(dispatch.date)) : null;
      const isPastOrToday = dispatchDate && dispatchDate <= today;
      if (effectiveStart && effectiveEnd && isPastOrToday && !dispatch.archived_flag) {
        await base44.entities.Dispatch.update(dispatch.id, {
          archived_flag: true,
          archived_at: new Date().toISOString(),
          archived_reason: 'Time logged',
        });
        queryClient.invalidateQueries({ queryKey: ['portal-dispatches', session?.company_id] });
      }

      return savedEntry;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['time-entries'] }),
  });

  const allowedTrucks = session?.allowed_trucks || [];

  const filteredDispatches = useMemo(() => {
    return dispatches.filter(d => {
      const assigned = d.trucks_assigned || [];
      return assigned.some(t => allowedTrucks.includes(t));
    });
  }, [dispatches, allowedTrucks]);

  const upcomingDispatches = useMemo(() => filteredDispatches
    .filter(d => getDispatchBucket(d) === 'upcoming')
    .sort((a, b) => {
      // String compare on YYYY-MM-DD is safe — no Date parsing needed
      const dateDiff = a.date.localeCompare(b.date);
      if (dateDiff !== 0) return dateDiff;
      return (a.start_time || 'zzz').localeCompare(b.start_time || 'zzz');
    }), [filteredDispatches]);

  const todayDispatches = useMemo(() => filteredDispatches
    .filter(d => getDispatchBucket(d) === 'today')
    .sort((a, b) => {
      if (!a.start_time && !b.start_time) return 0;
      if (!a.start_time) return 1;
      if (!b.start_time) return -1;
      return a.start_time.localeCompare(b.start_time);
    }), [filteredDispatches]);

  const historyDispatches = useMemo(() => filteredDispatches
    .filter(d => {
      if (getDispatchBucket(d) !== 'history') return false;
      if (!d.archived_flag) return myTrucksForHistory(d, timeEntries, session);
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date)),
  [filteredDispatches, timeEntries]);

  const companyMap = {};
  companies.forEach(c => { companyMap[c.id] = c.name; });

  const handleConfirm = (dispatch, truck, confType) => {
    const alreadyConfirmed = confirmations.some(c =>
      c.dispatch_id === dispatch.id &&
      c.truck_number === truck &&
      c.confirmation_type === confType
    );
    if (alreadyConfirmed) return;

    confirmMutation.mutate({
      dispatch_id: dispatch.id,
      access_code_id: session.id,
      truck_number: truck,
      confirmation_type: confType,
      confirmed_at: new Date().toISOString(),
    });

    const companyName = companyMap[dispatch.company_id];
    notifyTruckConfirmation(dispatch, truck, companyName);

    const updatedConfirmations = [
      ...confirmations,
      { dispatch_id: dispatch.id, truck_number: truck, confirmation_type: confType }
    ];

    if (session?.code_type === 'CompanyOwner') {
      resolveOwnerNotificationIfComplete(dispatch, updatedConfirmations, session.id);
    }

    // Auto-archive Cancelled dispatch once all trucks have confirmed cancellation
    if (confType === 'Cancelled') {
      const allTrucks = dispatch.trucks_assigned || [];
      const confirmedCanceledTrucks = updatedConfirmations
        .filter(c => c.dispatch_id === dispatch.id && c.confirmation_type === 'Cancelled')
        .map(c => c.truck_number);
      const allConfirmed = allTrucks.every(t => confirmedCanceledTrucks.includes(t));
      if (allConfirmed && !dispatch.archived_flag) {
        base44.entities.Dispatch.update(dispatch.id, {
          archived_flag: true,
          archived_at: new Date().toISOString(),
          archived_reason: 'Cancellation confirmed',
        }).then(() => queryClient.invalidateQueries({ queryKey: ['portal-dispatches', session?.company_id] }));
      }
    }
  };

  const handleTimeEntry = (dispatch, truck, start, end) => {
    timeEntryMutation.mutate({ dispatch, truck, start, end });
  };

  const currentList = tab === 'upcoming' ? upcomingDispatches : tab === 'today' ? todayDispatches : historyDispatches;
  const sortedNotes = sortTemplateNotesForDispatch(templateNotes);

  const dispatchNotFound = targetDispatchId && dispatches.length > 0 &&
    !dispatches.find(d => d.id === targetDispatchId);


  const handleDrawerClose = () => {
    setDrawerDispatchId(null);

    if (!targetDispatchId) return;

    const nextParams = new URLSearchParams(location.search);
    nextParams.delete('dispatchId');
    navigate({ search: nextParams.toString() ? `?${nextParams.toString()}` : '' }, { replace: true });
  };

  useEffect(() => {
    const idToOpen = targetDispatchId || pendingOpenIdRef.current;
    if (!idToOpen || dispatches.length === 0) return;

    const target = dispatches.find(d => d.id === idToOpen);
    if (!target) return;

    const filteredTarget = filteredDispatches.find(d => d.id === idToOpen);
    if (!filteredTarget) return;

    const inUpcoming = upcomingDispatches.some(d => d.id === idToOpen);
    const inToday = todayDispatches.some(d => d.id === idToOpen);
    const inHistory = historyDispatches.some(d => d.id === idToOpen);

    const correctTab = inUpcoming ? 'upcoming' : inToday ? 'today' : inHistory ? 'history' : null;
    if (!correctTab) return;

    if (tab !== correctTab) {
      pendingOpenIdRef.current = idToOpen;
      setTab(correctTab);
      return;
    }

    pendingOpenIdRef.current = null;
    setDrawerDispatchId(null);
    setDrawerMountKey(`${idToOpen}:${Date.now()}`);
    requestAnimationFrame(() => {
      setDrawerDispatchId(idToOpen);
      setTimeout(() => {
        const el = dispatchRefs.current[idToOpen];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    });
  }, [location.search, filteredDispatches, tab, upcomingDispatches, todayDispatches, historyDispatches]);

  return (
    <div className="space-y-6">
      {dispatchNotFound && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
          Dispatch no longer available.
        </div>
      )}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <h2 className="text-xl font-bold text-slate-900">My Dispatches</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-slate-500">Trucks:</span>
          {allowedTrucks.map(t => (
            <Badge key={t} variant="outline" className="font-mono text-xs">
              <Truck className="h-3 w-3 mr-1" />{t}
            </Badge>
          ))}
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-slate-100">
          <TabsTrigger value="today" className="text-xs">
            Today ({todayDispatches.length})
          </TabsTrigger>
          <TabsTrigger value="upcoming" className="text-xs">
            Upcoming ({upcomingDispatches.length})
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs">
            History ({historyDispatches.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {currentList.length === 0 ? (
        <div className="text-center py-16">
          <Inbox className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-500">
            {tab === 'today' ? 'No dispatches today' : tab === 'upcoming' ? 'No upcoming dispatches' : 'No history'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {currentList.map(d => (
            <div key={d.id} ref={el => dispatchRefs.current[d.id] = el}>
              <DispatchCard
                key={drawerDispatchId === d.id ? drawerMountKey || d.id : d.id}
                dispatch={d}
                session={session}
                confirmations={confirmations}
                timeEntries={timeEntries}
                templateNotes={sortedNotes}
                onConfirm={handleConfirm}
                onTimeEntry={handleTimeEntry}
                companyName={companyMap[d.company_id]}
                forceOpen={drawerDispatchId === d.id}
                onDrawerClose={handleDrawerClose}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}