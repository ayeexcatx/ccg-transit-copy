import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import DeleteConfirmationDialog from '@/components/admin/DeleteConfirmationDialog';
import { Key, Plus, Pencil, Trash2, Building2, Shield, Copy, UserRound } from 'lucide-react';
import { getCompanyOwnerSmsState, getDriverSmsState, normalizeSmsPhone as normalizePhoneShared, formatPhoneNumber as formatPhoneShared, hasUsSmsPhone } from '@/lib/sms';
import { buildSmsConsentFields } from '@/lib/smsConsent';
import SmsConsentDisclosure from '@/components/profile/SmsConsentDisclosure';
import { toast } from 'sonner';

function formatPhoneNumber(value) {
  return formatPhoneShared(value);
}

function normalizeSmsPhone(value) {
  return normalizePhoneShared(value);
}

function formatDateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

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
  const [accessCodePendingDelete, setAccessCodePendingDelete] = useState(null);
  const [smsConsentChecked, setSmsConsentChecked] = useState(false);
  const [form, setForm] = useState({
    code: '',
    label: '',
    active_flag: true,
    code_type: 'CompanyOwner',
    company_id: '',
    allowed_trucks: [],
    driver_id: '',
    sms_enabled: false,
    sms_phone: '',
    available_views: [],
    linked_company_ids: [],
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
      queryClient.invalidateQueries({ queryKey: ['drivers-all-nav'] });
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
      code_type: type || 'CompanyOwner',
      company_id: '',
      allowed_trucks: [],
      driver_id: '',
      sms_enabled: false,
      sms_phone: '',
      available_views: type === 'Admin' ? ['Admin'] : [],
      linked_company_ids: [],
    });
    setOpen(true);
    setSmsConsentChecked(false);
  };

  const openPendingDriverCodeDialog = (driver) => {
    setEditing(null);
    setForm({
      code: generateCode(),
      label: driver.driver_name || '',
      active_flag: true,
      code_type: 'Driver',
      company_id: driver.company_id || '',
      allowed_trucks: [],
      driver_id: driver.id || '',
      sms_enabled: driver.sms_enabled === true,
      sms_phone: formatPhoneNumber(driver.phone || ''),
      available_views: [],
      linked_company_ids: [],
    });
    setOpen(true);
    setSmsConsentChecked(false);
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
      sms_enabled: code.sms_enabled === true,
      sms_phone: formatPhoneNumber(code.sms_phone || ''),
      available_views: code.available_views || (code.code_type === 'Admin' ? ['Admin'] : []),
      linked_company_ids: code.linked_company_ids || [],
    });
    setOpen(true);
    setSmsConsentChecked(false);
  };

  const toggleTruck = (t) => {
    const has = form.allowed_trucks.includes(t);
    setForm({
      ...form,
      allowed_trucks: has
        ? form.allowed_trucks.filter((x) => x !== t)
        : [...form.allowed_trucks, t],
    });
  };

  const toggleView = (view) => {
    const has = form.available_views.includes(view);
    const nextViews = has
      ? form.available_views.filter((v) => v !== view)
      : [...form.available_views, view];

    setForm({
      ...form,
      available_views: nextViews,
      linked_company_ids: nextViews.includes('CompanyOwner') ? form.linked_company_ids : [],
    });
  };

  const toggleLinkedCompany = (companyId) => {
    const has = form.linked_company_ids.includes(companyId);
    setForm({
      ...form,
      linked_company_ids: has
        ? form.linked_company_ids.filter((id) => id !== companyId)
        : [...form.linked_company_ids, companyId],
    });
  };

  const handleSave = () => {
    if (!form.code.trim()) return;

    const smsPhone = normalizeSmsPhone(form.sms_phone);

    if (form.code_type === 'Driver') {
      if (!form.company_id || !form.driver_id) return;
      const driver = drivers.find((d) => d.id === form.driver_id);
      const driverSmsState = getDriverSmsState(driver);
      saveMutation.mutate({
        code: form.code,
        label: form.label || driver?.driver_name || '',
        active_flag: form.active_flag,
        code_type: 'Driver',
        company_id: form.company_id,
        driver_id: form.driver_id,
        allowed_trucks: [],
        sms_enabled: driverSmsState.effective,
        sms_phone: driverSmsState.normalizedPhone || '',
        available_views: [],
        linked_company_ids: [],
      });
      return;
    }

    if (form.code_type === 'Admin') {
      if (form.sms_enabled && !smsConsentChecked) {
        toast.error('Consent is required before enabling SMS notifications.');
        return;
      }

      if (form.sms_enabled && !hasUsSmsPhone(smsPhone)) {
        toast.error('Enter a valid US 10-digit SMS phone number (example: (555) 123-4567).');
        return;
      }

      const normalizedViews = Array.from(new Set(['Admin', ...(form.available_views || [])]));
      const requiresLinkedCompanies = normalizedViews.includes('CompanyOwner');
      const linkedCompanyIds = form.linked_company_ids || [];

      if (requiresLinkedCompanies && linkedCompanyIds.length === 0) {
        toast.error('Select at least one linked company when Company Owner workspace is enabled');
        return;
      }

      const payload = {
        ...form,
        sms_phone: smsPhone,
        available_views: normalizedViews,
        linked_company_ids: linkedCompanyIds,
      };
      if (form.sms_enabled) {
        Object.assign(payload, buildSmsConsentFields());
      }
      saveMutation.mutate(payload);
      return;
    }

    if (form.code_type === 'CompanyOwner') {
      const company = companies.find((companyRecord) => companyRecord.id === form.company_id);
      const ownerSmsState = getCompanyOwnerSmsState({ accessCode: editing || form, company });
      saveMutation.mutate({
        ...form,
        sms_enabled: ownerSmsState.effective,
        sms_phone: ownerSmsState.normalizedPhone || '',
        available_views: [],
        linked_company_ids: [],
      });
      return;
    }

    toast.error('Unsupported access code type. Use Admin, Company Owner, or Driver.');
    return;
  };

  const copyCode = (code) => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied');
  };

  const codeTypeIcons = { CompanyOwner: Building2, Admin: Shield, Driver: UserRound };

  const confirmDeleteAccessCode = () => {
    if (!accessCodePendingDelete) return;
    deleteMutation.mutate(accessCodePendingDelete.id, {
      onSuccess: () => setAccessCodePendingDelete(null),
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Access Codes</h2>
          <p className="text-sm text-slate-500">{codes.length} codes</p>
        </div>
        <div className="flex gap-2 flex-wrap">
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
                  <div key={driver.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white rounded-lg border p-3 gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-sm min-w-0 flex-1">
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">Driver</p>
                        <p className="font-medium text-slate-900 truncate">{driver.driver_name || 'Unnamed driver'}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">Company</p>
                        <p className="text-slate-700 truncate">{company?.name || 'Unknown company'}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">Phone</p>
                        <p className="text-slate-700 truncate">{driver.phone || '—'}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-slate-500">Current Status</p>
                        <Badge variant="outline">{driver.access_code_status || 'Not Requested'}</Badge>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      className="text-xs"
                      disabled={saveMutation.isPending}
                      onClick={() => openPendingDriverCodeDialog(driver)}
                    >
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
            const driverSmsState = c.code_type === 'Driver' ? getDriverSmsState(driver) : null;
            const ownerSmsState = c.code_type === 'CompanyOwner' ? getCompanyOwnerSmsState({ accessCode: c, company: comp }) : null;
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
                        {c.label && <p className="text-sm text-slate-600 mt-0.5">Name: {c.label}</p>}
                        <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                          {comp && <span>Company: {comp.name}</span>}
                          {driver && <span>Driver: {driver.driver_name || driver.id}</span>}
                          {c.code_type === 'Driver' && driverSmsState && <span>SMS enabled: {driverSmsState.effective ? 'Yes' : 'No'}</span>}
                          {c.code_type === 'Driver' && driverSmsState?.normalizedPhone && <span>SMS phone: {formatPhoneNumber(driverSmsState.normalizedPhone)}</span>}
                          {c.code_type === 'CompanyOwner' && ownerSmsState && <span>SMS enabled: {ownerSmsState.effective ? 'Yes' : 'No'}</span>}
                          {c.code_type === 'CompanyOwner' && ownerSmsState?.normalizedPhone && <span>SMS phone: {formatPhoneNumber(ownerSmsState.normalizedPhone)}</span>}
                          {c.code_type === 'Admin' && c.sms_enabled === true && c.sms_phone && <span>SMS: {formatPhoneNumber(c.sms_phone)}</span>}
                          {c.code_type === 'Admin' && <span>Consent: {c.sms_consent_given === true ? 'Given' : 'Not recorded'}</span>}
                          {c.code_type !== 'Driver' && (c.allowed_trucks || []).length > 0 && (
                            <span>Trucks: {c.allowed_trucks.join(', ')}</span>
                          )}
                          {c.code_type === 'Admin' && (c.available_views || []).length > 0 && (
                            <span>Views: {(c.available_views || []).join(', ')}</span>
                          )}
                          {c.code_type === 'Admin' && (c.linked_company_ids || []).length > 0 && (
                            <span>Linked companies: {(c.linked_company_ids || []).length}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)} className="h-8 w-8">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setAccessCodePendingDelete(c)} className="h-8 w-8 text-red-500 hover:text-red-600">
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


      <DeleteConfirmationDialog
        open={!!accessCodePendingDelete}
        onOpenChange={(openState) => !openState && setAccessCodePendingDelete(null)}
        title="Delete Access Code?"
        description="Are you sure you want to delete this access code? This action cannot be undone."
        onConfirm={confirmDeleteAccessCode}
        isDeleting={deleteMutation.isPending}
      />

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
              <Label>Name</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g., Owner ABC, Driver Jane Doe" />
            </div>
            <div>
              <Label>Code Type</Label>
              <Select
                value={form.code_type}
                onValueChange={(v) => setForm({ ...form, code_type: v, allowed_trucks: [], company_id: '', driver_id: '', available_views: v === 'Admin' ? ['Admin'] : [], linked_company_ids: [] })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CompanyOwner">Company Owner</SelectItem>
                  <SelectItem value="Driver">Driver</SelectItem>
                  <SelectItem value="Admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>


            {form.code_type === 'Admin' && (
              <div className="space-y-3">
                <div>
                  <Label>Available Workspaces</Label>
                  <div className="flex gap-2 flex-wrap mt-1">
                    {['Admin', 'CompanyOwner'].map((view) => (
                      <button
                        key={view}
                        onClick={() => toggleView(view)}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                          form.available_views.includes(view)
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                        }`}
                      >
                        {view === 'CompanyOwner' ? 'Company Owner' : view}
                      </button>
                    ))}
                  </div>
                </div>

                {form.available_views.includes('CompanyOwner') && (
                  <div>
                    <Label>Linked Companies</Label>
                    <div className="flex gap-2 flex-wrap mt-1">
                      {companies.map((company) => (
                        <button
                          key={company.id}
                          onClick={() => toggleLinkedCompany(company.id)}
                          className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                            form.linked_company_ids.includes(company.id)
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                          }`}
                        >
                          {company.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

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
                    <Label>Select Trucks</Label>
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

            {form.code_type === 'Admin' ? (<>
            <div className="flex items-center justify-between">
              <Label>SMS Enabled</Label>
              <Switch
                checked={form.sms_enabled}
                disabled={!smsConsentChecked && !form.sms_enabled}
                onCheckedChange={(v) => {
                  if (v && !smsConsentChecked) {
                    toast.error('Consent is required before enabling SMS notifications.');
                    return;
                  }
                  setForm({ ...form, sms_enabled: v });
                }}
              />
            </div>
            <label className="flex items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
              <Checkbox checked={smsConsentChecked} onCheckedChange={(checked) => setSmsConsentChecked(checked === true)} className="mt-0.5" />
              <span>I agree to receive operational SMS notifications from CCG Transit.</span>
            </label>
            <SmsConsentDisclosure />

            <div>
              <Label>SMS Phone</Label>
              <Input
                value={form.sms_phone}
                onChange={(e) => setForm({ ...form, sms_phone: formatPhoneNumber(e.target.value) })}
                placeholder="(555) 123-4567"
              />
            </div>
            </>) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                SMS fields for company owner and driver access codes are informational here. Manage consent from Profile and company/driver records.
              </div>
            )}

            {editing && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-2">SMS Compliance</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div className="text-slate-500">sms_enabled</div>
                  <div className="text-slate-800">{editing.sms_enabled === true ? 'true' : 'false'}</div>
                  <div className="text-slate-500">sms_phone</div>
                  <div className="text-slate-800">{editing.sms_phone ? formatPhoneNumber(editing.sms_phone) : '—'}</div>
                  <div className="text-slate-500">sms_consent_given</div>
                  <div className="text-slate-800">{editing.sms_consent_given === true ? 'true' : 'false'}</div>
                  <div className="text-slate-500">sms_consent_at</div>
                  <div className="text-slate-800">{formatDateTime(editing.sms_consent_at)}</div>
                  <div className="text-slate-500">sms_consent_method</div>
                  <div className="text-slate-800 break-all">{editing.sms_consent_method || '—'}</div>
                  <div className="text-slate-500">sms_opted_out_at</div>
                  <div className="text-slate-800">{formatDateTime(editing.sms_opted_out_at)}</div>
                  <div className="text-slate-500">sms_intro_sent_at</div>
                  <div className="text-slate-800">{formatDateTime(editing.sms_intro_sent_at)}</div>
                </div>
              </div>
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
