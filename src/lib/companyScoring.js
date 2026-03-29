import { differenceInCalendarDays, startOfDay, subDays, subMonths, startOfYear, format } from 'date-fns';

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
  breakdownRate: 0.15,
  lateIssueRate: 0.05,
  cancellationRate: 0.1,
  responsePerformance: 0.05,
};

export const SCORING_PERIODS = {
  last30: { key: 'last30', label: 'Last 30 Days', shortLabel: '30-Day', getRange: (now) => ({ start: subDays(startOfDay(now), 30), end: now }) },
  last90: { key: 'last90', label: 'Last 90 Days', shortLabel: '90-Day', getRange: (now) => ({ start: subDays(startOfDay(now), 90), end: now }) },
  ytd: { key: 'ytd', label: 'Year to Date', shortLabel: 'YTD', getRange: (now) => ({ start: startOfYear(startOfDay(now)), end: now }) },
  last12m: { key: 'last12m', label: 'Last 12 Months', shortLabel: '12-Month', getRange: (now) => ({ start: subMonths(startOfDay(now), 12), end: now }) },
};

const EVENT_IMPACT = {
  negative: {
    'Company Cancellation': 4,
    'Last-Minute Cancellation': 6,
    'Late Arrival': 2,
    'No Show': 8,
    'Truck Issue': 5,
    'Driver Issue': 3,
    'Customer Complaint': 3,
    Other: 1,
  },
  positive: {
    'Exceptional Performance': 2,
  },
};

const NON_COMPLETION_EVENT_TYPES = new Set(['Company Cancellation', 'Last-Minute Cancellation', 'No Show']);
const CANCELLATION_EVENT_TYPES = new Set(['Company Cancellation', 'Last-Minute Cancellation']);
const DRIVER_NEGATIVE_EVENT_TYPES = new Set(['Driver Issue', 'Customer Complaint', 'Late Arrival', 'No Show']);

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

const inRange = (date, start, end) => date && date >= start && date < end;

const isTrueBreakdownIncident = (incident) => {
  const type = String(incident?.incident_type || '').trim().toLowerCase();
  if (!type) return false;
  if (type.includes('delay') || type.includes('accident')) return false;
  if (type.includes('non-mechanical') || type.includes('damage')) return false;

  return type.includes('mechanical') || type.includes('breakdown');
};

export const getTrendLabel = (currentScore, previousScore) => {
  const delta = currentScore - previousScore;
  if (delta >= 3) return 'Trending Up';
  if (delta <= -3) return 'Trending Down';
  return 'Stable';
};

const buildPeriodRange = (periodKey, now) => {
  const period = SCORING_PERIODS[periodKey] || SCORING_PERIODS.last30;
  return period.getRange(now);
};

const previousPeriodRange = (periodKey, currentStart) => {
  if (periodKey === 'ytd') {
    const priorStart = startOfYear(subMonths(currentStart, 12));
    return { start: priorStart, end: subMonths(currentStart, 12) };
  }
  if (periodKey === 'last12m') {
    return { start: subMonths(currentStart, 12), end: currentStart };
  }
  const days = periodKey === 'last90' ? 90 : 30;
  return { start: subDays(currentStart, days), end: currentStart };
};

export const getPeriodComparisonLabels = (periodKey) => {
  const period = SCORING_PERIODS[periodKey] || SCORING_PERIODS.last30;
  if (periodKey === 'ytd') {
    return { current: 'Current Year-to-Date Period', previous: 'Previous Year-to-Date Period' };
  }
  return { current: `Current ${period.shortLabel} Period`, previous: `Previous ${period.shortLabel} Period` };
};

export const calculateCompanyScore = ({
  company,
  dispatches,
  confirmations,
  incidents,
  events,
  drivers,
  driverAssignments,
  periodKey = 'last30',
  now = new Date(),
}) => {
  if (!company?.id) return null;

  const companyDispatches = dispatches.filter((dispatch) => dispatch.company_id === company.id);
  const dispatchById = new Map(companyDispatches.map((dispatch) => [dispatch.id, dispatch]));
  const companyConfirmations = confirmations.filter((confirmation) => dispatchById.has(confirmation.dispatch_id));
  const companyIncidents = incidents.filter((incident) => incident.company_id === company.id || (incident.dispatch_id && dispatchById.has(incident.dispatch_id)));
  const companyEvents = events.filter((event) => event.company_id === company.id);
  const companyDrivers = drivers.filter((driver) => driver.company_id === company.id);
  const companyDriverIds = new Set(companyDrivers.map((driver) => driver.id));
  const companyAssignments = driverAssignments.filter((assignment) => dispatchById.has(assignment.dispatch_id) || companyDriverIds.has(assignment.driver_id));

  const today = startOfDay(now);
  const { start: rangeStart, end: rangeEnd } = buildPeriodRange(periodKey, now);
  const { start: previousRangeStart, end: previousRangeEnd } = previousPeriodRange(periodKey, rangeStart);

  const relevantDispatches = companyDispatches.filter((dispatch) => inRange(parseDate(dispatch.date), rangeStart, rangeEnd));
  const scopedConfirmations = companyConfirmations.filter((confirmation) => {
    const dispatch = dispatchById.get(confirmation.dispatch_id);
    return dispatch && inRange(parseDate(dispatch.date), rangeStart, rangeEnd);
  });
  const scopedIncidents = companyIncidents.filter((incident) => inRange(parseDate(incident.incident_datetime || incident.created_date), rangeStart, rangeEnd));
  const scopedEvents = companyEvents.filter((event) => inRange(parseDate(event.event_date || event.created_date), rangeStart, rangeEnd));
  const trendScopedEvents = scopedEvents.filter((event) => event.include_in_trends !== false);

  const completedDispatches = relevantDispatches.filter((dispatch) => {
    const dispatchDate = parseDate(dispatch.date);
    if (!dispatchDate || dispatchDate >= today) return false;

    const dispatchEvents = scopedEvents.filter((event) => event.dispatch_id === dispatch.id);
    const hasManualNonCompletion = dispatchEvents.some((event) => NON_COMPLETION_EVENT_TYPES.has(event.event_type) || event.impacts_completion_rate);
    const hasBreakdownFailure = scopedIncidents.some((incident) => incident.dispatch_id === dispatch.id && isTrueBreakdownIncident(incident));

    return !hasManualNonCompletion && !hasBreakdownFailure;
  });

  const expectedConfirmationDispatches = relevantDispatches.filter((dispatch) => dispatch.status !== 'Cancelled');

  const confirmationHours = scopedConfirmations.map((confirmation) => {
    const dispatch = dispatchById.get(confirmation.dispatch_id);
    const createdAt = parseDate(dispatch?.created_date);
    const confirmedAt = parseDate(confirmation.confirmed_at || confirmation.created_date);
    if (!createdAt || !confirmedAt) return null;
    const diffMs = confirmedAt.getTime() - createdAt.getTime();
    return diffMs >= 0 ? diffMs / (1000 * 60 * 60) : null;
  }).filter((value) => value !== null);

  const avgConfirmationHours = confirmationHours.length ? confirmationHours.reduce((sum, value) => sum + value, 0) / confirmationHours.length : null;

  const confirmedDispatchIds = new Set(scopedConfirmations.map((confirmation) => confirmation.dispatch_id));
  const missedConfirmationsCount = expectedConfirmationDispatches.filter((dispatch) => !confirmedDispatchIds.has(dispatch.id)).length;

  const trucks = Array.isArray(company.trucks) ? company.trucks : [];
  const usedTruckNumbers = new Set();
  relevantDispatches.forEach((dispatch) => {
    (dispatch.trucks_assigned || []).forEach((truckNumber) => truckNumber && usedTruckNumbers.add(truckNumber));
  });

  const breakdownIncidentCount = scopedIncidents.filter(isTrueBreakdownIncident).length;
  const breakdownEventCount = scopedEvents.filter((event) => event.event_type === 'Truck Issue').length;
  const breakdownCount = breakdownIncidentCount + breakdownEventCount;

  const lateIssueCount = scopedEvents.filter((event) => event.event_type === 'Late Arrival').length;
  const cancellationCount = scopedEvents.filter((event) => CANCELLATION_EVENT_TYPES.has(event.event_type)).length;

  const scheduledDispatches = relevantDispatches.filter((dispatch) => dispatch.status === 'Scheduled');
  const scheduledConfirmedCount = scheduledDispatches.filter((dispatch) => scopedConfirmations.some((confirmation) =>
    confirmation.dispatch_id === dispatch.id && (confirmation.confirmation_type === 'Scheduled' || !confirmation.confirmation_type)
  )).length;

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
      display: `${lateIssueCount} manual late events`,
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

  const weightedScore = Object.entries(SCORING_WEIGHTS).reduce((sum, [key, weight]) => sum + (metrics[key]?.score || 0) * weight, 0);
  const eventPenalty = trendScopedEvents.reduce((sum, event) => sum + (EVENT_IMPACT.negative[event.event_type] || 0), 0);
  const eventBonus = trendScopedEvents.reduce((sum, event) => sum + (EVENT_IMPACT.positive[event.event_type] || 0), 0);
  const overallScore = clamp(weightedScore - eventPenalty + eventBonus);

  const buildSnapshot = (start, end) => {
    const scopedDispatches = companyDispatches.filter((dispatch) => inRange(parseDate(dispatch.date), start, end));
    const scopedRangeEvents = companyEvents.filter((event) => inRange(parseDate(event.event_date || event.created_date), start, end) && event.include_in_trends !== false);
    const scopedRangeIncidents = companyIncidents.filter((incident) => inRange(parseDate(incident.incident_datetime || incident.created_date), start, end));
    const negativeRate = toPercent(scopedRangeEvents.filter((event) => EVENT_IMPACT.negative[event.event_type]).length, scopedDispatches.length || 1);
    const breakdownRate = toPercent(scopedRangeIncidents.filter(isTrueBreakdownIncident).length, scopedDispatches.length || 1);
    const positiveRate = toPercent(scopedRangeEvents.filter((event) => event.event_type === 'Exceptional Performance').length, scopedDispatches.length || 1);
    return clamp(100 - negativeRate * 0.35 - breakdownRate * 0.35 + positiveRate * 0.2);
  };

  const currentSnapshot = buildSnapshot(rangeStart, rangeEnd);
  const previousSnapshot = buildSnapshot(previousRangeStart, previousRangeEnd);

  const truckSummaries = trucks.map((truckNumber) => {
    const truckDispatches = relevantDispatches.filter((dispatch) => (dispatch.trucks_assigned || []).includes(truckNumber));
    const truckDispatchIds = new Set(truckDispatches.map((dispatch) => dispatch.id));
    const truckBreakdownIncidents = scopedIncidents.filter((incident) => (
      isTrueBreakdownIncident(incident)
      && (incident.truck_number === truckNumber || truckDispatchIds.has(incident.dispatch_id))
    )).length;
    const truckIssueEvents = scopedEvents.filter((event) => event.event_type === 'Truck Issue' && (event.truck_number === truckNumber || truckDispatchIds.has(event.dispatch_id))).length;
    const truckExceptionalEvents = scopedEvents.filter((event) => event.event_type === 'Exceptional Performance' && (event.truck_number === truckNumber || truckDispatchIds.has(event.dispatch_id))).length;
    const truckScore = clamp(100 - (truckBreakdownIncidents * 8) - (truckIssueEvents * 5) + (truckExceptionalEvents * 2));

    return {
      truckNumber,
      dispatchCount: truckDispatches.length,
      breakdowns: truckBreakdownIncidents + truckIssueEvents,
      lateIssues: scopedEvents.filter((event) => truckDispatchIds.has(event.dispatch_id) && event.event_type === 'Late Arrival').length,
      completionRate: toPercent(Math.max(0, truckDispatches.length - scopedEvents.filter((event) => truckDispatchIds.has(event.dispatch_id) && (NON_COMPLETION_EVENT_TYPES.has(event.event_type) || event.impacts_completion_rate)).length), truckDispatches.length || 1),
      truckScore,
    };
  });

  const driverSummaries = companyDrivers.map((driver) => {
    const relevantDriverAssignments = companyAssignments.filter((assignment) => assignment.driver_id === driver.id && inRange(parseDate(assignment.assigned_datetime || assignment.created_date), rangeStart, rangeEnd));
    const assignmentDispatchIds = new Set(relevantDriverAssignments.map((assignment) => assignment.dispatch_id));
    const assignedDispatches = relevantDispatches.filter((dispatch) => assignmentDispatchIds.has(dispatch.id));
    const driverConfirmedDispatches = new Set(relevantDriverAssignments
      .filter((assignment) => assignment.last_seen_at)
      .map((assignment) => assignment.dispatch_id));
    const negativeEventCount = scopedEvents.filter((event) => event.driver_id === driver.id && DRIVER_NEGATIVE_EVENT_TYPES.has(event.event_type)).length;
    const positiveEventCount = scopedEvents.filter((event) => event.driver_id === driver.id && event.event_type === 'Exceptional Performance').length;
    const driverScore = clamp(100 - (negativeEventCount * 6) + (positiveEventCount * 2));

    return {
      driverId: driver.id,
      driverName: driver.driver_name || 'Unknown Driver',
      dispatchCount: assignedDispatches.length,
      confirmationRate: toPercent(driverConfirmedDispatches.size, assignedDispatches.length || 1),
      eventCount: scopedEvents.filter((event) => event.driver_id === driver.id).length,
      driverScore,
    };
  });

  const warningBadges = [];
  if (metrics.breakdownRate.value > 20) warningBadges.push('High Breakdown Rate');
  if (metrics.confirmationSpeed.value !== null && metrics.confirmationSpeed.value > 8) warningBadges.push('Slow Confirmations');
  if (metrics.cancellationRate.value > 15) warningBadges.push('High Cancellation Rate');
  if (metrics.lateIssueRate.value > 15) warningBadges.push('Frequent Manual Late Events');

  const labels = getPeriodComparisonLabels(periodKey);

  return {
    score: Math.round(overallScore),
    metrics,
    trend: getTrendLabel(currentSnapshot, previousSnapshot),
    trendCurrentScore: Math.round(currentSnapshot),
    trendPreviousScore: Math.round(previousSnapshot),
    warningBadges,
    dispatchCount: relevantDispatches.length,
    truckSummaries,
    driverSummaries,
    events: scopedEvents.slice().sort((a, b) => new Date(b.event_date || b.created_date || 0) - new Date(a.event_date || a.created_date || 0)),
    periodLabel: SCORING_PERIODS[periodKey]?.label || SCORING_PERIODS.last30.label,
    periodComparisonLabels: labels,
    generatedAt: new Date().toISOString(),
    additional: {
      assumedCompletedRule: 'Dispatches before today are treated as completed by default unless manual non-completion events or true mechanical/breakdown incidents are logged.',
      lateIssues: lateIssueCount,
      breakdowns: breakdownCount,
      cancellations: cancellationCount,
      periodKey,
      periodDateRangeLabel: `${format(rangeStart, 'MMM d, yyyy')} – ${format(subDays(rangeEnd, 1), 'MMM d, yyyy')}`,
      daysSinceCreation: company.created_date ? differenceInCalendarDays(today, parseDate(company.created_date) || today) : null,
      exceptionalPerformanceBonus: EVENT_IMPACT.positive['Exceptional Performance'],
    },
  };
};
