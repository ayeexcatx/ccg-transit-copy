import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import AnnouncementCard from '@/components/announcements/AnnouncementCard';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { buildOpenConfirmationRows } from '@/components/notifications/openConfirmations';
import { createRuntimeVersionToken, APP_RUNTIME_VERSION_CONFIG_KEY } from '@/lib/runtimeVersion';
import { toast } from 'sonner';
import {
  Building2, Key, FileText, StickyNote,
  ArrowRight, Clock, CheckCircle2, Megaphone, AlertTriangle
} from 'lucide-react';
import { format } from 'date-fns';

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

  const activeDispatches = dispatches.filter(d => d.status !== 'Completed' && d.status !== 'Cancelled');
  const todayStr = new Date().toISOString().split('T')[0];
  const todayDispatches = dispatches.filter(d => d.date === todayStr);

  const openConfirmationCount = useMemo(() => buildOpenConfirmationRows({
    notifications,
    confirmations,
    dispatches,
    companies,
    accessCodes: codes,
  }).length, [notifications, confirmations, dispatches, companies, codes]);

  const stats = [
    {
      label: 'Confirmations', value: openConfirmationCount, icon: CheckCircle2,
      color: 'bg-blue-500', link: 'AdminConfirmations'
    },
    {
      label: 'Create New Dispatch', value: 'New', icon: FileText,
      color: 'bg-emerald-500', link: 'AdminDispatches', state: { openNewDispatch: true }, isAction: true
    },
    {
      label: 'Active Dispatches', value: activeDispatches.length, icon: FileText,
      color: 'bg-amber-500', link: 'AdminDispatches'
    },
    {
      label: "Today's Dispatches", value: todayDispatches.length, icon: Clock,
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

    const truckCodes = targetedCodes.filter((code) => code.code_type === 'Truck');
    if (truckCodes.length === targetedCodes.length) {
      const trucks = [...new Set(truckCodes.flatMap((code) => code.allowed_trucks || []))];
      if (trucks.length > 0) return `Specific Trucks: ${trucks.join(', ')}`;
    }

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <Link key={s.label} to={createPageUrl(s.link)} state={s.state}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="p-5">
                <div className={`h-10 w-10 rounded-xl ${s.color} bg-opacity-10 flex items-center justify-center mb-3`}>
                  <s.icon className={`h-5 w-5 ${s.color.replace('bg-', 'text-')}`} />
                </div>
                <p className="text-2xl font-semibold text-slate-900">{s.value}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className={`text-xs ${s.isAction ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>{s.label}</p>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card className="rounded-lg border bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-blue-700 px-4 py-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1">
            <Megaphone className="h-4 w-4 text-blue-700" />
            <h3 className="text-sm font-semibold text-blue-700">Active Announcements</h3>
          </div>
        </div>
        <CardContent className="p-0">
          {activeAnnouncements.length === 0 ? (
            <p className="p-5 text-sm text-slate-500">No active announcements.</p>
          ) : (
            <div className="space-y-2 p-3 sm:p-4">
              {activeAnnouncements.map((announcement) => (
                <AnnouncementCard
                  key={announcement.id}
                  announcement={announcement}
                  footer={(
                    <div className="mt-3 border-t border-slate-200/80 pt-2 text-xs text-slate-600">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                        <p>
                          <span className="font-medium text-slate-700">Added:</span>{' '}
                          {announcement.created_at
                            ? format(new Date(announcement.created_at), 'MMM d, yyyy · h:mm a')
                            : '—'}
                        </p>
                        <p>
                          <span className="font-medium text-slate-700">Audience:</span>{' '}
                          {formatAudience(announcement)}
                        </p>
                      </div>
                    </div>
                  )}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link to={createPageUrl('AdminDispatches')}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-900">Manage Dispatches</p>
                  <p className="text-xs text-slate-500">Create & edit</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link to={createPageUrl('AdminCompanies')}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-900">Manage Companies</p>
                  <p className="text-xs text-slate-500">Add trucks & info</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link to={createPageUrl('AdminAccessCodes')}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Key className="h-4 w-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-900">Access Codes</p>
                  <p className="text-xs text-slate-500">Create & manage</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link to={createPageUrl('AdminTemplateNotes')}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-purple-50 flex items-center justify-center">
                  <StickyNote className="h-4 w-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-slate-900">Template Notes</p>
                  <p className="text-xs text-slate-500">Manage notes</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-amber-900">Maintenance</h3>
            <p className="text-xs text-amber-800">Force all active sessions to reload and pick up the latest runtime version.</p>
          </div>
          <Button
            variant="outline"
            className="border-amber-300 bg-white text-amber-900 hover:bg-amber-100"
            onClick={() => {
              setRefreshConfirmError('');
              setRefreshAdminCode('');
              setIsRefreshConfirmOpen(true);
            }}
          >
            Force App Refresh
          </Button>
        </div>
      </div>

      <Dialog open={isRefreshConfirmOpen} onOpenChange={setIsRefreshConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Confirm Forced Refresh
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to force app refresh now?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="refresh-admin-code">Enter an admin access code to confirm</Label>
            <Input
              id="refresh-admin-code"
              value={refreshAdminCode}
              onChange={(event) => {
                setRefreshAdminCode(event.target.value);
                setRefreshConfirmError('');
              }}
              placeholder="Admin access code"
              autoComplete="off"
            />
            {refreshConfirmError && <p className="text-sm text-red-600">{refreshConfirmError}</p>}
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsRefreshConfirmOpen(false);
                setRefreshConfirmError('');
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleForceRefreshConfirm}
              disabled={refreshTriggerMutation.isPending || !refreshAdminCode.trim()}
            >
              {refreshTriggerMutation.isPending ? 'Continuing…' : 'Continue'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
