import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/components/session/SessionContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { UserRound, Plus, Pencil, KeyRound } from 'lucide-react';

const defaultForm = {
  driver_name: '',
  phone: '',
  notes: '',
  status: 'Active',
};

export default function Drivers() {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(defaultForm);

  const { data: drivers = [], isLoading } = useQuery({
    queryKey: ['drivers', session?.company_id],
    queryFn: () => base44.entities.Driver.filter({ company_id: session.company_id }, '-created_date', 200),
    enabled: !!session?.company_id,
  });

  const sortedDrivers = useMemo(
    () => [...drivers].sort((a, b) => (a.driver_name || '').localeCompare(b.driver_name || '')),
    [drivers],
  );

  const saveMutation = useMutation({
    mutationFn: (payload) => {
      if (editing) return base44.entities.Driver.update(editing.id, payload);
      return base44.entities.Driver.create({
        ...payload,
        company_id: session.company_id,
        access_code_status: 'Not Requested',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers', session?.company_id] });
      setOpen(false);
      setEditing(null);
    },
  });

  const requestCodeMutation = useMutation({
    mutationFn: (driver) => base44.entities.Driver.update(driver.id, {
      access_code_status: 'Pending',
      requested_by_access_code_id: session?.id,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['drivers', session?.company_id] });
      queryClient.invalidateQueries({ queryKey: ['drivers-all'] });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    setOpen(true);
  };

  const openEdit = (driver) => {
    setEditing(driver);
    setForm({
      driver_name: driver.driver_name || '',
      phone: driver.phone || '',
      notes: driver.notes || '',
      status: driver.status || 'Active',
    });
    setOpen(true);
  };

  const handleSave = () => {
    if (!form.driver_name.trim()) return;
    saveMutation.mutate({
      driver_name: form.driver_name.trim(),
      phone: form.phone.trim(),
      notes: form.notes,
      status: form.status,
      active_flag: form.status === 'Active',
    });
  };

  if (session?.code_type !== 'CompanyOwner') {
    return <div className="text-sm text-slate-500">Driver management is only available to company owners.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Drivers</h2>
          <p className="text-sm text-slate-500">Manage drivers for your company</p>
        </div>
        <Button onClick={openCreate} className="bg-slate-900 hover:bg-slate-800">
          <Plus className="h-4 w-4 mr-1" />Add Driver
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-slate-300 border-t-slate-700 rounded-full" />
        </div>
      ) : sortedDrivers.length === 0 ? (
        <div className="text-center py-12 text-sm text-slate-500">No drivers added yet.</div>
      ) : (
        <div className="grid gap-3">
          {sortedDrivers.map((driver) => {
            const status = driver.status || (driver.active_flag === false ? 'Inactive' : 'Active');
            const accessCodeStatus = driver.access_code_status || 'Not Requested';
            const canRequestCode = accessCodeStatus === 'Not Requested';
            const requestLabel = accessCodeStatus === 'Pending'
              ? 'Pending'
              : accessCodeStatus === 'Created'
                ? 'Created'
                : 'Request Code';
            return (
              <Card key={driver.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <UserRound className="h-4 w-4 text-slate-500" />
                        <p className="font-medium text-slate-900">{driver.driver_name || 'Unnamed driver'}</p>
                        <Badge variant={status === 'Active' ? 'default' : 'secondary'}>{status}</Badge>
                        <Badge variant="outline">{driver.access_code_status || 'Not Requested'}</Badge>
                      </div>
                      {driver.phone && <p className="text-sm text-slate-600">Phone: {driver.phone}</p>}
                      {driver.notes && <p className="text-sm text-slate-500">{driver.notes}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(driver)} className="h-8 w-8">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => requestCodeMutation.mutate(driver)}
                        disabled={requestCodeMutation.isPending || !canRequestCode}
                        className="text-xs"
                      >
                        <KeyRound className="h-3.5 w-3.5 mr-1" />
                        {requestLabel}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="border-slate-200 bg-slate-50/60">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-base font-semibold text-slate-900">Assigning Drivers:</h3>
          <ul className="list-disc pl-5 space-y-2 text-sm leading-6 text-slate-700">
            <li>When you select a driver on a dispatch, a copy of the dispatch and a notification will be sent to the driver.</li>
            <li>Any subsequent status changes by the admin will also be received by the driver as long as they remain assigned.</li>
            <li>If you remove a driver from the dispatch assignment, they will immediately receive a cancellation.</li>
            <li>If you still have a driver assigned, and switch the driver, the driver you removed will immediately receive a cancellation, and the driver you added will immediately receive a new dispatch notification.</li>
            <li>When you switch trucks, the driver assignment will reset and the driver will receive a cancellation if you have one assigned.</li>
            <li>Please make sure to reassign the drivers to the correct dispatch if you switch trucks.</li>
            <li>If you select a driver and do nothing, they will receive notifications and dispatch updates the same way you receive them, except they will only receive the ones pertaining to the dispatch they are assigned to.</li>
          </ul>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Driver' : 'Add Driver'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Driver Name *</Label>
              <Input
                value={form.driver_name}
                onChange={(e) => setForm((prev) => ({ ...prev, driver_name: e.target.value }))}
                placeholder="Driver name"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone} onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))} placeholder="Phone number" />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Notes"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Active</Label>
                <p className="text-xs text-slate-500">Inactive drivers remain in records but cannot be treated as active.</p>
              </div>
              <Switch
                checked={form.status === 'Active'}
                onCheckedChange={(checked) => setForm((prev) => ({ ...prev, status: checked ? 'Active' : 'Inactive' }))}
              />
            </div>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full bg-slate-900 hover:bg-slate-800">
              {saveMutation.isPending ? 'Saving...' : 'Save Driver'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
