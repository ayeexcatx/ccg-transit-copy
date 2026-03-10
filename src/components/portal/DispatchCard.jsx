import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Clock, Truck, Sun, Moon,
  FileText, ChevronDown
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import DispatchDetailDrawer from './DispatchDetailDrawer';
import { statusBadgeColors, statusBorderAccent } from './statusConfig';

const formatDispatchTime = (startTime) => {
  if (!startTime) return '';

  const time = String(startTime).trim();
  if (!time) return '';

  const amPmMatch = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp][Mm])$/);
  if (amPmMatch) {
    const [, hourRaw, minute, periodRaw] = amPmMatch;
    let hour = Number(hourRaw);
    if (!Number.isFinite(hour) || hour < 1) hour = 12;
    if (hour > 12) hour = hour % 12 || 12;
    return `${hour}:${minute} ${periodRaw.toUpperCase()}`;
  }

  const hhMmMatch = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!hhMmMatch) return time;

  let hour24 = Number(hhMmMatch[1]);
  const minute = hhMmMatch[2];
  if (!Number.isFinite(hour24) || hour24 < 0 || hour24 > 23) return time;

  const period = hour24 >= 12 ? 'PM' : 'AM';
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${minute} ${period}`;
};

const DispatchCard = React.forwardRef(function DispatchCard({
  dispatch, session, confirmations, timeEntries, templateNotes,
  onConfirm, onTimeEntry, onOwnerTruckUpdate, companyName, forceOpen, onDrawerClose
}, ref) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  React.useEffect(() => {
    if (forceOpen) setDrawerOpen(true);
  }, [forceOpen]);

  const handleClose = () => {
    setDrawerOpen(false);
    if (onDrawerClose) onDrawerClose();
  };

  const myTrucks = (session.allowed_trucks || []).filter(t =>
    (dispatch.trucks_assigned || []).includes(t)
  );

  return (
    <div ref={ref}>
      <Card
        className={`overflow-hidden border-slate-200 hover:border-slate-400 hover:shadow-md transition-all cursor-pointer ${statusBorderAccent[dispatch.status] || ''}`}
        onClick={() => setDrawerOpen(true)}
      >
        <CardContent className="p-0">
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`${statusBadgeColors[dispatch.status]} border text-xs font-medium`}>
                  {dispatch.status}
                </Badge>
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  {dispatch.shift_time === 'Day Shift' ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-slate-400" />}
                  {dispatch.shift_time}
                </span>
              </div>
              <div className="text-right text-xs text-slate-500 whitespace-nowrap">
                <div>{dispatch.date && format(parseISO(dispatch.date), 'EEE, MMM d, yyyy')}</div>
                {dispatch.start_time ? (
                  <div className="mt-0.5 flex items-center justify-end gap-1 text-slate-500">
                    <Clock className="h-3 w-3" />
                    {formatDispatchTime(dispatch.start_time)}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              {dispatch.status === 'Scheduled' ? (
                <>
                  <h3 className="text-sm font-semibold text-slate-700">Scheduled</h3>
                  <p className="text-xs text-blue-600 italic mt-0.5">Your truck has been scheduled — details will follow</p>
                </>
              ) : (
                <>
                  {dispatch.client_name && (
                    <h3 className="text-sm font-semibold text-slate-700">{dispatch.client_name}</h3>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    {dispatch.job_number && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        Job #{dispatch.job_number}
                      </div>
                    )}
                    {dispatch.reference_tag && (
                      <p className="text-xs text-slate-400">Reference Tag: {dispatch.reference_tag}</p>
                    )}
                  </div>
                </>
              )}

              {dispatch.status !== 'Scheduled' && companyName && (
                <p className="text-xs text-slate-400 mt-2">{companyName}</p>
              )}

              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <Truck className="h-3.5 w-3.5 text-slate-400" />
                {session.code_type === 'Truck' ? (
                  <Badge variant="outline" className="text-xs border-slate-900 text-slate-900 font-medium">
                    {myTrucks[0]}
                  </Badge>
                ) : (
                  myTrucks.map(t => (
                    <Badge key={t} variant="outline" className="text-xs border-slate-900 text-slate-900 font-medium">
                      {t}
                    </Badge>
                  ))
                )}
              </div>
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); setDrawerOpen(true); }}
              className="mt-3 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              View details
            </button>
          </div>
        </CardContent>
      </Card>

      <DispatchDetailDrawer
        open={drawerOpen}
        onClose={handleClose}
        dispatch={dispatch}
        session={session}
        confirmations={confirmations}
        timeEntries={timeEntries}
        templateNotes={templateNotes}
        onConfirm={onConfirm}
        onTimeEntry={onTimeEntry}
        onOwnerTruckUpdate={onOwnerTruckUpdate}
        companyName={companyName}
      />
    </div>
  );
});

export default DispatchCard;
