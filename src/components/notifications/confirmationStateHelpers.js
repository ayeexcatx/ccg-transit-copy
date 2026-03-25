/**
 * Parse dispatch status from a dispatch_status_key shaped like:
 * `${dispatchId}:${status}:${recipientId}`
 */
export function parseStatusFromDispatchStatusKey(dispatchStatusKey) {
  const parts = String(dispatchStatusKey || '').split(':');
  return parts.length >= 2 ? parts[1] : '';
}

/**
 * Return unique truthy truck numbers while preserving first-seen order.
 */
export function uniqueTruckNumbers(trucks = []) {
  return [...new Set((trucks || []).filter(Boolean))];
}

/**
 * Build a set of confirmed trucks for a specific dispatch + confirmation_type.
 */
export function buildConfirmedTruckSetForStatus({
  confirmations = [],
  dispatchId,
  status,
}) {
  return new Set(
    (confirmations || [])
      .filter((confirmation) => (
        confirmation.dispatch_id === dispatchId &&
        confirmation.confirmation_type === status &&
        confirmation?.truck_number
      ))
      .map((confirmation) => confirmation.truck_number)
  );
}

/**
 * Return confirmation rows matching a specific dispatch + status.
 */
export function getConfirmationsForDispatchStatus({
  confirmations = [],
  dispatchId,
  status,
}) {
  return (confirmations || []).filter((confirmation) =>
    confirmation.dispatch_id === dispatchId &&
    confirmation.confirmation_type === status
  );
}

/**
 * Derive confirmed/pending truck lists and summary counters.
 */
export function deriveConfirmationCoverage(requiredTrucks = [], confirmedTruckSet = new Set()) {
  const confirmedTrucks = (requiredTrucks || []).filter((truck) => confirmedTruckSet.has(truck));
  const pendingTrucks = (requiredTrucks || []).filter((truck) => !confirmedTruckSet.has(truck));
  const total = (requiredTrucks || []).length;
  const done = confirmedTrucks.length;
  const allConfirmed = pendingTrucks.length === 0;

  return {
    confirmedTrucks,
    pendingTrucks,
    total,
    done,
    allConfirmed,
  };
}

/**
 * Determine whether all required trucks are present in the confirmed set.
 */
export function areAllRequiredTrucksConfirmed(requiredTrucks = [], confirmedTruckSet = new Set()) {
  return (requiredTrucks || []).every((truck) => confirmedTruckSet.has(truck));
}

/**
 * Expand required trucks by appending newly eligible trucks.
 */
export function expandRequiredTruckList(existingRequired = [], addedTrucks = []) {
  return uniqueTruckNumbers([...(existingRequired || []), ...(addedTrucks || [])]);
}

/**
 * Keep required trucks limited to currently assigned + owner-allowed trucks.
 */
export function reconcileRequiredTruckList({
  existingRequired = [],
  dispatchTrucks = [],
  ownerAllowedTrucks = [],
}) {
  const currentDispatchTrucks = new Set(dispatchTrucks || []);
  const allowedTrucks = new Set(ownerAllowedTrucks || []);

  return (existingRequired || []).filter((truck) =>
    currentDispatchTrucks.has(truck) && allowedTrucks.has(truck)
  );
}
