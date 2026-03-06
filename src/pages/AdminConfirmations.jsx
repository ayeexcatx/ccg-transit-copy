import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNowStrict, format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '../utils';
import { buildOpenConfirmationRows } from '@/components/notifications/openConfirmations';

function formatDateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return format(parsed, 'MMM d, yyyy h:mm a');
}

function formatPendingAge(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return formatDistanceToNowStrict(parsed, { addSuffix: true });
}

export default function AdminConfirmations() {
  const navigate = useNavigate();

  const { data: notifications = [], isLoading: notificationsLoading } = useQuery({
    queryKey: ['notifications-admin-confirmations'],
    queryFn: () => base44.entities.Notification.list('-created_date', 1000),
  });

  const { data: confirmations = [], isLoading: confirmationsLoading } = useQuery({
    queryKey: ['confirmations-admin-review'],
    queryFn: () => base44.entities.Confirmation.list('-confirmed_at', 1000),
  });

  const { data: dispatches = [], isLoading: dispatchesLoading } = useQuery({
    queryKey: ['dispatches-admin-confirmations'],
    queryFn: () => base44.entities.Dispatch.list('-date', 1000),
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.list(),
  });

  const { data: accessCodes = [] } = useQuery({
    queryKey: ['access-codes'],
    queryFn: () => base44.entities.AccessCode.list(),
  });

  const dispatchById = useMemo(
    () => new Map(dispatches.map((dispatch) => [dispatch.id, dispatch])),
    [dispatches]
  );

  const companyById = useMemo(
    () => new Map(companies.map((company) => [company.id, company])),
    [companies]
  );

  const accessCodeById = useMemo(
    () => new Map(accessCodes.map((accessCode) => [accessCode.id, accessCode])),
    [accessCodes]
  );

  const openRows = useMemo(() => buildOpenConfirmationRows({
    notifications,
    confirmations,
    dispatches,
    companies,
    accessCodes,
  }), [notifications, confirmations, dispatches, companies, accessCodes]);

  const historyRows = useMemo(() => confirmations
    .map((confirmation) => {
      const dispatch = dispatchById.get(confirmation.dispatch_id);
      if (!dispatch) return null;

      const accessCodeId = confirmation.access_code_id || confirmation.confirmed_by_access_code_id;
      const confirmer = accessCodeById.get(accessCodeId);

      return {
        id: confirmation.id,
        dispatchId: dispatch.id,
        companyName: companyById.get(dispatch.company_id)?.name || 'Unknown Company',
        dispatchDate: dispatch.date,
        truckNumber: confirmation.truck_number,
        confirmationType: confirmation.confirmation_type,
        confirmedAt: confirmation.confirmed_at,
        confirmedBy: confirmer?.label || confirmer?.code || '—',
      };
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.confirmedAt || 0).getTime() - new Date(a.confirmedAt || 0).getTime()),
  [confirmations, dispatchById, companyById, accessCodeById]);

  const isLoading = notificationsLoading || confirmationsLoading || dispatchesLoading;

  const openDispatch = (dispatchId) => {
    navigate(`${createPageUrl('AdminDispatches')}?dispatchId=${dispatchId}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Confirmations</h2>
        <p className="text-sm text-slate-500 mt-1">Review outstanding truck confirmations and recent confirmation history.</p>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-slate-900">Open Confirmations</h3>
              <p className="text-xs text-slate-500">Outstanding truck confirmations derived from unresolved owner notifications.</p>
            </div>
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">{openRows.length} open</Badge>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-slate-300 border-t-slate-700 rounded-full" />
            </div>
          ) : openRows.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No open confirmations.</p>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Company</th>
                    <th className="text-left font-medium px-3 py-2">Dispatch Date</th>
                    <th className="text-left font-medium px-3 py-2">Type</th>
                    <th className="text-left font-medium px-3 py-2">Truck</th>
                    <th className="text-left font-medium px-3 py-2">Client / Job</th>
                    <th className="text-left font-medium px-3 py-2">Notification Time</th>
                    <th className="text-left font-medium px-3 py-2">Pending</th>
                  </tr>
                </thead>
                <tbody>
                  {openRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => openDispatch(row.dispatchId)}
                    >
                      <td className="px-3 py-2">{row.companyName}</td>
                      <td className="px-3 py-2">{row.dispatchDate || '—'}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{row.status}</Badge></td>
                      <td className="px-3 py-2 font-mono">{row.truckNumber}</td>
                      <td className="px-3 py-2">{[row.clientName, row.jobNumber].filter(Boolean).join(' / ') || '—'}</td>
                      <td className="px-3 py-2">{formatDateTime(row.createdAt)}</td>
                      <td className="px-3 py-2">{formatPendingAge(row.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-slate-900">Confirmation Log / History</h3>
              <p className="text-xs text-slate-500">Completed confirmations from confirmation records.</p>
            </div>
            <Badge variant="secondary">{historyRows.length} records</Badge>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin h-6 w-6 border-2 border-slate-300 border-t-slate-700 rounded-full" />
            </div>
          ) : historyRows.length === 0 ? (
            <p className="text-sm text-slate-500 py-6 text-center">No confirmation history found.</p>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Company</th>
                    <th className="text-left font-medium px-3 py-2">Dispatch Date</th>
                    <th className="text-left font-medium px-3 py-2">Truck</th>
                    <th className="text-left font-medium px-3 py-2">Type</th>
                    <th className="text-left font-medium px-3 py-2">Confirmed At</th>
                    <th className="text-left font-medium px-3 py-2">Confirmed By</th>
                  </tr>
                </thead>
                <tbody>
                  {historyRows.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                      onClick={() => openDispatch(row.dispatchId)}
                    >
                      <td className="px-3 py-2">{row.companyName}</td>
                      <td className="px-3 py-2">{row.dispatchDate || '—'}</td>
                      <td className="px-3 py-2 font-mono">{row.truckNumber || '—'}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{row.confirmationType || '—'}</Badge></td>
                      <td className="px-3 py-2">{formatDateTime(row.confirmedAt)}</td>
                      <td className="px-3 py-2">{row.confirmedBy}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
