import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function DispatchDriverAssignmentsSection({
  eligibleDrivers,
  trucksAssigned,
  selectedDriverByTruck,
  unassignedDriverValue,
  handleDriverSelection,
  assignDriverMutation,
  conflictingDriverAssignmentsById,
  driverAssignmentErrors,
}) {
  if (trucksAssigned.length === 0) return null;

  return (
    <div data-screenshot-exclude="true" data-tour="dispatch-driver-assignments" className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
      <p className="text-xs text-slate-500 uppercase tracking-wide">Driver Assignments</p>
      <p className="text-xs text-slate-500">Please read instructions on Drivers page before assigning drivers.</p>
      {eligibleDrivers.length === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2.5 py-2">
          Create and activate a driver access code first.
        </p>
      )}
      {trucksAssigned.map((truckNumber) => (
        <div key={`driver-${truckNumber}`} className="grid grid-cols-[70px,1fr] items-start gap-2">
          <span className="text-xs font-mono text-slate-600">{truckNumber}</span>
          {eligibleDrivers.length > 0 ? (
            <div className="space-y-1">
              <Select
                value={selectedDriverByTruck[truckNumber] || unassignedDriverValue}
                onValueChange={(value) => handleDriverSelection(truckNumber, value)}
                disabled={assignDriverMutation.isPending}
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
              {driverAssignmentErrors[truckNumber] && (
                <p className="text-xs text-red-600">{driverAssignmentErrors[truckNumber]}</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-slate-500 italic">No eligible drivers available</p>
          )}
        </div>
      ))}
    </div>
  );
}
