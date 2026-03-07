import React, { useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { buildOpenConfirmationRows } from '@/components/notifications/openConfirmations';
import {
  Building2, Key, FileText, StickyNote,
  ArrowRight, Clock, CheckCircle2
} from 'lucide-react';

export default function AdminDashboard() {
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

  const { data: dispatches = [] } = useQuery({
    queryKey: ['dispatches-all'],
    queryFn: () => base44.entities.Dispatch.list('-date', 200),
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

  const statusCounts = {};
  dispatches.forEach(d => {
    statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
  });

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Admin Dashboard</h2>
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
                <p className="text-2xl font-bold text-slate-900">{s.value}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className={`text-xs ${s.isAction ? 'text-emerald-700 font-semibold' : 'text-slate-500'}`}>{s.label}</p>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="p-5">
          <h3 className="font-semibold text-slate-900 mb-4">Dispatch Status Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {['Scheduled', 'Dispatch', 'Amended', 'Cancelled', 'Completed'].map(status => (
              <div key={status} className="text-center p-3 rounded-lg bg-slate-50">
                <p className="text-xl font-bold text-slate-900">{statusCounts[status] || 0}</p>
                <p className="text-xs text-slate-500 mt-0.5">{status}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div>
        <h3 className="font-semibold text-slate-900 mb-3">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Link to={createPageUrl('AdminDispatches')}>
            <Card className="hover:shadow-md transition-shadow cursor-pointer">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">Manage Dispatches</p>
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
                  <p className="text-sm font-medium text-slate-900">Manage Companies</p>
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
                  <p className="text-sm font-medium text-slate-900">Access Codes</p>
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
                  <p className="text-sm font-medium text-slate-900">Template Notes</p>
                  <p className="text-xs text-slate-500">Manage notes</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}
