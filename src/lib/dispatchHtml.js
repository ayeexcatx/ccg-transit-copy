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
    body {
      font-family: Arial, Helvetica, sans-serif;
      background: #f8fafc;
      margin: 0;
      padding: 24px;
      color: #0f172a;
    }

    .container {
      max-width: 1050px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 14px;
      padding: 28px;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
    }

    .header {
      border-bottom: 2px solid #334155;
      padding-bottom: 14px;
      margin-bottom: 22px;
    }

    .title-row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
      flex-wrap: wrap;
    }

    .title-block h1 {
      margin: 0;
      font-size: 24px;
      line-height: 1.2;
      color: #0f172a;
    }

    .subtitle {
      margin-top: 6px;
      font-size: 13px;
      color: #64748b;
    }

    .status-badge {
      display: inline-block;
      padding: 8px 14px;
      border-radius: 9999px;
      border: 1px solid #94a3b8;
      font-size: 13px;
      font-weight: 700;
      background: #f8fafc;
      color: #0f172a;
      white-space: nowrap;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 18px;
    }

    .summary-card {
      border: 1px solid #dbeafe;
      border-radius: 10px;
      background: #f8fafc;
      padding: 10px 12px;
    }

    .summary-label {
      font-size: 11px;
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      margin-bottom: 4px;
    }

    .summary-value {
      font-size: 14px;
      font-weight: 700;
      color: #0f172a;
      word-break: break-word;
    }

    .section {
      margin-top: 24px;
    }

    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 6px;
      margin-bottom: 10px;
      text-decoration: underline;
    }

    .info-grid {
      display: grid;
      grid-template-columns: 180px minmax(0, 1fr);
      row-gap: 8px;
      column-gap: 12px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      background: #ffffff;
      padding: 14px;
    }

    .label {
      font-weight: 700;
      color: #334155;
    }

    .value {
      color: #0f172a;
      word-break: break-word;
    }

    .table-wrap {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      overflow: hidden;
      background: #ffffff;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th, td {
      border: 1px solid #dbeafe;
      padding: 9px 10px;
      text-align: left;
      vertical-align: top;
      font-size: 13px;
    }

    th {
      background: #f1f5f9;
      font-weight: 700;
      color: #334155;
    }

    .log-box {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      overflow: hidden;
      background: #ffffff;
    }

    .log-box.empty {
      padding: 12px;
      color: #64748b;
      font-style: italic;
    }

    .assignment-card {
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      overflow: hidden;
      background: #ffffff;
    }

    .assignment-card + .assignment-card {
      margin-top: 14px;
    }

    .assignment-header {
      background: #f8fafc;
      border-bottom: 1px solid #cbd5e1;
      padding: 10px 12px;
      font-weight: 700;
      color: #0f172a;
    }

    .assignment-body {
      padding: 12px;
    }

    .assignment-grid {
      display: grid;
      grid-template-columns: 180px minmax(0, 1fr);
      row-gap: 8px;
      column-gap: 12px;
    }

    .notes-box {
      margin-top: 10px;
      padding: 10px 12px;
      border: 1px solid #dbeafe;
      border-radius: 8px;
      background: #f8fafc;
    }

    .notes-title {
      font-weight: 700;
      margin-bottom: 4px;
      color: #334155;
    }

    .footer {
      margin-top: 32px;
      border-top: 1px solid #cbd5e1;
      padding-top: 12px;
      color: #64748b;
      font-size: 12px;
      text-align: right;
      line-height: 1.5;
    }

    @media print {
      body {
        background: #ffffff;
        padding: 0;
      }

      .container {
        border: none;
        border-radius: 0;
        box-shadow: none;
        max-width: none;
        padding: 0;
      }

      .section,
      .assignment-card,
      .table-wrap,
      .log-box {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title-row">
        <div class="title-block">
          <h1>CCG Dispatch Record</h1>
          <div class="subtitle">Truck-specific dispatch archive record</div>
        </div>
        <div class="status-badge">Status: ${escapeHtml(dispatch?.status || '—')}</div>
      </div>

      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-label">Dispatch Date</div>
          <div class="summary-value">${escapeHtml(formatDateDisplay(dispatch?.date))}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Client</div>
          <div class="summary-value">${escapeHtml(dispatch?.client_name || '—')}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Shift</div>
          <div class="summary-value">${escapeHtml(normalizeShift(dispatch?.shift_time))}</div>
        </div>
        <div class="summary-card">
          <div class="summary-label">Reference</div>
          <div class="summary-value">${escapeHtml(referenceValue)}</div>
        </div>
      </div>
    </div>

    <section class="section">
      <div class="section-title">Hauler</div>
      <div class="info-grid">
        <div class="label">Company</div>
        <div class="value">${escapeHtml(companyName || '—')}</div>

        <div class="label">Truck Number</div>
        <div class="value">${escapeHtml(truckNumber || '—')}</div>

        <div class="label">Driver</div>
        <div class="value">${escapeHtml(selectedDriverName || '—')}</div>
      </div>
    </section>

    <section class="section">
      <div class="section-title">Assignments</div>
      ${assignments.map((assignment, index) => `
        <div class="assignment-card">
          <div class="assignment-header">${escapeHtml(index === 0 ? 'Assignment 1' : `Additional Assignment ${index}`)}</div>
          <div class="assignment-body">
            <div class="assignment-grid">
              <div class="label">Job Number</div>
              <div class="value">${escapeHtml(assignment?.job_number || '—')}</div>

              <div class="label">Start Time</div>
              <div class="value">${escapeHtml(assignment?.start_time || '—')}</div>

              <div class="label">Start Location</div>
              <div class="value">${escapeHtml(assignment?.start_location || '—')}</div>

              <div class="label">Instructions</div>
              <div class="value">${escapeHtml(assignment?.instructions || '—')}</div>

              <div class="label">Tolls</div>
              <div class="value">${escapeHtml(assignment?.toll_status || '—')}</div>
            </div>

            <div class="notes-box">
              <div class="notes-title">Notes</div>
              <div>${escapeHtml(assignment?.notes || '—')}</div>
            </div>
          </div>
        </div>
      `).join('')}
    </section>

    <section class="section">
      <div class="section-title">Confirmation</div>
      ${renderSimpleLogTable(
        ['Truck', 'Type', 'Confirmed By', 'Timestamp'],
        filteredConfirmations.map((entry) => [
          entry?.truck_number || '—',
          entry?.confirmation_type || '—',
          entry?.driver_name || '—',
          formatTimestamp(entry?.confirmed_at)
        ]),
        'No confirmations recorded.'
      )}
    </section>

    <section class="section">
      <div class="section-title">Time Log</div>
      ${renderSimpleLogTable(
        ['Truck', 'Check In', 'Check Out'],
        selectedTimeEntryByTruck.map((entry) => [
          entry?.truck_number || '—',
          entry?.start_time || '—',
          entry?.end_time || '—'
        ]),
        'No time log entries recorded.'
      )}
    </section>

    <section class="section">
      <div class="section-title">Activity</div>
      ${renderSimpleLogTable(
        ['Type', 'Detail', 'By', 'Timestamp'],
        activityRows,
        'No activity entries recorded.'
      )}
    </section>

    <div class="footer">
      Generated by CCG Transit App<br />
      Generated: ${escapeHtml(formatTimestamp(generatedAt))}
    </div>
  </div>
</body>
</html>`;
};