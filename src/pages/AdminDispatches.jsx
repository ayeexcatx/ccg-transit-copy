import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus, Pencil, Trash2, Copy, FileText,
  Sun, Moon, Truck, Filter, ChevronDown, ChevronUp, Eye, CheckCircle2, XCircle, History, Archive, ArchiveX } from
'lucide-react';
import { format, parseISO } from 'date-fns';
import { getDispatchBucket } from '../components/portal/dispatchBuckets';
import DispatchForm from '../components/admin/DispatchForm';
import DispatchDetailDrawer from '../components/portal/DispatchDetailDrawer';
import { useSession } from '../components/session/SessionContext';
import { Label } from '@/components/ui/label';
import { statusBadgeColors, statusBorderAccent } from '../components/portal/statusConfig';
import { reconcileOwnerNotificationsForDispatch } from '@/components/notifications/createNotifications';

const STATUS_ORDER = ['Scheduled', 'Dispatch', 'Amended', 'Cancelled'];

const formatDispatchTime = (startTime) => {
  if (!startTime) return '';

  const time = String(startTime).trim();
  if (!time) return '';
  if (/\b(?:AM|PM)\b/i.test(time)) return time.toUpperCase();

  const match = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return time;

  const hours24 = Number(match[1]);
  const minutes = match[2];

  if (Number.isNaN(hours24) || hours24 < 0 || hours24 > 23) return time;

  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${hours12}:${minutes} ${meridiem}`;
};

function AdminConfirmationsPanel({ dispatch, confirmations }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const trucks = dispatch.trucks_assigned || [];
  const currentStatus = dispatch.status;

  // Group confirmations by confirmation_type
  const byType = {};
  confirmations.forEach((c) => {
    if (!byType[c.confirmation_type]) byType[c.confirmation_type] = [];
    byType[c.confirmation_type].push(c);
  });

  const priorStatuses = STATUS_ORDER.filter((s) => s !== currentStatus && byType[s]);

  return (
    <div className="space-y-4">
      {/* Current status section */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Badge className={`${statusBadgeColors[currentStatus]} border text-xs`}>{currentStatus}</Badge>
          <span className="text-xs text-slate-500">current status</span>
        </div>
        <div className="space-y-1.5">
          {trucks.map((truck) => {
            const conf = (byType[currentStatus] || []).find((c) => c.truck_number === truck);
            return (
              <div key={truck} className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <Truck className="h-3.5 w-3.5 text-slate-400" />
                  <span className="text-sm font-mono font-medium">{truck}</span>
                </div>
                {conf ?
                <div className="flex items-center gap-1.5 text-emerald-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-xs font-medium">Confirmed</span>
                    {conf.confirmed_at &&
                  <span className="text-xs text-slate-400 ml-1">
                        {format(new Date(conf.confirmed_at), 'MMM d, h:mm a')}
                      </span>
                  }
                  </div> :

                <div className="flex items-center gap-1.5 text-slate-400">
                    <XCircle className="h-4 w-4" />
                    <span className="text-xs">Not confirmed for {currentStatus}</span>
                  </div>
                }
              </div>);

          })}
          {trucks.length === 0 &&
          <p className="text-xs text-slate-400 py-2">No trucks assigned</p>
          }
        </div>
      </div>

      {/* Prior statuses collapsible */}
      {priorStatuses.length > 0 &&
      <div>
          <button
          onClick={() => setHistoryOpen((h) => !h)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors">

            <History className="h-3.5 w-3.5" />
            {historyOpen ? 'Hide' : 'Show'} prior confirmations ({priorStatuses.join(', ')})
            {historyOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {historyOpen &&
        <div className="mt-2 space-y-3">
              {priorStatuses.map((status) =>
          <div key={status}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <Badge className={`${statusBadgeColors[status]} border text-xs`}>{status}</Badge>
                    <span className="text-xs text-slate-400">prior status</span>
                  </div>
                  <div className="space-y-1">
                    {(byType[status] || []).map((c, i) =>
              <div key={i} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded px-3 py-1.5">
                        <Truck className="h-3 w-3 text-slate-400" />
                        <span className="font-mono font-medium">{c.truck_number}</span>
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 ml-1" />
                        {c.confirmed_at &&
                <span className="text-slate-400">{format(new Date(c.confirmed_at), 'MMM d, yyyy h:mm a')}</span>
                }
                      </div>
              )}
                  </div>
                </div>
          )}
            </div>
        }
        </div>
      }
    </div>);

}

export default function AdminDispatches() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [previewDispatch, setPreviewDispatch] = useState(null);
  const [drawerConfirmations, setDrawerConfirmations] = useState([]);
  const [drawerTimeEntries, setDrawerTimeEntries] = useState([]);
  const [drawerMountKey, setDrawerMountKey] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteCode, setDeleteCode] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [filters, setFilters] = useState({ status: 'all', company_id: 'all', truck: '', dateFrom: '', dateTo: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [tab, setTab] = useState('today');
  const dispatchRefs = useRef({});
  const pendingOpenIdRef = useRef(null);

  const urlParams = new URLSearchParams(location.search);
  const targetDispatchId = urlParams.get('dispatchId');
  const targetNotificationId = urlParams.get('notificationId');
  const openNewDispatch = Boolean(location.state?.openNewDispatch);

  const { data: dispatches = [], isLoading } = useQuery({
    queryKey: ['dispatches-admin'],
    queryFn: () => base44.entities.Dispatch.list('-date', 500)
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.list()
  });

  const { data: accessCodes = [] } = useQuery({
    queryKey: ['access-codes'],
    queryFn: () => base44.entities.AccessCode.list()
  });

  const { data: confirmations = [] } = useQuery({
    queryKey: ['confirmations-admin'],
    queryFn: () => base44.entities.Confirmation.list('-confirmed_at', 500)
  });

  const { data: timeEntries = [] } = useQuery({
    queryKey: ['time-entries-admin'],
    queryFn: () => base44.entities.TimeEntry.list('-created_date', 500)
  });

  const openDrawer = async (d) => {
    setPreviewDispatch(d);
    const [confs, times, adminNotifs] = await Promise.all([
    base44.entities.Confirmation.filter({ dispatch_id: d.id }, '-confirmed_at', 100),
    base44.entities.TimeEntry.filter({ dispatch_id: d.id }, '-created_date', 100),
    base44.entities.Notification.filter({
      recipient_type: 'Admin',
      related_dispatch_id: d.id
    }, '-created_date', 50)]
    );
    setDrawerConfirmations(confs);
    setDrawerTimeEntries(times);

    // Bulk-mark as read all unread admin notifications for this dispatch+status group
    const groupKey = `${d.id}:${d.status}`;
    const unreadGroup = (adminNotifs || []).filter((n) =>
    !n.read_flag && (n.admin_group_key === groupKey || n.related_dispatch_id === d.id)
    );
    if (unreadGroup.length > 0) {
      await Promise.all(unreadGroup.map((n) =>
      base44.entities.Notification.update(n.id, { read_flag: true })
      ));
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  };

  const { data: templateNotes = [] } = useQuery({
    queryKey: ['template-notes'],
    queryFn: () => base44.entities.DispatchTemplateNotes.filter({ active_flag: true }, 'priority', 50)
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editing && !editing._isCopy) {
        await base44.entities.Dispatch.update(editing.id, data);
        const savedDispatch = await base44.entities.Dispatch.filter({ id: editing.id }, '-created_date', 1).then((r) => r[0]);

        if (savedDispatch) {
          await reconcileOwnerNotificationsForDispatch(savedDispatch, accessCodes);
        }

        return savedDispatch;
      } else {
        return base44.entities.Dispatch.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dispatches-admin'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['portal-dispatches'] });
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey?.[0] || '').startsWith('confirmations') });
      setOpen(false);
      setEditing(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Dispatch.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dispatches-admin'] })
  });

  const archiveMutation = useMutation({
    mutationFn: ({ id, archive }) => base44.entities.Dispatch.update(id, archive ?
    { archived_flag: true, archived_at: new Date().toISOString(), archived_reason: 'Admin archived' } :
    { archived_flag: false, archived_at: null, archived_reason: null }
    ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dispatches-admin'] })
  });

  const companyMap = {};
  companies.forEach((c) => {companyMap[c.id] = c.name;});

  const filtered = useMemo(() => {
    return dispatches.filter((d) => {
      if (filters.status !== 'all' && d.status !== filters.status) return false;
      if (filters.company_id !== 'all' && d.company_id !== filters.company_id) return false;
      if (filters.truck && !(d.trucks_assigned || []).some((t) => t.includes(filters.truck))) return false;
      if (filters.dateFrom && d.date < filters.dateFrom) return false;
      if (filters.dateTo && d.date > filters.dateTo) return false;
      return true;
    });
  }, [dispatches, filters]);

  const upcomingDispatches = useMemo(() => filtered.
  filter((d) => getDispatchBucket(d) === 'upcoming').
  sort((a, b) => {
    const dd = a.date.localeCompare(b.date);
    if (dd !== 0) return dd;
    return (a.start_time || 'zzz').localeCompare(b.start_time || 'zzz');
  }), [filtered]);

  const todayDispatches = useMemo(() => filtered.
  filter((d) => getDispatchBucket(d) === 'today').
  sort((a, b) => (a.start_time || 'zzz').localeCompare(b.start_time || 'zzz')),
  [filtered]);

  const historyDispatches = useMemo(() => filtered.
  filter((d) => getDispatchBucket(d) === 'history').
  sort((a, b) => b.date.localeCompare(a.date)),
  [filtered]);

  const currentList = tab === 'upcoming' ? upcomingDispatches : tab === 'today' ? todayDispatches : historyDispatches;

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
      status: 'Scheduled',
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
    const sessionCode = accessCodes.find((ac) => ac.id === session?.id);
    if (!sessionCode || sessionCode.code !== deleteCode || sessionCode.code_type !== 'Admin') {
      setDeleteError('Invalid admin code. Please try again.');
      return;
    }
    deleteMutation.mutate(deleteTarget.id);
    setDeleteTarget(null);
    setDeleteCode('');
    setDeleteError('');
  };

  // Auto-open drawer for target dispatch from notification
  useEffect(() => {
    const idToOpen = targetDispatchId || pendingOpenIdRef.current;
    if (!idToOpen || dispatches.length === 0) return;

    const target = dispatches.find((d) => d.id === idToOpen);
    if (!target) return;

    const inUpcoming = upcomingDispatches.some((d) => d.id === idToOpen);
    const inToday = todayDispatches.some((d) => d.id === idToOpen);
    const correctTab = inUpcoming ? 'upcoming' : inToday ? 'today' : 'history';

    if (tab !== correctTab) {
      pendingOpenIdRef.current = idToOpen;
      setTab(correctTab);
      return;
    }

    pendingOpenIdRef.current = null;

    if (targetNotificationId) {
      base44.entities.Notification.update(targetNotificationId, { read_flag: true }).
      then(() => queryClient.invalidateQueries({ queryKey: ['notifications'] }));
    }

    setPreviewDispatch(null);
    setDrawerMountKey(`${idToOpen}:${Date.now()}`);
    requestAnimationFrame(() => {
      openDrawer(target);
      setTimeout(() => {
        const el = dispatchRefs.current[idToOpen];
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 200);
    });
  }, [location.search, dispatches, tab, upcomingDispatches, todayDispatches]);


  const handleDrawerClose = () => {
    setPreviewDispatch(null);

    if (!targetDispatchId && !targetNotificationId) return;

    const nextParams = new URLSearchParams(location.search);
    nextParams.delete('dispatchId');
    nextParams.delete('notificationId');
    navigate({ search: nextParams.toString() ? `?${nextParams.toString()}` : '' }, { replace: true });
  };

  const handleSave = (formData) => {
    return new Promise((resolve, reject) => {
      saveMutation.mutate(formData, {
        onSuccess: (saved) => resolve(saved),
        onError: reject
      });
      if (!editing || editing._isCopy) setEditing(null);
    });
  };

  useEffect(() => {
    if (!openNewDispatch) return;
    setEditing(null);
    setOpen(true);
  }, [openNewDispatch]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 text-left">Dispatches</h2>
          <p className="text-sm text-slate-500">{currentList.length} dispatches</p>
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

      {showFilters &&
      <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {['Scheduled', 'Dispatch', 'Amended', 'Cancelled'].map((s) =>
                <SelectItem key={s} value={s}>{s}</SelectItem>
                )}
                </SelectContent>
              </Select>
              <Select value={filters.company_id} onValueChange={(v) => setFilters({ ...filters, company_id: v })}>
                <SelectTrigger className="text-xs"><SelectValue placeholder="Company" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Companies</SelectItem>
                  {companies.map((c) =>
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                )}
                </SelectContent>
              </Select>
              <Input placeholder="Truck #" value={filters.truck} onChange={(e) => setFilters({ ...filters, truck: e.target.value })} className="text-xs" />
              <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} className="text-xs" />
              <Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} className="text-xs" />
            </div>
          </CardContent>
        </Card>
      }

      <Tabs value={tab} onValueChange={setTab} className="bg-slate-600 rounded">
        <TabsList className="bg-slate-700 text-violet-50 p-1 rounded-[10007px] inline-flex h-9 items-center justify-center">
          <TabsTrigger value="today" className="text-xs">Today ({todayDispatches.length})</TabsTrigger>
          <TabsTrigger value="upcoming" className="text-xs">Upcoming ({upcomingDispatches.length})</TabsTrigger>
          <TabsTrigger value="history" className="text-xs">History ({historyDispatches.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ?
      <div className="flex justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-slate-300 border-t-slate-700 rounded-full" />
        </div> :
      currentList.length === 0 ?
      <div className="text-center py-16 text-slate-500 text-sm">No dispatches found</div> :

      <div className="grid gap-3">
          {currentList.map((d) => {
          const assignmentList = Array.isArray(d.assignments) ?
          d.assignments :
          Array.isArray(d.additional_assignments) ?
          d.additional_assignments :
          [];
          const firstAssignmentStartTime = assignmentList[0]?.start_time || assignmentList[0]?.startTime;
          const firstLineTimeText = formatDispatchTime(firstAssignmentStartTime || d.start_time);

          return (
            <div key={d.id} ref={(el) => dispatchRefs.current[d.id] = el} className="rounded-lg transition-all duration-500">
              <Card
                className={`hover:shadow-md transition-shadow cursor-pointer ${statusBorderAccent[d.status] || ''}`}
                onClick={() => openDrawer(d)}>

              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <Badge className={`${statusBadgeColors[d.status]} border text-xs`}>{d.status}</Badge>
                      {d.archived_flag &&
                        <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-xs flex items-center gap-1">
                          <Archive className="h-2.5 w-2.5" />Archived
                        </Badge>
                        }
                      <span className="text-slate-400 text-sm text-left normal-case flex items-center gap-1">
                        {d.shift_time === 'Day Shift' ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                        {d.shift_time}
                      </span>
                      <span className="text-slate-500 text-sm font-semibold">
                        {d.date && format(parseISO(d.date), 'EEEE, MMM d, yyyy')}
                        {firstLineTimeText ? ` • ${firstLineTimeText}` : ''}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-700 flex-wrap">
                      {d.client_name && <span className="font-medium">{d.client_name}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                      {d.job_number &&
                        <span className="flex items-center gap-1"><FileText className="h-3 w-3" />#{d.job_number}</span>
                        }
                    </div>
                    <div className="mt-2">
                      <div className="text-slate-400 text-xs mb-1">{companyMap[d.company_id] || '—'}</div>
                      <div className="flex items-center gap-1 flex-wrap">
                      <Truck className="h-3 w-3 text-slate-400" />
                      {(d.trucks_assigned || []).map((t) =>
                          <Badge key={t} variant="outline" className="text-xs font-mono">{t}</Badge>
                          )}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" onClick={() => openDrawer(d)} className="h-8 w-8" title="Preview">
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => copyShift(d)} className="h-8 w-8" title="Copy Shift">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost" size="icon"
                        onClick={() => archiveMutation.mutate({ id: d.id, archive: !d.archived_flag })}
                        className="h-8 w-8 text-slate-500 hover:text-amber-600"
                        title={d.archived_flag ? 'Unarchive' : 'Archive'}>

                      {d.archived_flag ? <ArchiveX className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
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
            </div>);

        })}
        </div>
      }

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
            onCancel={() => {setOpen(false);setEditing(null);}}
            saving={saveMutation.isPending} />

        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => {setDeleteTarget(null);setDeleteCode('');setDeleteError('');}}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-red-600">Confirm Deletion</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-slate-600">
              This will permanently delete the dispatch for{' '}
              <span className="font-semibold">{deleteTarget?.date} ({deleteTarget?.shift_time})</span>.
              Enter your admin access code to confirm.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="admin-code">Admin Access Code</Label>
              <Input
                id="admin-code"
                value={deleteCode}
                onChange={(e) => {setDeleteCode(e.target.value);setDeleteError('');}}
                placeholder="Enter your access code"
                className={deleteError ? 'border-red-400 focus-visible:ring-red-400' : ''} />

              {deleteError && <p className="text-xs text-red-500">{deleteError}</p>}
            </div>
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => {setDeleteTarget(null);setDeleteCode('');setDeleteError('');}}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="flex-1"
                disabled={!deleteCode || deleteMutation.isPending}
                onClick={handleDeleteConfirm}>

                {deleteMutation.isPending ? 'Deleting...' : 'Confirm Delete'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dispatch Detail Drawer */}
      <DispatchDetailDrawer
        key={drawerMountKey}
        open={!!previewDispatch}
        onClose={handleDrawerClose}
        dispatch={previewDispatch}
        session={{ code_type: 'Admin', allowed_trucks: previewDispatch?.trucks_assigned || [] }}
        confirmations={drawerConfirmations}
        timeEntries={drawerTimeEntries}
        templateNotes={templateNotes}
        onConfirm={() => {}}
        onTimeEntry={() => {}}
        companyName={previewDispatch ? companyMap[previewDispatch.company_id] : ''} />

    </div>);

}