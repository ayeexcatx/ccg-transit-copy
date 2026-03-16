import { differenceInCalendarDays } from 'date-fns';

export const SCORING_EVENT_TYPES = [
  'Company Cancellation',
  'Last-Minute Cancellation',
  'Late Arrival',
  'No Show',
  'Truck Issue',
  'Driver Issue',
  'Customer Complaint',
  'Exceptional Performance',
  'Other',
];

export const SCORING_WEIGHTS = {
  confirmationSpeed: 0.15,
  missedConfirmations: 0.15,
  dispatchCompletionRate: 0.25,
  truckUtilization: 0.1,
  breakdownRate: 0.1,
  lateIssueRate: 0.1,
  cancellationRate: 0.1,
  responsePerformance: 0.05,
};

const clamp = (value, min = 0, max = 100) => Math.max(min, Math.min(max, value));

const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toPercent = (numerator, denominator) => (denominator > 0 ? (numerator / denominator) * 100 : 100);

const scoreFromRate = (rate) => clamp(rate);

const scoreFromInverseRate = (rate) => clamp(100 - rate);

const scoreFromHours = (hours) => {
  if (hours <= 1) return 100;
  if (hours <= 2) return 90;
  if (hours <= 4) return 75;
  if (hours <= 8) return 60;
  if (hours <= 24) return 40;
  return 20;
};

const NON_COMPLETION_EVENT_TYPES = new Set([
  'Company Cancellation',
  'Last-Minute Cancellation',
  'No Show',
]);

const NEGATIVE_EVENT_TYPES = new Set([
  'Company Cancellation',
  'Last-Minute Cancellation',
  'Late Arrival',
  'No Show',
  'Truck Issue',
  'Driver Issue',
  'Customer Complaint',
]);

const breakdownIncident = (incident) => {
  const type = String(incident?.incident_type || '').toLowerCase();
  return type.includes('mechanical') || type.includes('breakdown');
};

const delayIncident = (incident) => {
  const type = String(incident?.incident_type || '').toLowerCase();
  return type.includes('delay');
};

export const getTrendLabel = (currentScore, previousScore) => {
  const delta = currentScore - previousScore;
  if (delta >= 3) return 'Trending Up';
  if (delta <= -3) return 'Trending Down';
  return 'Stable';
};

const metricRate = (items, predicate) => {
  if (!items.length) return 0;
  return (items.filter(predicate).length / items.length) * 100;
};

export const calculateCompanyScore = ({
  company,
  dispatches,
  confirmations,
  incidents,
  events,
  drivers,
  driverAssignments,
  periodDays = 30,
  now = new Date(),
}) => {
  if (!company?.id) return null;

  const companyDispatches = dispatches.filter((dispatch) => dispatch.company_id === company.id);
  const dispatchById = new Map(companyDispatches.map((dispatch) => [dispatch.id, dispatch]));

  const companyConfirmations = confirmations.filter((confirmation) => dispatchById.has(confirmation.dispatch_id));
  const companyIncidents = incidents.filter((incident) => {
    if (incident.company_id === company.id) return true;
    return incident.dispatch_id && dispatchById.has(incident.dispatch_id);
  });
  const companyEvents = events.filter((event) => event.company_id === company.id);
  const companyDrivers = drivers.filter((driver) => driver.company_id === company.id);
  const companyDriverIds = new Set(companyDrivers.map((driver) => driver.id));
  const companyAssignments = driverAssignments.filter((assignment) =>
    dispatchById.has(assignment.dispatch_id) || companyDriverIds.has(assignment.driver_id)
  );

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const rangeStart = new Date(today);
  rangeStart.setDate(today.getDate() - periodDays);
  const previousRangeStart = new Date(rangeStart);
  previousRangeStart.setDate(rangeStart.getDate() - periodDays);

  const inRange = (date, start, end) => date && date >= start && date < end;

  const relevantDispatches = companyDispatches.filter((dispatch) => {
    const dispatchDate = parseDate(dispatch.date);
    return inRange(dispatchDate, previousRangeStart, today);
  });

  const completedDispatches = relevantDispatches.filter((dispatch) => {
    const dispatchDate = parseDate(dispatch.date);
    if (!dispatchDate || dispatchDate >= today) return false;

    const dispatchEvents = companyEvents.filter((event) => event.dispatch_id === dispatch.id);
    const hasManualNonCompletion = dispatchEvents.some((event) =>
      NON_COMPLETION_EVENT_TYPES.has(event.event_type) || event.impacts_completion_rate
    );

    const hasIncidentFailure = companyIncidents.some((incident) => {
      if (incident.dispatch_id !== dispatch.id) return false;
      const type = String(incident.incident_type || '').toLowerCase();
      return type.includes('accident') || type.includes('mechanical') || type.includes('breakdown');
    });

    return !hasManualNonCompletion && !hasIncidentFailure;
  });

  const expectedConfirmationDispatches = relevantDispatches.filter((dispatch) => dispatch.status !== 'Cancelled');

  const confirmationHours = companyConfirmations
    .map((confirmation) => {
      const dispatch = dispatchById.get(confirmation.dispatch_id);
      if (!dispatch) return null;
      const createdAt = parseDate(dispatch.created_date);
      const confirmedAt = parseDate(confirmation.confirmed_at || confirmation.created_date);
      if (!createdAt || !confirmedAt) return null;
      const diffMs = confirmedAt.getTime() - createdAt.getTime();
      return diffMs >= 0 ? diffMs / (1000 * 60 * 60) : null;
    })
    .filter((value) => value !== null);

  const avgConfirmationHours = confirmationHours.length
    ? confirmationHours.reduce((sum, value) => sum + value, 0) / confirmationHours.length
    : null;

  const confirmedDispatchIds = new Set(companyConfirmations.map((confirmation) => confirmation.dispatch_id));
  const missedConfirmationsCount = expectedConfirmationDispatches.filter((dispatch) => !confirmedDispatchIds.has(dispatch.id)).length;

  const trucks = Array.isArray(company.trucks) ? company.trucks : [];
  const usedTruckNumbers = new Set();
  relevantDispatches.forEach((dispatch) => {
    (dispatch.trucks_assigned || []).forEach((truckNumber) => {
      if (!truckNumber) return;
      usedTruckNumbers.add(truckNumber);
    });
  });

  const breakdownCount = companyIncidents.filter(breakdownIncident).length +
    companyEvents.filter((event) => event.event_type === 'Truck Issue').length;

  const lateIssueCount = companyIncidents.filter(delayIncident).length +
    companyEvents.filter((event) => event.event_type === 'Late Arrival').length;

  const cancellationCount = companyEvents.filter((event) =>
    event.event_type === 'Company Cancellation' || event.event_type === 'Last-Minute Cancellation'
  ).length;

  const scheduledDispatches = relevantDispatches.filter((dispatch) => dispatch.status === 'Scheduled');
  const scheduledConfirmedCount = scheduledDispatches.filter((dispatch) =>
    companyConfirmations.some((confirmation) =>
      confirmation.dispatch_id === dispatch.id && (confirmation.confirmation_type === 'Scheduled' || !confirmation.confirmation_type)
    )
  ).length;

  const metrics = {
    confirmationSpeed: {
      label: 'Avg Confirmation Speed',
      value: avgConfirmationHours,
      display: avgConfirmationHours === null ? 'No data' : `${avgConfirmationHours.toFixed(1)}h`,
      score: avgConfirmationHours === null ? 70 : scoreFromHours(avgConfirmationHours),
    },
    missedConfirmations: {
      label: 'Missed Confirmations',
      value: toPercent(missedConfirmationsCount, expectedConfirmationDispatches.length),
      display: `${missedConfirmationsCount}/${expectedConfirmationDispatches.length || 0}`,
      score: scoreFromInverseRate(toPercent(missedConfirmationsCount, expectedConfirmationDispatches.length)),
    },
    dispatchCompletionRate: {
      label: 'Completion Rate',
      value: toPercent(completedDispatches.length, relevantDispatches.length),
      display: `${completedDispatches.length}/${relevantDispatches.length || 0}`,
      score: scoreFromRate(toPercent(completedDispatches.length, relevantDispatches.length)),
    },
    truckUtilization: {
      label: 'Truck Utilization',
      value: toPercent(usedTruckNumbers.size, trucks.length || usedTruckNumbers.size || 1),
      display: `${usedTruckNumbers.size}/${trucks.length || usedTruckNumbers.size || 0} trucks used`,
      score: scoreFromRate(toPercent(usedTruckNumbers.size, trucks.length || usedTruckNumbers.size || 1)),
    },
    breakdownRate: {
      label: 'Breakdown Rate',
      value: toPercent(breakdownCount, relevantDispatches.length),
      display: `${breakdownCount} issues`,
      score: scoreFromInverseRate(toPercent(breakdownCount, relevantDispatches.length)),
    },
    lateIssueRate: {
      label: 'Late Issue Rate',
      value: toPercent(lateIssueCount, relevantDispatches.length),
      display: `${lateIssueCount} issues`,
      score: scoreFromInverseRate(toPercent(lateIssueCount, relevantDispatches.length)),
    },
    cancellationRate: {
      label: 'Cancellation Rate',
      value: toPercent(cancellationCount, relevantDispatches.length),
      display: `${cancellationCount} cancellations`,
      score: scoreFromInverseRate(toPercent(cancellationCount, relevantDispatches.length)),
    },
    responsePerformance: {
      label: 'Scheduled Confirmation Performance',
      value: toPercent(scheduledConfirmedCount, scheduledDispatches.length),
      display: `${scheduledConfirmedCount}/${scheduledDispatches.length || 0}`,
      score: scoreFromRate(toPercent(scheduledConfirmedCount, scheduledDispatches.length)),
    },
  };

  const overallScore = Object.entries(SCORING_WEIGHTS).reduce((sum, [key, weight]) => {
    return sum + (metrics[key]?.score || 0) * weight;
  }, 0);

  const buildSnapshot = (start, end) => {
    const scopedDispatches = companyDispatches.filter((dispatch) => inRange(parseDate(dispatch.date), start, end));
    const scopedEvents = companyEvents.filter((event) => inRange(parseDate(event.event_date || event.created_date), start, end));
    const scopedIncidents = companyIncidents.filter((incident) => inRange(parseDate(incident.incident_datetime || incident.created_date), start, end));
    const negativeEventRate = metricRate(scopedEvents, (event) => NEGATIVE_EVENT_TYPES.has(event.event_type));
    const incidentRate = toPercent(scopedIncidents.length, scopedDispatches.length || 1);
    const completionRate = toPercent(
      scopedDispatches.filter((dispatch) => parseDate(dispatch.date) < today).length,
      scopedDispatches.length || 1
    );
    const score = clamp(100 - negativeEventRate * 0.4 - incidentRate * 0.3 + completionRate * 0.3);
    return { score, dispatchCount: scopedDispatches.length };
  };

  const currentSnapshot = buildSnapshot(rangeStart, today);
  const previousSnapshot = buildSnapshot(previousRangeStart, rangeStart);

  const truckSummaries = trucks.map((truckNumber) => {
    const truckDispatches = relevantDispatches.filter((dispatch) => (dispatch.trucks_assigned || []).includes(truckNumber));
    const truckDispatchIds = new Set(truckDispatches.map((dispatch) => dispatch.id));
    const truckBreakdowns = companyIncidents.filter((incident) => truckDispatchIds.has(incident.dispatch_id) && breakdownIncident(incident)).length;
    const truckLateIssues = companyIncidents.filter((incident) => truckDispatchIds.has(incident.dispatch_id) && delayIncident(incident)).length;
    const truckCancellationEvents = companyEvents.filter((event) =>
      truckDispatchIds.has(event.dispatch_id) && (
        event.event_type === 'Company Cancellation' ||
        event.event_type === 'Last-Minute Cancellation' ||
        event.event_type === 'No Show'
      )
    ).length;
    const truckCompletionRate = toPercent(
      Math.max(0, truckDispatches.length - truckCancellationEvents),
      truckDispatches.length || 1
    );

    return {
      truckNumber,
      dispatchCount: truckDispatches.length,
      breakdowns: truckBreakdowns,
      lateIssues: truckLateIssues,
      completionRate: truckCompletionRate,
    };
  });

  const driverSummaries = companyDrivers.map((driver) => {
    const assignmentDispatchIds = new Set(
      companyAssignments
        .filter((assignment) => assignment.driver_id === driver.id)
        .map((assignment) => assignment.dispatch_id)
    );
    const assignedDispatches = relevantDispatches.filter((dispatch) => assignmentDispatchIds.has(dispatch.id));
    const assignedConfirmations = companyConfirmations.filter((confirmation) => assignmentDispatchIds.has(confirmation.dispatch_id));
    const driverEventCount = companyEvents.filter((event) => event.driver_id === driver.id).length;

    return {
      driverId: driver.id,
      driverName: driver.driver_name || 'Unknown Driver',
      dispatchCount: assignedDispatches.length,
      confirmationRate: toPercent(assignedConfirmations.length, assignedDispatches.length || 1),
      eventCount: driverEventCount,
    };
  });

  const warningBadges = [];
  if (metrics.breakdownRate.value > 20) warningBadges.push('High Breakdown Rate');
  if (metrics.confirmationSpeed.value !== null && metrics.confirmationSpeed.value > 8) warningBadges.push('Slow Confirmations');
  if (metrics.cancellationRate.value > 15) warningBadges.push('High Cancellation Rate');
  if (metrics.lateIssueRate.value > 15) warningBadges.push('Frequent Late Issues');

  return {
    score: Math.round(overallScore),
    metrics,
    trend: getTrendLabel(currentSnapshot.score, previousSnapshot.score),
    trendCurrentScore: Math.round(currentSnapshot.score),
    trendPreviousScore: Math.round(previousSnapshot.score),
    warningBadges,
    dispatchCount: relevantDispatches.length,
    truckSummaries,
    driverSummaries,
    events: companyEvents
      .slice()
      .sort((a, b) => new Date(b.event_date || b.created_date || 0) - new Date(a.event_date || a.created_date || 0)),
    periodLabel: `${periodDays} days`,
    generatedAt: new Date().toISOString(),
    additional: {
      assumedCompletedRule: 'Dispatch dates before today are treated as completed unless a manual non-completion event or severe incident exists.',
      lateIssues: lateIssueCount,
      breakdowns: breakdownCount,
      cancellations: cancellationCount,
      periodDays,
      daysSinceCreation: company.created_date ? differenceInCalendarDays(today, parseDate(company.created_date) || today) : null,
    },
  };
};
