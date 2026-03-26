import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { useSession } from '../components/session/SessionContext';
import AdminAnnouncementsHeader from '@/components/admin/admin-announcements/AdminAnnouncementsHeader';
import AdminAnnouncementsList from '@/components/admin/admin-announcements/AdminAnnouncementsList';

const priorityColors = {
  1: 'bg-red-50 text-red-700 border-red-200',
  2: 'bg-orange-50 text-orange-700 border-orange-200',
  3: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  4: 'bg-blue-50 text-blue-700 border-blue-200',
  5: 'bg-slate-50 text-slate-600 border-slate-200',
};

const defaultForm = {
  title: '',
  message: '',
  priority: 3,
  active_flag: true,
  target_type: 'All',
  target_company_ids: [],
  target_access_code_ids: [],
};

const getAdminDisplayName = (session) => {
  if (!session) return 'Admin';
  return session.label || session.name || session.code || `Admin ${session.id || ''}`.trim();
};

const getAdminSessionId = (session) => session?.id || session?.code || 'unknown-session';

const createAdminActivityEntry = (session, action, message) => ({
  timestamp: new Date().toISOString(),
  admin_session_id: getAdminSessionId(session),
  admin_name: getAdminDisplayName(session),
  action,
  message
});

const appendAdminActivityLog = (existingLog, entries) => {
  const current = Array.isArray(existingLog) ? existingLog : [];
  const nextEntries = Array.isArray(entries) ? entries : [entries];
  return [...nextEntries, ...current];
};

const normalizeIds = (values) => (Array.isArray(values) ? [...values].sort() : []);

const buildAnnouncementUpdateEntries = (previousAnnouncement, nextAnnouncement, session) => {
  const adminName = getAdminDisplayName(session);
  const specificEntries = [];

  if (previousAnnouncement.active_flag !== nextAnnouncement.active_flag) {
    specificEntries.push(createAdminActivityEntry(
      session,
      nextAnnouncement.active_flag ? 'activated_announcement' : 'deactivated_announcement',
      `${adminName} ${nextAnnouncement.active_flag ? 'activated' : 'deactivated'} this announcement`
    ));
  }

  if (previousAnnouncement.target_type !== nextAnnouncement.target_type) {
    specificEntries.push(createAdminActivityEntry(session, 'updated_visibility', `${adminName} updated announcement visibility`));
  }

  if (
    JSON.stringify(normalizeIds(previousAnnouncement.target_company_ids)) !== JSON.stringify(normalizeIds(nextAnnouncement.target_company_ids)) ||
    JSON.stringify(normalizeIds(previousAnnouncement.target_access_code_ids)) !== JSON.stringify(normalizeIds(nextAnnouncement.target_access_code_ids))
  ) {
    specificEntries.push(createAdminActivityEntry(session, 'updated_targets', `${adminName} updated announcement targets`));
  }

  if (
    previousAnnouncement.title !== nextAnnouncement.title ||
    previousAnnouncement.message !== nextAnnouncement.message ||
    previousAnnouncement.priority !== nextAnnouncement.priority
  ) {
    specificEntries.push(createAdminActivityEntry(session, 'updated_content', `${adminName} updated announcement content`));
  }

  const generalEntry = createAdminActivityEntry(session, 'updated_announcement', `${adminName} updated this announcement`);
  return [...specificEntries.slice(0, 2), generalEntry];
};

const formatActivityTimestamp = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return format(date, 'MMM d, yyyy h:mm a');
};

export default function AdminAnnouncements() {
  const queryClient = useQueryClient();
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);

  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn: () => base44.entities.Announcement.list('-created_at', 100),
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.list(),
  });

  const { data: accessCodes = [] } = useQuery({
    queryKey: ['access-codes'],
    queryFn: () => base44.entities.AccessCode.list(),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => {
      if (editing) {
        const entries = buildAnnouncementUpdateEntries(editing, data, session);
        return base44.entities.Announcement.update(editing.id, {
          ...data,
          admin_activity_log: appendAdminActivityLog(editing.admin_activity_log, entries)
        });
      }

      return base44.entities.Announcement.create({
        ...data,
        created_at: new Date().toISOString(),
        admin_activity_log: appendAdminActivityLog(
          data.admin_activity_log,
          createAdminActivityEntry(session, 'created_announcement', `${getAdminDisplayName(session)} created this announcement`)
        )
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      setOpen(false);
      setEditing(null);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ announcement, active }) => base44.entities.Announcement.update(announcement.id, {
      active_flag: active,
      admin_activity_log: appendAdminActivityLog(
        announcement.admin_activity_log,
        createAdminActivityEntry(
          session,
          active ? 'activated_announcement' : 'deactivated_announcement',
          `${getAdminDisplayName(session)} ${active ? 'activated' : 'deactivated'} this announcement`
        )
      )
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['announcements'] }),
  });

  const openNew = () => {
    setEditing(null);
    setForm(defaultForm);
    setOpen(true);
  };

  const openEdit = (a) => {
    setEditing(a);
    setForm({
      title: a.title || '',
      message: a.message || '',
      priority: a.priority || 3,
      active_flag: a.active_flag !== false,
      target_type: a.target_type || 'All',
      target_company_ids: a.target_company_ids || [],
      target_access_code_ids: a.target_access_code_ids || [],
    });
    setOpen(true);
  };

  const toggleCompany = (id) => {
    setForm(f => ({
      ...f,
      target_company_ids: f.target_company_ids.includes(id)
        ? f.target_company_ids.filter(x => x !== id)
        : [...f.target_company_ids, id],
    }));
  };

  const toggleAccessCode = (id) => {
    setForm(f => ({
      ...f,
      target_access_code_ids: f.target_access_code_ids.includes(id)
        ? f.target_access_code_ids.filter(x => x !== id)
        : [...f.target_access_code_ids, id],
    }));
  };

  const handleSave = () => {
    if (!form.title.trim() || !form.message.trim()) return;
    const data = { ...form };
    if (data.target_type !== 'Companies') data.target_company_ids = [];
    if (data.target_type !== 'AccessCodes') data.target_access_code_ids = [];
    saveMutation.mutate(data);
  };

  const targetLabel = (a) => {
    if (a.target_type === 'All') return 'All users';
    if (a.target_type === 'Companies') return `${(a.target_company_ids || []).length} company(s)`;
    return `${(a.target_access_code_ids || []).length} access code(s)`;
  };

  return (
    <div className="space-y-6">
      <AdminAnnouncementsHeader total={announcements.length} onNew={openNew} />

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-slate-300 border-t-slate-700 rounded-full" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">No announcements yet</div>
      ) : (
        <AdminAnnouncementsList
          announcements={announcements}
          onToggleActive={(announcement, active) => toggleMutation.mutate({ announcement, active })}
          onEdit={openEdit}
          targetLabel={targetLabel}
          priorityColors={priorityColors}
          formatActivityTimestamp={formatActivityTimestamp}
        />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Announcement' : 'New Announcement'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Announcement title" />
            </div>
            <div className="space-y-1.5">
              <Label>Message</Label>
              <Textarea
                value={form.message}
                onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Announcement message..."
                className="min-h-[100px]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Priority (1 = highest)</Label>
                <Select value={String(form.priority)} onValueChange={v => setForm(f => ({ ...f, priority: Number(v) }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map(p => (
                      <SelectItem key={p} value={String(p)}>P{p}{p === 1 ? ' — Urgent' : p === 5 ? ' — Low' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Targets</Label>
                <Select value={form.target_type} onValueChange={v => setForm(f => ({ ...f, target_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="All">All Users</SelectItem>
                    <SelectItem value="Companies">Specific Companies</SelectItem>
                    <SelectItem value="AccessCodes">Specific Access Codes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {form.target_type === 'Companies' && (
              <div className="space-y-1.5">
                <Label>Select Companies</Label>
                <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                  {companies.map(c => (
                    <label key={c.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.target_company_ids.includes(c.id)}
                        onChange={() => toggleCompany(c.id)}
                        className="rounded"
                      />
                      <span className="text-sm">{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {form.target_type === 'AccessCodes' && (
              <div className="space-y-1.5">
                <Label>Select Access Codes</Label>
                <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                  {accessCodes.filter(ac => ac.code_type === 'CompanyOwner' || ac.code_type === 'Driver').map(ac => (
                    <label key={ac.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.target_access_code_ids.includes(ac.id)}
                        onChange={() => toggleAccessCode(ac.id)}
                        className="rounded"
                      />
                      <span className="text-sm font-mono">{ac.code}</span>
                      {ac.label && <span className="text-xs text-slate-500">{ac.label}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                id="active-flag"
                checked={form.active_flag}
                onCheckedChange={v => setForm(f => ({ ...f, active_flag: v }))}
              />
              <Label htmlFor="active-flag">Active</Label>
            </div>

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => { setOpen(false); setEditing(null); }}>Cancel</Button>
              <Button
                className="flex-1 bg-slate-900 hover:bg-slate-800"
                disabled={!form.title.trim() || !form.message.trim() || saveMutation.isPending}
                onClick={handleSave}
              >
                {saveMutation.isPending ? 'Saving...' : editing ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
