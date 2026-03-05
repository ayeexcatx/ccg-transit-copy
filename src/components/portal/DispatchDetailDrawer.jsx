import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  CheckCircle2, Clock, MapPin, Truck, Sun, Moon,
  FileText, AlertTriangle, Save, History
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { statusBadgeColors } from './statusConfig';

const tollColors = {
  Authorized: 'bg-green-50 text-green-700',
  Unauthorized: 'bg-red-50 text-red-700',
  'Included in Rate': 'bg-purple-50 text-purple-700',
};

function TruckTimeRow({ truck, dispatch, timeEntries, onTimeEntry, readOnly }) {
  const existing = timeEntries.find(te =>
    te.dispatch_id === dispatch.id && te.truck_number === truck
  );
  const [start, setStart] = useState(existing?.start_time || '');
  const [end, setEnd] = useState(existing?.end_time || '');
  const [saved, setSaved] = useState(false);

  React.useEffect(() => {
    if (existing) {
      setStart(existing.start_time || '');
      setEnd(existing.end_time || '');
    }
  }, [existing?.start_time, existing?.end_time]);

  const handleSave = () => {
    onTimeEntry(dispatch, truck, start, end);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (readOnly) {
    return (
      <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 rounded px-3 py-2">
        <div className="flex items-center gap-2">
          <Truck className="h-3 w-3 text-slate-400" />
          <span className="font-mono font-medium">{truck}</span>
        </div>
        <span>
          {existing ? (
            <span className="text-slate-500">{existing.start_time || '—'} → {existing.end_time || '—'}</span>
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
          <span className="text-xs text-slate-400 ml-auto">
            Saved: {existing.start_time || '—'} → {existing.end_time || '—'}
          </span>
        )}
      </div>
      <div className="flex gap-2 items-center">
        <div className="flex-1">
          <p className="text-xs text-slate-500 mb-1">Check-in</p>
          <Input type="time" value={start} onChange={e => setStart(e.target.value)} className="text-sm h-8" />
        </div>
        <div className="flex-1">
          <p className="text-xs text-slate-500 mb-1">Check-out</p>
          <Input type="time" value={end} onChange={e => setEnd(e.target.value)} className="text-sm h-8" />
        </div>
        <div className="pt-5">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!start && !end}
            className={`h-8 text-xs ${saved ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-900 hover:bg-slate-800'}`}
          >
            {saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            {!saved && 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function DispatchDetailDrawer({
  dispatch, session, confirmations, timeEntries, templateNotes,
  onConfirm, onTimeEntry, companyName, open, onClose
}) {
  if (!dispatch) return null;

  const myTrucks = (session.allowed_trucks || []).filter(t =>
    (dispatch.trucks_assigned || []).includes(t)
  );
  const isOwner = session.code_type === 'CompanyOwner';
  const isAdmin = session.code_type === 'Admin';
  const currentConfType = dispatch.status;

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

  // Safe date display: use parseISO to avoid timezone shift on YYYY-MM-DD strings
  const displayDate = dispatch.date
    ? format(parseISO(dispatch.date), 'MMM d, yyyy')
    : '';

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-0">
        {/* Top bar */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-4 z-10">
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

          {/* Main info */}
          {dispatch.status === 'Scheduled' ? (
            <div>
              <h2 className="font-semibold text-slate-900 text-lg">Scheduled Dispatch</h2>
              <p className="text-sm text-blue-600 mt-1 italic">Your truck has been scheduled — details will follow</p>
            </div>
          ) : (
            <div className="space-y-3">
              {dispatch.client_name && (
                <h2 className="font-semibold text-slate-900 text-lg">{dispatch.client_name}</h2>
              )}
              {companyName && (
                <p className="text-xs text-slate-400">{companyName}</p>
              )}

              <div className="grid grid-cols-1 gap-3 text-sm">
                {dispatch.job_number && (
                  <div className="flex items-center gap-2 text-slate-600">
                    <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                    <span>Job #{dispatch.job_number}</span>
                  </div>
                )}
              </div>

              {/* Trucks */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <Truck className="h-3.5 w-3.5 text-slate-400" />
                {myTrucks.map(t => (
                  <Badge key={t} variant="outline" className="text-xs border-slate-900 text-slate-900 font-medium">
                    {t}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {dispatch.status !== 'Scheduled' && (
            <>
              {(dispatch.instructions || dispatch.notes || dispatch.toll_status || dispatch.start_time || dispatch.start_location) && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assignment 1</p>
                  {dispatch.toll_status && (
                    <Badge className={`${tollColors[dispatch.toll_status]} text-xs font-medium`}>
                      Toll: {dispatch.toll_status}
                    </Badge>
                  )}
                  {dispatch.start_time && (
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Clock className="h-4 w-4 text-slate-400 shrink-0" />
                      <span>{dispatch.start_time}</span>
                    </div>
                  )}
                  {dispatch.start_location && (
                    <div className="flex items-start gap-2 text-sm text-slate-600">
                      <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                      <span className="whitespace-pre-wrap">{dispatch.start_location}</span>
                    </div>
                  )}
                  {dispatch.instructions && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 mb-1">Instructions</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{dispatch.instructions}</p>
                    </div>
                  )}
                  {dispatch.notes && (
                    <div>
                      <p className="text-xs font-semibold text-slate-400 mb-1">Notes</p>
                      <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{dispatch.notes}</p>
                    </div>
                  )}
                </div>
              )}

              {(dispatch.additional_assignments || []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Additional Assignments</p>
                  <div className="space-y-3">
                    {dispatch.additional_assignments.map((a, i) => (
                      <div key={i} className={`rounded-lg border border-slate-200 p-3 text-sm ${i % 2 === 0 ? 'bg-slate-50' : 'bg-blue-50/40'}`}>
                        <p className="text-xs font-semibold text-slate-500 mb-2">Assignment {i + 2}</p>
                        <div className="space-y-1.5">
                          {a.toll_status && (
                            <Badge className={`${tollColors[a.toll_status]} text-xs font-medium`}>
                              Toll: {a.toll_status}
                            </Badge>
                          )}
                          {a.job_number && (
                            <div className="flex items-center gap-2 text-slate-600">
                              <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span>Job #{a.job_number}</span>
                            </div>
                          )}
                          {a.start_time && (
                            <div className="flex items-center gap-2 text-slate-600">
                              <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span>{a.start_time}</span>
                            </div>
                          )}
                          {a.start_location && (
                            <div className="flex items-start gap-2 text-slate-600">
                              <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                              <span className="whitespace-pre-wrap">{a.start_location}</span>
                            </div>
                          )}
                          {a.instructions && (
                            <div>
                              <p className="text-xs font-semibold text-slate-400 mb-0.5">Instructions</p>
                              <p className="text-sm text-slate-600 whitespace-pre-wrap">{a.instructions}</p>
                            </div>
                          )}
                          {a.notes && (
                            <div>
                              <p className="text-xs font-semibold text-slate-400 mb-0.5">Notes</p>
                              <p className="text-sm text-slate-600 whitespace-pre-wrap">{a.notes}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {templateNotes?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">General Notes</p>
                  <div className="space-y-1">
                    {templateNotes.map(n => (
                      <p key={n.id} className="text-sm text-slate-600">• {n.note_text}</p>
                    ))}
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

          {/* Actions */}
          {(isOwner || isAdmin) && (
            <div className="space-y-4 pt-2 border-t border-slate-100">

              {/* CompanyOwner confirm */}
              {isOwner && myTrucks.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
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
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Time Log</p>
                  <div className="space-y-2">
                    {myTrucks.map(truck => (
                      <TruckTimeRow
                        key={truck}
                        truck={truck}
                        dispatch={dispatch}
                        timeEntries={timeEntries}
                        onTimeEntry={onTimeEntry}
                        readOnly={false}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Confirmations — Admin (read-only) */}
              {isAdmin && (dispatch.trucks_assigned || []).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
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
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Time Log</p>
                  <div className="space-y-1.5">
                    {(dispatch.trucks_assigned || []).map(truck => (
                      <TruckTimeRow
                        key={truck}
                        truck={truck}
                        dispatch={dispatch}
                        timeEntries={timeEntries}
                        onTimeEntry={() => {}}
                        readOnly={true}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}