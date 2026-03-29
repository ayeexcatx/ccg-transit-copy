import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';

const STATUS_LABELS = {
  staged: 'Staged',
  sent: 'Sent',
  seen: 'Seen',
  cancelled: 'Cancelled/Removed',
  removed: 'Cancelled/Removed',
};

export default function DispatchDriverAssignmentsSection({
  eligibleDrivers,
  trucksAssigned,
  selectedDriverByTruck,
  unassignedDriverValue,
  handleDriverSelection,
  assignDriverMutation,
  conflictingDriverAssignmentsById,
  driverAssignmentErrors,
  shouldShowDriverAssignmentControls,
  driverDispatchByTruck,
  onSendDispatch,
  onCancelDispatch,
  sendMutationPending,
  cancelMutationPending,
}) {
  if (trucksAssigned.length === 0 || !shouldShowDriverAssignmentControls) return null;

  return (
    <div data-screenshot-exclude="true" data-tour="dispatch-driver-assignments" className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <p className="text-xs text-slate-500 uppercase tracking-wide">Driver Dispatch (Staged → Sent)</p>
      <p className="text-xs text-slate-500">Select a driver to stage. Use <span className="font-medium text-slate-700">Send</span> to deliver; use <span className="font-medium text-slate-700">Cancel</span> to remove delivery access.</p>
      {eligibleDrivers.length === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
          Create and activate a driver access code first.
        </p>
      )}
      {trucksAssigned.map((truckNumber) => {
        const row = driverDispatchByTruck?.[truckNumber] || null;
        const status = STATUS_LABELS[String(row?.delivery_status || 'staged').toLowerCase()] || 'Staged';
        const canSend = row?.id && row?.active_flag !== false && !row?.is_visible_to_driver;
        const canCancel = row?.id && row?.active_flag !== false && row?.is_visible_to_driver;

        return (
          <div key={`driver-${truckNumber}`} className="grid grid-cols-[70px,1fr] items-start gap-2 border-t pt-2 first:border-t-0 first:pt-0">
            <span className="text-xs font-mono text-slate-600">{truckNumber}</span>
            {eligibleDrivers.length > 0 ? (
              <div className="space-y-1">
                <Select
                  value={selectedDriverByTruck[truckNumber] || unassignedDriverValue}
                  onValueChange={(value) => handleDriverSelection(truckNumber, value)}
                  disabled={assignDriverMutation.isPending || sendMutationPending || cancelMutationPending}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Assign driver" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={unassignedDriverValue}>No driver assigned</SelectItem>
                    {eligibleDrivers.map((driver) => {
                      const isCurrentTruckSelection = selectedDriverByTruck[truckNumber] === driver.id;
                      const hasConflict = Boolean(conflictingDriverAssignmentsById[driver.id]) && !isCurrentTruckSelection;
                      return (
                        <SelectItem key={driver.id} value={driver.id} disabled={hasConflict}>
                          {driver.driver_name}{hasConflict ? ' (Already assigned this shift)' : ''}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">Status: {status}</span>
                  {canSend && <Button type="button" size="sm" className="h-7 text-xs" onClick={() => onSendDispatch(truckNumber)}>Send</Button>}
                  {canCancel && <Button type="button" size="sm" variant="outline" className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50" onClick={() => onCancelDispatch(truckNumber)}>Cancel</Button>}
                  {row?.last_seen_at && <span className="text-[11px] text-emerald-700">Seen</span>}
                </div>
                {driverAssignmentErrors[truckNumber] && (
                  <p className="text-xs text-red-600">{driverAssignmentErrors[truckNumber]}</p>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">No eligible drivers available</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
