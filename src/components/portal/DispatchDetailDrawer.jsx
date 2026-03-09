import React, { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  CheckCircle2, Clock, Truck, Sun, Moon,
  FileText, AlertTriangle, Save, History, ArrowLeft, Pencil, Camera
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { statusBadgeColors } from './statusConfig';
import { NOTE_TYPES, normalizeTemplateNote, renderSimpleMarkupToHtml } from '@/lib/templateNotes';
import { calculateWorkedHours, formatTime24h, formatWorkedHours } from '@/lib/timeLogs';
import { toast } from 'sonner';
import html2canvas from 'html2canvas';

const tollColors = {
  Authorized: 'bg-green-50 text-green-700',
  Unauthorized: 'bg-red-50 text-red-700',
  'Included in Rate': 'bg-purple-50 text-purple-700',
};


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

function buildDispatchCopyText({ dispatch, trucks, boxNotes, generalTemplateNotes }) {
  const lines = ['CCG DISPATCH'];
  const dateValue = dispatch?.date ? format(parseISO(dispatch.date), 'MM-dd-yyyy') : '';

  const appendLine = (label, value) => {
    if (!value) return;
    lines.push(`${label}: ${value}`);
  };

  lines.push('');
  appendLine('Date', dateValue);
  appendLine('Shift', dispatch?.shift_time);
  appendLine('Status', dispatch?.status);

  lines.push('');
  appendLine('Client', dispatch?.client_name);
  appendLine('Job Number', dispatch?.job_number);
  if (Array.isArray(trucks) && trucks.length > 0) appendLine('Trucks Assigned', trucks.join(', '));

  lines.push('');
  appendLine('Start Time', formatTimeToAmPm(dispatch?.start_time));
  appendLine('Start Location', dispatch?.start_location);

  if (dispatch?.instructions) {
    lines.push('');
    lines.push('Instructions:');
    lines.push(dispatch.instructions);
  }

  const templateLines = [];
  boxNotes.forEach((note) => {
    if (note?.title) templateLines.push(note.title);
    if (note?.box_content) templateLines.push(note.box_content);
    else if (note?.note_text) templateLines.push(note.note_text);
  });
  generalTemplateNotes.forEach((note) => {
    if (note?.title) templateLines.push(note.title);
    if (Array.isArray(note?.bullet_lines) && note.bullet_lines.length > 0) {
      note.bullet_lines.forEach((line) => templateLines.push(line));
      return;
    }
    if (note?.note_text) templateLines.push(note.note_text);
  });

  if (templateLines.length > 0) {
    lines.push('');
    lines.push('Dispatch Template Notes:');
    lines.push(templateLines.join('\n'));
  }

  if (dispatch?.notes) {
    lines.push('');
    lines.push('General Notes:');
    lines.push(dispatch.notes);
  }

  if (dispatch?.toll_status) {
    lines.push('');
    appendLine('Toll Status', dispatch.toll_status);
  }

  const additionalAssignments = (dispatch?.additional_assignments || []).filter((assignment) => (
    assignment?.job_number || assignment?.start_time || assignment?.start_location || assignment?.instructions || assignment?.notes
  ));

  if (additionalAssignments.length > 0) {
    lines.push('');
    lines.push('Additional Assignments:');
    additionalAssignments.forEach((assignment, index) => {
      const summaryParts = [assignment.job_number, formatTimeToAmPm(assignment.start_time), assignment.start_location].filter(Boolean);
      lines.push(`${index + 1}. ${summaryParts.join(' | ')}`);
      if (assignment.instructions) lines.push(`   Instructions: ${assignment.instructions}`);
      if (assignment.notes) lines.push(`   Notes: ${assignment.notes}`);
    });
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
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
  onConfirm, onTimeEntry, onOwnerTruckUpdate, companyName, open, onClose
}) {
  const [draftTimeEntries, setDraftTimeEntries] = useState({});
  const [isSavingAll, setIsSavingAll] = useState(false);
  const drawerScrollRef = React.useRef(null);
  const timeLogSectionRef = React.useRef(null);
  const [isEditingTrucks, setIsEditingTrucks] = useState(false);
  const [draftTrucks, setDraftTrucks] = useState([]);
  const [isSavingTrucks, setIsSavingTrucks] = useState(false);
  const [truckEditMessage, setTruckEditMessage] = useState(null);
  const [isCreatingScreenshot, setIsCreatingScreenshot] = useState(false);
  const screenshotSectionRef = React.useRef(null);

  useEffect(() => {
    setDraftTimeEntries({});
  }, [dispatch?.id]);

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

  if (!dispatch) return null;

  const myTrucks = (session?.allowed_trucks || []).filter(t =>
    (dispatch?.trucks_assigned || []).includes(t)
  );
  const isOwner = session.code_type === 'CompanyOwner';
  const isAdmin = session.code_type === 'Admin';
  const primaryReferenceTag = String(dispatch.reference_tag || '').trim();
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

  const handleCopyDispatch = async () => {
    const copyText = buildDispatchCopyText({
      dispatch,
      trucks: myTrucks,
      boxNotes,
      generalTemplateNotes: generalNotes,
    });

    try {
      await navigator.clipboard.writeText(copyText);
      toast.success('Dispatch copied to clipboard.');
    } catch {
      toast.error('Unable to copy dispatch details.');
    }
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
    try {
      const canvas = await html2canvas(target, {
        backgroundColor: '#ffffff',
        scale: Math.min(window.devicePixelRatio || 1, 2),
        useCORS: true,
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
      setIsCreatingScreenshot(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) handleDrawerClose(); }}>
      <SheetContent ref={drawerScrollRef} side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
        {/* Top bar */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 z-10">
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

          {isOwner && (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={handleCopyDispatch}
              >
                Copy Dispatch
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                disabled={isCreatingScreenshot || isEditingTrucks}
                onClick={handleScreenshotDispatch}
              >
                <Camera className="h-3.5 w-3.5 mr-1" />
                {isCreatingScreenshot ? 'Creating…' : 'Screenshot Dispatch'}
              </Button>
            </div>
          )}

          <div ref={screenshotSectionRef} className="space-y-6 bg-white">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="font-semibold text-slate-500">Date</p>
                <p className="text-slate-700">{displayDate || '—'}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">Shift</p>
                <p className="text-slate-700">{dispatch.shift_time || '—'}</p>
              </div>
              <div>
                <p className="font-semibold text-slate-500">Status</p>
                <p className="text-slate-700">{dispatch.status || '—'}</p>
              </div>
            </div>

            {/* Main info */}
            {dispatch.status === 'Scheduled' ? (
              <div>
                <h2 className="text-sm font-semibold text-slate-700">Scheduled Dispatch</h2>
                <p className="text-sm text-blue-600 mt-1 italic">Your truck has been scheduled — details will follow</p>
              </div>
            ) : (
              <div className="space-y-3">
              {dispatch.client_name && (
                <h2 className="text-sm font-semibold text-slate-700">{dispatch.client_name}</h2>
              )}
              {!hasAdditional && (
                <div className="grid grid-cols-1 gap-3 text-sm">
                  {dispatch.job_number && (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 text-slate-600">
                        <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                        <span>Job #{dispatch.job_number}</span>
                      </div>
                      {primaryReferenceTag && (
                        <p className="text-xs text-slate-400 pl-6">Reference Tag: {primaryReferenceTag}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              {companyName && (
                <p className="text-xs text-slate-400">{companyName}</p>
              )}

              {/* Trucks */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Truck className="h-3.5 w-3.5 text-slate-400" />
                  {myTrucks.map(t => (
                    <Badge key={t} variant="outline" className="text-xs border-slate-900 text-slate-900 font-medium">
                      {t}
                    </Badge>
                  ))}
                  {isOwner && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800"
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
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
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
          )}

          {dispatch.status !== 'Scheduled' && (
            <>
              {(hasAdditional || dispatch.instructions || dispatch.notes || dispatch.toll_status || dispatch.start_time || dispatch.start_location) && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                  <p className="text-xs text-slate-500 uppercase tracking-wide">Assignment 1</p>
                  {hasAdditional && (
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                        <span>Job Number{dispatch.job_number ? `: ${dispatch.job_number}` : ''}</span>
                      </div>
                      {primaryReferenceTag && (
                        <p className="text-xs text-slate-400 pl-6">Reference Tag: {primaryReferenceTag}</p>
                      )}
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
                              <div className="flex items-center gap-2 text-slate-600">
                                <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                <span>Job Number: {a.job_number}</span>
                              </div>
                              {String(a.reference_tag || '').trim() && (
                                <p className="text-xs text-slate-400 pl-[1.375rem]">Reference Tag: {String(a.reference_tag || '').trim()}</p>
                              )}
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
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Box Notes</p>
                  <div className="space-y-2">
                    {boxNotes.map(n => (
                      <div key={n.id} className="rounded-lg border p-3" style={{ borderColor: n.border_color, color: n.text_color }}>
                        {n.title && <p className="text-sm font-semibold mb-1">{n.title}</p>}
                        <p
                          className="text-sm leading-relaxed"
                          dangerouslySetInnerHTML={{ __html: renderSimpleMarkupToHtml(n.box_content || n.note_text) }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {generalNotes.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-1.5">General Notes</p>
                  <div className="space-y-3">
                    {generalNotes.map(n => {
                      const bullets = n.bullet_lines?.length > 0
                        ? n.bullet_lines
                        : n.note_text
                          ? [n.note_text]
                          : [];

                      if (bullets.length === 0 && !n.title) return null;

                      return (
                        <div key={n.id}>
                          {n.title && <p className="text-sm text-slate-700 font-semibold underline">{n.title}</p>}
                          <ul className="mt-1 space-y-1 list-disc ml-4">
                            {bullets.map((line, idx) => (
                              <li key={`${n.id}-${idx}`} className="text-sm text-slate-600">{line}</li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

                {dispatch.canceled_reason && (
                  <div className="flex items-start gap-2 bg-red-50 rounded-lg p-4">
                    <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-red-700 mb-0.5">Cancellation Reason</p>
                      <p className="text-sm text-red-600">{dispatch.canceled_reason}</p>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          {(isOwner || isAdmin) && (
            <div className="space-y-4 pt-2 border-t border-slate-100">

              {/* CompanyOwner confirm */}
              {isOwner && myTrucks.length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">
                    Confirm Receipt — <span className="text-slate-700">{currentConfType}</span>
                  </p>
                  <div className="space-y-2">
                    {myTrucks.map(truck => {
                      const confirmed = isTruckConfirmedForCurrent(truck);
                      const conf = getTruckCurrentConfirmation(truck);
                      const priorConfs = getTruckPriorConfirmations(truck);
                      return (
                        <div key={truck} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Truck className="h-3.5 w-3.5 text-slate-400" />
                              <span className="text-sm font-mono font-medium">{truck}</span>
                            </div>
                            {confirmed ? (
                              <div className="flex items-center gap-1.5 text-emerald-600">
                                <CheckCircle2 className="h-4 w-4" />
                                <span className="text-xs font-medium">Confirmed</span>
                                {conf?.confirmed_at && (
                                  <span className="text-xs text-slate-400 ml-1">
                                    {format(new Date(conf.confirmed_at), 'MMM d, h:mm a')}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                className="bg-slate-900 hover:bg-slate-800 h-7 text-xs"
                                onClick={() => handleConfirmTruck(truck)}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                Confirm Receipt
                              </Button>
                            )}
                          </div>
                          {priorConfs.length > 0 && (
                            <div className="border-t border-slate-100 px-3 py-2 bg-slate-50">
                              <p className="text-xs text-slate-400 mb-1">Prior confirmations:</p>
                              {priorConfs.map((c, i) => (
                                <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                                  <CheckCircle2 className="h-3 w-3 text-slate-400" />
                                  <span className="font-medium">{c.confirmation_type}</span>
                                  {c.confirmed_at && (
                                    <span className="text-slate-400">{format(new Date(c.confirmed_at), 'MMM d, h:mm a')}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Time Log — CompanyOwner (editable) — only for non-canceled */}
              {isOwner && myTrucks.length > 0 && dispatch.status !== 'Cancelled' && (
                <div id="time-log-section" ref={timeLogSectionRef}>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Time Log</p>
                  <div className="space-y-2">
                    {myTrucks.map(truck => (
                      <TruckTimeRow
                        key={truck}
                        truck={truck}
                        dispatch={dispatch}
                        timeEntries={timeEntries}
                        readOnly={false}
                        draft={draftTimeEntries[truck]}
                        onChangeDraft={handleChangeDraft}
                        onCopyToAll={handleCopyToAll}
                        isFirstRow={truck === myTrucks[0]}
                      />
                    ))}
                  </div>
                  <div className="pt-3">
                    <Button
                      type="button"
                      onClick={handleSaveAll}
                      disabled={!hasUnsavedChanges || isSavingAll || entriesToSave.length === 0}
                      className="w-full bg-slate-900 hover:bg-slate-800"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {isSavingAll ? 'Saving…' : 'Save All Time Logs'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Confirmations — Admin (read-only) */}
              {isAdmin && (dispatch.trucks_assigned || []).length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                    <History className="h-3.5 w-3.5" />Confirmations
                  </p>
                  <div className="space-y-2">
                    {(dispatch.trucks_assigned || []).map(truck => {
                      const truckConfs = confirmations
                        .filter(c => c.truck_number === truck)
                        .sort((a, b) => new Date(b.confirmed_at || 0) - new Date(a.confirmed_at || 0));
                      return (
                        <div key={truck} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                          <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
                            <Truck className="h-3.5 w-3.5 text-slate-400" />
                            <span className="text-sm font-mono font-medium text-slate-800">{truck}</span>
                          </div>
                          {truckConfs.length === 0 ? (
                            <p className="text-xs text-slate-400 italic px-3 py-2">No confirmations yet</p>
                          ) : (
                            <div className="divide-y divide-slate-100">
                              {truckConfs.map((c, i) => (
                                <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
                                  <div className="flex items-center gap-2">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                                    <Badge className={`${statusBadgeColors[c.confirmation_type]} border text-xs py-0`}>{c.confirmation_type}</Badge>
                                  </div>
                                  {c.confirmed_at && (
                                    <span className="text-slate-400">{format(new Date(c.confirmed_at), 'MMM d, h:mm a')}</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Time Log — Admin (read-only) */}
              {isAdmin && (dispatch.trucks_assigned || []).length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wide mb-2">Time Log</p>
                  <div className="space-y-1.5">
                    {(dispatch.trucks_assigned || []).map(truck => (
                      <TruckTimeRow
                        key={truck}
                        truck={truck}
                        dispatch={dispatch}
                        timeEntries={timeEntries}
                        readOnly={true}
                      />
                    ))}
                  </div>
                </div>
              )}


              {/* Activity — Admin */}
              {isAdmin && (
                <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5">
                  <p className="text-[11px] text-amber-800 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                    <History className="h-3.5 w-3.5" />Activity
                  </p>
                  {Array.isArray(dispatch.admin_activity_log) && dispatch.admin_activity_log.length > 0 ? (
                    <ul className="space-y-1">
                      {dispatch.admin_activity_log.map((entry, idx) => (
                        <li key={`${entry.timestamp || 'activity'}-${idx}`} className="text-[11px] leading-tight text-slate-700 flex items-start gap-1.5">
                          <span className="text-amber-600 mt-[1px]">•</span>
                          <span className="min-w-0">
                            {entry.message || entry.action || 'Activity update'}
                            <span className="text-slate-400">{' — '}{formatActivityTimestamp(entry.timestamp)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">No activity yet.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
