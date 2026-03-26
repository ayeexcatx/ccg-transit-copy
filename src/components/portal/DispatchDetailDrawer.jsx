import React, { useMemo, useState, useEffect } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Truck } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import {
  canCompanyOwnerViewAssignmentsAndTimeLogs,
} from './statusConfig';
import { NOTE_DISPLAY_WIDTH, NOTE_TYPES, normalizeTemplateNote } from '@/lib/templateNotes';
import { calculateWorkedHours, formatTime24h, formatWorkedHours } from '@/lib/timeLogs';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';
import DispatchActivityLogSection from './DispatchActivityLogSection';
import DispatchTimeLogSection from './DispatchTimeLogSection';
import DispatchDriverConfirmationSection from './DispatchDriverConfirmationSection';
import DispatchDrawerTopBar from './DispatchDrawerTopBar';
import DispatchDrawerActionButtons from './DispatchDrawerActionButtons';
import DispatchDrawerIdentitySection from './DispatchDrawerIdentitySection';
import DispatchDrawerStatusReasonBox from './DispatchDrawerStatusReasonBox';
import DispatchDrawerAssignmentsSection from './DispatchDrawerAssignmentsSection';
import DispatchDrawerTemplateNotesSection from './DispatchDrawerTemplateNotesSection';
import { getVisibleTrucksForDispatch } from '@/lib/dispatchVisibility';
import { buildConfirmedTruckSetForStatus } from '@/components/notifications/confirmationStateHelpers';
import { deactivateDriverAssignment, upsertDriverAssignment } from '@/services/driverAssignmentMutationService';

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

  const myTrucks = getVisibleTrucksForDispatch(session, dispatch);
  const isOwner = session.code_type === 'CompanyOwner';
  const isAdmin = session.code_type === 'Admin';
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
      const { savedAssignment } = await upsertDriverAssignment({
        dispatch,
        driverAssignments: previousAssignments,
        truckNumber,
        driver,
        session,
        buildActivityEntries: ({ truckNumber: nextTruckNumber, previousAssignment, nextAssignment }) =>
          buildDriverAssignmentActivityEntries({
            session,
            truckNumber: nextTruckNumber,
            previousAssignment,
            nextAssignment,
          }),
        appendActivityEntries: appendDispatchActivityEntries,
      });

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
      const { removed } = await deactivateDriverAssignment({
        dispatch,
        driverAssignments,
        truckNumber,
        buildActivityEntries: ({ truckNumber: nextTruckNumber, previousAssignment, nextAssignment }) =>
          buildDriverAssignmentActivityEntries({
            session,
            truckNumber: nextTruckNumber,
            previousAssignment,
            nextAssignment,
          }),
        appendActivityEntries: appendDispatchActivityEntries,
      });
      if (!removed) return;
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

  const visibleTrucks = getVisibleTrucksForDispatch(session, dispatch, {
    driverAssignedTrucks,
  });
  const activeAssignmentsByTruck = (isOwner || isAdmin ? driverAssignments : currentDriverAssignments)
    .filter((entry) => entry?.active_flag !== false && entry?.truck_number)
    .reduce((map, entry) => {
      map[entry.truck_number] = entry;
      return map;
    }, {});

  const hasTruckSeenStatus = (truckNumber) => Boolean(activeAssignmentsByTruck[truckNumber]?.receipt_confirmed_at);

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

  const companyHasDrivers = companyDrivers.length > 0;
  const shouldShowDriverAssignmentControls = !isOwner || companyHasDrivers;
  const shouldShowUnassignedDriverLabel = shouldShowDriverAssignmentControls;

  const getTruckDriverSummaryLabel = (truckNumber) => {
    if (!isOwner) return assignedDriverNameByTruck[truckNumber] || 'Unassigned';

    const selectedDriverId = selectedDriverByTruck[truckNumber];
    if (selectedDriverId === UNASSIGNED_DRIVER_VALUE) {
      return shouldShowUnassignedDriverLabel ? 'No driver assigned' : null;
    }
    if (selectedDriverId && eligibleDriverNameById[selectedDriverId]) {
      return eligibleDriverNameById[selectedDriverId];
    }

    return assignedDriverNameByTruck[truckNumber] || (shouldShowUnassignedDriverLabel ? 'No driver assigned' : null);
  };

  const currentConfType = dispatch.status;
  const currentConfirmedTruckSet = buildConfirmedTruckSetForStatus({
    confirmations,
    dispatchId: dispatch.id,
    status: currentConfType,
  });
  const hasAdditional = Array.isArray(dispatch.additional_assignments) && dispatch.additional_assignments.length > 0;

  const normalizedTemplateNotes = (templateNotes || []).map(normalizeTemplateNote);
  const boxNotes = normalizedTemplateNotes.filter(n => n.note_type === NOTE_TYPES.BOX);
  const generalNotes = normalizedTemplateNotes.filter(n => n.note_type !== NOTE_TYPES.BOX);

  const isTruckConfirmedForCurrent = (truck) => currentConfirmedTruckSet.has(truck);

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
        <DispatchDrawerTopBar
          dispatch={dispatch}
          displayDate={displayDate}
          isOwner={isOwner}
          open={open}
          onBack={handleDrawerClose}
        />

        <div className="px-5 py-5 space-y-6">
          <DispatchDrawerActionButtons
            isDriverUser={isDriverUser}
            isOwner={isOwner}
            isCreatingScreenshot={isCreatingScreenshot}
            isEditingTrucks={isEditingTrucks}
            onReportIncident={handleReportIncident}
            onScreenshotDispatch={handleScreenshotDispatch}
          />

          <div ref={screenshotSectionRef} className="space-y-6 bg-white">
            <DispatchDrawerIdentitySection
              dispatch={dispatch}
              hasAdditional={hasAdditional}
              jobNumberBadgeClassName={jobNumberBadgeClassName}
              isAdmin={isAdmin}
              isOwner={isOwner}
              visibleTrucks={visibleTrucks}
              getTruckDriverSummaryLabel={getTruckDriverSummaryLabel}
              hasTruckSeenStatus={hasTruckSeenStatus}
              isEditingTrucks={isEditingTrucks}
              onToggleEditingTrucks={() => {
                if (isEditingTrucks) {
                  resetTruckEditing();
                  return;
                }
                setTruckEditMessage(null);
                setIsEditingTrucks((prev) => !prev);
              }}
              requiredTruckCount={requiredTruckCount}
              ownerTruckOptions={ownerTruckOptions}
              draftTrucks={draftTrucks}
              toggleDraftTruck={toggleDraftTruck}
              truckEditMessage={truckEditMessage}
              hasTruckDraftChanges={hasTruckDraftChanges}
              isSavingTrucks={isSavingTrucks}
              onSaveTrucks={handleSaveTrucks}
            />

          {dispatch.status !== 'Scheduled' && (
            <>
              <DispatchDrawerStatusReasonBox dispatch={dispatch} />
              <DispatchDrawerAssignmentsSection
                dispatch={dispatch}
                hasAdditional={hasAdditional}
                formatTimeToAmPm={formatTimeToAmPm}
              />
              <DispatchDrawerTemplateNotesSection
                boxNotes={boxNotes}
                generalNotes={generalNotes}
                NOTE_DISPLAY_WIDTH={NOTE_DISPLAY_WIDTH}
              />

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
                shouldShowDriverAssignmentControls={shouldShowDriverAssignmentControls}
              />

              {!isDriverUser && (
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
              )}


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
