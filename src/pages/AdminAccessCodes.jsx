import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Key, Plus, Pencil, Trash2, Truck, Building2, Shield, Copy, UserRound } from 'lucide-react';
import { toast } from 'sonner';

function generateCode(len = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = '';
  for (let i = 0; i < len; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
  return result;
}

export default function AdminAccessCodes() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({
    code: '',
    label: '',
    active_flag: true,
    code_type: 'Truck',
    company_id: '',
    allowed_trucks: [],
    driver_id: '',
  });

  const { data: codes = [], isLoading } = useQuery({
    queryKey: ['access-codes'],
    queryFn: () => base44.entities.AccessCode.list(),
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.list(),
  });

  const { data: drivers = [] } = useQuery({
    queryKey: ['drivers-all'],
    queryFn: () => base44.entities.Driver.list('-created_date', 500),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editing) {
        const updated = await base44.entities.AccessCode.update(editing.id, data);
        if (data.code_type === 'Driver' && data.driver_id) {
          await base44.entities.Driver.update(data.driver_id, {
            access_code_id: updated.id,
            access_code_status: 'Created',
          });
        }
        return updated;
      }

      const created = await base44.entities.AccessCode.create(data);
      if (data.code_type === 'Driver' && data.driver_id) {
        await base44.entities.Driver.update(data.driver_id, {
          access_code_id: created.id,
          access_code_status: 'Created',
        });
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['access-codes'] });
      queryClient.invalidateQueries({ queryKey: ['drivers-all'] });
      setOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.AccessCode.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['access-codes'] }),
  });

  const selectedCompany = companies.find((c) => c.id === form.company_id);
  const companyTrucks = selectedCompany?.trucks || [];
  const driversForCompany = useMemo(
    () => drivers.filter((d) => d.company_id === form.company_id),
    [drivers, form.company_id],
  );

  const pendingDrivers = useMemo(
    () => drivers.filter((d) => d.access_code_status === 'Pending'),
    [drivers],
  );

  const openNew = (type) => {
    setEditing(null);
    setForm({
      code: generateCode(),
      label: '',
      active_flag: true,
      code_type: type || 'Truck',
      company_id: '',
      allowed_trucks: [],
      driver_id: '',
    });
    setOpen(true);
  };

  const openEdit = (code) => {
    setEditing(code);
    setForm({
      code: code.code,
      label: code.label || '',
      active_flag: code.active_flag !== false,
      code_type: code.code_type,
      company_id: code.company_id || '',
      allowed_trucks: code.allowed_trucks || [],
      driver_id: code.driver_id || '',
    });
    setOpen(true);
  };

  const openNewDriverCode = (driver) => {
    setEditing(null);
    setForm({
      code: generateCode(),
      label: driver.driver_name || '',
      active_flag: true,
      code_type: 'Driver',
      company_id: driver.company_id || '',
      allowed_trucks: [],
      driver_id: driver.id,
    });
    setOpen(true);
  };

  const toggleTruck = (t) => {
    if (form.code_type === 'Truck') {
      setForm({ ...form, allowed_trucks: [t] });
      return;
    }

    const has = form.allowed_trucks.includes(t);
    setForm({
      ...form,
      allowed_trucks: has
        ? form.allowed_trucks.filter((x) => x !== t)
        : [...form.allowed_trucks, t],
    });
  };

  const handleSave = () => {
    if (!form.code.trim()) return;

    if (form.code_type === 'Driver') {
      if (!form.company_id || !form.driver_id) return;
      saveMutation.mutate({
        code: form.code,
        label: form.label || drivers.find((d) => d.id === form.driver_id)?.driver_name || '',
        active_flag: form.active_flag,
        code_type: 'Driver',
        company_id: form.company_id,
        driver_id: form.driver_id,
        allowed_trucks: [],
      });
      return;
    }

    saveMutation.mutate(form);
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied');
  };

  const codeTypeIcons = { Truck, CompanyOwner: Building2, Admin: Shield, Driver: UserRound };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Access Codes</h2>
          <p className="text-sm text-slate-500">{codes.length} codes</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => openNew('Truck')} className="text-xs">
            <Truck className="h-3.5 w-3.5 mr-1" />Truck Code
          </Button>
          <Button variant="outline" onClick={() => openNew('CompanyOwner')} className="text-xs">
            <Building2 className="h-3.5 w-3.5 mr-1" />Owner Code
          </Button>
          <Button variant="outline" onClick={() => openNew('Driver')} className="text-xs">
            <UserRound className="h-3.5 w-3.5 mr-1" />Driver Code
          </Button>
          <Button onClick={() => openNew('Admin')} className="bg-slate-900 hover:bg-slate-800 text-xs">
            <Shield className="h-3.5 w-3.5 mr-1" />Admin Code
          </Button>
        </div>
      </div>

      {pendingDrivers.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-4 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-amber-900">Pending Driver Access Code Requests</h3>
              <p className="text-xs text-amber-700">Create a Driver code for requested drivers.</p>
            </div>
            <div className="space-y-2">
              {pendingDrivers.map((driver) => {
                const company = companies.find((c) => c.id === driver.company_id);
                return (
                  <div key={driver.id} className="flex items-center justify-between bg-white rounded-lg border p-3 gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{driver.driver_name || 'Unnamed driver'}</p>
                      <p className="text-xs text-slate-500 truncate">{company?.name || 'Unknown company'}</p>
                    </div>
                    <Button size="sm" className="text-xs" onClick={() => openNewDriverCode(driver)}>
                      <Plus className="h-3.5 w-3.5 mr-1" />Create Code
                    </Button>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-slate-300 border-t-slate-700 rounded-full" />
        </div>
      ) : codes.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">No access codes yet</div>
      ) : (
        <div className="grid gap-3">
          {codes.map((c) => {
            const Icon = codeTypeIcons[c.code_type] || Key;
            const comp = companies.find((co) => co.id === c.company_id);
            const driver = drivers.find((d) => d.id === c.driver_id);
            return (
              <Card key={c.id} className={`transition-shadow hover:shadow-sm ${c.active_flag === false ? 'opacity-50' : ''}`}>
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        <Icon className="h-5 w-5 text-slate-500" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-sm text-slate-900 tracking-wide">{c.code}</span>
                          <button onClick={() => copyCode(c.code)} className="text-slate-400 hover:text-slate-600">
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                          <Badge variant={c.active_flag !== false ? 'default' : 'secondary'} className="text-xs">
                            {c.active_flag !== false ? 'Active' : 'Inactive'}
                          </Badge>
                          <Badge variant="outline" className="text-xs">{c.code_type}</Badge>
                        </div>
                        {c.label && <p className="text-sm text-slate-600 mt-0.5">{c.label}</p>}
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                          {comp && <span>Company: {comp.name}</span>}
                          {driver && <span>Driver: {driver.driver_name || driver.id}</span>}
                          {c.code_type !== 'Driver' && (c.allowed_trucks || []).length > 0 && (
                            <span>Trucks: {c.allowed_trucks.join(', ')}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)} className="h-8 w-8">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(c.id)} className="h-8 w-8 text-red-500 hover:text-red-600">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Access Code' : `New ${form.code_type} Code`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Code *</Label>
              <div className="flex gap-2">
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="font-mono tracking-wide" />
                <Button type="button" variant="outline" onClick={() => setForm({ ...form, code: generateCode() })}>
                  Generate
                </Button>
              </div>
            </div>
            <div>
              <Label>Label</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g., Truck 401, Owner ABC" />
            </div>
            <div>
              <Label>Code Type</Label>
              <Select
                value={form.code_type}
                onValueChange={(v) => setForm({ ...form, code_type: v, allowed_trucks: [], company_id: '', driver_id: '' })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Truck">Truck</SelectItem>
                  <SelectItem value="CompanyOwner">Company Owner</SelectItem>
                  <SelectItem value="Driver">Driver</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.code_type !== 'Admin' && (
              <>
                <div>
                  <Label>Company *</Label>
                  <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v, allowed_trucks: [], driver_id: '' })}>
                    <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {form.code_type === 'Driver' && form.company_id && (
                  <div>
                    <Label>Driver *</Label>
                    <Select
                      value={form.driver_id}
                      onValueChange={(v) => {
                        const selectedDriver = drivers.find((d) => d.id === v);
                        setForm({
                          ...form,
                          driver_id: v,
                          label: form.label || selectedDriver?.driver_name || '',
                        });
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                      <SelectContent>
                        {driversForCompany.map((driver) => (
                          <SelectItem key={driver.id} value={driver.id}>{driver.driver_name || driver.id}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {form.code_type !== 'Driver' && form.company_id && companyTrucks.length > 0 && (
                  <div>
                    <Label>{form.code_type === 'Truck' ? 'Select Truck' : 'Select Trucks'}</Label>
                    <div className="flex gap-2 flex-wrap mt-1">
                      {companyTrucks.map((t) => (
                        <button
                          key={t}
                          onClick={() => toggleTruck(t)}
                          className={`px-3 py-1.5 rounded-lg border text-sm font-mono transition-colors ${
                            form.allowed_trucks.includes(t)
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={form.active_flag} onCheckedChange={(v) => setForm({ ...form, active_flag: v })} />
            </div>

            <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full bg-slate-900 hover:bg-slate-800">
              {saveMutation.isPending ? 'Saving...' : 'Save Code'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
