import React from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Moon, Search, Sun } from 'lucide-react';

function LiveDispatchLineRow({ line, jobAccent, onOpenDispatch, onChangeLiveStatus, statusUpdatingKey, liveStatusOptions, getLiveStatusClasses }) {
  return (
    <div
      className={`rounded-lg border px-3.5 py-3 ${line.isPlaceholder ? 'border-dashed border-slate-300 bg-slate-50' : 'border-slate-200 bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]'}`}
      style={line.isPlaceholder ? undefined : { borderLeftWidth: '4px', borderLeftColor: jobAccent.accent, backgroundColor: jobAccent.rowTint }}>
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
                {liveStatusOptions.map((option) => <SelectItem key={option} value={option}>{option}</SelectItem>)}
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
  );
}

function LiveDispatchJobBlock({ job, jobAccent, onAdjustRequestedCount, requestUpdatingKey, onOpenDispatch, onChangeLiveStatus, statusUpdatingKey, liveStatusOptions, getLiveStatusClasses }) {
  return (
    <article className="rounded-xl border border-slate-300 bg-slate-100/80 shadow-sm overflow-hidden">
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
          <LiveDispatchLineRow
            key={line.lineKey}
            line={line}
            jobAccent={jobAccent}
            onOpenDispatch={onOpenDispatch}
            onChangeLiveStatus={onChangeLiveStatus}
            statusUpdatingKey={statusUpdatingKey}
            liveStatusOptions={liveStatusOptions}
            getLiveStatusClasses={getLiveStatusClasses} />
        )}
      </div>
    </article>
  );
}

function LiveDispatchShiftSection({ shiftGroup, getJobAccentByShift, onAdjustRequestedCount, requestUpdatingKey, onOpenDispatch, onChangeLiveStatus, statusUpdatingKey, liveStatusOptions, getLiveStatusClasses }) {
  return (
    <section className="space-y-4">
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
            <LiveDispatchJobBlock
              key={job.groupKey}
              job={job}
              jobAccent={jobAccent}
              onAdjustRequestedCount={onAdjustRequestedCount}
              requestUpdatingKey={requestUpdatingKey}
              onOpenDispatch={onOpenDispatch}
              onChangeLiveStatus={onChangeLiveStatus}
              statusUpdatingKey={statusUpdatingKey}
              liveStatusOptions={liveStatusOptions}
              getLiveStatusClasses={getLiveStatusClasses} />
          );
        })}
      </div>
    </section>
  );
}

export default function LiveDispatchBoard({
  selectedDate,
  groupedShifts,
  onMoveWindow,
  boardSearch,
  onBoardSearch,
  onOpenDispatch,
  onChangeLiveStatus,
  onAdjustRequestedCount,
  statusUpdatingKey,
  requestUpdatingKey,
  getJobAccentByShift,
  getLiveStatusClasses,
  liveStatusOptions
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
                <LiveDispatchShiftSection
                  key={shiftGroup.shift}
                  shiftGroup={shiftGroup}
                  getJobAccentByShift={getJobAccentByShift}
                  onAdjustRequestedCount={onAdjustRequestedCount}
                  requestUpdatingKey={requestUpdatingKey}
                  onOpenDispatch={onOpenDispatch}
                  onChangeLiveStatus={onChangeLiveStatus}
                  statusUpdatingKey={statusUpdatingKey}
                  liveStatusOptions={liveStatusOptions}
                  getLiveStatusClasses={getLiveStatusClasses} />
              )}
            </CardContent>
          </Card>
        </div>
      }
    </div>
  );
}
