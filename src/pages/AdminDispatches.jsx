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
  Sun, Moon, Truck, Filter, ChevronDown, ChevronUp, Eye, CheckCircle2, XCircle, History, Archive, ArchiveX, Lock, ChevronLeft, ChevronRight, Search } from
'lucide-react';
import { addDays, format, parseISO, startOfDay } from 'date-fns';
import { getDispatchBucket } from '../components/portal/dispatchBuckets';
import DispatchForm from '../components/admin/DispatchForm';
import DispatchDetailDrawer from '../components/portal/DispatchDetailDrawer';
import { useSession } from '../components/session/SessionContext';
import { Label } from '@/components/ui/label';
import { statusBadgeColors, statusBorderAccent, scheduledStatusMessage } from '../components/portal/statusConfig';
import { reconcileOwnerNotificationsForDispatch, notifyDriversForDispatchEdit } from '@/components/notifications/createNotifications';
import { syncDispatchHtmlToDrive } from '@/lib/dispatchDriveSync';
import { toast } from 'sonner';
import { clearRemovedTruckDriverAssignments } from '@/services/driverAssignmentMutationService';

const STATUS_ORDER = ['Scheduled', 'Dispatch', 'Amended', 'Cancelled'];
const ACTIVE_LIVE_EXCLUDED_STATUSES = new Set(['Cancelled', 'Scheduled']);
const LIVE_STATUS_OPTIONS = ['Running', 'Broken Down', 'Delayed', 'At Plant', 'Switched', 'Waiting', 'Off Route', 'Other'];


const DAY_SHIFT_JOB_ACCENTS = [
{ accent: '#0ea5e9', rowTint: 'rgba(14, 165, 233, 0.07)' },
{ accent: '#14b8a6', rowTint: 'rgba(20, 184, 166, 0.07)' },
{ accent: '#22c55e', rowTint: 'rgba(34, 197, 94, 0.07)' },
{ accent: '#f59e0b', rowTint: 'rgba(245, 158, 11, 0.07)' },
{ accent: '#f97316', rowTint: 'rgba(249, 115, 22, 0.07)' },
{ accent: '#a855f7', rowTint: 'rgba(168, 85, 247, 0.07)' },
{ accent: '#6366f1', rowTint: 'rgba(99, 102, 241, 0.07)' },
{ accent: '#ec4899', rowTint: 'rgba(236, 72, 153, 0.07)' },
{ accent: '#84cc16', rowTint: 'rgba(132, 204, 22, 0.07)' },
{ accent: '#06b6d4', rowTint: 'rgba(6, 182, 212, 0.07)' }];


const NIGHT_SHIFT_JOB_ACCENTS = [
{ accent: '#0369a1', rowTint: 'rgba(3, 105, 161, 0.12)' },
{ accent: '#0f766e', rowTint: 'rgba(15, 118, 110, 0.12)' },
{ accent: '#166534', rowTint: 'rgba(22, 101, 52, 0.12)' },
{ accent: '#b45309', rowTint: 'rgba(180, 83, 9, 0.12)' },
{ accent: '#9a3412', rowTint: 'rgba(154, 52, 18, 0.12)' },
{ accent: '#6d28d9', rowTint: 'rgba(109, 40, 217, 0.12)' },
{ accent: '#3730a3', rowTint: 'rgba(55, 48, 163, 0.12)' },
{ accent: '#be185d', rowTint: 'rgba(190, 24, 93, 0.12)' },
{ accent: '#4d7c0f', rowTint: 'rgba(77, 124, 15, 0.12)' },
{ accent: '#155e75', rowTint: 'rgba(21, 94, 117, 0.12)' }];


const getJobAccentByShift = (shift, index) => {
  const palette = shift === 'Night Shift' ? NIGHT_SHIFT_JOB_ACCENTS : DAY_SHIFT_JOB_ACCENTS;
  return palette[index % palette.length];
};

const getLiveStatusClasses = (status) => {
  switch (status) {
    case 'Broken Down':
      return 'border-rose-300 bg-rose-50 text-rose-700';
    case 'Delayed':
      return 'border-amber-300 bg-amber-50 text-amber-700';
    case 'Waiting':
      return 'border-sky-300 bg-sky-50 text-sky-700';
    case 'At Plant':
      return 'border-indigo-300 bg-indigo-50 text-indigo-700';
    case 'Switched':
      return 'border-violet-300 bg-violet-50 text-violet-700';
    case 'Off Route':
      return 'border-orange-300 bg-orange-50 text-orange-700';
    case 'Other':
      return 'border-fuchsia-300 bg-fuchsia-50 text-fuchsia-700';
    default:
      return 'border-slate-200 bg-white text-slate-700';
  }
};


const getAdminDisplayName = (session) => {
  if (!session) return 'Admin';
  return session.label || session.name || session.code || `Admin ${session.id || ''}`.trim();
};

const getAdminSessionId = (session) => session?.id || session?.code || 'unknown-session';

const createAdminActivityEntry = (session, action, message) => ({
  timestamp: new Date().toISOString(),
  admin_session_id: getAdminSessionId(session),
  admin_name: getAdminDisplayName(session),
  action,
  message
});

const appendAdminActivityLog = (existingLog, entries) => {
  const current = Array.isArray(existingLog) ? existingLog : [];
  const nextEntries = Array.isArray(entries) ? entries : [entries];
  return [...nextEntries, ...current];
};

const getCompanyNameFromDispatch = (dispatch, companies) => {
  const company = companies.find((candidate) => candidate.id === dispatch?.company_id);
  return company?.name || 'Unknown Company';
};

const syncDispatchRecordHtml = async ({
  dispatch,
  previousDispatch,
  companies,
  finalizeAfterSync = false,
  allowArchivedFinalizedSync = false
}) => {
  const companyName = getCompanyNameFromDispatch(dispatch, companies);
  const [confirmationsForDispatch, timeEntriesForDispatch, driverAssignmentsForDispatch] = await Promise.all([
  base44.entities.Confirmation.filter({ dispatch_id: dispatch.id }, '-confirmed_at', 500),
  base44.entities.TimeEntry.filter({ dispatch_id: dispatch.id }, '-created_date', 500),
  base44.entities.DriverDispatchAssignment.filter({ dispatch_id: dispatch.id }, '-assigned_datetime', 500)]
  );

  return syncDispatchHtmlToDrive({
    dispatch,
    previousDispatch,
    companyName,
    confirmations: confirmationsForDispatch,
    timeEntries: timeEntriesForDispatch,
    driverAssignments: driverAssignmentsForDispatch,
    finalizeAfterSync,
    allowArchivedFinalizedSync
  });
};

const normalizeTextField = (value) => String(value ?? '').trim();

const normalizeTruckAssignments = (value) => {
  if (!Array.isArray(value)) return [];
  return value.
  map((truck) => normalizeTextField(truck)).
  filter(Boolean).
  sort();
};

const areTruckAssignmentsEqual = (previous, next) => {
  const left = normalizeTruckAssignments(previous);
  const right = normalizeTruckAssignments(next);
  if (left.length !== right.length) return false;
  return left.every((truck, index) => truck === right[index]);
};

const buildDispatchUpdateActivityEntries = (previousDispatch, nextDispatch, session) => {
  const adminName = getAdminDisplayName(session);

  if (previousDispatch.status !== nextDispatch.status) {
    if (nextDispatch.status === 'Cancelled') {
      return [createAdminActivityEntry(session, 'cancelled_dispatch', `${adminName} cancelled this dispatch`)];
    }

    return [createAdminActivityEntry(
      session,
      'changed_status',
      `${adminName} changed status from ${previousDispatch.status} to ${nextDispatch.status}`
    )];
  }

  if (normalizeTextField(previousDispatch.date) !== normalizeTextField(nextDispatch.date)) {
    return [createAdminActivityEntry(session, 'changed_dispatch_date', `${adminName} changed dispatch date`)];
  }

  if (normalizeTextField(previousDispatch.start_time) !== normalizeTextField(nextDispatch.start_time)) {
    return [createAdminActivityEntry(session, 'changed_start_time', `${adminName} changed start time`)];
  }

  if (!areTruckAssignmentsEqual(previousDispatch.trucks_assigned, nextDispatch.trucks_assigned)) {
    return [createAdminActivityEntry(session, 'updated_truck_assignments', `${adminName} updated truck assignments`)];
  }

  if (normalizeTextField(previousDispatch.instructions) !== normalizeTextField(nextDispatch.instructions)) {
    return [createAdminActivityEntry(session, 'updated_instructions', `${adminName} updated instructions`)];
  }

  if (normalizeTextField(previousDispatch.notes) !== normalizeTextField(nextDispatch.notes)) {
    return [createAdminActivityEntry(session, 'updated_notes', `${adminName} updated notes`)];
  }

  if (normalizeTextField(previousDispatch.start_location) !== normalizeTextField(nextDispatch.start_location)) {
    return [createAdminActivityEntry(session, 'changed_start_location', `${adminName} changed start location`)];
  }

  if (normalizeTextField(previousDispatch.client_name) !== normalizeTextField(nextDispatch.client_name)) {
    return [createAdminActivityEntry(session, 'changed_client_name', `${adminName} changed client name`)];
  }

  if (normalizeTextField(previousDispatch.job_number) !== normalizeTextField(nextDispatch.job_number)) {
    return [createAdminActivityEntry(session, 'changed_job_number', `${adminName} changed job number`)];
  }

  if (normalizeTextField(previousDispatch.shift_time) !== normalizeTextField(nextDispatch.shift_time)) {
    return [createAdminActivityEntry(session, 'changed_shift', `${adminName} changed shift`)];
  }

  return [createAdminActivityEntry(session, 'updated_dispatch', `${adminName} updated this dispatch`)];
};

const formatActivityPreviewTimestamp = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return format(date, 'M/d/yyyy h:mm a');
};

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

const buildLiveLineKey = (dispatchId, truckNumber) => `${dispatchId}:${truckNumber || 'unassigned'}`;

const getAssignmentSortValue = (startTime) => {
  if (!startTime) return Number.MAX_SAFE_INTEGER;
  const time = String(startTime).trim();
  if (!time) return Number.MAX_SAFE_INTEGER;

  const plainMatch = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (plainMatch) {
    return Number(plainMatch[1]) * 60 + Number(plainMatch[2]);
  }

  const meridiemMatch = time.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (meridiemMatch) {
    const rawHour = Number(meridiemMatch[1]) % 12;
    const minute = Number(meridiemMatch[2]);
    const isPm = meridiemMatch[3].toUpperCase() === 'PM';
    return (rawHour + (isPm ? 12 : 0)) * 60 + minute;
  }

  return Number.MAX_SAFE_INTEGER;
};

const getDispatchAssignmentsForTruck = (dispatch, truckNumber) => {
  const assignments = Array.isArray(dispatch?.assignments) ? dispatch.assignments : Array.isArray(dispatch?.additional_assignments) ? dispatch.additional_assignments : [];
  const normalizedTruck = String(truckNumber || '').trim();

  return assignments.
  filter((entry) => String(entry?.truck_number || '').trim() === normalizedTruck).
  map((entry) => ({
    jobNumber: entry?.job_number || dispatch?.job_number || '',
    startTime: formatDispatchTime(entry?.start_time || entry?.startTime)
  })).
  sort((a, b) => getAssignmentSortValue(a.startTime) - getAssignmentSortValue(b.startTime));
};

const deriveTruckStartTime = (dispatch, truckNumber) => {
  const assignmentsForTruck = getDispatchAssignmentsForTruck(dispatch, truckNumber);
  return assignmentsForTruck[0]?.startTime || formatDispatchTime(dispatch?.start_time);
};

const getShiftSort = (shift) => shift === 'Night Shift' ? 1 : 0;

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


function LiveDispatchBoard({
  selectedDate,
  groupedShifts,
  onMoveWindow,
  boardSearch,
  onBoardSearch,
  onOpenDispatch,
  onChangeLiveStatus,
  onAdjustRequestedCount,
  statusUpdatingKey,
  requestUpdatingKey
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => onMoveWindow(-1)} className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div>
              <p className="text-xs text-slate-500">Viewing date</p>
              <p className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">{format(selectedDate, 'EEEE, MMMM d, yyyy')}</p>
            </div>
            <Button variant="outline" size="icon" onClick={() => onMoveWindow(1)} className="h-8 w-8">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <div className="relative w-full sm:w-80">
            <Search className="h-4 w-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input className="pl-8 text-xs" value={boardSearch} onChange={(e) => onBoardSearch(e.target.value)} placeholder="Filter job #, truck #, or driver" />
          </div>
        </CardContent>
      </Card>

      {groupedShifts.every((shiftGroup) => shiftGroup.jobs.length === 0) ?
      <div className="text-center py-12 text-sm text-slate-500">No live dispatch activity for this date.</div> :

      <div className="space-y-4">
          <Card>
              <CardContent className="bg-[#ffffff] p-4 space-y-4">
                {groupedShifts.map((shiftGroup) =>
            <section key={shiftGroup.shift} className="space-y-4">
                    <div className="bg-neutral-800 text-slate-50 px-4 py-3 rounded-lg flex items-center justify-between gap-3 border border-slate-200 from-slate-50 to-white shadow-sm">
                      <div className="text-slate-50 text-xl font-bold tracking-tight flex items-center gap-2.5 sm:text-2xl">
                        {shiftGroup.shift === 'Day Shift' ? <Sun className="text-amber-300 lucide lucide-sun h-5 w-5" /> : <Moon className="h-5 w-5 text-slate-500" />}
                        {shiftGroup.shift}
                      </div>
                      <Badge variant="secondary" className="text-xs font-medium text-slate-600">{shiftGroup.jobs.length} jobs</Badge>
                    </div>
                    <div className="space-y-4">
                      {shiftGroup.jobs.length === 0 &&
                <p className="text-xs text-slate-400 px-1 py-1">No active jobs in this shift.</p>
                }
                      {shiftGroup.jobs.map((job, jobIndex) => {
                  const jobAccent = getJobAccentByShift(shiftGroup.shift, jobIndex);

                  return (
                    <article key={job.groupKey} className="rounded-xl border border-slate-300 bg-slate-100/80 shadow-sm overflow-hidden">
                          <div className="h-1.5" style={{ backgroundColor: jobAccent.accent }} />
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-slate-300 bg-white/90 px-4 py-3.5">
                            <div className="space-y-1">
                              <p className="text-base font-bold text-slate-900 tracking-tight">{job.clientName || 'Unknown Client'} <span className="text-slate-500 font-semibold">• Job #{job.jobNumber || 'No Job #'}</span></p>
                              <p className="text-xs text-slate-500">{job.shift}{job.startLocation ? ` • ${job.startLocation}` : ''}</p>
                              <p className="text-xs font-medium" style={{ color: jobAccent.accent }}>Filled {job.assignedCount} of {job.requestedCount} requested slots</p>
                            </div>
                            <div className="flex items-center gap-1.5 self-start sm:self-auto">
                              <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs bg-white" disabled={requestUpdatingKey === `${job.groupKey}:down`} onClick={() => onAdjustRequestedCount(job, -1)}>- Slot</Button>
                              <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs bg-white" disabled={requestUpdatingKey === `${job.groupKey}:up`} onClick={() => onAdjustRequestedCount(job, 1)}>+ Slot</Button>
                            </div>
                          </div>
                          <div className="space-y-2.5 p-3.5">
                            {job.lines.map((line) =>
                        <div key={line.lineKey} className={`rounded-lg border px-3.5 py-3 ${line.isPlaceholder ? 'border-dashed border-slate-300 bg-slate-50' : 'border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]'}`} style={line.isPlaceholder ? undefined : { borderLeftWidth: '4px', borderLeftColor: jobAccent.accent, backgroundColor: jobAccent.rowTint }}>
                                {line.isPlaceholder ?
                          <div className="flex items-center justify-between gap-2">
                                    <div>
                                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Requested Truck Slot</p>
                                      <p className="text-xs text-slate-400">Unfilled placeholder</p>
                                    </div>
                                    <Badge variant="outline" className="text-[10px] border-dashed border-slate-400 bg-white text-slate-600">Open Slot</Badge>
                                  </div> :

                          <div className="space-y-2">
                                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                      <button type="button" className="text-left space-y-1" onClick={() => onOpenDispatch(line.dispatch)}>
                                        <p className="text-sm font-bold text-slate-900">Truck {line.truckNumber || 'Unassigned'} {line.driverName ? `• ${line.driverName}` : ''}</p>
                                        <p className="text-xs text-slate-500">Start {line.startTime || 'TBD'} • {line.dispatch.status}</p>
                                      </button>
                                      <Select value={line.liveStatus} onValueChange={(value) => onChangeLiveStatus(line, value)}>
                                        <SelectTrigger className={`h-9 w-[170px] text-xs font-medium rounded-full border transition-colors ${getLiveStatusClasses(line.liveStatus)}`}>
                                          <SelectValue placeholder="Live status" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {LIVE_STATUS_OPTIONS.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    {statusUpdatingKey === line.statusKey && <p className="text-[10px] text-slate-400">Saving status...</p>}
                                    {line.additionalAssignments.length > 0 &&
                            <div className="pl-2.5 border-l-2 border-indigo-200 space-y-1">
                                        {line.additionalAssignments.map((assignment) =>
                              <p key={assignment.lineKey} className="text-xs text-indigo-700">
                                            Additional assignment: Job #{assignment.jobNumber || 'No Job #'} • {assignment.startTime || 'TBD'}
                                          </p>
                              )}
                                      </div>
                            }
                                  </div>
                          }
                              </div>
                        )}
                          </div>
                        </article>);

                })}
                    </div>
                  </section>
            )}
              </CardContent>
            </Card>
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
  const [filters, setFilters] = useState({ status: 'all', company_id: 'all', truck: '', dateFrom: '', dateTo: '', query: '' });
  const [showFilters, setShowFilters] = useState(false);
  const [tab, setTab] = useState('live-board');
  const [liveBoardCenterDate, setLiveBoardCenterDate] = useState(() => startOfDay(new Date()));
  const [boardSearch, setBoardSearch] = useState('');
  const [statusUpdatingKey, setStatusUpdatingKey] = useState('');
  const [requestUpdatingKey, setRequestUpdatingKey] = useState('');
  const dispatchRefs = useRef({});
  const pendingOpenIdRef = useRef(null);
  const activeEditLockDispatchIdRef = useRef(null);

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

  const { data: liveBoardRequests = [] } = useQuery({
    queryKey: ['live-dispatch-board-requests'],
    queryFn: () => base44.entities.LiveDispatchBoardRequest.list('-created_date', 500)
  });

  const { data: driverAssignments = [] } = useQuery({
    queryKey: ['driver-dispatch-assignments-admin'],
    queryFn: () => base44.entities.DriverDispatchAssignment.list('-assigned_datetime', 2000)
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

  const getSessionLockName = () => {
    if (!session) return 'Admin session';
    return session.label || session.code || session.name || `Admin ${session.id || 'session'}`;
  };

  const releaseEditLock = async (dispatchId) => {
    if (!dispatchId || !session?.id) return;

    try {
      const latest = await base44.entities.Dispatch.filter({ id: dispatchId }, '-created_date', 1).then((r) => r[0]);
      if (!latest || !latest.edit_locked) return;
      if (latest.edit_locked_by_session_id !== session.id) return;

      await base44.entities.Dispatch.update(dispatchId, {
        edit_locked: false,
        edit_locked_by_session_id: null,
        edit_locked_by_name: null,
        edit_locked_at: null
      });

      activeEditLockDispatchIdRef.current = null;
      await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dispatches-admin'] }),
      queryClient.invalidateQueries({ queryKey: ['portal-dispatches'] })]
      );
      return true;
    } catch {
      toast.error('Failed to release edit lock. Please retry or refresh.');
      return false;
    }
  };

  const acquireEditLock = async (dispatchId) => {
    if (!session?.id) {
      toast.error('Unable to start editing without an active admin session.');
      return null;
    }

    try {
      const latest = await base44.entities.Dispatch.filter({ id: dispatchId }, '-created_date', 1).then((r) => r[0]);
      if (!latest) {
        toast.error('Dispatch not found. Please refresh and try again.');
        return null;
      }

      const lockedByAnotherSession = latest.edit_locked && latest.edit_locked_by_session_id && latest.edit_locked_by_session_id !== session.id;
      if (lockedByAnotherSession) {
        const byName = latest.edit_locked_by_name ? ` (${latest.edit_locked_by_name})` : '';
        toast.error(`This dispatch is currently being edited by another admin${byName}.`);
        await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dispatches-admin'] }),
        queryClient.invalidateQueries({ queryKey: ['portal-dispatches'] })]
        );
        return null;
      }

      await base44.entities.Dispatch.update(dispatchId, {
        edit_locked: true,
        edit_locked_by_session_id: session.id,
        edit_locked_by_name: getSessionLockName(),
        edit_locked_at: new Date().toISOString()
      });

      activeEditLockDispatchIdRef.current = dispatchId;
      await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dispatches-admin'] }),
      queryClient.invalidateQueries({ queryKey: ['portal-dispatches'] })]
      );

      return {
        ...latest,
        edit_locked: true,
        edit_locked_by_session_id: session.id,
        edit_locked_by_name: getSessionLockName(),
        edit_locked_at: new Date().toISOString()
      };
    } catch {
      toast.error('Failed to acquire edit lock. Please refresh and try again.');
      return null;
    }
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editing && !editing._isCopy) {
        const nextEntries = buildDispatchUpdateActivityEntries(editing, data, session);

        await base44.entities.Dispatch.update(editing.id, {
          ...data,
          admin_activity_log: appendAdminActivityLog(editing.admin_activity_log, nextEntries),
          edit_locked: false,
          edit_locked_by_session_id: null,
          edit_locked_by_name: null,
          edit_locked_at: null
        });
        const previousActiveDriverAssignments = await base44.entities.DriverDispatchAssignment.filter({
          dispatch_id: editing.id,
          active_flag: true
        }, '-assigned_datetime', 500);
        const savedDispatch = await base44.entities.Dispatch.filter({ id: editing.id }, '-created_date', 1).then((r) => r[0]);

        if (savedDispatch) {
          const removedTrucks = (editing?.trucks_assigned || []).filter((truck) => !(savedDispatch.trucks_assigned || []).includes(truck));
          await clearRemovedTruckDriverAssignments({
            dispatch: savedDispatch,
            removedTrucks,
          });

          const previousStatus = editing?.status;
          const nextStatus = savedDispatch.status;
          const shouldResetDriverReceiptConfirmation = previousStatus !== nextStatus && (nextStatus === 'Amended' || nextStatus === 'Cancelled');

          if (shouldResetDriverReceiptConfirmation) {
            const activeDriverAssignmentsForReset = await base44.entities.DriverDispatchAssignment.filter({
              dispatch_id: savedDispatch.id,
              active_flag: true
            }, '-assigned_datetime', 500);

            await Promise.all((activeDriverAssignmentsForReset || []).
            filter((assignment) => assignment?.id).
            map((assignment) => base44.entities.DriverDispatchAssignment.update(assignment.id, {
              receipt_confirmed_flag: false,
              receipt_confirmed_at: null,
              receipt_confirmed_by_driver_id: null,
              receipt_confirmed_by_name: null
            })));
          }

          await reconcileOwnerNotificationsForDispatch(savedDispatch, accessCodes);
          const activeDriverAssignments = await base44.entities.DriverDispatchAssignment.filter({
            dispatch_id: savedDispatch.id,
            active_flag: true
          }, '-assigned_datetime', 500);

          await notifyDriversForDispatchEdit({
            previousDispatch: editing,
            nextDispatch: savedDispatch,
            previousDriverAssignments: previousActiveDriverAssignments,
            driverAssignments: activeDriverAssignments
          });

          try {
            await syncDispatchRecordHtml({
              dispatch: savedDispatch,
              previousDispatch: editing,
              companies
            });
          } catch (error) {
            await base44.entities.Dispatch.update(savedDispatch.id, {
              dispatch_html_drive_last_sync_status: 'failed',
              dispatch_html_drive_last_sync_error: String(error?.message || error || 'Drive sync failed')
            });
            toast.warning('Dispatch saved, but Google Drive sync failed.');
          }
        }

        return savedDispatch;
      } else {
        const adminName = getAdminDisplayName(session);
        const createdDispatch = await base44.entities.Dispatch.create({
          ...data,
          admin_activity_log: appendAdminActivityLog(data.admin_activity_log, createAdminActivityEntry(session, 'created_dispatch', `${adminName} created this dispatch`)),
          edit_locked: false,
          edit_locked_by_session_id: null,
          edit_locked_by_name: null,
          edit_locked_at: null
        });

        try {
          await syncDispatchRecordHtml({
            dispatch: createdDispatch,
            previousDispatch: null,
            companies
          });
        } catch (error) {
          await base44.entities.Dispatch.update(createdDispatch.id, {
            dispatch_html_drive_last_sync_status: 'failed',
            dispatch_html_drive_last_sync_error: String(error?.message || error || 'Drive sync failed')
          });
          toast.warning('Dispatch created, but Google Drive sync failed.');
        }

        return createdDispatch;
      }
    },
    onSuccess: () => {
      activeEditLockDispatchIdRef.current = null;
      queryClient.invalidateQueries({ queryKey: ['dispatches-admin'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['portal-dispatches'] });
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey?.[0] || '').startsWith('confirmations') });
      if (editing && !editing._isCopy) {
        toast.success('Dispatch saved. Edit lock released.');
      }
      setOpen(false);
      setEditing(null);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await base44.entities.Dispatch.delete(id);

      const [notifications, confirmations] = await Promise.all([
      base44.entities.Notification.filter({ related_dispatch_id: id }, '-created_date', 1000),
      base44.entities.Confirmation.filter({ dispatch_id: id }, '-confirmed_at', 1000)]);

      await Promise.all([
      ...notifications.map((notification) => base44.entities.Notification.delete(notification.id)),
      ...confirmations.map((confirmation) => base44.entities.Confirmation.delete(confirmation.id))]
      );
    },
    onSuccess: async () => {
      await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dispatches-admin'] }),
      queryClient.invalidateQueries({ queryKey: ['portal-dispatches'] }),
      queryClient.invalidateQueries({ queryKey: ['dispatches-admin-confirmations'] }),
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey?.[0] || '').startsWith('notifications') }),
      queryClient.invalidateQueries({ predicate: (query) => String(query.queryKey?.[0] || '').startsWith('confirmations') })]
      );
    }
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ dispatch, archive }) => {
      const payload = archive ?
      {
        archived_flag: true,
        archived_at: new Date().toISOString(),
        archived_reason: 'Admin archived'
      } :
      {
        archived_flag: false,
        archived_at: null,
        archived_reason: null,
        dispatch_html_drive_sync_finalized_at: null
      };

      const nextLog = archive ? appendAdminActivityLog(
        dispatch.admin_activity_log,
        createAdminActivityEntry(session, 'archived_dispatch', `${getAdminDisplayName(session)} archived this dispatch`)
      ) : dispatch.admin_activity_log;

      const updatedDispatch = await base44.entities.Dispatch.update(dispatch.id, {
        ...payload,
        admin_activity_log: nextLog
      });

      if (!archive) return updatedDispatch;

      const shouldRunArchiveFinalSync = !dispatch.dispatch_html_drive_sync_finalized_at;
      if (!shouldRunArchiveFinalSync) return updatedDispatch;

      try {
        await syncDispatchRecordHtml({
          dispatch: updatedDispatch,
          previousDispatch: dispatch,
          companies,
          finalizeAfterSync: true,
          allowArchivedFinalizedSync: true
        });
      } catch (error) {
        await base44.entities.Dispatch.update(updatedDispatch.id, {
          dispatch_html_drive_last_sync_status: 'failed',
          dispatch_html_drive_last_sync_error: String(error?.message || error || 'Drive sync failed')
        });
        toast.warning('Dispatch archived, but final Google Drive sync failed.');
      }

      return updatedDispatch;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dispatches-admin'] })
  });


  const updateLiveStatusMutation = useMutation({
    mutationFn: async ({ dispatch, truckNumber, liveStatus }) => {
      const key = buildLiveLineKey(dispatch.id, truckNumber);
      setStatusUpdatingKey(key);
      const nextStatuses = {
        ...(dispatch.live_truck_statuses || {}),
        [truckNumber || 'unassigned']: liveStatus
      };
      await base44.entities.Dispatch.update(dispatch.id, { live_truck_statuses: nextStatuses });
      return key;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['dispatches-admin'] }),
    onSettled: () => setStatusUpdatingKey('')
  });

  const adjustLiveRequestMutation = useMutation({
    mutationFn: async ({ job, delta }) => {
      const direction = delta > 0 ? 'up' : 'down';
      setRequestUpdatingKey(`${job.groupKey}:${direction}`);
      const nextCount = Math.max(job.assignedCount, (job.requestedCount || 0) + delta);
      const existing = liveBoardRequests.find((entry) =>
      entry.date === job.date &&
      (entry.shift_time || 'Day Shift') === job.shift &&
      String(entry.job_number || '') === String(job.jobNumber || '')
      );

      if (existing) {
        if (nextCount === job.assignedCount) {
          await base44.entities.LiveDispatchBoardRequest.delete(existing.id);
          return;
        }
        await base44.entities.LiveDispatchBoardRequest.update(existing.id, {
          requested_count: nextCount,
          client_name: job.clientName || existing.client_name || '',
          start_location: job.startLocation || existing.start_location || ''
        });
        return;
      }

      if (delta < 0) return;
      await base44.entities.LiveDispatchBoardRequest.create({
        date: job.date,
        shift_time: job.shift,
        job_number: job.jobNumber || '',
        client_name: job.clientName || '',
        start_location: job.startLocation || '',
        requested_count: nextCount
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['live-dispatch-board-requests'] }),
    onSettled: () => setRequestUpdatingKey('')
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
      if (filters.query.trim()) {
        const term = filters.query.trim().toLowerCase();
        const assignmentTags = (Array.isArray(d.additional_assignments) ? d.additional_assignments : []).
        flatMap((a) => [a?.job_number, a?.reference_tag]).
        filter(Boolean).
        join(' ').
        toLowerCase();
        const searchable = [d.client_name, d.job_number, d.reference_tag, assignmentTags].
        filter(Boolean).
        join(' ').
        toLowerCase();
        if (!searchable.includes(term)) return false;
      }
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

  const liveBoardSelectedDateKey = useMemo(() => format(startOfDay(liveBoardCenterDate), 'yyyy-MM-dd'), [liveBoardCenterDate]);

  const liveBoardGroupedShifts = useMemo(() => {
    const search = boardSearch.trim().toLowerCase();
    const byDispatchTruckDriver = driverAssignments.
    filter((assignment) => assignment.active_flag !== false).
    reduce((acc, assignment) => {
      const key = buildLiveLineKey(assignment.dispatch_id, assignment.truck_number);
      acc[key] = assignment.driver_name || acc[key] || '';
      return acc;
    }, {});

    const filteredDispatches = dispatches.
    filter((dispatch) => !ACTIVE_LIVE_EXCLUDED_STATUSES.has(dispatch.status)).
    filter((dispatch) => dispatch.date === liveBoardSelectedDateKey);

    const shiftGroups = [
    { shift: 'Day Shift', jobs: [] },
    { shift: 'Night Shift', jobs: [] }];

    const allJobMap = new Map();

    filteredDispatches.forEach((dispatch) => {
      const shift = dispatch.shift_time || 'Day Shift';
      const dateKey = dispatch.date;
      const jobKey = `${dateKey}|${shift}|${dispatch.job_number || ''}`;
      if (!allJobMap.has(jobKey)) {
        allJobMap.set(jobKey, {
          groupKey: jobKey,
          date: dateKey,
          shift,
          jobNumber: dispatch.job_number || '',
          clientName: dispatch.client_name || '',
          startLocation: dispatch.start_location || '',
          lines: []
        });
      }

      const job = allJobMap.get(jobKey);
      (dispatch.trucks_assigned || []).forEach((truckNumber, index) => {
        const statusKey = buildLiveLineKey(dispatch.id, truckNumber);
        job.lines.push({
          lineKey: `${statusKey}:${index}`,
          statusKey,
          dispatch,
          isPlaceholder: false,
          truckNumber,
          driverName: byDispatchTruckDriver[statusKey] || '',
          startTime: deriveTruckStartTime(dispatch, truckNumber),
          liveStatus: dispatch.live_truck_statuses?.[truckNumber] || 'Running'
        });
      });
    });

    liveBoardRequests.forEach((request) => {
      if (request.date !== liveBoardSelectedDateKey) return;
      const shift = request.shift_time || 'Day Shift';
      const jobKey = `${request.date}|${shift}|${request.job_number || ''}`;
      if (!allJobMap.has(jobKey)) {
        allJobMap.set(jobKey, {
          groupKey: jobKey,
          date: request.date,
          shift,
          jobNumber: request.job_number || '',
          clientName: request.client_name || '',
          startLocation: request.start_location || '',
          lines: []
        });
      }
    });

    allJobMap.forEach((job) => {
      const requestEntry = liveBoardRequests.find((entry) =>
      entry.date === job.date &&
      (entry.shift_time || 'Day Shift') === job.shift &&
      String(entry.job_number || '') === String(job.jobNumber || '')
      );

      job.lines.sort((a, b) => (a.startTime || 'zz').localeCompare(b.startTime || 'zz'));

      job.lines = job.lines.map((line) => {
        if (line.isPlaceholder) return line;
        const assignmentsForTruck = getDispatchAssignmentsForTruck(line.dispatch, line.truckNumber);

        return {
          ...line,
          additionalAssignments: assignmentsForTruck.slice(1).map((assignment, assignmentIndex) => ({
            ...assignment,
            lineKey: `${line.lineKey}:assignment:${assignmentIndex}`
          }))
        };
      });

      job.assignedCount = job.lines.length;
      job.requestedCount = Math.max(job.assignedCount, Number(requestEntry?.requested_count || job.assignedCount));
      const openSlots = Math.max(0, job.requestedCount - job.assignedCount);
      for (let i = 0; i < openSlots; i += 1) {
        job.lines.push({
          lineKey: `${job.groupKey}:placeholder:${i}`,
          isPlaceholder: true
        });
      }

      if (search) {
        const hasJobMatch = `${job.jobNumber} ${job.clientName}`.toLowerCase().includes(search);
        const hasLineMatch = job.lines.some((line) =>
        line.isPlaceholder ? false : `${line.truckNumber || ''} ${line.driverName || ''}`.toLowerCase().includes(search)
        );
        if (!hasJobMatch && !hasLineMatch) return;
      }

      const existingShiftGroup = shiftGroups.find((group) => group.shift === job.shift);
      if (existingShiftGroup) {
        existingShiftGroup.jobs.push(job);
      }
    });

    return shiftGroups.map((group) => ({
      ...group,
      jobs: group.jobs.sort((a, b) => String(a.jobNumber || '').localeCompare(String(b.jobNumber || '')))
    }));
  }, [boardSearch, dispatches, driverAssignments, liveBoardRequests, liveBoardSelectedDateKey]);

  const openNew = () => {
    setEditing(null);
    setOpen(true);
  };

  const openEdit = async (d) => {
    if (open && editing && editing.id === d.id) {
      toast.message('This dispatch is already open for editing in your session.');
      return;
    }

    const dispatchForEdit = await acquireEditLock(d.id);
    if (!dispatchForEdit) return;
    setEditing(dispatchForEdit);
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

  const liveBoardDispatchCount = useMemo(() => liveBoardGroupedShifts.reduce((sum, shiftGroup) =>
  sum + shiftGroup.jobs.reduce((jobSum, job) => jobSum + job.assignedCount, 0),
  0), [liveBoardGroupedShifts]);

  const dispatchCountLabel = tab === 'live-board' ? `${liveBoardDispatchCount} active truck lines` : `${currentList.length} dispatches`;

  const shiftLiveBoardWindow = (direction) => {
    setLiveBoardCenterDate((prev) => addDays(prev, direction));
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

  useEffect(() => {
    return () => {
      if (activeEditLockDispatchIdRef.current) {
        releaseEditLock(activeEditLockDispatchIdRef.current);
      }
    };
  }, [session?.id]);

  useEffect(() => {
    if (!previewDispatch?.id) return;
    const freshPreview = dispatches.find((d) => d.id === previewDispatch.id);
    if (freshPreview) {
      setPreviewDispatch(freshPreview);
    }
  }, [dispatches, previewDispatch?.id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 text-left">Dispatches</h2>
          <p className="text-sm text-slate-500">{dispatchCountLabel}</p>
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
            <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
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
              <Input placeholder="Search job / reference" value={filters.query} onChange={(e) => setFilters({ ...filters, query: e.target.value })} className="text-xs" />
              <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} className="text-xs" />
              <Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} className="text-xs" />
            </div>
          </CardContent>
        </Card>
      }

      <Tabs value={tab} onValueChange={setTab} className="bg-slate-600 rounded">
        <TabsList className="bg-slate-700 text-violet-50 p-1 rounded-[10007px] inline-flex h-9 items-center justify-center flex-wrap h-auto">
          <TabsTrigger value="live-board" className="text-xs">Live Dispatch Board</TabsTrigger>
          <TabsTrigger value="today" className="text-xs">Today ({todayDispatches.length})</TabsTrigger>
          <TabsTrigger value="upcoming" className="text-xs">Upcoming ({upcomingDispatches.length})</TabsTrigger>
          <TabsTrigger value="history" className="text-xs">History ({historyDispatches.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ?
      <div className="flex justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-slate-300 border-t-slate-700 rounded-full" />
        </div> : tab === 'live-board' ?
      <LiveDispatchBoard
        selectedDate={liveBoardCenterDate}
        groupedShifts={liveBoardGroupedShifts}
        onMoveWindow={shiftLiveBoardWindow}
        boardSearch={boardSearch}
        onBoardSearch={setBoardSearch}
        onOpenDispatch={openDrawer}
        onChangeLiveStatus={(line, value) => updateLiveStatusMutation.mutate({ dispatch: line.dispatch, truckNumber: line.truckNumber, liveStatus: value })}
        onAdjustRequestedCount={(job, delta) => adjustLiveRequestMutation.mutate({ job, delta })}
        statusUpdatingKey={statusUpdatingKey}
        requestUpdatingKey={requestUpdatingKey} /> :

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

          const latestActivity = d.admin_activity_log?.[0];
          const latestActivityTimestamp = formatActivityPreviewTimestamp(latestActivity?.timestamp);

          return (
            <div key={d.id} ref={(el) => dispatchRefs.current[d.id] = el} className="rounded-lg transition-all duration-500">
              <Card
                className={`hover:shadow-md transition-shadow cursor-pointer ${statusBorderAccent[d.status] || ''}`}
                onClick={() => openDrawer(d)}>

              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <Badge className={`${statusBadgeColors[d.status]} border text-xs`}>{d.status}</Badge>
                      {d.archived_flag &&
                        <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-xs flex items-center gap-1">
                          <Archive className="h-2.5 w-2.5" />Archived
                        </Badge>
                        }
                      <span className="text-slate-400 text-sm text-left normal-case flex items-center gap-1 shrink-0">
                        {d.shift_time === 'Day Shift' ? <Sun className="h-3 w-3 text-amber-400" /> : <Moon className="h-3 w-3 text-slate-400" />}
                        {d.shift_time}
                      </span>
                      <span className="text-slate-500 text-sm font-semibold w-full sm:w-auto">
                        {d.date && format(parseISO(d.date), 'EEEE, MMM d, yyyy')}
                        {firstLineTimeText ? ` • ${firstLineTimeText}` : ''}
                      </span>
                    </div>
                    {d.status === 'Scheduled' &&
                      <p className="text-xs text-blue-600 italic mt-0.5">{scheduledStatusMessage}</p>
                      }
                    <div className="flex items-center gap-3 text-sm text-slate-700 flex-wrap">
                      {d.client_name && <span className="font-medium">{d.client_name}</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                      {d.job_number &&
                        <span className="flex items-center gap-1"><FileText className="h-3 w-3" />#{d.job_number}</span>
                        }
                    </div>
                    {d.reference_tag &&
                      <p className="text-xs text-slate-400 mt-0.5">Reference Tag: {d.reference_tag}</p>
                      }
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
                  <div className="hidden sm:flex flex-col items-end justify-between gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {d.edit_locked && d.edit_locked_by_session_id && d.edit_locked_by_session_id !== session?.id &&
                      <div className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                        <Lock className="h-3 w-3" />
                        <span>{d.edit_locked_by_name ? `Locked by ${d.edit_locked_by_name}` : 'Editing in progress'}</span>
                      </div>
                      }
                    <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openDrawer(d)} className="h-8 w-8" title="Preview">
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => copyShift(d)} className="h-8 w-8" title="Copy Shift">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                          variant="ghost" size="icon"
                          onClick={() => archiveMutation.mutate({ dispatch: d, archive: !d.archived_flag })}
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

                    <div className="text-right max-w-[210px]">
                      {latestActivity?.message ?
                        <>
                          <p className="text-[10px] text-slate-500 leading-tight line-clamp-1">{latestActivity.message}</p>
                          {latestActivityTimestamp && <p className="text-[10px] text-slate-400">{latestActivityTimestamp}</p>}
                        </> :

                        <p className="text-[10px] text-slate-400 italic">No activity yet.</p>
                        }
                    </div>
                  </div>
                </div>

                <div className="sm:hidden mt-3 pt-3 border-t border-slate-200/80" onClick={(e) => e.stopPropagation()}>
                  {d.edit_locked && d.edit_locked_by_session_id && d.edit_locked_by_session_id !== session?.id &&
                    <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                      <Lock className="h-3 w-3" />
                      <span>{d.edit_locked_by_name ? `Locked by ${d.edit_locked_by_name}` : 'Editing in progress'}</span>
                    </div>
                    }

                  <div className="mb-2">
                    {latestActivity?.message ?
                      <>
                        <p className="text-[10px] text-slate-500 leading-tight">{latestActivity.message}</p>
                        {latestActivityTimestamp && <p className="text-[10px] text-slate-400">{latestActivityTimestamp}</p>}
                      </> :

                      <p className="text-[10px] text-slate-400 italic">No activity yet.</p>
                      }
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openDrawer(d)} className="h-9 w-9" title="Preview">
                      <Eye className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => copyShift(d)} className="h-9 w-9" title="Copy Shift">
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        variant="ghost" size="icon"
                        onClick={() => archiveMutation.mutate({ dispatch: d, archive: !d.archived_flag })}
                        className="h-9 w-9 text-slate-500 hover:text-amber-600"
                        title={d.archived_flag ? 'Unarchive' : 'Archive'}>
                      {d.archived_flag ? <ArchiveX className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(d)} className="h-9 w-9">
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => openDelete(d)} className="h-9 w-9 text-red-500 hover:text-red-600">
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

      <Dialog open={open} onOpenChange={(nextOpen) => {
        if (!nextOpen && activeEditLockDispatchIdRef.current) {
          releaseEditLock(activeEditLockDispatchIdRef.current);
        }
        setOpen(nextOpen);
        if (!nextOpen) setEditing(null);
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing && !editing._isCopy ? 'Edit Dispatch' : 'New Dispatch'}</DialogTitle>
          </DialogHeader>
          <DispatchForm
            dispatch={editing}
            dispatches={dispatches}
            companies={companies}
            accessCodes={accessCodes}
            onSave={handleSave}
            onCancel={() => {
              if (activeEditLockDispatchIdRef.current) {
                releaseEditLock(activeEditLockDispatchIdRef.current);
              }
              setOpen(false);
              setEditing(null);
            }}
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
