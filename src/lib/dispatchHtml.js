import { format, parseISO } from 'date-fns';

const escapeHtml = (value) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const formatDateDisplay = (value) => {
  if (!value) return '—';
  try {
    return format(parseISO(value), 'MM-dd-yyyy');
  } catch {
    return value;
  }
};

const normalizeShift = (value) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'night') return 'Night Shift';
  return 'Day Shift';
};

const formatTimestamp = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return format(parsed, 'MM-dd-yyyy h:mm a');
};

const renderAssignmentTable = (assignment, title) => `
  <section class="section">
    <h3>${escapeHtml(title)}</h3>
    <table>
      <tr><th>Job Number</th><td>${escapeHtml(assignment?.job_number || '—')}</td></tr>
      <tr><th>Start Time</th><td>${escapeHtml(assignment?.start_time || '—')}</td></tr>
      <tr><th>Start Location</th><td>${escapeHtml(assignment?.start_location || '—')}</td></tr>
      <tr><th>Instruction</th><td>${escapeHtml(assignment?.instructions || '—')}</td></tr>
      <tr><th>Notes</th><td>${escapeHtml(assignment?.notes || '—')}</td></tr>
      <tr><th>Tolls</th><td>${escapeHtml(assignment?.toll_status || '—')}</td></tr>
    </table>
  </section>
`;

const renderSimpleLogTable = (columns, rows, emptyMessage) => {
  if (!rows.length) {
    return `<div class="log-box empty">${escapeHtml(emptyMessage)}</div>`;
  }

  return `
    <div class="log-box">
      <table>
        <thead>
          <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
};

export const getDispatchJobNumbers = (dispatch) => {
  const numbers = [dispatch?.job_number, ...(dispatch?.additional_assignments || []).map((assignment) => assignment?.job_number)]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean);

  return Array.from(new Set(numbers));
};

export const getDispatchJobNumberString = (dispatch) => {
  const values = getDispatchJobNumbers(dispatch);
  return values.length ? values.join('+') : 'NoJobNumber';
};

export const buildDispatchHtml = ({
  dispatch,
  companyName,
  truckNumber,
  confirmations = [],
  timeEntries = [],
  driverAssignments = []
}) => {
  const assignments = [
    {
      job_number: dispatch?.job_number,
      start_time: dispatch?.start_time,
      start_location: dispatch?.start_location,
      instructions: dispatch?.instructions,
      notes: dispatch?.notes,
      toll_status: dispatch?.toll_status
    },
    ...(Array.isArray(dispatch?.additional_assignments) ? dispatch.additional_assignments : [])
  ];

  const filteredConfirmations = confirmations.filter((entry) => !truckNumber || entry?.truck_number === truckNumber);
  const filteredDriverAssignments = driverAssignments.filter((entry) => {
    if (entry?.active_flag === false) return false;
    return !truckNumber || entry?.truck_number === truckNumber;
  });
  const filteredTimeEntries = timeEntries.filter((entry) => !truckNumber || entry?.truck_number === truckNumber);

  const selectedDriverEntry = [...filteredDriverAssignments].sort((a, b) => {
    const left = new Date(a?.assigned_datetime || a?.updated_date || a?.created_date || 0).getTime();
    const right = new Date(b?.assigned_datetime || b?.updated_date || b?.created_date || 0).getTime();
    return right - left;
  })[0];
  const selectedDriverName = selectedDriverEntry?.driver_name || dispatch?.driver_name || '—';

  const selectedTimeEntryByTruck = Object.values(
    filteredTimeEntries.reduce((map, entry) => {
      const key = entry?.truck_number || 'unassigned';
      const existing = map[key];
      if (!existing) {
        map[key] = entry;
        return map;
      }

      const existingHasValues = Boolean(existing?.start_time || existing?.end_time);
      const nextHasValues = Boolean(entry?.start_time || entry?.end_time);
      if (nextHasValues && !existingHasValues) {
        map[key] = entry;
        return map;
      }

      const existingTime = new Date(existing?.updated_date || existing?.created_date || existing?.timestamp || 0).getTime();
      const nextTime = new Date(entry?.updated_date || entry?.created_date || entry?.timestamp || 0).getTime();
      if (nextTime >= existingTime) {
        map[key] = entry;
      }
      return map;
    }, {})
  );

  const activityRows = [
    ...(Array.isArray(dispatch?.admin_activity_log) ? dispatch.admin_activity_log : []).map((entry) => [
      entry?.action || 'Activity',
      entry?.message || '—',
      entry?.admin_name || '—',
      formatTimestamp(entry?.timestamp)
    ]),
    ...(Array.isArray(dispatch?.amendment_history) ? dispatch.amendment_history : []).map((entry) => [
      'Amendment',
      entry?.changes || '—',
      'System',
      formatTimestamp(entry?.amended_at)
    ])
  ];

  const referenceValue = dispatch?.reference_tag || '—';
  const generatedAt = new Date().toISOString();

  return `<!doctype html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>CCG Dispatch Record</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
    .container { max-width: 980px; margin: 0 auto; background: #fff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 24px; }
    h1 { margin: 0 0 16px; text-align: center; }
    .status { display: inline-block; font-weight: 700; padding: 6px 10px; border-radius: 9999px; border: 1px solid #94a3b8; margin-bottom: 8px; }
    .section { margin-top: 20px; }
    h3 { font-size: 16px; margin-bottom: 8px; text-decoration: underline; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #dbeafe; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; font-weight: 700; width: 30%; }
    .log-box { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; }
    .log-box.empty { padding: 10px; color: #64748b; font-style: italic; }
    .footer { margin-top: 24px; color: #64748b; font-size: 12px; text-align: right; }
    @media print { body { background: #fff; padding: 0; } .container { border: none; border-radius: 0; } }
  </style>
</head>
<body>
  <div class="container">
    <h1>CCG Dispatch Record</h1>
    <div class="status">Status: ${escapeHtml(dispatch?.status || '—')}</div>
    <table>
      <tr><th>Dispatch Date</th><td>${escapeHtml(formatDateDisplay(dispatch?.date))}</td></tr>
      <tr><th>Client</th><td>${escapeHtml(dispatch?.client_name || '—')}</td></tr>
      <tr><th>Shift</th><td>${escapeHtml(normalizeShift(dispatch?.shift_time))}</td></tr>
      <tr><th>Reference</th><td>${escapeHtml(referenceValue)}</td></tr>
    </table>

    <section class="section">
      <h3>Hauler</h3>
      <table>
        <tr><th>Company</th><td>${escapeHtml(companyName || '—')}</td></tr>
        <tr><th>Truck Number</th><td>${escapeHtml(truckNumber || '—')}</td></tr>
        <tr><th>Driver</th><td>${escapeHtml(selectedDriverName)}</td></tr>
      </table>
    </section>

    ${assignments.map((assignment, index) => renderAssignmentTable(assignment, index === 0 ? 'Assignment 1' : `Additional Assignment ${index}`)).join('')}

    <section class="section">
      <h3>Confirmation</h3>
      ${renderSimpleLogTable(
        ['Truck', 'Type', 'Confirmed By', 'Timestamp'],
        filteredConfirmations.map((entry) => [entry?.truck_number || '—', entry?.confirmation_type || '—', entry?.driver_name || '—', formatTimestamp(entry?.confirmed_at)]),
        'No confirmations recorded.'
      )}
    </section>

    <section class="section">
      <h3>Time</h3>
      ${renderSimpleLogTable(
        ['Truck', 'Check In', 'Check Out'],
        selectedTimeEntryByTruck.map((entry) => [entry?.truck_number || '—', entry?.start_time || '—', entry?.end_time || '—']),
        'No time log entries recorded.'
      )}
    </section>

    <section class="section">
      <h3>Activity</h3>
      ${renderSimpleLogTable(['Type', 'Detail', 'By', 'Timestamp'], activityRows, 'No activity entries recorded.')}
    </section>

    <div class="footer">
      Generated by CCG Transit App<br />
      Generated: ${escapeHtml(formatTimestamp(generatedAt))}
    </div>
  </div>
</body>
</html>`;
};
