import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { addDays, format } from 'date-fns';
import { Clock, FileText, CheckCircle2 } from 'lucide-react';
import { createPageUrl } from '../utils';
import { buildOpenConfirmationRows } from '@/components/notifications/openConfirmations';
import { createRuntimeVersionToken, APP_RUNTIME_VERSION_CONFIG_KEY } from '@/lib/runtimeVersion';
import DashboardSummaryCards from '@/components/admin/admin-dashboard/DashboardSummaryCards';
import ActiveAnnouncementsSection from '@/components/admin/admin-dashboard/ActiveAnnouncementsSection';
import QuickActionsSection from '@/components/admin/admin-dashboard/QuickActionsSection';
import ForceRefreshSection from '@/components/admin/admin-dashboard/ForceRefreshSection';

export default function AdminDashboard() {
  const queryClient = useQueryClient();
  const [isRefreshConfirmOpen, setIsRefreshConfirmOpen] = useState(false);
  const [refreshAdminCode, setRefreshAdminCode] = useState('');
  const [refreshConfirmError, setRefreshConfirmError] = useState('');
  const { data: codes = [] } = useQuery({
    queryKey: ['access-codes'],
    queryFn: () => base44.entities.AccessCode.list(),
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications-admin-dashboard'],
    queryFn: () => base44.entities.Notification.list('-created_date', 1000),
  });

  const { data: confirmations = [] } = useQuery({
    queryKey: ['confirmations-admin-dashboard'],
    queryFn: () => base44.entities.Confirmation.list('-confirmed_at', 1000),
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.list(),
  });

  const { data: announcements = [] } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => base44.entities.Announcement.filter({ active_flag: true }, 'priority', 100),
  });

  const { data: dispatches = [] } = useQuery({
    queryKey: ['dispatches-all'],
    queryFn: () => base44.entities.Dispatch.list('-date', 200),
  });

  const refreshTriggerMutation = useMutation({
    mutationFn: async () => {
      const nextVersion = createRuntimeVersionToken();
      const existingRows = await base44.entities.AppConfig.filter({ key: APP_RUNTIME_VERSION_CONFIG_KEY }, '-updated_date', 1);
      const existing = existingRows?.[0];

      if (existing?.id) {
        await base44.entities.AppConfig.update(existing.id, { value: nextVersion });
      } else {
        await base44.entities.AppConfig.create({ key: APP_RUNTIME_VERSION_CONFIG_KEY, value: nextVersion });
      }

      return nextVersion;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-runtime-version'] });
      toast.success('Force refresh triggered. Open sessions will be prompted to refresh.');
    },
    onError: () => {
      toast.error('Unable to trigger app refresh. Please try again.');
    },
  });

  const countDispatchShiftsByDate = (dateStr) => dispatches.reduce((totals, dispatch) => {
    if (dispatch.date !== dateStr) return totals;

    const assignedTruckCount = Array.isArray(dispatch.trucks_assigned)
      ? dispatch.trucks_assigned.filter(Boolean).length
      : 0;

    if (dispatch.shift_time === 'Night Shift') return { ...totals, night: totals.night + assignedTruckCount };
    if (dispatch.shift_time === 'Day Shift') return { ...totals, day: totals.day + assignedTruckCount };
    return totals;
  }, { day: 0, night: 0 });

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');
  const todayShiftCounts = countDispatchShiftsByDate(todayStr);

  const upcomingCardConfig = (() => {
    const weekday = today.getDay();
    const shouldShowMonday = weekday === 5 || weekday === 6 || weekday === 0;
    const upcomingDate = shouldShowMonday
      ? addDays(today, weekday === 0 ? 1 : 8 - weekday)
      : addDays(today, 1);
    const upcomingDateStr = format(upcomingDate, 'yyyy-MM-dd');
    const sundayDateStr = format(addDays(upcomingDate, -1), 'yyyy-MM-dd');
    const sundayNightCount = dispatches.filter(
      (dispatch) => dispatch.date === sundayDateStr && dispatch.shift_time === 'Night Shift'
    ).length;

    return {
      label: 'Upcoming Dispatches',
      shiftCounts: countDispatchShiftsByDate(upcomingDateStr),
      showSundayNightIndicator: shouldShowMonday && sundayNightCount > 0,
    };
  })();

  const openConfirmationCount = useMemo(() => buildOpenConfirmationRows({
    notifications,
    confirmations,
    dispatches,
    companies,
    accessCodes: codes,
  }).length, [notifications, confirmations, dispatches, companies, codes]);

  const stats = [
    {
      label: 'Confirmations', value: `${openConfirmationCount} Pending`, icon: CheckCircle2,
      headerLabel: 'Confirmations',
      color: 'bg-blue-500', link: 'AdminConfirmations'
    },
    {
      label: 'Create Dispatch', value: 'Create Dispatch', headerLabel: 'New', icon: FileText,
      color: 'bg-emerald-500', link: 'AdminDispatches', state: { openNewDispatch: true }, isAction: true
    },
    {
      label: "Today's Dispatches", shiftCounts: todayShiftCounts, icon: Clock,
      headerLabel: "Today's Dispatches",
      color: 'bg-amber-500', link: 'AdminDispatches'
    },
    {
      label: upcomingCardConfig.label,
      headerLabel: upcomingCardConfig.label,
      shiftCounts: upcomingCardConfig.shiftCounts,
      showSundayNightIndicator: upcomingCardConfig.showSundayNightIndicator,
      icon: Clock,
      color: 'bg-purple-500', link: 'AdminDispatches'
    },
  ];

  const companyMap = useMemo(
    () => Object.fromEntries(companies.map(company => [company.id, company.name])),
    [companies]
  );

  const accessCodeMap = useMemo(
    () => Object.fromEntries(codes.map(code => [code.id, code])),
    [codes]
  );

  const activeAnnouncements = useMemo(
    () => announcements.filter((announcement) => announcement.active_flag !== false)
      .sort((a, b) => (a.priority || 3) - (b.priority || 3)),
    [announcements]
  );

  const formatAudience = (announcement) => {
    if (announcement.target_type === 'All') return 'All';

    if (announcement.target_type === 'Companies') {
      const names = (announcement.target_company_ids || [])
        .map((id) => companyMap[id])
        .filter(Boolean);

      if (names.length > 0) return `Specific Companies: ${names.join(', ')}`;
      return 'Specific Companies';
    }

    const targetedCodes = (announcement.target_access_code_ids || [])
      .map((id) => accessCodeMap[id])
      .filter(Boolean);

    if (targetedCodes.length === 0) return 'Specific Access Codes';

    const ownerCodes = targetedCodes.filter((code) => code.code_type === 'CompanyOwner');
    if (ownerCodes.length === targetedCodes.length) {
      const ownerLabels = ownerCodes
        .map((code) => code.label || code.code)
        .filter(Boolean);

      if (ownerLabels.length > 0) return `Company Owners: ${ownerLabels.join(', ')}`;
      return 'Company Owners';
    }

    const labels = targetedCodes.map((code) => code.label || code.code).filter(Boolean);
    return labels.length > 0 ? `Specific Access Codes: ${labels.join(', ')}` : 'Specific Access Codes';
  };

  const handleForceRefreshConfirm = () => {
    const trimmedCode = refreshAdminCode.trim();
    if (!trimmedCode) {
      setRefreshConfirmError('Enter an admin access code to continue.');
      return;
    }

    const match = codes.find((code) => code.code === trimmedCode && code.code_type === 'Admin' && code.active_flag !== false);
    if (!match) {
      setRefreshConfirmError('Invalid admin access code.');
      return;
    }

    setRefreshConfirmError('');
    refreshTriggerMutation.mutate(undefined, {
      onSuccess: () => {
        setIsRefreshConfirmOpen(false);
        setRefreshAdminCode('');
      },
    });
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Admin Dashboard</h2>
        <p className="text-sm text-slate-500 mt-1">Overview of your dispatch operations</p>
      </div>

      <DashboardSummaryCards stats={stats} createPageUrl={createPageUrl} />

      <ActiveAnnouncementsSection
        announcements={activeAnnouncements}
        formatAudience={formatAudience}
      />

      <QuickActionsSection createPageUrl={createPageUrl} />

      <ForceRefreshSection
        isOpen={isRefreshConfirmOpen}
        refreshAdminCode={refreshAdminCode}
        refreshConfirmError={refreshConfirmError}
        isPending={refreshTriggerMutation.isPending}
        onOpen={() => {
          setRefreshConfirmError('');
          setRefreshAdminCode('');
          setIsRefreshConfirmOpen(true);
        }}
        onClose={() => {
          setIsRefreshConfirmOpen(false);
          setRefreshConfirmError('');
        }}
        onConfirm={handleForceRefreshConfirm}
        onOpenChange={setIsRefreshConfirmOpen}
        onCodeChange={(value) => {
          setRefreshAdminCode(value);
          setRefreshConfirmError('');
        }}
      />
    </div>
  );
}
