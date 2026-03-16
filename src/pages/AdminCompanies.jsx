import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Building2, Plus, Pencil, Trash2, X, Truck, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { calculateCompanyScore, SCORING_EVENT_TYPES } from '@/lib/companyScoring';

const CONTACT_TYPE_OPTIONS = ['Office', 'Cell', 'Email', 'Fax', 'Other'];
const PHONE_CONTACT_TYPES = ['Office', 'Cell', 'Fax'];

const formatPhoneNumber = (value) => {
  const digits = value.replace(/\D/g, '').slice(0, 10);
  if (!digits) return '';
  if (digits.length < 4) return `(${digits}`;
  if (digits.length < 7) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
};

const normalizeContactMethods = (company) => {
  if (Array.isArray(company?.contact_methods) && company.contact_methods.length > 0) {
    return company.contact_methods.map((method) => ({
      type: CONTACT_TYPE_OPTIONS.includes(method?.type) ? method.type : 'Other',
      value: method?.value || '',
    }));
  }

  if (company?.contact_info) return [{ type: 'Other', value: company.contact_info }];
  return [{ type: 'Office', value: '' }];
};

const initialEventForm = {
  event_type: 'Company Cancellation',
  event_date: new Date().toISOString().slice(0, 10),
  dispatch_id: '',
  truck_number: '',
  driver_id: '',
  severity: 'Medium',
  notes: '',
  impacts_completion_rate: true,
  include_in_trends: true,
};

const MetricCard = ({ metric }) => (
  <div className="rounded-lg border border-slate-200 bg-white p-3">
    <p className="text-xs text-slate-500">{metric.label}</p>
    <p className="text-sm font-semibold text-slate-900 mt-1">{metric.display}</p>
    <p className="text-xs text-slate-500 mt-1">Score {Math.round(metric.score)} / 100</p>
  </div>
);

function CompanyScoringTab({ company, trucks }) {
  const queryClient = useQueryClient();
  const [eventForm, setEventForm] = useState(initialEventForm);

  const { data: dispatches = [] } = useQuery({ queryKey: ['scoring-dispatches'], queryFn: () => base44.entities.Dispatch.list('-date', 1000) });
  const { data: confirmations = [] } = useQuery({ queryKey: ['scoring-confirmations'], queryFn: () => base44.entities.Confirmation.list('-confirmed_at', 1000) });
  const { data: incidents = [] } = useQuery({ queryKey: ['scoring-incidents'], queryFn: () => base44.entities.IncidentReport.list('-created_date', 1000) });
  const { data: drivers = [] } = useQuery({ queryKey: ['scoring-drivers'], queryFn: () => base44.entities.Driver.list('-created_date', 1000) });
  const { data: assignments = [] } = useQuery({ queryKey: ['scoring-driver-assignments'], queryFn: () => base44.entities.DriverDispatchAssignment.list('-assigned_datetime', 1000) });
  const { data: events = [] } = useQuery({ queryKey: ['company-scoring-events'], queryFn: () => base44.entities.CompanyScoringEvent.list('-event_date', 1000) });

  const saveEventMutation = useMutation({
    mutationFn: (payload) => base44.entities.CompanyScoringEvent.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['company-scoring-events'] });
      setEventForm(initialEventForm);
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id) => base44.entities.CompanyScoringEvent.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company-scoring-events'] }),
  });

  const companyDispatches = useMemo(
    () => dispatches.filter((dispatch) => dispatch.company_id === company.id),
    [dispatches, company.id]
  );

  const score = useMemo(() => calculateCompanyScore({
    company,
    dispatches,
    confirmations,
    incidents,
    events,
    drivers,
    driverAssignments: assignments,
  }), [company, dispatches, confirmations, incidents, events, drivers, assignments]);

  if (!score) return <p className="text-sm text-slate-500">Unable to calculate score yet.</p>;

  const trendIcon = score.trend === 'Trending Up' ? TrendingUp : score.trend === 'Trending Down' ? TrendingDown : Minus;
  const TrendIcon = trendIcon;
  const trendColor = score.trend === 'Trending Up' ? 'text-emerald-600' : score.trend === 'Trending Down' ? 'text-red-600' : 'text-slate-500';

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Company Reliability Score</p>
              <p className="text-3xl font-bold text-slate-900 mt-1">{score.score} / 100</p>
              <p className={`text-sm mt-1 flex items-center gap-1 ${trendColor}`}><TrendIcon className="h-4 w-4" />{score.trend}</p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>Current period: {score.trendCurrentScore}</p>
              <p>Previous period: {score.trendPreviousScore}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {score.warningBadges.length === 0 ? (
              <Badge variant="outline">No warning flags</Badge>
            ) : score.warningBadges.map((warning) => (
              <Badge key={warning} variant="secondary">{warning}</Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <div>
        <p className="text-sm font-semibold text-slate-800 mb-2">Metrics Overview</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.values(score.metrics).map((metric) => <MetricCard key={metric.label} metric={metric} />)}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-800">Truck Performance</p>
            {score.truckSummaries.length === 0 ? (
              <p className="text-sm text-slate-500">No truck data available.</p>
            ) : score.truckSummaries.map((truck) => (
              <div key={truck.truckNumber} className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-mono font-semibold text-slate-800">Truck {truck.truckNumber}</p>
                <p className="text-slate-600">Breakdowns: {truck.breakdowns} • Late issues: {truck.lateIssues}</p>
                <p className="text-slate-600">Completion: {Math.round(truck.completionRate)}%</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-800">Driver Performance</p>
            {score.driverSummaries.length === 0 ? (
              <p className="text-sm text-slate-500">No driver data available.</p>
            ) : score.driverSummaries.map((driver) => (
              <div key={driver.driverId} className="rounded-lg border border-slate-200 p-3 text-sm">
                <p className="font-semibold text-slate-800">{driver.driverName}</p>
                <p className="text-slate-600">Dispatches: {driver.dispatchCount} • Confirmation rate: {Math.round(driver.confirmationRate)}%</p>
                <p className="text-slate-600">Logged performance events: {driver.eventCount}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <p className="text-sm font-semibold text-slate-800">Manual Reliability Log</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label>Event Type</Label>
              <Select value={eventForm.event_type} onValueChange={(value) => setEventForm((prev) => ({ ...prev, event_type: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCORING_EVENT_TYPES.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={eventForm.event_date} onChange={(e) => setEventForm((prev) => ({ ...prev, event_date: e.target.value }))} />
            </div>
            <div>
              <Label>Related Dispatch (optional)</Label>
              <Select value={eventForm.dispatch_id || 'none'} onValueChange={(value) => setEventForm((prev) => ({ ...prev, dispatch_id: value === 'none' ? '' : value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked dispatch</SelectItem>
                  {companyDispatches.map((dispatch) => (
                    <SelectItem key={dispatch.id} value={dispatch.id}>{dispatch.job_number || dispatch.reference_tag || dispatch.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Related Truck (optional)</Label>
              <Select value={eventForm.truck_number || 'none'} onValueChange={(value) => setEventForm((prev) => ({ ...prev, truck_number: value === 'none' ? '' : value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked truck</SelectItem>
                  {trucks.map((truckNumber) => <SelectItem key={truckNumber} value={truckNumber}>{truckNumber}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Related Driver (optional)</Label>
              <Select value={eventForm.driver_id || 'none'} onValueChange={(value) => setEventForm((prev) => ({ ...prev, driver_id: value === 'none' ? '' : value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No linked driver</SelectItem>
                  {score.driverSummaries.map((driver) => <SelectItem key={driver.driverId} value={driver.driverId}>{driver.driverName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Severity</Label>
              <Select value={eventForm.severity} onValueChange={(value) => setEventForm((prev) => ({ ...prev, severity: value }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={3} value={eventForm.notes} onChange={(e) => setEventForm((prev) => ({ ...prev, notes: e.target.value }))} />
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={eventForm.impacts_completion_rate} onChange={(e) => setEventForm((prev) => ({ ...prev, impacts_completion_rate: e.target.checked }))} />
              Impacts completion rate
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={eventForm.include_in_trends} onChange={(e) => setEventForm((prev) => ({ ...prev, include_in_trends: e.target.checked }))} />
              Include in trend analysis
            </label>
          </div>
          <Button
            onClick={() => saveEventMutation.mutate({
              ...eventForm,
              company_id: company.id,
              event_date: eventForm.event_date ? new Date(eventForm.event_date).toISOString() : new Date().toISOString(),
            })}
            disabled={saveEventMutation.isPending}
            className="bg-slate-900 hover:bg-slate-800"
          >
            {saveEventMutation.isPending ? 'Saving Event...' : 'Add Performance Event'}
          </Button>

          <div className="space-y-2">
            <p className="text-xs uppercase text-slate-500">Event History</p>
            {score.events.length === 0 ? (
              <p className="text-sm text-slate-500">No manual reliability events yet.</p>
            ) : score.events.map((event) => (
              <div key={event.id} className="rounded-lg border border-slate-200 p-3 text-sm flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-800">{event.event_type} • {event.severity || '—'}</p>
                  <p className="text-slate-500">{new Date(event.event_date || event.created_date).toLocaleDateString()} • {event.notes || 'No notes'}</p>
                  <p className="text-xs text-slate-500 mt-1">Dispatch: {event.dispatch_id || '—'} • Truck: {event.truck_number || '—'} • Driver: {event.driver_id || '—'}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteEventMutation.mutate(event.id)} className="h-7 w-7 text-red-500 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminCompanies() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [activeTab, setActiveTab] = useState('info');
  const [form, setForm] = useState({ name: '', address: '', contact_methods: [{ type: 'Office', value: '' }], trucks: [], status: 'active' });
  const [truckInput, setTruckInput] = useState('');

  const { data: companies = [], isLoading } = useQuery({ queryKey: ['companies'], queryFn: () => base44.entities.Company.list() });

  const saveMutation = useMutation({
    mutationFn: (data) => (editing ? base44.entities.Company.update(editing.id, data) : base44.entities.Company.create(data)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      closeDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Company.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companies'] }),
  });

  const openNew = () => {
    setEditing(null);
    setActiveTab('info');
    setForm({ name: '', address: '', contact_methods: [{ type: 'Office', value: '' }], trucks: [], status: 'active' });
    setTruckInput('');
    setOpen(true);
  };

  const openEdit = (company) => {
    setEditing(company);
    setActiveTab('info');
    setForm({
      name: company.name || '',
      address: company.address || '',
      contact_methods: normalizeContactMethods(company),
      trucks: company.trucks || [],
      status: company.status || 'active',
    });
    setTruckInput('');
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
  };

  const addTruck = () => {
    const val = truckInput.trim();
    if (val && !form.trucks.includes(val)) setForm({ ...form, trucks: [...form.trucks, val] });
    setTruckInput('');
  };

  const removeTruck = (t) => setForm({ ...form, trucks: form.trucks.filter((x) => x !== t) });

  const handleSave = () => {
    if (!form.name.trim()) return;
    const cleanedContactMethods = (form.contact_methods || [])
      .map((method) => ({ type: CONTACT_TYPE_OPTIONS.includes(method?.type) ? method.type : 'Other', value: (method?.value || '').trim() }))
      .filter((method) => method.value);

    saveMutation.mutate({
      ...form,
      contact_methods: cleanedContactMethods,
      contact_info: cleanedContactMethods.map((method) => `${method.type}: ${method.value}`).join(' • '),
    });
  };

  const addContactMethod = () => setForm((prev) => ({ ...prev, contact_methods: [...prev.contact_methods, { type: 'Office', value: '' }] }));
  const removeContactMethod = (index) => setForm((prev) => ({ ...prev, contact_methods: prev.contact_methods.filter((_, i) => i !== index) }));

  const updateContactMethod = (index, key, nextValue) => {
    setForm((prev) => ({
      ...prev,
      contact_methods: prev.contact_methods.map((method, i) => {
        if (i !== index) return method;
        if (key === 'value' && PHONE_CONTACT_TYPES.includes(method.type)) return { ...method, value: formatPhoneNumber(nextValue) };
        if (key === 'type') {
          const nextMethod = { ...method, type: nextValue };
          if (PHONE_CONTACT_TYPES.includes(nextValue)) nextMethod.value = formatPhoneNumber(nextMethod.value);
          return nextMethod;
        }
        return { ...method, [key]: nextValue };
      }),
    }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Companies</h2>
          <p className="text-sm text-slate-500">{companies.length} companies</p>
        </div>
        <Button onClick={openNew} className="bg-slate-900 hover:bg-slate-800">
          <Plus className="h-4 w-4 mr-2" />Add Company
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><div className="animate-spin h-6 w-6 border-2 border-slate-300 border-t-slate-700 rounded-full" /></div>
      ) : companies.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">No companies yet</div>
      ) : (
        <div className="grid gap-3">
          {companies.map((c) => (
            <Card key={c.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0"><Building2 className="h-5 w-5 text-slate-500" /></div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-700">{c.name}</h3>
                        <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="text-xs">{c.status}</Badge>
                      </div>
                      {c.address && <p className="text-sm text-slate-500 mt-0.5 whitespace-pre-line">{c.address}</p>}
                      {(Array.isArray(c.contact_methods) && c.contact_methods.length > 0) ? (
                        <div className="mt-1.5 space-y-0.5">
                          {c.contact_methods.filter((method) => method?.value).map((method, index) => (
                            <p key={`${c.id}-contact-${index}`} className="text-sm text-slate-500"><span className="font-medium text-slate-600">{method.type}:</span> {method.value}</p>
                          ))}
                        </div>
                      ) : c.contact_info && <p className="text-sm text-slate-500 mt-0.5">{c.contact_info}</p>}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <Truck className="h-3.5 w-3.5 text-slate-400" />
                        {(c.trucks || []).length === 0 ? <span className="text-xs text-slate-400">No trucks</span> : (c.trucks || []).map((t) => <Badge key={t} variant="outline" className="text-xs font-mono">{t}</Badge>)}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(c)} className="h-8 w-8"><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(c.id)} className="h-8 w-8 text-red-500 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? 'Edit Company' : 'New Company'}</DialogTitle></DialogHeader>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="info">Company Info</TabsTrigger>
              {editing && <TabsTrigger value="scoring">Company Scoring</TabsTrigger>}
            </TabsList>

            <TabsContent value="info" className="space-y-4">
              <div><Label>Company Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div>
                <Label>Address</Label>
                <Textarea rows={3} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Street address\nCity, State ZIP" />
              </div>
              <div>
                <Label>Contact Info</Label>
                <div className="space-y-2 mt-1">
                  {form.contact_methods.map((method, index) => {
                    const isPhoneType = PHONE_CONTACT_TYPES.includes(method.type);
                    return (
                      <div key={`contact-method-${index}`} className="flex gap-2 items-start">
                        <Select value={method.type} onValueChange={(v) => updateContactMethod(index, 'type', v)}>
                          <SelectTrigger className="w-32 shrink-0"><SelectValue /></SelectTrigger>
                          <SelectContent>{CONTACT_TYPE_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
                        </Select>
                        <Input value={method.value} placeholder={isPhoneType ? '(555) 123-4567' : 'Enter value'} onChange={(e) => updateContactMethod(index, 'value', e.target.value)} />
                        {form.contact_methods.length > 1 && (
                          <Button type="button" size="icon" variant="ghost" onClick={() => removeContactMethod(index)} className="h-9 w-9 shrink-0"><X className="h-4 w-4" /></Button>
                        )}
                      </div>
                    );
                  })}
                  <Button type="button" variant="outline" size="sm" onClick={addContactMethod}><Plus className="h-3.5 w-3.5 mr-1" />Add Contact</Button>
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Trucks</Label>
                <div className="flex gap-2 mt-1">
                  <Input value={truckInput} onChange={(e) => setTruckInput(e.target.value)} placeholder="Truck number" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTruck())} />
                  <Button type="button" variant="outline" onClick={addTruck}>Add</Button>
                </div>
                <div className="flex gap-1.5 flex-wrap mt-2">
                  {form.trucks.map((t) => (
                    <Badge key={t} variant="secondary" className="gap-1 pr-1">{t}<button onClick={() => removeTruck(t)} className="hover:bg-slate-300 rounded-full p-0.5"><X className="h-3 w-3" /></button></Badge>
                  ))}
                </div>
              </div>
              <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full bg-slate-900 hover:bg-slate-800">{saveMutation.isPending ? 'Saving...' : 'Save Company'}</Button>
            </TabsContent>

            {editing && (
              <TabsContent value="scoring">
                <CompanyScoringTab company={editing} trucks={form.trucks} />
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
