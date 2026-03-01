import React, { useState, useMemo, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../components/session/SessionContext';
import DispatchCard from '../components/portal/DispatchCard';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Truck, Inbox } from 'lucide-react';
import { format, isToday, isBefore, startOfDay } from 'date-fns';
import { notifyTruckConfirmation } from '../components/notifications/createNotifications';

export default function Portal() {
  const { session } = useSession();
  const [tab, setTab] = useState('today');
  const queryClient = useQueryClient();
  const dispatchRefs = useRef({});
  const [expandedDispatchId, setExpandedDispatchId] = useState(null);
  const didAutoScroll = useRef(false);

  // Read ?dispatchId from URL
  const urlParams = new URLSearchParams(window.location.search);
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

  const timeEntryMutation = useMutation({
    mutationFn: async ({ dispatch, truck, start, end }) => {
      const existing = timeEntries.find(te =>
        te.dispatch_id === dispatch.id && te.truck_number === truck && te.access_code_id === session.id
      );
      if (existing) {
        return base44.entities.TimeEntry.update(existing.id, {
          start_time: start || existing.start_time,
          end_time: end || existing.end_time,
        });
      }
      return base44.entities.TimeEntry.create({
        dispatch_id: dispatch.id,
        access_code_id: session.id,
        truck_number: truck,
        start_time: start,
        end_time: end,
      });
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

  const today = startOfDay(new Date());

  const upcomingDispatches = useMemo(() => {
    return filteredDispatches
      .filter(d => d.status !== 'Canceled' && d.date && new Date(d.date) > today)
      .sort((a, b) => {
        const dateDiff = new Date(a.date) - new Date(b.date);
        if (dateDiff !== 0) return dateDiff;
        const aTime = a.start_time || 'zzz';
        const bTime = b.start_time || 'zzz';
        return aTime.localeCompare(bTime);
      });
  }, [filteredDispatches, today]);

  const todayDispatches = useMemo(() => {
    return filteredDispatches
      .filter(d => d.status !== 'Canceled' && d.date && isToday(new Date(d.date)))
      .sort((a, b) => {
        if (!a.start_time && !b.start_time) return 0;
        if (!a.start_time) return 1;
        if (!b.start_time) return -1;
        return a.start_time.localeCompare(b.start_time);
      });
  }, [filteredDispatches]);

  const historyDispatches = useMemo(() => {
    return filteredDispatches
      .filter(d => d.status === 'Canceled' || (d.date && isBefore(new Date(d.date), today)))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [filteredDispatches, today]);

  const companyMap = {};
  companies.forEach(c => { companyMap[c.id] = c.name; });

  const handleConfirm = (dispatch, truck, confType) => {
    // Prevent duplicate: same dispatch + truck + type
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

    // Notify admin of truck confirmation
    const companyName = companyMap[dispatch.company_id];
    notifyTruckConfirmation(dispatch, truck, companyName);
  };

  const handleTimeEntry = (dispatch, truck, start, end) => {
    timeEntryMutation.mutate({ dispatch, truck, start, end });
  };

  const currentList = tab === 'active' ? activeDispatches : historyDispatches;
  const sortedNotes = [...templateNotes].sort((a, b) => (a.priority || 0) - (b.priority || 0));

  // Detect if targeted dispatch is not found/visible
  const dispatchNotFound = targetDispatchId && dispatches.length > 0 &&
    !dispatches.find(d => d.id === targetDispatchId);

  // Auto-navigate to target dispatch when data is loaded
  useEffect(() => {
    if (!targetDispatchId || didAutoScroll.current || dispatches.length === 0) return;

    // Check if dispatch exists at all (even if not in filteredDispatches)
    const target = dispatches.find(d => d.id === targetDispatchId);
    if (!target) {
      didAutoScroll.current = true;
      return; // dispatch not found/available
    }

    const filteredTarget = filteredDispatches.find(d => d.id === targetDispatchId);
    if (!filteredTarget) return; // dispatch exists but not assigned to this user

    // Determine correct tab
    const isActive = activeDispatches.some(d => d.id === targetDispatchId);
    const isHistory = historyDispatches.some(d => d.id === targetDispatchId);
    if (!isActive && !isHistory) {
      // Dispatch is assigned to this user but falls outside 30-day history window
      didAutoScroll.current = true;
      return;
    }

    const correctTab = isActive ? 'active' : 'history';
    if (tab !== correctTab) {
      setTab(correctTab);
      return; // wait for re-render
    }

    // Expand and scroll
    setExpandedDispatchId(targetDispatchId);
    didAutoScroll.current = true;

    setTimeout(() => {
      const el = dispatchRefs.current[targetDispatchId];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 150);
  }, [targetDispatchId, filteredDispatches, tab, activeDispatches, historyDispatches]);

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
          <TabsTrigger value="active" className="text-xs">
            Active ({activeDispatches.length})
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
            {tab === 'active' ? 'No active dispatches' : 'No history in the last 30 days'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {currentList.map(d => (
            <div key={d.id} ref={el => dispatchRefs.current[d.id] = el}>
              <DispatchCard
                dispatch={d}
                session={session}
                confirmations={confirmations}
                timeEntries={timeEntries}
                templateNotes={sortedNotes}
                onConfirm={handleConfirm}
                onTimeEntry={handleTimeEntry}
                companyName={companyMap[d.company_id]}
                forceExpanded={expandedDispatchId === d.id}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}