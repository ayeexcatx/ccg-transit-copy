import React, { useState, useMemo, useEffect, useRef } from 'react';
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
  Sun, Moon, Truck, Filter, ChevronDown, ChevronUp, Eye, CheckCircle2, XCircle, History
} from 'lucide-react';
import { format } from 'date-fns';
import DispatchForm from '../components/admin/DispatchForm';
import DispatchCard from '../components/portal/DispatchCard';
import { useSession } from '../components/session/SessionContext';
import { Label } from '@/components/ui/label';

const statusColors = {
  Confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  Dispatched: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Amended: 'bg-amber-50 text-amber-700 border-amber-200',
  Canceled: 'bg-red-50 text-red-700 border-red-200',
};

const STATUS_ORDER = ['Confirmed', 'Dispatched', 'Amended', 'Canceled'];

function AdminConfirmationsPanel({ dispatch, confirmations }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const trucks = dispatch.trucks_assigned || [];
  const currentStatus = dispatch.status;

  // Group confirmations by confirmation_type
  const byType = {};
  confirmations.forEach(c => {
    if (!byType[c.confirmation_type]) byType[c.confirmation_type] = [];
    byType[c.confirmation_type].push(c);
  });

  const priorStatuses = STATUS_ORDER.filter(s => s !== currentStatus && byType[s]);

  return (
    <div className="space-y-4">
      {/* Current status section */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge className={`${statusColors[currentStatus]} border text-xs`}>{currentStatus}</Badge>
          <span className="text-xs text-slate-500">current status</span>
        </div>
        <div className="space-y-1.5">
          {trucks.map(truck => {
            const conf = (byType[currentStatus] || []).find(c => c.truck_number === truck);
            return (
              <div key={truck} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-sm font-mono font-medium">{truck}</span>
                </div>
                {conf ? (
                  <div className="flex items-center gap-1.5 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs font-medium">Confirmed</span>
                    {conf.confirmed_at && (
                      <span className="text-xs text-slate-400 ml-1">
                        {format(new Date(conf.confirmed_at), 'MMM d, h:mm a')}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-slate-400">
                    <XCircle className="h-4 w-4" />
                    <span className="text-xs">Not confirmed for {currentStatus}</span>
                  </div>
                )}
              </div>
            );
          })}
          {trucks.length === 0 && (
            <p className="text-xs text-slate-400 py-2">No trucks assigned</p>
          )}
        </div>
      </div>

      {/* Prior statuses collapsible */}
      {priorStatuses.length > 0 && (
        <div>
          <button
            onClick={() => setHistoryOpen(h => !h)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            <History className="h-3.5 w-3.5" />
            {historyOpen ? 'Hide' : 'Show'} prior confirmations ({priorStatuses.join(', ')})
            {historyOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {historyOpen && (
            <div className="mt-2 space-y-3">
              {priorStatuses.map(status => (
                <div key={status}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge className={`${statusColors[status]} border text-xs`}>{status}</Badge>
                    <span className="text-xs text-slate-400">prior status</span>
                  </div>
                  <div className="space-y-1">
                    {(byType[status] || []).map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded px-3 py-1.5">
                        <Truck className="h-3 w-3 text-slate-400" />
                        <span className="font-mono font-medium">{c.truck_number}</span>
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 ml-1" />
                        {c.confirmed_at && (
                          <span className="text-slate-400">{format(new Date(c.confirmed_at), 'MMM d, yyyy h:mm a')}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminDispatches() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [previewDispatch, setPreviewDispatch] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteError, setDeleteError] = useState('');
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

  const { data: accessCodes = [] } = useQuery({
    queryKey: ['access-codes'],
    queryFn: () => base44.entities.AccessCode.list(),
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

  const openDelete = (d) => {
    setDeleteTarget(d);
    setDeleteCode('');
    setDeleteError('');
  };

  const handleDeleteConfirm = () => {
    // Find the current session's AccessCode record to compare the actual code value
    const sessionCode = accessCodes.find(ac => ac.id === session?.id);
    if (!sessionCode || sessionCode.code !== deleteCode || sessionCode.code_type !== 'Admin') {
      setDeleteError('Invalid admin code. Please try again.');
      return;
    }
    deleteMutation.mutate(deleteTarget.id);
    setDeleteTarget(null);
    setDeleteCode('');
    setDeleteError('');
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
                    <Button variant="ghost" size="icon" onClick={() => openDelete(d)} className="h-8 w-8 text-red-500 hover:text-red-600">
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
            accessCodes={accessCodes}
            onSave={handleSave}
            onCancel={() => { setOpen(false); setEditing(null); }}
            saving={saveMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => { setDeleteTarget(null); setDeleteCode(''); setDeleteError(''); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Confirm Deletion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-slate-600">
              This will permanently delete the dispatch for{' '}
              <span className="font-semibold">{deleteTarget?.date} ({deleteTarget?.shift_time} shift)</span>.
              Enter your admin access code to confirm.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="admin-code">Admin Access Code</Label>
              <Input
                id="admin-code"
                value={deleteCode}
                onChange={e => { setDeleteCode(e.target.value); setDeleteError(''); }}
                placeholder="Enter your access code"
                className={deleteError ? 'border-red-400 focus-visible:ring-red-400' : ''}
              />
              {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setDeleteTarget(null); setDeleteCode(''); setDeleteError(''); }}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={!deleteCode || deleteMutation.isPending}
                onClick={handleDeleteConfirm}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
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

              {/* Confirmations by Status */}
              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Confirmations by Status</h3>
                <AdminConfirmationsPanel
                  dispatch={previewDispatch}
                  confirmations={confirmations.filter(c => c.dispatch_id === previewDispatch.id)}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}