import React, { useState, useMemo, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../components/session/SessionContext';
import DispatchCard from '../components/portal/DispatchCard';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Truck, Inbox } from 'lucide-react';
import { subDays } from 'date-fns';
import { notifyTruckConfirmation } from '../components/notifications/createNotifications';

export default function Portal() {
  const { session } = useSession();
  const [tab, setTab] = useState('active');
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

  const thirtyDaysAgo = subDays(new Date(), 30);

  const activeDispatches = filteredDispatches.filter(d =>
    d.status !== 'Completed' && d.status !== 'Canceled'
  );

  const historyDispatches = filteredDispatches.filter(d =>
    (d.status === 'Completed' || d.status === 'Canceled') &&
    new Date(d.date) >= thirtyDaysAgo
  );

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

  return (
    <div className="space-y-6">
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
            <DispatchCard
              key={d.id}
              dispatch={d}
              session={session}
              confirmations={confirmations}
              timeEntries={timeEntries}
              templateNotes={sortedNotes}
              onConfirm={handleConfirm}
              onTimeEntry={handleTimeEntry}
              companyName={companyMap[d.company_id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}