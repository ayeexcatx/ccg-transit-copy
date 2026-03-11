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
import { toast } from 'sonner';

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
  photos: '',
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return format(d, 'MMM d, yyyy h:mm a');
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

export default function Incidents() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(INITIAL_FORM);
  const [filters, setFilters] = useState({ status: 'all', truck: '', type: 'all' });
  const [draftUpdates, setDraftUpdates] = useState({});

  const isAdmin = session?.code_type === 'Admin';
  const isOwner = session?.code_type === 'CompanyOwner';
  const isTruck = session?.code_type === 'Truck';

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

  const visibleDispatches = useMemo(() => {
    if (isAdmin || isOwner) return dispatches;
    const allowed = session?.allowed_trucks || [];
    return dispatches.filter((dispatch) =>
      (dispatch.trucks_assigned || []).some((truckNumber) => allowed.includes(truckNumber))
    );
  }, [dispatches, isAdmin, isOwner, session?.allowed_trucks]);

  const visibleDispatchIds = useMemo(() => new Set(visibleDispatches.map((d) => d.id)), [visibleDispatches]);

  const formTruckOptions = useMemo(() => {
    const selectedDispatch = form.dispatch_id ? dispatchMap[form.dispatch_id] : null;

    if (selectedDispatch) {
      let trucks = selectedDispatch.trucks_assigned || [];
      if (isTruck) {
        const allowed = new Set(session?.allowed_trucks || []);
        trucks = trucks.filter((truck) => allowed.has(truck));
      }
      return [...new Set(trucks)].map((truck) => ({ value: truck, label: truck }));
    }

    if (isTruck) {
      return (session?.allowed_trucks || []).map((truck) => ({ value: truck, label: truck }));
    }

    const trucks = new Set();
    visibleDispatches.forEach((dispatch) => {
      (dispatch.trucks_assigned || []).forEach((truck) => trucks.add(truck));
    });
    return Array.from(trucks).sort().map((truck) => ({ value: truck, label: truck }));
  }, [form.dispatch_id, dispatchMap, isTruck, session?.allowed_trucks, visibleDispatches]);

  useEffect(() => {
    if (!createFromDispatch || !session) return;
    if (queryDispatchId && !visibleDispatchIds.has(queryDispatchId)) return;

    const prefillDispatch = queryDispatchId ? dispatchMap[queryDispatchId] : null;

    let prefillTruck = queryTruckNumber;
    if (!prefillTruck && prefillDispatch) {
      const assignedTrucks = prefillDispatch.trucks_assigned || [];
      if (isTruck) {
        const allowed = new Set(session?.allowed_trucks || []);
        const available = assignedTrucks.filter((truck) => allowed.has(truck));
        prefillTruck = available.length === 1 ? available[0] : '';
      } else {
        prefillTruck = assignedTrucks.length === 1 ? assignedTrucks[0] : '';
      }
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
    isTruck,
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
    mutationFn: async ({ incident, note }) => {
      const trimmed = note.trim();
      const existingUpdates = Array.isArray(incident.updates) ? incident.updates : [];
      return base44.entities.IncidentReport.update(incident.id, {
        updates: [
          ...existingUpdates,
          {
            note: trimmed,
            created_at: new Date().toISOString(),
            created_by_access_code_id: session?.id || null,
            created_by_code_type: session?.code_type || null,
          },
        ],
      });
    },
    onSuccess: (_, variables) => {
      setDraftUpdates((prev) => ({ ...prev, [variables.incident.id]: '' }));
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      toast.success('Incident update added.');
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to add incident update.');
    },
  });

  const reopenMutation = useMutation({
    mutationFn: (incidentId) => base44.entities.IncidentReport.update(incidentId, { status: 'Open' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      toast.success('Incident reopened.');
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to reopen incident.');
    },
  });

  const visibleIncidents = useMemo(() => {
    const ownedTruckSet = new Set(session?.allowed_trucks || []);

    return incidents
      .filter((incident) => {
        if (isAdmin) return true;
        if (isTruck) return incident.reported_by_access_code_id === session?.id;
        if (isOwner) {
          const createdByOwner = incident.reported_by_access_code_id === session?.id;
          const forOwnersTruck = incident.company_id === session?.company_id && ownedTruckSet.has(incident.truck_number);
          return createdByOwner || forOwnersTruck;
        }
        return false;
      })
      .filter((incident) => {
        if (filters.status !== 'all' && incident.status !== filters.status) return false;
        if (filters.type !== 'all' && incident.incident_type !== filters.type) return false;
        if (filters.truck && !String(incident.truck_number || '').toLowerCase().includes(filters.truck.toLowerCase())) return false;
        return true;
      })
      .sort((a, b) => new Date(b.incident_datetime || b.created_date || 0) - new Date(a.incident_datetime || a.created_date || 0));
  }, [incidents, isAdmin, isOwner, isTruck, session, filters]);

  const onDispatchChange = (dispatchId) => {
    if (dispatchId === '__none__') {
      setForm((prev) => ({ ...prev, dispatch_id: '', truck_number: '' }));
      return;
    }

    const dispatch = dispatchMap[dispatchId];
    const assignedTrucks = dispatch?.trucks_assigned || [];
    let prefillTruck = '';

    if (isTruck) {
      const allowed = new Set(session?.allowed_trucks || []);
      const filtered = assignedTrucks.filter((truck) => allowed.has(truck));
      if (filtered.length === 1) prefillTruck = filtered[0];
    } else if (assignedTrucks.length === 1) {
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
      reported_by_code_type: session?.code_type,
      incident_type: form.incident_type,
      status: 'Open',
      incident_datetime: new Date().toISOString(),
      time_stopped_from: toIsoOrNull(form.time_stopped_from),
      time_stopped_to: toIsoOrNull(form.time_stopped_to),
      location: form.location || null,
      summary: form.summary,
      details: form.details || null,
      photos: form.photos
        ? form.photos.split('\n').map((item) => item.trim()).filter(Boolean)
        : [],
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
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Incident
        </Button>
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
            ? (isAdmin ? createPageUrl(`AdminDispatches?dispatchId=${dispatch.id}`) : createPageUrl(`Portal?dispatchId=${dispatch.id}`))
            : null;

          return (
            <Card key={incident.id} className="border-slate-200">
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
                    <p className="text-xs text-slate-500 mt-1">{formatDateTime(incident.incident_datetime)}</p>
                    {dispatch && (
                      <div className="text-xs text-slate-600 mt-2 space-y-0.5">
                        <p>
                          Dispatch:{' '}
                          <Link to={dispatchHref} className="text-blue-700 hover:underline">
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

                    <div className="mt-4 space-y-2">
                      <Label className="text-xs text-slate-600">Add update / note</Label>
                      <Textarea
                        rows={2}
                        placeholder="Add a note to this incident..."
                        value={draftUpdates[incident.id] || ''}
                        onChange={(e) => setDraftUpdates((prev) => ({ ...prev, [incident.id]: e.target.value }))}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => addUpdateMutation.mutate({ incident, note: draftUpdates[incident.id] || '' })}
                          disabled={addUpdateMutation.isPending || !(draftUpdates[incident.id] || '').trim()}
                        >
                          Add Update
                        </Button>
                        {incident.status === 'Completed' && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => reopenMutation.mutate(incident.id)}
                            disabled={reopenMutation.isPending}
                          >
                            Reopen Incident
                          </Button>
                        )}
                      </div>
                    </div>

                    {Array.isArray(incident.updates) && incident.updates.length > 0 && (
                      <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 space-y-2">
                        <p className="text-xs font-medium text-slate-700">Incident Updates</p>
                        {incident.updates.map((update, idx) => (
                          <div key={`${incident.id}-update-${idx}`} className="text-xs text-slate-700">
                            <p>{update?.note || '—'}</p>
                            <p className="text-slate-500 mt-0.5">{formatDateTime(update?.created_at)}</p>
                          </div>
                        ))}
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
                    {visibleDispatches.map((dispatch) => (
                      <SelectItem key={dispatch.id} value={dispatch.id}>
                        {(dispatch.job_number || dispatch.reference_tag || dispatch.id)}
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
                <Label>Time Stopped From</Label>
                <Input
                  type="datetime-local"
                  value={form.time_stopped_from}
                  onChange={(e) => setForm((p) => ({ ...p, time_stopped_from: e.target.value }))}
                />
              </div>

              <div>
                <Label>Time Stopped To</Label>
                <Input
                  type="datetime-local"
                  value={form.time_stopped_to}
                  onChange={(e) => setForm((p) => ({ ...p, time_stopped_to: e.target.value }))}
                />
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
              <Label>Photos / Documents Link</Label>
              <p className="text-xs text-slate-500 mb-1">Please submit any photos or documents (.jpg, .png, .pdf) to alex@ccgnj.com and reference the incident.</p>
              <Textarea
                rows={3}
                placeholder="https://..."
                value={form.photos}
                onChange={(e) => setForm((p) => ({ ...p, photos: e.target.value }))}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'Creating...' : 'Create Incident'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
