import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CheckCircle2, Clock, MapPin, Truck, Sun, Moon,
  FileText, AlertTriangle, ChevronDown, ChevronUp
} from 'lucide-react';
import { format } from 'date-fns';

const statusColors = {
  Confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  Dispatched: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Amended: 'bg-amber-50 text-amber-700 border-amber-200',
  Canceled: 'bg-red-50 text-red-700 border-red-200',
};

const tollColors = {
  Authorized: 'bg-green-50 text-green-700',
  Unauthorized: 'bg-red-50 text-red-700',
  'Included in Rate': 'bg-purple-50 text-purple-700',
};

export default function DispatchCard({
  dispatch, session, confirmations, timeEntries, templateNotes,
  onConfirm, onTimeEntry, companyName, forceExpanded
}) {
  const [expanded, setExpanded] = useState(false);

  // Allow parent to force-expand this card
  React.useEffect(() => {
    if (forceExpanded) setExpanded(true);
  }, [forceExpanded]);
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const myTrucks = (session.allowed_trucks || []).filter(t =>
    (dispatch.trucks_assigned || []).includes(t)
  );

  const isOwner = session.code_type === 'CompanyOwner';

  // Current status drives the required confirmation type
  const currentConfType = dispatch.status; // Confirmed/Dispatched/Amended/Canceled

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

  const handleConfirmTruck = (truck) => {
    onConfirm(dispatch, truck, currentConfType);
  };

  const handleTimeEntry = (truck) => {
    if (!truck) return;
    onTimeEntry(dispatch, truck, startTime, endTime);
    setStartTime('');
    setEndTime('');
  };

  // For time entry: use single truck for Truck type, or first truck for owner
  const singleTruck = session.code_type === 'Truck' ? myTrucks[0] : null;
  const existingEntry = timeEntries.find(te =>
    te.dispatch_id === dispatch.id && te.truck_number === singleTruck
  );

  return (
    <Card className="overflow-hidden border-slate-200 hover:border-slate-300 transition-colors">
      <CardContent className="p-0">
        {/* Header */}
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`${statusColors[dispatch.status]} border text-xs font-medium`}>
                {dispatch.status}
              </Badge>
              {dispatch.toll_status && (
                <Badge className={`${tollColors[dispatch.toll_status]} text-xs font-medium`}>
                  {dispatch.toll_status}
                </Badge>
              )}
              <span className="text-xs text-slate-400 flex items-center gap-1">
                {dispatch.shift_time === 'Day' ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                {dispatch.shift_time}
              </span>
            </div>
            <span className="text-xs text-slate-500 whitespace-nowrap">
              {dispatch.date && format(new Date(dispatch.date), 'MMM d, yyyy')}
            </span>
          </div>

          <div className="space-y-2">
            {dispatch.status === 'Confirmed' ? (
              <>
                <h3 className="font-semibold text-slate-900">Confirmed Dispatch</h3>
                <p className="text-sm text-slate-500">Details to follow</p>
              </>
            ) : (
              <>
                {dispatch.client_name && (
                  <h3 className="font-semibold text-slate-900">{dispatch.client_name}</h3>
                )}
                {companyName && (
                  <p className="text-xs text-slate-400">{companyName}</p>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  {dispatch.job_number && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <FileText className="h-3.5 w-3.5 text-slate-400" />
                      Job #{dispatch.job_number}
                    </div>
                  )}
                  {dispatch.start_time && (
                    <div className="flex items-center gap-2 text-slate-600">
                      <Clock className="h-3.5 w-3.5 text-slate-400" />
                      {dispatch.start_time}
                    </div>
                  )}
                  {dispatch.start_location && (
                    <div className="flex items-start gap-2 text-slate-600 sm:col-span-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                      <span className="whitespace-pre-wrap">{dispatch.start_location}</span>
                    </div>
                  )}
                </div>
              </>
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
            onClick={() => setExpanded(!expanded)}
            className="mt-3 flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? 'Less details' : 'More details'}
          </button>
        </div>

        {/* Expanded */}
        {expanded && (
          <div className="border-t border-slate-100 p-4 sm:p-5 space-y-4 bg-slate-50/50">
            {dispatch.status === 'Confirmed' && (
              <p className="text-sm text-slate-500 italic">Full dispatch details will be provided soon.</p>
            )}
            {dispatch.status !== 'Confirmed' && (
              <>
                {dispatch.instructions && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Instructions</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{dispatch.instructions}</p>
                  </div>
                )}
                {dispatch.notes && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">Notes</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap">{dispatch.notes}</p>
                  </div>
                )}

            {(dispatch.additional_assignments || []).length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-2">Additional Assignments</p>
                <div className="space-y-2">
                  {dispatch.additional_assignments.map((a, i) => (
                    <div key={i} className="bg-white rounded-lg border border-slate-200 p-3 text-sm">
                      <div className="flex items-center gap-2 text-slate-600 mb-1">
                        <Clock className="h-3 w-3 text-slate-400" />{a.start_time}
                        <MapPin className="h-3 w-3 text-slate-400 ml-2" />{a.start_location}
                      </div>
                      {a.instructions && <p className="text-xs text-slate-500">{a.instructions}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {templateNotes?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-500 mb-1">General Notes</p>
                <div className="space-y-1">
                  {templateNotes.map(n => (
                    <p key={n.id} className="text-xs text-slate-600">• {n.note_text}</p>
                  ))}
                </div>
              </div>
            )}

            {dispatch.canceled_reason && (
              <div className="flex items-start gap-2 bg-red-50 rounded-lg p-3">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5" />
                <div>
                  <p className="text-xs font-medium text-red-700">Canceled</p>
                  <p className="text-sm text-red-600">{dispatch.canceled_reason}</p>
                </div>
              </div>
            )}

              </>
            )}

            {/* Actions */}
            {dispatch.status !== 'Canceled' && (
              <div className="space-y-3 pt-2">

                {/* CompanyOwner: per-truck confirm list */}
                {isOwner && myTrucks.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">
                      Confirm Receipt — <span className="text-slate-700 font-semibold">{currentConfType}</span>
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

                {/* Time Entry (Truck code type only) */}
                {session.code_type === 'Truck' && singleTruck && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-2">Log Time</p>
                    {existingEntry && (
                      <p className="text-xs text-slate-500 mb-2">
                        Current: {existingEntry.start_time || '—'} → {existingEntry.end_time || '—'}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <Input
                        type="time"
                        value={startTime}
                        onChange={e => setStartTime(e.target.value)}
                        className="bg-white text-sm"
                      />
                      <Input
                        type="time"
                        value={endTime}
                        onChange={e => setEndTime(e.target.value)}
                        className="bg-white text-sm"
                      />
                      <Button
                        variant="outline"
                        onClick={() => handleTimeEntry(singleTruck)}
                        disabled={!startTime && !endTime}
                        className="shrink-0"
                      >
                        <Clock className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}