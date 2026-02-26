import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Plus, Pencil, Trash2, Copy, FileText, Clock, MapPin,
  Sun, Moon, Truck, Filter, ChevronDown, ChevronUp, Eye, CheckCircle2, XCircle
} from 'lucide-react';
import { format } from 'date-fns';
import DispatchForm from '../components/admin/DispatchForm';
import DispatchCard from '../components/portal/DispatchCard';

const statusColors = {
  Confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  Dispatched: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Amended: 'bg-amber-50 text-amber-700 border-amber-200',
  Canceled: 'bg-red-50 text-red-700 border-red-200',
};

export default function AdminDispatches() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [previewDispatch, setPreviewDispatch] = useState(null);
  const [filters, setFilters] = useState({ status: 'all', company_id: 'all', truck: '', dateFrom: '', dateTo: '' });
  const [showFilters, setShowFilters] = useState(false);

  const { data: dispatches = [], isLoading } = useQuery({
    queryKey: ['dispatches-admin'],
    queryFn: () => base44.entities.Dispatch.list('-date', 500),
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.list(),
  });

  const { data: confirmations = [] } = useQuery({
    queryKey: ['confirmations-admin'],
    queryFn: () => base44.entities.Confirmation.list('-confirmed_at', 500),
  });

  const { data: templateNotes = [] } = useQuery({
    queryKey: ['template-notes'],
    queryFn: () => base44.entities.DispatchTemplateNotes.filter({ active_flag: true }, 'priority', 50),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editing
      ? base44.entities.Dispatch.update(editing.id, data)
      : base44.entities.Dispatch.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches-admin'] });
      setOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Dispatch.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dispatches-admin'] }),
  });

  const companyMap = {};
  companies.forEach(c => { companyMap[c.id] = c.name; });

  const filtered = useMemo(() => {
    return dispatches.filter(d => {
      if (filters.status !== 'all' && d.status !== filters.status) return false;
      if (filters.company_id !== 'all' && d.company_id !== filters.company_id) return false;
      if (filters.truck && !(d.trucks_assigned || []).some(t => t.includes(filters.truck))) return false;
      if (filters.dateFrom && d.date < filters.dateFrom) return false;
      if (filters.dateTo && d.date > filters.dateTo) return false;
      return true;
    });
  }, [dispatches, filters]);

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = (d) => {
    setEditing(d);
    setOpen(true);
  };

  const copyShift = (d) => {
    const { id, company_id, trucks_assigned, ...rest } = d;
    const copy = {
      ...rest,
      company_id: '',
      trucks_assigned: [],
      status: 'Confirmed',
      amendment_history: [],
      canceled_reason: '',
      _isCopy: true
    };
    setEditing(copy);
    setOpen(true);
  };

  const handleSave = (formData) => {
    if (editing && !editing._isCopy) {
      saveMutation.mutate(formData);
    } else {
      // Creating new (or copy)
      setEditing(null);
      saveMutation.mutate(formData);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Dispatches</h2>
          <p className="text-sm text-slate-500">{filtered.length} dispatches</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)} className="text-xs">
            <Filter className="h-3.5 w-3.5 mr-1" />Filters
          </Button>
          <Button onClick={openNew} className="bg-slate-900 hover:bg-slate-800 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" />New Dispatch
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Select value={filters.status} onValueChange={v => setFilters({ ...filters, status: v })}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {['Confirmed', 'Dispatched', 'Amended', 'Canceled'].map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filters.company_id} onValueChange={v => setFilters({ ...filters, company_id: v })}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="Company" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Companies</SelectItem>
                  {companies.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input placeholder="Truck #" value={filters.truck} onChange={e => setFilters({ ...filters, truck: e.target.value })} className="text-xs" />
              <Input type="date" value={filters.dateFrom} onChange={e => setFilters({ ...filters, dateFrom: e.target.value })} className="text-xs" />
              <Input type="date" value={filters.dateTo} onChange={e => setFilters({ ...filters, dateTo: e.target.value })} className="text-xs" />
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-slate-300 border-t-slate-700 rounded-full" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">No dispatches found</div>
      ) : (
        <div className="grid gap-3">
          {filtered.map(d => (
            <Card key={d.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <Badge className={`${statusColors[d.status]} border text-xs`}>{d.status}</Badge>
                      <span className="text-xs text-slate-400 flex items-center gap-1">
                        {d.shift_time === 'Day' ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                        {d.shift_time}
                      </span>
                      <span className="text-xs text-slate-500">
                        {d.date && format(new Date(d.date), 'MMM d, yyyy')}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-700 flex-wrap">
                      {d.client_name && <span className="font-medium">{d.client_name}</span>}
                      <span className="text-slate-400 text-xs">{companyMap[d.company_id] || '—'}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                      {d.job_number && (
                        <span className="flex items-center gap-1"><FileText className="h-3 w-3" />#{d.job_number}</span>
                      )}
                      {d.start_time && (
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{d.start_time}</span>
                      )}
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{d.start_location}</span>
                    </div>
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      <Truck className="h-3 w-3 text-slate-400" />
                      {(d.trucks_assigned || []).map(t => (
                        <Badge key={t} variant="outline" className="text-xs font-mono">{t}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="icon" onClick={() => setPreviewDispatch(d)} className="h-8 w-8" title="Preview">
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => copyShift(d)} className="h-8 w-8" title="Copy Shift">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(d)} className="h-8 w-8">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(d.id)} className="h-8 w-8 text-red-500 hover:text-red-600">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing && !editing._isCopy ? 'Edit Dispatch' : 'New Dispatch'}</DialogTitle>
          </DialogHeader>
          <DispatchForm
            dispatch={editing}
            companies={companies}
            onSave={handleSave}
            onCancel={() => { setOpen(false); setEditing(null); }}
            saving={saveMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewDispatch} onOpenChange={() => setPreviewDispatch(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Dispatch Preview & Confirmations</DialogTitle>
          </DialogHeader>
          {previewDispatch && (
            <div className="space-y-6">
              {/* Portal Preview */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Portal View Preview</h3>
                <DispatchCard
                  dispatch={previewDispatch}
                  session={{
                    code_type: 'CompanyOwner',
                    allowed_trucks: previewDispatch.trucks_assigned || []
                  }}
                  confirmations={confirmations.filter(c => c.dispatch_id === previewDispatch.id)}
                  timeEntries={[]}
                  templateNotes={templateNotes}
                  onConfirm={() => {}}
                  onTimeEntry={() => {}}
                  companyName={companyMap[previewDispatch.company_id]}
                />
              </div>

              {/* Confirmations Panel */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Truck Confirmations</h3>
                <div className="space-y-2">
                  {(previewDispatch.trucks_assigned || []).map(truck => {
                    const truckConfirmations = confirmations.filter(c => 
                      c.dispatch_id === previewDispatch.id && c.truck_number === truck
                    ).sort((a, b) => new Date(b.confirmed_at || 0) - new Date(a.confirmed_at || 0));
                    const latestConfirmation = truckConfirmations[0];
                    const isConfirmed = !!latestConfirmation;

                    return (
                      <Card key={truck}>
                        <CardContent className="p-3 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline" className="font-mono text-xs">
                              {truck}
                            </Badge>
                            {isConfirmed ? (
                              <div className="flex items-center gap-2 text-emerald-600">
                                <CheckCircle2 className="h-4 w-4" />
                                <span className="text-sm">Confirmed</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 text-slate-400">
                                <XCircle className="h-4 w-4" />
                                <span className="text-sm">Not Confirmed</span>
                              </div>
                            )}
                          </div>
                          {isConfirmed && latestConfirmation.confirmed_at && (
                            <span className="text-xs text-slate-500">
                              {format(new Date(latestConfirmation.confirmed_at), 'MMM d, yyyy h:mm a')}
                            </span>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                  {(!previewDispatch.trucks_assigned || previewDispatch.trucks_assigned.length === 0) && (
                    <p className="text-sm text-slate-500 text-center py-4">No trucks assigned</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}