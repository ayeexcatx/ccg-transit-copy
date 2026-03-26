import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/components/session/SessionContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Plus, Truck } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { buildDispatchOpenPath } from '@/lib/dispatchOpenOrchestration';
import { toast } from 'sonner';
import { canUserSeeIncident, normalizeVisibilityId } from '@/lib/dispatchVisibility';

const INCIDENT_TYPES = [
  'Mechanical Issue',
  'Damage / Non-Mechanical Issue',
  'DOT Inspection / Pulled Over',
  'Accident',
  'Delay',
  'DPF Regen',
  'Other',
];


const INITIAL_FORM = {
  dispatch_id: '',
  company_id: '',
  truck_number: '',
  incident_type: 'Mechanical Issue',
  time_stopped_from: '',
  time_stopped_to: '',
  location: '',
  summary: '',
  details: '',
};

const EASTERN_TIMEZONE = 'America/New_York';

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';

  return new Intl.DateTimeFormat('en-US', {
    timeZone: EASTERN_TIMEZONE,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
};

const toIsoOrNull = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const formatDispatchDate = (value) => {
  if (!value) return '—';
  try {
    return format(parseISO(value), 'MMM d, yyyy');
  } catch {
    return value;
  }
};

const formatDispatchDateForOption = (value) => {
  if (!value) return '—';
  try {
    return format(parseISO(value), 'MM/dd/yyyy');
  } catch {
    return value;
  }
};

const getIncidentCreatedDateTime = (incident) => incident?.incident_datetime || incident?.created_date || null;

export default function Incidents() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [filters, setFilters] = useState({ status: 'all', truck: '', type: 'all' });
  const [draftUpdates, setDraftUpdates] = useState({});
  const [draftTimeStoppedTo, setDraftTimeStoppedTo] = useState({});
  const [selectedIncidentId, setSelectedIncidentId] = useState(null);

  const isAdmin = session?.code_type === 'Admin';
  const isOwner = session?.code_type === 'CompanyOwner';
  const isDriver = session?.code_type === 'Driver';

  const queryParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const createFromDispatch = queryParams.get('create') === '1';
  const queryDispatchId = queryParams.get('dispatchId') || '';
  const queryCompanyId = queryParams.get('companyId') || '';
  const queryTruckNumber = queryParams.get('truckNumber') || '';

  const { data: incidents = [], isLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: () => base44.entities.IncidentReport.list('-created_date', 500),
    enabled: !!session,
  });

  const { data: accessCodes = [] } = useQuery({
    queryKey: ['incident-access-codes'],
    queryFn: () => base44.entities.AccessCode.list('-created_date', 500),
    enabled: !!session,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['incident-companies'],
    queryFn: () => base44.entities.Company.list('-created_date', 500),
    enabled: !!session,
  });

  const { data: driverAssignments = [] } = useQuery({
    queryKey: ['incident-driver-dispatch-assignments', session?.driver_id],
    queryFn: () => base44.entities.DriverDispatchAssignment.filter({ driver_id: session.driver_id }, '-assigned_datetime', 1000),
    enabled: !!session && isDriver && !!session?.driver_id,
  });

  const { data: dispatches = [] } = useQuery({
    queryKey: ['incident-dispatches', session?.company_id],
    queryFn: () => (isAdmin
      ? base44.entities.Dispatch.list('-date', 500)
      : base44.entities.Dispatch.filter({ company_id: session.company_id }, '-date', 500)),
    enabled: !!session,
  });

  const dispatchMap = useMemo(() => {
    const map = {};
    dispatches.forEach((dispatch) => {
      map[dispatch.id] = dispatch;
    });
    return map;
  }, [dispatches]);

  const accessCodeMap = useMemo(
    () => Object.fromEntries(accessCodes.map((code) => [code.id, code])),
    [accessCodes]
  );

  const companyMap = useMemo(
    () => Object.fromEntries(companies.map((company) => [company.id, company])),
    [companies]
  );

  const getBestReadableName = (person = {}, companyId = null, fallbackCodeType = null) => {
    const readable = [
      person.full_name,
      person.display_name,
      person.label,
      person.name,
      person.owner_name,
      person.company_owner_name,
      person.company_name,
      companyId ? companyMap[companyId]?.name : null,
      fallbackCodeType,
    ].find((value) => typeof value === 'string' && value.trim());

    return readable || null;
  };

  const getIncidentReporterName = (incident) => {
    const reportedByCode = incident.reported_by_access_code_id
      ? accessCodeMap[incident.reported_by_access_code_id]
      : null;

    return getBestReadableName(
      {
        full_name: incident.reported_by_name,
        display_name: incident.reported_by_display_name,
        ...reportedByCode,
      },
      incident.company_id,
      incident.reported_by_code_type
    ) || incident.reported_by_access_code_id || '—';
  };


  const { data: incidentUpdates = [] } = useQuery({
    queryKey: ['incident-updates', selectedIncidentId],
    queryFn: () => base44.entities.IncidentUpdate.filter({ incident_report_id: selectedIncidentId }, 'update_datetime', 1000),
    enabled: !!session && !!selectedIncidentId,
  });

  const selectedIncident = useMemo(
    () => incidents.find((item) => item.id === selectedIncidentId) || null,
    [incidents, selectedIncidentId]
  );

  const sortedIncidentUpdates = useMemo(
    () => [...incidentUpdates].sort((a, b) => new Date(a?.update_datetime || 0) - new Date(b?.update_datetime || 0)),
    [incidentUpdates]
  );

  const getUpdateAuthorName = (incident, update) => {
    const updateCode = update?.added_by_access_code_id
      ? accessCodeMap[update.added_by_access_code_id]
      : null;

    return getBestReadableName(
      {
        full_name: update?.added_by_name,
        display_name: update?.added_by_display_name,
        ...updateCode,
      },
      incident.company_id,
      update?.added_by_code_type
    ) || update?.added_by_access_code_id || null;
  };

  const driverDispatchIds = useMemo(() => new Set(
    driverAssignments
      .filter((assignment) => assignment?.active_flag !== false)
      .map((assignment) => assignment.dispatch_id)
      .filter(Boolean)
  ), [driverAssignments]);

  const visibleDispatches = useMemo(() => {
    if (isAdmin || isOwner) return dispatches;
    if (isDriver) {
      return dispatches.filter((dispatch) => driverDispatchIds.has(dispatch.id));
    }
    return [];
  }, [dispatches, driverDispatchIds, isAdmin, isDriver, isOwner]);

  const visibleDispatchIds = useMemo(
    () => new Set(visibleDispatches.map((d) => normalizeVisibilityId(d.id))),
    [visibleDispatches]
  );

  const sortedVisibleDispatches = useMemo(() => (
    visibleDispatches
      .map((dispatch, index) => ({ dispatch, index }))
      .sort((a, b) => {
        const aTime = new Date(a.dispatch?.date || 0).getTime();
        const bTime = new Date(b.dispatch?.date || 0).getTime();
        if (aTime !== bTime) return bTime - aTime;

        const aJob = String(a.dispatch?.job_number || a.dispatch?.reference_tag || a.dispatch?.id || '');
        const bJob = String(b.dispatch?.job_number || b.dispatch?.reference_tag || b.dispatch?.id || '');
        const compareJob = aJob.localeCompare(bJob, undefined, { numeric: true, sensitivity: 'base' });
        if (compareJob !== 0) return compareJob;

        return a.index - b.index;
      })
      .map((item) => item.dispatch)
  ), [visibleDispatches]);

  const formTruckOptions = useMemo(() => {
    const selectedDispatch = form.dispatch_id ? dispatchMap[form.dispatch_id] : null;

    if (selectedDispatch) {
      const trucks = selectedDispatch.trucks_assigned || [];
      return [...new Set(trucks)].map((truck) => ({ value: truck, label: truck }));
    }

    if (isDriver) {
      const trucks = new Set();
      visibleDispatches.forEach((dispatch) => {
        (dispatch.trucks_assigned || []).forEach((truck) => trucks.add(truck));
      });
      return Array.from(trucks).sort().map((truck) => ({ value: truck, label: truck }));
    }

    const trucks = new Set();
    visibleDispatches.forEach((dispatch) => {
      (dispatch.trucks_assigned || []).forEach((truck) => trucks.add(truck));
    });
    return Array.from(trucks).sort().map((truck) => ({ value: truck, label: truck }));
  }, [form.dispatch_id, dispatchMap, isDriver, visibleDispatches]);

  useEffect(() => {
    if (!createFromDispatch || !session) return;
    if (queryDispatchId && !visibleDispatchIds.has(queryDispatchId)) return;

    const prefillDispatch = queryDispatchId ? dispatchMap[queryDispatchId] : null;

    let prefillTruck = queryTruckNumber;
    if (!prefillTruck && prefillDispatch) {
      const assignedTrucks = prefillDispatch.trucks_assigned || [];
      prefillTruck = assignedTrucks.length === 1 ? assignedTrucks[0] : '';
    }

    setForm((prev) => ({
      ...prev,
      dispatch_id: queryDispatchId || '',
      company_id: queryCompanyId || prefillDispatch?.company_id || session?.company_id || '',
      truck_number: prefillTruck || prev.truck_number,
    }));
    setCreateOpen(true);
  }, [
    createFromDispatch,
    dispatchMap,
    isDriver,
    queryCompanyId,
    queryDispatchId,
    queryTruckNumber,
    session,
    visibleDispatchIds,
  ]);

  useEffect(() => {
    if (!form.truck_number) return;
    const allowed = new Set(formTruckOptions.map((truck) => truck.value));
    if (!allowed.has(form.truck_number)) {
      setForm((prev) => ({ ...prev, truck_number: '' }));
    }
  }, [form.truck_number, formTruckOptions]);

  const createMutation = useMutation({
    mutationFn: (payload) => base44.entities.IncidentReport.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setCreateOpen(false);
      setForm({ ...INITIAL_FORM, company_id: session?.company_id || '' });
      toast.success('Incident report created.');

      if (createFromDispatch) {
        navigate(createPageUrl('Incidents'), { replace: true });
      }
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to create incident report.');
    },
  });

  const addUpdateMutation = useMutation({
    mutationFn: ({ incident, note }) => {
      const trimmed = note.trim();
      if (!trimmed) {
        throw new Error('Update text is required.');
      }

      return base44.entities.IncidentUpdate.create({
        incident_report_id: incident.id,
        dispatch_id: incident.dispatch_id || null,
        company_id: incident.company_id || null,
        truck_number: incident.truck_number || null,
        added_by_access_code_id: session?.id || null,
        added_by_code_type: session?.code_type || null,
        update_datetime: new Date().toISOString(),
        update_text: trimmed,
      });
    },
    onSuccess: async (_, variables) => {
      const incidentId = variables.incident.id;
      setDraftUpdates((prev) => ({ ...prev, [incidentId]: '' }));
      await queryClient.invalidateQueries({ queryKey: ['incident-updates', incidentId], exact: true });
      await queryClient.refetchQueries({ queryKey: ['incident-updates', incidentId], exact: true });
      toast.success('Incident update added.');
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to add incident update.');
    },
  });

  const updateTimeStoppedToMutation = useMutation({
    mutationFn: ({ incidentId, timeStoppedTo }) => base44.entities.IncidentReport.update(incidentId, {
      time_stopped_to: toIsoOrNull(timeStoppedTo),
    }),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['incidents'] });
      await queryClient.refetchQueries({ queryKey: ['incidents'] });
      setDraftTimeStoppedTo((prev) => ({ ...prev, [variables.incidentId]: '' }));
      toast.success('Restart Time saved.');
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to save Restart Time.');
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ incidentId, status }) => base44.entities.IncidentReport.update(incidentId, { status }),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['incidents'] });
      await queryClient.refetchQueries({ queryKey: ['incidents'] });
      if (variables?.status === 'Completed') {
        setSelectedIncidentId(null);
      }
      toast.success('Incident status updated.');
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to update incident status.');
    },
  });

  const visibleIncidents = useMemo(() => {
    return incidents
      .filter((incident) => canUserSeeIncident(session, incident, { visibleDispatchIds }))
      .filter((incident) => {
        if (filters.status !== 'all' && incident.status !== filters.status) return false;
        if (filters.type !== 'all' && incident.incident_type !== filters.type) return false;
        if (filters.truck && !String(incident.truck_number || '').toLowerCase().includes(filters.truck.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => new Date(b.incident_datetime || b.created_date || 0) - new Date(a.incident_datetime || a.created_date || 0));
  }, [filters, incidents, session, visibleDispatchIds]);

  const onDispatchChange = (dispatchId) => {
    if (dispatchId === '__none__') {
      setForm((prev) => ({ ...prev, dispatch_id: '', truck_number: '' }));
      return;
    }

    const dispatch = dispatchMap[dispatchId];
    const assignedTrucks = dispatch?.trucks_assigned || [];
    let prefillTruck = '';

    if (assignedTrucks.length === 1) {
      prefillTruck = assignedTrucks[0];
    }

    setForm((prev) => ({
      ...prev,
      dispatch_id: dispatchId,
      company_id: dispatch?.company_id || prev.company_id,
      truck_number: prefillTruck,
    }));
  };

  const handleCreate = (e) => {
    e.preventDefault();

    if (!form.truck_number || !form.incident_type || !form.summary) {
      toast.error('Please complete truck, incident type, and summary.');
      return;
    }

    createMutation.mutate({
      dispatch_id: form.dispatch_id || null,
      company_id: form.company_id || session?.company_id || null,
      truck_number: form.truck_number,
      reported_by_access_code_id: session?.id,
      reported_by_name: getBestReadableName(session, form.company_id || session?.company_id, session?.code_type),
      reported_by_code_type: session?.code_type,
      incident_type: form.incident_type,
      status: 'Open',
      incident_datetime: new Date().toISOString(),
      time_stopped_from: toIsoOrNull(form.time_stopped_from),
      time_stopped_to: toIsoOrNull(form.time_stopped_to),
      location: form.location || null,
      summary: form.summary,
      details: form.details || null,
      created_from_dispatch: Boolean(form.dispatch_id),
    });
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Incidents</h2>
          <p className="text-sm text-slate-500">View and create incident reports.</p>
        </div>
        {!isDriver && (
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Incident
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="pt-6 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Status</Label>
            <Select value={filters.status} onValueChange={(v) => setFilters((p) => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Open">Open</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Incident Type</Label>
            <Select value={filters.type} onValueChange={(v) => setFilters((p) => ({ ...p, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {INCIDENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Truck Number</Label>
            <Input
              placeholder="Filter by truck"
              value={filters.truck}
              onChange={(e) => setFilters((p) => ({ ...p, truck: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {isLoading && <Card><CardContent className="pt-6 text-sm text-slate-500">Loading incidents…</CardContent></Card>}
        {!isLoading && visibleIncidents.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-slate-500 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              No incidents found for your current filters.
            </CardContent>
          </Card>
        )}

        {visibleIncidents.map((incident) => {
          const dispatch = incident.dispatch_id ? dispatchMap[incident.dispatch_id] : null;
          const dispatchHref = dispatch
            ? createPageUrl(buildDispatchOpenPath(isAdmin ? 'AdminDispatches' : 'Portal', { dispatchId: dispatch.id }))
            : null;

          return (
            <Card
              key={incident.id}
              className="border-slate-200 cursor-pointer hover:border-slate-300 transition-colors"
              role="button"
              tabIndex={0}
              onClick={() => setSelectedIncidentId(incident.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setSelectedIncidentId(incident.id);
                }
              }}
            >
              <CardContent className="pt-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge>{incident.incident_type || 'Incident'}</Badge>
                      <Badge variant="outline" className="font-mono">
                        <Truck className="h-3 w-3 mr-1" />
                        {incident.truck_number || 'N/A'}
                      </Badge>
                      <Badge
                        className={incident.status === 'Completed'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-amber-100 text-amber-800 border border-amber-200'}
                      >
                        {incident.status || 'Open'}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-900 font-medium mt-2">{incident.summary || 'No summary'}</p>
                    <p className="text-xs text-slate-500 mt-1">{formatDateTime(getIncidentCreatedDateTime(incident))}</p>
                    {dispatch && (
                      <div className="text-xs text-slate-600 mt-2 space-y-0.5">
                        <p>
                          Dispatch:{' '}
                          <Link
                            to={dispatchHref}
                            className="text-blue-700 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {dispatch.job_number || dispatch.reference_tag || dispatch.id}
                          </Link>
                        </p>
                        <p>
                          {formatDispatchDate(dispatch.date)}
                          {dispatch.start_time ? ` • ${dispatch.start_time}` : ''}
                          {dispatch.status ? ` • ${dispatch.status}` : ''}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Incident</DialogTitle>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleCreate}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <Label>Dispatch (optional)</Label>
                <Select value={form.dispatch_id || '__none__'} onValueChange={onDispatchChange}>
                  <SelectTrigger><SelectValue placeholder="Select dispatch" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No dispatch link</SelectItem>
                    {sortedVisibleDispatches.map((dispatch) => (
                      <SelectItem key={dispatch.id} value={dispatch.id}>
                        {`${formatDispatchDateForOption(dispatch.date)} - ${dispatch.job_number || dispatch.reference_tag || dispatch.id}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Truck Number</Label>
                <Select value={form.truck_number} onValueChange={(v) => setForm((p) => ({ ...p, truck_number: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select truck" /></SelectTrigger>
                  <SelectContent>
                    {formTruckOptions.map((truck) => (
                      <SelectItem key={truck.value} value={truck.value}>{truck.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Incident Type</Label>
                <Select value={form.incident_type} onValueChange={(v) => setForm((p) => ({ ...p, incident_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INCIDENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Status</Label>
                <Input value="Open" disabled />
              </div>

              <div>
                <Label>Location</Label>
                <Input value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} />
              </div>

              <div>
                <Label>Time Stopped</Label>
                <Input
                  type="datetime-local"
                  value={form.time_stopped_from}
                  onChange={(e) => setForm((p) => ({ ...p, time_stopped_from: e.target.value }))}
                />
              </div>

              <div>
                <Label>Time Restarted</Label>
                <Input
                  type="datetime-local"
                  value={form.time_stopped_to}
                  onChange={(e) => setForm((p) => ({ ...p, time_stopped_to: e.target.value }))}
                />
                <p className="mt-1 text-xs text-slate-500">
                  If unknown now, you can enter restart time later. The incident can remain open until then.
                </p>
              </div>
            </div>

            <div>
              <Label>Summary</Label>
              <p className="text-xs text-slate-500 mb-1">Use this field for the specific issue.</p>
              <Input value={form.summary} onChange={(e) => setForm((p) => ({ ...p, summary: e.target.value }))} />
            </div>

            <div>
              <Label>Details</Label>
              <p className="text-xs text-slate-500 mb-1">Use this field for the full explanation.</p>
              <Textarea rows={4} value={form.details} onChange={(e) => setForm((p) => ({ ...p, details: e.target.value }))} />
            </div>

            <div>
              <Label>Photos / Documents</Label>
              <p className="text-xs text-slate-500 mb-1">Please submit any photos or documents (.jpg, .png, .pdf) to alex@ccgnj.com and reference the incident.</p>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Incident'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedIncidentId} onOpenChange={(open) => !open && setSelectedIncidentId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedIncident && (() => {
            const incident = selectedIncident;
            if (!incident) return null;

            return (
              <>
                <DialogHeader>
                  <DialogTitle>Incident Detail</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge>{incident.incident_type || 'Incident'}</Badge>
                    <Badge variant="outline" className="font-mono">
                      <Truck className="h-3 w-3 mr-1" />
                      {incident.truck_number || 'N/A'}
                    </Badge>
                    <Badge
                      className={incident.status === 'Completed'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'}
                    >
                      {incident.status || 'Open'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-slate-500">Summary</p>
                      <p className="text-slate-900 font-medium">{incident.summary || '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Created On</p>
                      <p className="text-slate-900">{formatDateTime(getIncidentCreatedDateTime(incident))}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Time Stopped</p>
                      <p className="text-slate-900">{formatDateTime(incident.time_stopped_from)}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Time Restarted</p>
                      <p className="text-slate-900">{formatDateTime(incident.time_stopped_to)}</p>
                    </div>
                    <div className="md:col-span-2">
                      <p className="text-slate-500">Details</p>
                      <p className="text-slate-900 whitespace-pre-wrap">{incident.details || '—'}</p>
                    </div>
                    <div>
                      <p className="text-slate-500">Reported By</p>
                      <p className="text-slate-900">{getIncidentReporterName(incident)}</p>
                    </div>
                  </div>

                  {!incident.time_stopped_to && (
                    <div className="space-y-2 rounded-md border border-slate-200 p-3">
                      <Label className="text-sm text-slate-700">Restart Time</Label>
                      <Input
                        type="datetime-local"
                        value={draftTimeStoppedTo[incident.id] || ''}
                        onChange={(e) => setDraftTimeStoppedTo((prev) => ({ ...prev, [incident.id]: e.target.value }))}
                      />
                      <Button
                        type="button"
                        className="bg-red-700 text-white hover:bg-red-600"
                        onClick={() => updateTimeStoppedToMutation.mutate({
                          incidentId: incident.id,
                          timeStoppedTo: draftTimeStoppedTo[incident.id] || '',
                        })}
                        disabled={updateTimeStoppedToMutation.isPending || !draftTimeStoppedTo[incident.id]}
                      >
                        Save Restart Time
                      </Button>
                      <p className="text-xs font-bold text-red-700">→ Please save time first before marking complete.</p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label className="text-sm text-slate-700">Add Update / Note</Label>
                    <Textarea
                      className="w-full min-h-[120px]"
                      placeholder="Write an update or note..."
                      value={draftUpdates[incident.id] || ''}
                      onChange={(e) => setDraftUpdates((prev) => ({ ...prev, [incident.id]: e.target.value }))}
                    />
                    <Button
                      type="button"
                      className="bg-red-700 text-white hover:bg-red-600"
                      onClick={() => addUpdateMutation.mutate({ incident, note: draftUpdates[incident.id] || '' })}
                      disabled={addUpdateMutation.isPending || !(draftUpdates[incident.id] || '').trim()}
                    >
                      Add Update
                    </Button>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-end">
                      {incident.status === 'Completed' ? (
                        <Button
                          type="button"
                          onClick={() => updateStatusMutation.mutate({ incidentId: incident.id, status: 'Open' })}
                          disabled={updateStatusMutation.isPending}
                        >
                          Reopen Incident
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          onClick={() => updateStatusMutation.mutate({ incidentId: incident.id, status: 'Completed' })}
                          disabled={updateStatusMutation.isPending}
                        >
                          Mark Completed
                        </Button>
                      )}
                    </div>
                    {!incident.time_stopped_to && incident.status !== 'Completed' && (
                      <p className="text-xs font-bold text-red-700 text-right">Please save restart time before marking complete.</p>
                    )}
                    <p className="text-xs text-slate-500 text-right">You can still add updates after marking this incident complete.</p>
                  </div>

                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3 space-y-3">
                    <p className="text-sm font-medium text-slate-700">Incident Timeline</p>
                    <div className="text-sm text-slate-700">
                      <p className="font-medium">Original Incident Report</p>
                      <p className="whitespace-pre-wrap">{incident.details || incident.summary || '—'}</p>
                      <p className="text-xs text-slate-500 mt-1">
                        {formatDateTime(getIncidentCreatedDateTime(incident))}
                        {getIncidentReporterName(incident) ? ` • ${getIncidentReporterName(incident)}` : ''}
                      </p>
                    </div>
                    {sortedIncidentUpdates.length > 0 ? (
                      sortedIncidentUpdates.map((update) => (
                        <div key={update.id} className="text-sm text-slate-700 border-t border-slate-200 pt-2">
                          <p className="font-medium">Update</p>
                          <p className="whitespace-pre-wrap">{update?.update_text || '—'}</p>
                          <p className="text-xs text-slate-500 mt-1">
                            {formatDateTime(update?.update_datetime)}
                            {getUpdateAuthorName(incident, update) ? ` • ${getUpdateAuthorName(incident, update)}` : ''}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-500">No updates yet.</p>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
