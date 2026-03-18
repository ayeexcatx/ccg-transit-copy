import React, { useMemo, useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Clock, Truck, Sun, Moon,
  FileText, AlertTriangle, ArrowLeft, Pencil, Camera
} from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  canCompanyOwnerViewAssignmentsAndTimeLogs,
  statusBadgeColors,
  scheduledDispatchNote,
  scheduledStatusMessage,
} from './statusConfig';
import { NOTE_DISPLAY_WIDTH, NOTE_TYPES, normalizeTemplateNote, renderSimpleMarkupToHtml } from '@/lib/templateNotes';
import { calculateWorkedHours, formatTime24h, formatWorkedHours } from '@/lib/timeLogs';
import { toast } from 'sonner';
import { notifyDriverAssignmentChanges, notifyOwnerDriverConfirmed } from '@/components/notifications/createNotifications';
import html2canvas from 'html2canvas';
import DispatchDrawerTutorial from '@/components/tutorial/DispatchDrawerTutorial';
import DispatchActivityLogSection from './DispatchActivityLogSection';
import DispatchTimeLogSection from './DispatchTimeLogSection';
import DispatchDriverConfirmationSection from './DispatchDriverConfirmationSection';

const tollColors = {
  Authorized: 'bg-green-50 text-green-700',
  Unauthorized: 'bg-red-50 text-red-700',
  'Included in Rate': 'bg-purple-50 text-purple-700',
};

const UNASSIGNED_DRIVER_VALUE = '__unassigned__';
const DRIVER_SHIFT_CONFLICT_MESSAGE = 'That driver is already assigned on a different dispatch for the same shift. Please remove the driver from that assignment or select a different driver.';
let openDispatchDrawerCount = 0;

function getActivityActorName(session) {
  const candidates = [
    session?.label,
    session?.access_code_label,
    session?.name,
    session?.access_code_name,
  ];

  const resolved = candidates.find((value) => String(value || '').trim());
  return resolved ? String(resolved).trim() : 'Company Owner';
}

function buildDriverAssignmentActivityEntries({ session, truckNumber, previousAssignment, nextAssignment }) {
  if (session?.code_type !== 'CompanyOwner') return [];

  const previousDriverId = previousAssignment?.driver_id || null;
  const nextDriverId = nextAssignment?.driver_id || null;
  if (previousDriverId === nextDriverId) return [];

  const actorName = getActivityActorName(session);
  const timestamp = new Date().toISOString();
  const previousDriverName = previousAssignment?.driver_name || 'Unknown driver';
  const nextDriverName = nextAssignment?.driver_name || 'Unknown driver';

  if (!previousDriverId && nextDriverId) {
    return [{
      timestamp,
      actor_type: 'CompanyOwner',
      actor_id: session?.id,
      actor_name: actorName,
      action: 'owner_assigned_driver',
      message: `${actorName} assigned driver ${nextDriverName} to Truck ${truckNumber}`,
    }];
  }

  if (previousDriverId && !nextDriverId) {
    return [{
      timestamp,
      actor_type: 'CompanyOwner',
      actor_id: session?.id,
      actor_name: actorName,
      action: 'owner_removed_driver',
      message: `${actorName} removed driver ${previousDriverName} from Truck ${truckNumber}`,
    }];
  }

  return [{
    timestamp,
    actor_type: 'CompanyOwner',
    actor_id: session?.id,
    actor_name: actorName,
    action: 'owner_changed_driver',
    message: `${actorName} changed driver from ${previousDriverName} to ${nextDriverName} on Truck ${truckNumber}`,
  }];
}

async function appendDispatchActivityEntries(dispatch, entries = []) {
  if (!dispatch?.id || !Array.isArray(entries) || entries.length === 0) return;

  try {
    const latestDispatch = await base44.entities.Dispatch.filter({ id: dispatch.id }, '-created_date', 1);
    const currentLog = Array.isArray(latestDispatch?.[0]?.admin_activity_log)
      ? latestDispatch[0].admin_activity_log
      : (Array.isArray(dispatch.admin_activity_log) ? dispatch.admin_activity_log : []);

    await base44.entities.Dispatch.update(dispatch.id, {
      admin_activity_log: [...entries, ...currentLog],
    });
  } catch (error) {
    console.error('Failed to append dispatch activity entries for driver assignment changes:', error);
  }
}

function announceDispatchDrawerState() {
  if (typeof window === 'undefined') return;
  const isOpen = openDispatchDrawerCount > 0;
  window.__dispatchDetailDrawerOpen = isOpen;
  window.dispatchEvent(new CustomEvent('dispatch-detail-drawer-state', {
    detail: { open: isOpen },
  }));
}


function formatActivityTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return format(date, 'MMM d, yyyy h:mm a');
}
function formatTimeToAmPm(value) {
  if (!value) return '';
  const v = String(value).trim();

  if (/[ap]m$/i.test(v) || /\b[ap]m\b/i.test(v)) {
    return v.replace(/\s+/g, ' ').toUpperCase();
  }

  const m = v.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return v;

  let hh = parseInt(m[1], 10);
  const mm = m[2];
  if (Number.isNaN(hh) || hh < 0 || hh > 23) return v;

  const suffix = hh >= 12 ? 'PM' : 'AM';
  hh = hh % 12;
  if (hh === 0) hh = 12;

  return `${hh}:${mm} ${suffix}`;
}

function getEntryActorLabel(entry) {
  if (!entry) return '';
  const preferred = [
    entry.confirmed_by_name,
    entry.entered_by_name,
    entry.driver_name,
    entry.user_label,
    entry.access_code_label,
    entry.access_code_name,
    entry.label,
    entry.name,
  ];
  const explicit = preferred.find((value) => String(value || '').trim());
  if (explicit) return String(explicit).trim();

  if (String(entry.truck_number || '').trim()) return `Truck ${String(entry.truck_number).trim()}`;
  return '';
}

function formatLogTimestampWithActor(prefix, timestamp, actorLabel) {
  if (!timestamp) return '';
  const base = `${prefix} ${format(new Date(timestamp), 'MMM d, h:mm a')}`;
  return actorLabel ? `${base} by ${actorLabel}` : base;
}

function getGeneralNoteLayout(note) {
  const bullets = note.bullet_lines?.length > 0
    ? note.bullet_lines
    : note.note_text
      ? [note.note_text]
      : [];

  const titleLength = (note.title || '').trim().length;
  const bulletLengths = bullets.map((line) => String(line || '').trim().length);
  const totalTextLength = titleLength + bulletLengths.reduce((sum, len) => sum + len, 0);
  const longestBulletLength = Math.max(0, ...bulletLengths);
  const bulletCount = bullets.length;

  const shouldSpanWide = (
    totalTextLength > 220
    || bulletCount >= 5
    || longestBulletLength > 90
    || (Boolean(note.title) && bulletCount >= 3 && totalTextLength > 150)
  );

  return {
    bullets,
    shouldSpanWide,
  };
}



function getNoteColumnClass(displayWidth, autoShouldSpanWide = false) {
  if (displayWidth === NOTE_DISPLAY_WIDTH.FULL) return 'col-span-2';
  if (displayWidth === NOTE_DISPLAY_WIDTH.HALF) return 'col-span-1';
  return autoShouldSpanWide ? 'col-span-2 md:col-span-2' : 'col-span-2 md:col-span-1';
}

function TruckTimeRow({
  truck,
  dispatch,
  timeEntries,
  readOnly,
  draft,
  onChangeDraft,
  onCopyToAll,
  isFirstRow,
  showActor = false,
}) {
  const existing = timeEntries.find((te) =>
    te.dispatch_id === dispatch.id && te.truck_number === truck
  );
  const start = draft?.start ?? existing?.start_time ?? '';
  const end = draft?.end ?? existing?.end_time ?? '';
  const workedHours = calculateWorkedHours(existing?.start_time, existing?.end_time);

  if (readOnly) {
    return (
      <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 rounded px-3 py-2">
        <div className="flex items-center gap-2">
          <Truck className="h-3 w-3 text-slate-400" />
          <span className="font-mono font-medium">{truck}</span>
        </div>
        <span className="text-right">
          {existing ? (
            <span className="text-slate-500">
              {formatTime24h(existing.start_time) || '—'} → {formatTime24h(existing.end_time) || '—'}
              {workedHours != null && (
                <span className="block text-[11px] text-slate-400">Total: {formatWorkedHours(workedHours)} hrs</span>
              )}
              {showActor && (
                <span className="block text-[11px] text-slate-400">
                  {formatLogTimestampWithActor('Entered', existing.updated_date || existing.created_date, getEntryActorLabel(existing) || 'Unknown')}
                </span>
              )}
            </span>
          ) : (
            <span className="text-slate-400 italic">No time logged</span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Truck className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-sm font-mono font-medium">{truck}</span>
        {existing && (
          <div className="text-xs text-slate-400 ml-auto text-right">
            <span>Saved: {formatTime24h(existing.start_time) || '—'} → {formatTime24h(existing.end_time) || '—'}</span>
            {workedHours != null && (
              <span className="block text-[11px]">Total: {formatWorkedHours(workedHours)} hrs</span>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <p className="text-xs text-slate-500 mb-1">Check-in</p>
          <Input type="time" value={start} onChange={e => onChangeDraft(truck, 'start', e.target.value)} className="text-sm h-8" />
        </div>
        {isFirstRow && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs mb-0"
            disabled={!start && !end}
            onClick={() => onCopyToAll(start, end)}
          >
            Copy to all
          </Button>
        )}
        <div className="flex-1">
          <p className="text-xs text-slate-500 mb-1">Check-out</p>
          <Input type="time" value={end} onChange={e => onChangeDraft(truck, 'end', e.target.value)} className="text-sm h-8" />
        </div>
      </div>
    </div>
  );
}

export default function DispatchDetailDrawer({
  dispatch, session, confirmations, timeEntries, templateNotes,
  onConfirm, onTimeEntry, onOwnerTruckUpdate, companyName: _companyName, open, onClose
}) {
  const jobNumberBadgeClassName = 'bg-black px-2 py-0.5 text-[11px] font-semibold text-white hover:bg-black';
  const [draftTimeEntries, setDraftTimeEntries] = useState({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const drawerScrollRef = React.useRef(null);
  const timeLogSectionRef = React.useRef(null);
  const [isEditingTrucks, setIsEditingTrucks] = useState(false);
  const [draftTrucks, setDraftTrucks] = useState([]);
  const [isSavingTrucks, setIsSavingTrucks] = useState(false);
  const [truckEditMessage, setTruckEditMessage] = useState(null);
  const [isCreatingScreenshot, setIsCreatingScreenshot] = useState(false);
  const [selectedDriverByTruck, setSelectedDriverByTruck] = useState({});
  const [driverAssignmentErrors, setDriverAssignmentErrors] = useState({});
  const screenshotSectionRef = React.useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    setDraftTimeEntries({});
  }, [dispatch?.id]);

  useEffect(() => {
    if (!open) return undefined;

    openDispatchDrawerCount += 1;
    announceDispatchDrawerState();

    return () => {
      openDispatchDrawerCount = Math.max(0, openDispatchDrawerCount - 1);
      announceDispatchDrawerState();
    };
  }, [open]);

  useEffect(() => {
    setIsEditingTrucks(false);
    setDraftTrucks(dispatch?.trucks_assigned || []);
    setIsSavingTrucks(false);
    setTruckEditMessage(null);
  }, [dispatch?.id, dispatch?.trucks_assigned]);

  useEffect(() => {
    if (!truckEditMessage) return undefined;

    const timeoutId = window.setTimeout(() => {
      setTruckEditMessage(null);
    }, 4000);

    return () => window.clearTimeout(timeoutId);
  }, [truckEditMessage]);

  const myTrucks = (session?.allowed_trucks || []).filter(t =>
    (dispatch?.trucks_assigned || []).includes(t)
  );
  const isOwner = session.code_type === 'CompanyOwner';
  const isAdmin = session.code_type === 'Admin';
  const isTruckUser = session.code_type === 'Truck';
  const isDriverUser = session.code_type === 'Driver';

  const { data: companyDrivers = [] } = useQuery({
    queryKey: ['drivers', dispatch?.company_id],
    queryFn: () => base44.entities.Driver.filter({ company_id: dispatch.company_id }, '-driver_name', 500),
    enabled: open && isOwner && !!dispatch?.company_id,
  });

  const eligibleDrivers = useMemo(
    () => companyDrivers.filter((driver) => {
      const isActive = driver.active_flag !== false && (driver.status || 'Active') === 'Active';
      return isActive && driver.access_code_status === 'Created';
    }),
    [companyDrivers],
  );

  const { data: driverAssignments = [], refetch: refetchDriverAssignments } = useQuery({
    queryKey: ['driver-dispatch-assignments', dispatch?.id],
    queryFn: () => base44.entities.DriverDispatchAssignment.filter({ dispatch_id: dispatch.id, active_flag: true }, '-assigned_datetime', 500),
    enabled: open && (isOwner || isAdmin) && !!dispatch?.id,
  });



  const { data: currentDriverAssignments = [] } = useQuery({
    queryKey: ['driver-dispatch-assignments', dispatch?.id, session?.driver_id],
    queryFn: () => base44.entities.DriverDispatchAssignment.filter({ dispatch_id: dispatch.id, driver_id: session.driver_id }, '-assigned_datetime', 200),
    enabled: open && isDriverUser && !!dispatch?.id && !!session?.driver_id,
  });

  const confirmDispatchReceiptMutation = useMutation({
    mutationFn: async ({ assignments }) => {
      const confirmedAt = new Date().toISOString();
      const updates = assignments
        .filter((assignment) => assignment?.id)
        .map((assignment) => base44.entities.DriverDispatchAssignment.update(assignment.id, {
          receipt_confirmed_flag: true,
          receipt_confirmed_at: confirmedAt,
          receipt_confirmed_by_driver_id: session?.driver_id,
          receipt_confirmed_by_name: session?.label || session?.driver_name || session?.name || assignment?.driver_name || undefined,
        }));

      await Promise.all(updates);
      return confirmedAt;
    },
    onSuccess: async (_confirmedAt, variables) => {
      await notifyOwnerDriverConfirmed({
        dispatch,
        assignments: variables?.assignments || [],
        driverName: session?.label || session?.driver_name || session?.name || variables?.assignments?.[0]?.driver_name,
      });
      await Promise.all([
        refetchDriverAssignments(),
        queryClient.invalidateQueries({ queryKey: ['driver-dispatch-assignments', dispatch?.id, session?.driver_id] }),
      ]);
      queryClient.invalidateQueries({ queryKey: ['driver-dispatch-assignments', dispatch?.id] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Receipt confirmed.');
    },
    onError: (error) => {
      toast.error(error?.message || 'Unable to confirm dispatch receipt.');
    },
  });
  useEffect(() => {
    if (!isOwner || !dispatch?.id) return;

    const next = {};
    (dispatch.trucks_assigned || []).forEach((truckNumber) => {
      const assignment = driverAssignments.find((entry) => entry.truck_number === truckNumber && entry.active_flag !== false);
      next[truckNumber] = assignment?.driver_id || UNASSIGNED_DRIVER_VALUE;
    });
    setSelectedDriverByTruck(next);
    setDriverAssignmentErrors({});
  }, [isOwner, dispatch?.id, dispatch?.trucks_assigned, driverAssignments]);

  const { data: conflictingDriverAssignmentsById = {} } = useQuery({
    queryKey: ['driver-shift-conflicts', dispatch?.id, dispatch?.company_id, dispatch?.date, dispatch?.shift_time],
    enabled: open && isOwner && !!dispatch?.id && !!dispatch?.company_id && !!dispatch?.date && !!dispatch?.shift_time,
    queryFn: async () => {
      const sameShiftDispatches = await base44.entities.Dispatch.filter({
        company_id: dispatch.company_id,
        date: dispatch.date,
        shift_time: dispatch.shift_time,
      }, '-created_date', 500);

      const conflictingDispatches = (sameShiftDispatches || []).filter((candidate) => (
        candidate?.id
        && candidate.id !== dispatch.id
        && candidate.status !== 'Cancelled'
      ));

      if (!conflictingDispatches.length) return {};

      const dispatchIds = new Set(conflictingDispatches.map((candidate) => candidate.id));
      const assignmentsByDispatch = await Promise.all(
        conflictingDispatches.map((candidate) =>
          base44.entities.DriverDispatchAssignment.filter({
            dispatch_id: candidate.id,
            active_flag: true,
          }, '-assigned_datetime', 200)
        )
      );

      return assignmentsByDispatch.flat().reduce((map, assignment) => {
        if (!assignment?.driver_id || !dispatchIds.has(assignment.dispatch_id)) return map;
        if (!map[assignment.driver_id]) map[assignment.driver_id] = assignment;
        return map;
      }, {});
    },
  });

  const assignDriverMutation = useMutation({
    mutationFn: async ({ truckNumber, driverId }) => {
      const previousAssignments = [...driverAssignments];
      const driver = eligibleDrivers.find((entry) => entry.id === driverId);
      if (!driver) throw new Error('Selected driver was not found.');

      const sameShiftDispatches = await base44.entities.Dispatch.filter({
        company_id: dispatch.company_id,
        date: dispatch.date,
        shift_time: dispatch.shift_time,
      }, '-created_date', 500);

      const conflictingDispatchIds = new Set((sameShiftDispatches || [])
        .filter((candidate) => (
          candidate?.id
          && candidate.id !== dispatch.id
          && candidate.status !== 'Cancelled'
        ))
        .map((candidate) => candidate.id));

      if (conflictingDispatchIds.size > 0) {
        const driverActiveAssignments = await base44.entities.DriverDispatchAssignment.filter({
          driver_id: driverId,
          active_flag: true,
        }, '-assigned_datetime', 500);

        const hasConflict = (driverActiveAssignments || []).some((assignment) =>
          conflictingDispatchIds.has(assignment.dispatch_id)
        );

        if (hasConflict) {
          throw new Error(DRIVER_SHIFT_CONFLICT_MESSAGE);
        }
      }

      const existing = driverAssignments.find((entry) => entry.truck_number === truckNumber);
      const previousAssignment = existing && existing.active_flag !== false ? existing : null;
      const payload = {
        dispatch_id: dispatch.id,
        company_id: dispatch.company_id,
        truck_number: truckNumber,
        driver_id: driver.id,
        driver_name: driver.driver_name,
        assigned_by_access_code_id: session?.id,
        assigned_by_code_type: session?.code_type,
        assigned_datetime: new Date().toISOString(),
        active_flag: true,
        receipt_confirmed_flag: false,
        receipt_confirmed_at: null,
        receipt_confirmed_by_driver_id: null,
        receipt_confirmed_by_name: null,
      };

      let savedAssignment;
      if (existing?.id) {
        savedAssignment = await base44.entities.DriverDispatchAssignment.update(existing.id, payload);
      } else {
        savedAssignment = await base44.entities.DriverDispatchAssignment.create(payload);
      }

      const nextAssignments = previousAssignments
        .filter((entry) => entry?.id !== existing?.id)
        .concat(savedAssignment);

      const activityEntries = buildDriverAssignmentActivityEntries({
        session,
        truckNumber,
        previousAssignment,
        nextAssignment: savedAssignment,
      });
      await appendDispatchActivityEntries(dispatch, activityEntries);

      await notifyDriverAssignmentChanges(dispatch, previousAssignments, nextAssignments);

      return savedAssignment;
    },
    onSuccess: async () => {
      await refetchDriverAssignments();
      queryClient.invalidateQueries({ queryKey: ['portal-dispatches', dispatch?.company_id] });
      queryClient.invalidateQueries({ queryKey: ['dispatches-admin'] });
      queryClient.invalidateQueries({ queryKey: ['driver-dispatch-assignments', dispatch?.id] });
      toast.success('Driver assignment saved.');
    },
    onError: (error) => {
      toast.error(error?.message || 'Unable to save driver assignment.');
    },
  });

  const handleDriverSelection = async (truckNumber, driverId) => {
    const previousDriverId = selectedDriverByTruck[truckNumber] || UNASSIGNED_DRIVER_VALUE;
    setSelectedDriverByTruck((prev) => ({ ...prev, [truckNumber]: driverId }));
    setDriverAssignmentErrors((prev) => ({ ...prev, [truckNumber]: null }));

    if (driverId === UNASSIGNED_DRIVER_VALUE) {
      const existing = driverAssignments.find((entry) => entry.truck_number === truckNumber && entry.active_flag !== false);
      if (!existing?.id) return;

      const previousAssignments = [...driverAssignments];
      await base44.entities.DriverDispatchAssignment.update(existing.id, {
        active_flag: false,
      });

      const activityEntries = buildDriverAssignmentActivityEntries({
        session,
        truckNumber,
        previousAssignment: existing,
        nextAssignment: null,
      });
      await appendDispatchActivityEntries(dispatch, activityEntries);

      const nextAssignments = previousAssignments.filter((entry) => entry.id !== existing.id);
      await notifyDriverAssignmentChanges(dispatch, previousAssignments, nextAssignments);
      await refetchDriverAssignments();
      queryClient.invalidateQueries({ queryKey: ['portal-dispatches', dispatch?.company_id] });
      queryClient.invalidateQueries({ queryKey: ['dispatches-admin'] });
      queryClient.invalidateQueries({ queryKey: ['driver-dispatch-assignments', dispatch?.id] });
      toast.success('Driver assignment removed.');
      return;
    }

    try {
      await assignDriverMutation.mutateAsync({ truckNumber, driverId });
    } catch (error) {
      setSelectedDriverByTruck((prev) => ({ ...prev, [truckNumber]: previousDriverId }));
      if (error?.message === DRIVER_SHIFT_CONFLICT_MESSAGE) {
        setDriverAssignmentErrors((prev) => ({ ...prev, [truckNumber]: DRIVER_SHIFT_CONFLICT_MESSAGE }));
      }
    }
  };

  if (!dispatch) return null;

  const driverAssignedTrucks = currentDriverAssignments
    .filter((entry) => entry?.active_flag !== false)
    .map((entry) => entry.truck_number)
    .filter(Boolean);

  const visibleTrucks = isDriverUser ? [...new Set(driverAssignedTrucks)] : myTrucks;
  const activeAssignmentsByTruck = (isOwner || isAdmin ? driverAssignments : currentDriverAssignments)
    .filter((entry) => entry?.active_flag !== false && entry?.truck_number)
    .reduce((map, entry) => {
      map[entry.truck_number] = entry;
      return map;
    }, {});

  const hasTruckReceiptConfirmation = (truckNumber) => Boolean(activeAssignmentsByTruck[truckNumber]?.receipt_confirmed_at);

  const driverActiveAssignments = currentDriverAssignments.filter((entry) => entry?.active_flag !== false);
  const canDriverConfirmReceipt = isDriverUser
    && driverActiveAssignments.length > 0
    && driverActiveAssignments.some((entry) => !entry?.receipt_confirmed_at);

  const driverConfirmReceiptButtonText = 'Confirm';
  const assignedDriverNameByTruck = driverAssignments
    .filter((entry) => entry?.active_flag !== false)
    .reduce((map, entry) => {
      if (!entry?.truck_number || !entry?.driver_name) return map;
      map[entry.truck_number] = entry.driver_name;
      return map;
    }, {});

  const eligibleDriverNameById = eligibleDrivers.reduce((map, driver) => {
    if (!driver?.id || !driver?.driver_name) return map;
    map[driver.id] = driver.driver_name;
    return map;
  }, {});

  const getTruckDriverSummaryLabel = (truckNumber) => {
    if (!isOwner) return assignedDriverNameByTruck[truckNumber] || 'Unassigned';

    const selectedDriverId = selectedDriverByTruck[truckNumber];
    if (selectedDriverId === UNASSIGNED_DRIVER_VALUE) return 'No driver assigned';
    if (selectedDriverId && eligibleDriverNameById[selectedDriverId]) {
      return eligibleDriverNameById[selectedDriverId];
    }

    return assignedDriverNameByTruck[truckNumber] || 'No driver assigned';
  };

  const currentConfType = dispatch.status;
  const hasAdditional = Array.isArray(dispatch.additional_assignments) && dispatch.additional_assignments.length > 0;

  const normalizedTemplateNotes = (templateNotes || []).map(normalizeTemplateNote);
  const boxNotes = normalizedTemplateNotes.filter(n => n.note_type === NOTE_TYPES.BOX);
  const generalNotes = normalizedTemplateNotes.filter(n => n.note_type !== NOTE_TYPES.BOX);

  const isTruckConfirmedForCurrent = (truck) =>
    confirmations.some(c =>
      c.dispatch_id === dispatch.id &&
      c.truck_number === truck &&
      c.confirmation_type === currentConfType
    );

  const getTruckCurrentConfirmation = (truck) =>
    confirmations.find(c =>
      c.dispatch_id === dispatch.id &&
      c.truck_number === truck &&
      c.confirmation_type === currentConfType
    );

  const getTruckPriorConfirmations = (truck) =>
    confirmations
      .filter(c =>
        c.dispatch_id === dispatch.id &&
        c.truck_number === truck &&
        c.confirmation_type !== currentConfType
      )
      .sort((a, b) => new Date(b.confirmed_at || 0) - new Date(a.confirmed_at || 0));

  const handleChangeDraft = (truck, field, value) => {
    setDraftTimeEntries((prev) => ({
      ...prev,
      [truck]: {
        ...(prev[truck] || {}),
        [field]: value,
      },
    }));
  };

  const handleCopyToAll = (sourceStart, sourceEnd) => {
    setDraftTimeEntries((prev) => {
      const next = { ...prev };
      myTrucks.forEach((truck) => {
        next[truck] = {
          ...(next[truck] || {}),
          ...(sourceStart ? { start: sourceStart } : {}),
          ...(sourceEnd ? { end: sourceEnd } : {}),
        };
      });
      return next;
    });
  };

  const handleDriverConfirmReceipt = async () => {
    const pendingAssignments = driverActiveAssignments.filter((entry) => !entry?.receipt_confirmed_at);
    if (pendingAssignments.length === 0 || confirmDispatchReceiptMutation.isPending) return;
    await confirmDispatchReceiptMutation.mutateAsync({ assignments: pendingAssignments });
  };

  const entriesToSave = myTrucks
    .map((truck) => {
      const existing = timeEntries.find((te) => te.dispatch_id === dispatch.id && te.truck_number === truck);
      const start = draftTimeEntries[truck]?.start ?? existing?.start_time ?? '';
      const end = draftTimeEntries[truck]?.end ?? existing?.end_time ?? '';
      if (!start && !end) return null;
      return { truck, start, end };
    })
    .filter(Boolean);

  const hasUnsavedChanges = myTrucks.some((truck) => {
    const draft = draftTimeEntries[truck];
    if (!draft) return false;
    const existing = timeEntries.find((te) => te.dispatch_id === dispatch.id && te.truck_number === truck);
    const currentStart = existing?.start_time ?? '';
    const currentEnd = existing?.end_time ?? '';
    const nextStart = draft.start ?? currentStart;
    const nextEnd = draft.end ?? currentEnd;
    return nextStart !== currentStart || nextEnd !== currentEnd;
  });

  const handleSaveAll = async () => {
    if (entriesToSave.length === 0 || !hasUnsavedChanges) return;
    setIsSavingAll(true);
    const previousScrollTop = drawerScrollRef.current?.scrollTop;

    try {
      await onTimeEntry(dispatch, entriesToSave);
      setDraftTimeEntries({});
      requestAnimationFrame(() => {
        if (typeof previousScrollTop === 'number' && drawerScrollRef.current) {
          drawerScrollRef.current.scrollTop = previousScrollTop;
          return;
        }
        timeLogSectionRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' });
      });
    } finally {
      setIsSavingAll(false);
    }
  };

  const handleConfirmTruck = (truck) => {
    onConfirm(dispatch, truck, currentConfType);
  };


  const ownerTruckOptions = session?.code_type === 'CompanyOwner' ? (session?.allowed_trucks || []) : [];
  const showOwnerAssignmentsAndTimeLogs = !isOwner || canCompanyOwnerViewAssignmentsAndTimeLogs(dispatch.status);
  const requiredTruckCount = (dispatch?.trucks_assigned || []).filter(Boolean).length;

  const resetDraftTrucksToCurrentDispatch = () => {
    setDraftTrucks(dispatch?.trucks_assigned || []);
  };

  const resetTruckEditing = () => {
    setIsEditingTrucks(false);
    resetDraftTrucksToCurrentDispatch();
    setTruckEditMessage(null);
  };

  const handleDrawerClose = () => {
    resetTruckEditing();
    onClose();
  };

  const toggleDraftTruck = (truck) => {
    setDraftTrucks((prev) =>
      prev.includes(truck)
        ? prev.filter((item) => item !== truck)
        : [...prev, truck]
    );
  };

  const handleSaveTrucks = async () => {
    if (!onOwnerTruckUpdate) return;
    setTruckEditMessage(null);
    const nextTrucks = [...new Set(draftTrucks.filter(Boolean))];

    if (nextTrucks.length !== requiredTruckCount) {
      setTruckEditMessage({
        type: 'error',
        text: `Truck count must remain ${requiredTruckCount}. Replace trucks one-for-one before saving.`,
      });
      resetDraftTrucksToCurrentDispatch();
      return;
    }

    setIsSavingTrucks(true);
    try {
      const result = await onOwnerTruckUpdate(dispatch, nextTrucks);
      if (result?.updated) {
        resetTruckEditing();
      }
    } catch (error) {
      setTruckEditMessage({
        type: 'error',
        text: error?.message || 'Unable to update truck assignments.',
      });
      resetDraftTrucksToCurrentDispatch();
    } finally {
      setIsSavingTrucks(false);
    }
  };

  const hasTruckDraftChanges = (() => {
    const current = [...new Set((dispatch?.trucks_assigned || []).filter(Boolean))].sort();
    const next = [...new Set(draftTrucks.filter(Boolean))].sort();
    if (current.length !== next.length) return true;
    return current.some((truck, index) => truck !== next[index]);
  })();

  // Safe date display: use parseISO to avoid timezone shift on YYYY-MM-DD strings
  const displayDate = dispatch.date
    ? format(parseISO(dispatch.date), 'EEE, MMM d, yyyy')
    : '';


  const handleReportIncident = () => {
    const params = new URLSearchParams();
    params.set('create', '1');
    params.set('fromDispatch', '1');
    params.set('dispatchId', dispatch.id);

    if (dispatch.company_id) {
      params.set('companyId', dispatch.company_id);
    }

    if (visibleTrucks.length === 1) {
      params.set('truckNumber', visibleTrucks[0]);
    }

    handleDrawerClose();
    window.location.href = createPageUrl(`Incidents?${params.toString()}`);
  };

  const handleScreenshotDispatch = async () => {
    if (isEditingTrucks) {
      toast.error('Finish editing trucks before creating a screenshot.');
      return;
    }

    const target = screenshotSectionRef.current;
    if (!target) {
      toast.error('Dispatch details are not ready to capture yet.');
      return;
    }

    setIsCreatingScreenshot(true);
    let screenshotRoot;
    try {
      screenshotRoot = document.createElement('div');
      screenshotRoot.style.position = 'fixed';
      screenshotRoot.style.left = '-10000px';
      screenshotRoot.style.top = '0';
      screenshotRoot.style.width = `${Math.max(360, Math.min(target.scrollWidth || 420, 720))}px`;
      screenshotRoot.style.padding = '20px';
      screenshotRoot.style.background = '#ffffff';
      screenshotRoot.style.boxSizing = 'border-box';
      screenshotRoot.style.zIndex = '-1';

      const summary = document.createElement('div');
      summary.style.display = 'grid';
      summary.style.gridTemplateColumns = 'repeat(3, minmax(0, 1fr))';
      summary.style.gap = '8px';
      summary.style.padding = '12px';
      summary.style.border = '1px solid #e2e8f0';
      summary.style.borderRadius = '10px';
      summary.style.background = '#f8fafc';
      summary.style.marginBottom = '16px';
      summary.style.fontSize = '12px';
      summary.innerHTML = `
        <div><p style="margin:0;color:#64748b;font-weight:600;">Date</p><p style="margin:2px 0 0;color:#334155;">${displayDate || '—'}</p></div>
        <div><p style="margin:0;color:#64748b;font-weight:600;">Shift</p><p style="margin:2px 0 0;color:#334155;">${dispatch.shift_time || '—'}</p></div>
        <div><p style="margin:0;color:#64748b;font-weight:600;">Status</p><p style="margin:2px 0 0;color:#334155;">${dispatch.status || '—'}</p></div>
      `;

      const clone = target.cloneNode(true);
      clone.querySelectorAll('[data-screenshot-exclude="true"]').forEach((node) => node.remove());

      screenshotRoot.appendChild(summary);
      screenshotRoot.appendChild(clone);
      document.body.appendChild(screenshotRoot);

      const canvas = await html2canvas(screenshotRoot, {
        backgroundColor: '#ffffff',
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
        scrollX: 0,
        scrollY: 0,
        windowWidth: screenshotRoot.scrollWidth,
        windowHeight: screenshotRoot.scrollHeight,
      });

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Failed to generate screenshot image.');

      const fileNameDate = dispatch?.date || format(new Date(), 'yyyy-MM-dd');
      const fileName = `dispatch-${fileNameDate}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      const canShareFile = typeof navigator !== 'undefined'
        && typeof navigator.share === 'function'
        && typeof navigator.canShare === 'function'
        && navigator.canShare({ files: [file] });

      if (canShareFile) {
        await navigator.share({ files: [file], title: 'Dispatch Screenshot' });
      } else {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);
      }

      toast.success('Dispatch screenshot created.');
    } catch (error) {
      toast.error(error?.message || 'Unable to create dispatch screenshot on this device/browser.');
    } finally {
      if (screenshotRoot?.parentNode) {
        screenshotRoot.parentNode.removeChild(screenshotRoot);
      }
      setIsCreatingScreenshot(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleDrawerClose(); }}>
      <SheetContent
        ref={drawerScrollRef}
        side="right"
        className="w-full sm:max-w-lg overflow-y-auto p-0"
        data-tutorial-scroll="drawer"
      >
        {/* Top bar */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 z-10">
          <div className="flex items-center justify-between gap-2">
            <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDrawerClose}
            className="mb-2 -ml-2 h-8 px-2 text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
            </Button>
            <DispatchDrawerTutorial isOwner={isOwner} drawerOpen={open} />
          </div>
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2 flex-wrap text-base">
              <Badge className={`${statusBadgeColors[dispatch.status]} border text-xs font-medium`}>
                {dispatch.status}
              </Badge>
              <span className="text-xs text-slate-400 flex items-center gap-1 font-normal">
                {dispatch.shift_time === 'Day Shift' ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                {dispatch.shift_time}
              </span>
              <span className="ml-auto text-xs text-slate-500 font-normal">
                {displayDate}
              </span>
            </SheetTitle>
          </SheetHeader>
        </div>

        <div className="px-5 py-5 space-y-6">

          {isDriverUser && (
            <div className="flex items-center gap-2">
              {driverActiveAssignments.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  onClick={handleDriverConfirmReceipt}
                  disabled={!canDriverConfirmReceipt || confirmDispatchReceiptMutation.isPending}
                  className="bg-emerald-700 hover:bg-emerald-800 disabled:bg-emerald-100 disabled:text-emerald-700 text-white"
                >
                  {confirmDispatchReceiptMutation.isPending
                    ? 'Confirming…'
                    : canDriverConfirmReceipt
                      ? driverConfirmReceiptButtonText
                      : 'Received Confirmed'}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                data-screenshot-exclude="true"
                onClick={handleReportIncident}
                data-tour="dispatch-report-incident"
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                Report Incident
              </Button>
            </div>
          )}

          {(isOwner || isTruckUser) && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                data-screenshot-exclude="true"
                onClick={handleReportIncident}
                data-tour="dispatch-report-incident"
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                Report Incident
              </Button>
              {isOwner && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  disabled={isCreatingScreenshot || isEditingTrucks}
                  onClick={handleScreenshotDispatch}
                  data-tour="dispatch-screenshot"
                >
                  <Camera className="h-3.5 w-3.5 mr-1" />
                  {isCreatingScreenshot ? 'Creating…' : 'Screenshot Dispatch'}
                </Button>
              )}
            </div>
          )}

          <div ref={screenshotSectionRef} className="space-y-6 bg-white">
            {/* Main info */}
            {dispatch.status === 'Scheduled' ? (
              <div>
                <h2 className="text-sm font-semibold text-slate-700">Scheduled Dispatch</h2>
                <p className="text-sm text-blue-600 mt-1 italic">{scheduledStatusMessage}</p>
                <p className="text-xs text-slate-600 mt-2 italic">{scheduledDispatchNote}</p>
              </div>
            ) : (
              <div className="space-y-4">
              <div className="space-y-1">
                {dispatch.client_name && (
                  <h2 className="text-lg font-semibold text-slate-800">{dispatch.client_name}</h2>
                )}
                {!hasAdditional && (
                  <div className="grid grid-cols-1 text-sm">
                    {dispatch.job_number && (
                      <div className="flex items-center gap-2 text-slate-700">
                        <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="font-bold">Job #</span>
                        <Badge className={jobNumberBadgeClassName}>
                          {dispatch.job_number}
                        </Badge>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2.5 pt-1">
                <p className="text-xs font-bold text-slate-400">Working for CCG Transit</p>

              {/* Trucks */}
              <div className="space-y-2">
                <div className="flex items-start gap-1.5">
                  <Truck className="h-3.5 w-3.5 text-slate-400 mt-1 shrink-0" />
                  {(isAdmin || isOwner) ? (
                    <div className="min-w-0 flex-1 space-y-1.5">
                      {visibleTrucks.map((t) => (
                        <div key={t} className="flex items-start gap-2">
                          <Badge variant="outline" className="text-xs border-slate-900 text-slate-900 font-medium shrink-0">
                            {t}
                          </Badge>
                          <span className="text-xs text-slate-500 min-w-0 break-words leading-5">
                            {getTruckDriverSummaryLabel(t)}
                          </span>
                          {hasTruckReceiptConfirmation(t) && (
                            <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-semibold py-0 px-1.5">
                              Confirmed
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {visibleTrucks.map((t) => (
                        <Badge key={t} variant="outline" className="text-xs border-slate-900 text-slate-900 font-medium w-fit">
                          {t}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {isOwner && (
                    <Button
                      type="button"
                      data-screenshot-exclude="true"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
                      data-tour="dispatch-edit-trucks"
                      onClick={() => {
                        if (isEditingTrucks) {
                          resetTruckEditing();
                          return;
                        }
                        setTruckEditMessage(null);
                        setIsEditingTrucks((prev) => !prev);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      {isEditingTrucks ? 'Cancel' : 'Edit Trucks'}
                    </Button>
                  )}
                </div>

                {isOwner && isEditingTrucks && (
                  <div data-screenshot-exclude="true" className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                    <p className="text-xs text-slate-500">
                      Select assigned trucks. You must keep exactly {requiredTruckCount} truck{requiredTruckCount === 1 ? '' : 's'}.
                    </p>
                    <div className="space-y-2">
                      {ownerTruckOptions.map((truck) => (
                        <label key={truck} className="flex items-center gap-2 text-sm text-slate-700">
                          <Checkbox
                            checked={draftTrucks.includes(truck)}
                            disabled={!draftTrucks.includes(truck) && draftTrucks.filter(Boolean).length >= requiredTruckCount}
                            onCheckedChange={() => toggleDraftTruck(truck)}
                          />
                          <span className="font-mono">{truck}</span>
                        </label>
                      ))}
                    </div>
                    {truckEditMessage?.text && (
                      <div className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
                        {truckEditMessage.text}
                      </div>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      className="bg-emerald-600 hover:bg-emerald-700 text-white"
                      disabled={!hasTruckDraftChanges || isSavingTrucks || draftTrucks.filter(Boolean).length !== requiredTruckCount}
                      onClick={handleSaveTrucks}
                    >
                      {isSavingTrucks ? 'Saving…' : 'Save Truck Assignments'}
                    </Button>
                  </div>
                )}

              </div>
              </div>
            </div>
          )}

          {dispatch.status !== 'Scheduled' && (
            <>
              {(() => {
                const normalizedStatus = String(dispatch.status || '').toLowerCase();
                const isCanceled = normalizedStatus === 'cancelled' || normalizedStatus === 'canceled';
                const isAmended = normalizedStatus === 'amended';

                if (!dispatch.canceled_reason || (!isCanceled && !isAmended)) return null;

                const amendmentBadgeClasses = statusBadgeColors.Amended || '';

                return (
                  <div className={`flex items-start gap-2 rounded-lg p-4 ${isAmended ? amendmentBadgeClasses : 'bg-red-50'}`}>
                    <AlertTriangle className={`h-4 w-4 mt-0.5 shrink-0 ${isAmended ? 'text-amber-700' : 'text-red-500'}`} />
                    <div>
                      <p className={`text-xs font-semibold mb-0.5 ${isAmended ? 'text-amber-700' : 'text-red-700'}`}>{isCanceled ? 'Cancellation' : 'Amendment'}</p>
                      <p className={`text-sm ${isAmended ? 'text-amber-700' : 'text-red-600'}`}>{dispatch.canceled_reason}</p>
                    </div>
                  </div>
                );
              })()}

              {(hasAdditional || dispatch.instructions || dispatch.notes || dispatch.toll_status || dispatch.start_time || dispatch.start_location) && (
                <div data-tour="dispatch-assignment-details" className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">
                    {(dispatch.additional_assignments || []).length > 0 ? 'Assignment 1' : 'Assignment'}
                  </p>
                  {hasAdditional && (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="font-bold">Job #</span>
                        {dispatch.job_number && (
                          <Badge className={jobNumberBadgeClassName}>
                            {dispatch.job_number}
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                  {dispatch.start_time && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                      <span>{formatTimeToAmPm(dispatch.start_time)}</span>
                    </div>
                  )}
                  {dispatch.start_location && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 mb-1">Start Location:</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{dispatch.start_location}</p>
                    </div>
                  )}
                  {dispatch.instructions && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 mb-1">Instructions:</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{dispatch.instructions}</p>
                    </div>
                  )}
                  {dispatch.notes && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 mb-1">Notes</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{dispatch.notes}</p>
                    </div>
                  )}
                  {dispatch.toll_status && (
                    <Badge className={`${tollColors[dispatch.toll_status]} text-xs font-medium`}>
                      Toll: {dispatch.toll_status}
                    </Badge>
                  )}
                </div>
              )}

              {(dispatch.additional_assignments || []).length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Additional Assignments</p>
                  <div className="space-y-3">
                    {dispatch.additional_assignments.map((a, i) => (
                      <div key={i} className={`rounded-lg border border-slate-200 p-3 text-sm ${i % 2 === 0 ? 'bg-slate-50' : 'bg-blue-50/40'}`}>
                        <p className="text-xs font-semibold text-slate-500 mb-2">Assignment {i + 2}</p>
                        <div className="space-y-1.5">
                          {a.job_number && (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2 text-slate-700">
                                <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span className="font-bold">Job #</span>
                                <Badge className={jobNumberBadgeClassName}>
                                  {a.job_number}
                                </Badge>
                              </div>
                            </div>
                          )}
                          {a.start_time && (
                            <div className="flex items-center gap-2 text-slate-600">
                              <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span>{formatTimeToAmPm(a.start_time)}</span>
                            </div>
                          )}
                          {a.start_location && (
                            <div>
                              <p className="text-xs font-semibold text-slate-400 mb-0.5">Start Location:</p>
                              <p className="text-sm text-slate-600 whitespace-pre-wrap">{a.start_location}</p>
                            </div>
                          )}
                          {a.instructions && (
                            <div>
                              <p className="text-xs font-semibold text-slate-400 mb-0.5">Instructions:</p>
                              <p className="text-sm text-slate-600 whitespace-pre-wrap">{a.instructions}</p>
                            </div>
                          )}
                          {a.notes && (
                            <div>
                              <p className="text-xs font-semibold text-slate-400 mb-0.5">Notes</p>
                              <p className="text-sm text-slate-600 whitespace-pre-wrap">{a.notes}</p>
                            </div>
                          )}
                          {a.toll_status && (
                            <Badge className={`${tollColors[a.toll_status]} text-xs font-medium`}>
                              Toll: {a.toll_status}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {boxNotes.length > 0 && (
                <div data-tour="dispatch-notes" className="space-y-1.5">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Box Notes</p>
                  <div className="grid grid-cols-2 gap-1.5 md:gap-2">
                    {boxNotes.map(n => (
                      <div key={n.id} className={`rounded-lg border p-2.5 md:p-3 ${getNoteColumnClass(n.displayWidth, false)}`} style={{ borderColor: n.border_color, color: n.text_color }}>
                        {n.title && <p className="text-sm font-semibold leading-snug mb-0.5">{n.title}</p>}
                        <p
                          className="text-sm leading-snug"
                          dangerouslySetInnerHTML={{ __html: renderSimpleMarkupToHtml(n.box_content || n.note_text) }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {generalNotes.length > 0 && (
                <div data-tour="dispatch-notes" className="space-y-1.5">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">General Notes</p>
                  <div className="grid grid-cols-2 gap-1.5 md:gap-2">
                    {generalNotes.map(n => {
                      const { bullets, shouldSpanWide } = getGeneralNoteLayout(n);

                      if (bullets.length === 0 && !n.title) return null;

                      return (
                        <div
                          key={n.id}
                          className={`rounded-lg border border-slate-200 bg-white/90 p-2.5 md:p-3 ${getNoteColumnClass(n.displayWidth, shouldSpanWide)}`}
                        >
                          {n.title && <p className="text-sm text-slate-700 font-semibold leading-snug mb-0.5">{n.title}</p>}
                          <ul className="mt-0.5 space-y-0.5 list-disc ml-4">
                            {bullets.map((line, idx) => (
                              <li key={`${n.id}-${idx}`} className="text-sm text-slate-600 leading-snug">{line}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              </>
            )}
          </div>

          {/* Actions */}
          {(isOwner || isAdmin || isDriverUser) && (
            <div className="space-y-4 pt-2 border-t border-slate-100">

              <DispatchDriverConfirmationSection
                isOwner={isOwner}
                isAdmin={isAdmin}
                showOwnerAssignmentsAndTimeLogs={showOwnerAssignmentsAndTimeLogs}
                myTrucks={myTrucks}
                currentConfType={currentConfType}
                isTruckConfirmedForCurrent={isTruckConfirmedForCurrent}
                getTruckCurrentConfirmation={getTruckCurrentConfirmation}
                getTruckPriorConfirmations={getTruckPriorConfirmations}
                handleConfirmTruck={handleConfirmTruck}
                formatLogTimestampWithActor={formatLogTimestampWithActor}
                getEntryActorLabel={getEntryActorLabel}
                dispatch={dispatch}
                eligibleDrivers={eligibleDrivers}
                selectedDriverByTruck={selectedDriverByTruck}
                handleDriverSelection={handleDriverSelection}
                assignDriverMutation={assignDriverMutation}
                unassignedDriverValue={UNASSIGNED_DRIVER_VALUE}
                conflictingDriverAssignmentsById={conflictingDriverAssignmentsById}
                driverAssignmentErrors={driverAssignmentErrors}
                confirmations={confirmations}
              />

              <DispatchTimeLogSection
                isOwner={isOwner}
                isDriverUser={isDriverUser}
                isAdmin={isAdmin}
                showOwnerAssignmentsAndTimeLogs={showOwnerAssignmentsAndTimeLogs}
                dispatchStatus={dispatch.status}
                myTrucks={myTrucks}
                visibleTrucks={visibleTrucks}
                assignedTrucks={dispatch.trucks_assigned || []}
                timeLogSectionRef={timeLogSectionRef}
                draftTimeEntries={draftTimeEntries}
                timeEntries={timeEntries}
                dispatch={dispatch}
                onChangeDraft={handleChangeDraft}
                onCopyToAll={handleCopyToAll}
                onSaveAll={handleSaveAll}
                hasUnsavedChanges={hasUnsavedChanges}
                isSavingAll={isSavingAll}
                entriesToSave={entriesToSave}
                TruckTimeRow={TruckTimeRow}
              />


              {/* Activity — Admin */}
              {isAdmin && (
                <DispatchActivityLogSection
                  activityLog={dispatch.admin_activity_log}
                  formatActivityTimestamp={formatActivityTimestamp}
                />
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
