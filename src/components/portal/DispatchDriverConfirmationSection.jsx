import React from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, History, Truck } from 'lucide-react';
import { statusBadgeColors } from './statusConfig';
import DispatchConfirmReceiptLogSection from './DispatchConfirmReceiptLogSection';
import DispatchDriverAssignmentsSection from './DispatchDriverAssignmentsSection';

export default function DispatchDriverConfirmationSection({
  isOwner,
  isAdmin,
  myTrucks,
  currentConfType,
  isTruckConfirmedForCurrent,
  getTruckCurrentConfirmation,
  getTruckPriorConfirmations,
  handleConfirmTruck,
  formatLogTimestampWithActor,
  getEntryActorLabel,
  dispatch,
  eligibleDrivers,
  selectedDriverByTruck,
  handleDriverSelection,
  assignDriverMutation,
  unassignedDriverValue,
  conflictingDriverAssignmentsById,
  driverAssignmentErrors,
  confirmations,
}) {
  return (
    <>
      {isOwner && myTrucks.length > 0 && (
        <DispatchConfirmReceiptLogSection
          myTrucks={myTrucks}
          currentConfType={currentConfType}
          isTruckConfirmedForCurrent={isTruckConfirmedForCurrent}
          getTruckCurrentConfirmation={getTruckCurrentConfirmation}
          getTruckPriorConfirmations={getTruckPriorConfirmations}
          handleConfirmTruck={handleConfirmTruck}
          formatLogTimestampWithActor={formatLogTimestampWithActor}
          getEntryActorLabel={getEntryActorLabel}
        />
      )}

      {isOwner && (dispatch.trucks_assigned || []).length > 0 && (
        <DispatchDriverAssignmentsSection
          eligibleDrivers={eligibleDrivers}
          trucksAssigned={dispatch.trucks_assigned || []}
          selectedDriverByTruck={selectedDriverByTruck}
          unassignedDriverValue={unassignedDriverValue}
          handleDriverSelection={handleDriverSelection}
          assignDriverMutation={assignDriverMutation}
          conflictingDriverAssignmentsById={conflictingDriverAssignmentsById}
          driverAssignmentErrors={driverAssignmentErrors}
        />
      )}

      {isAdmin && (dispatch.trucks_assigned || []).length > 0 && (
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <History className="h-3.5 w-3.5" />Confirmations
          </p>
          <div className="space-y-2">
            {(dispatch.trucks_assigned || []).map((truck) => {
              const truckConfs = confirmations
                .filter((c) => c.truck_number === truck)
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
                            <span className="text-slate-400 text-right">{formatLogTimestampWithActor('Confirmed', c.confirmed_at, getEntryActorLabel(c) || 'Unknown')}</span>
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
    </>
  );
}
