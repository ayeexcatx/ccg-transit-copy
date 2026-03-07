import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building2, Plus, Pencil, Trash2, X, Truck } from 'lucide-react';

export default function AdminCompanies() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', contact_info: '', trucks: [], status: 'active' });
  const [truckInput, setTruckInput] = useState('');

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.list(),
  });

  const saveMutation = useMutation({
    mutationFn: (data) => editing
      ? base44.entities.Company.update(editing.id, data)
      : base44.entities.Company.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      closeDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Company.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['companies'] }),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', contact_info: '', trucks: [], status: 'active' });
    setTruckInput('');
    setOpen(true);
  };

  const openEdit = (company) => {
    setEditing(company);
    setForm({
      name: company.name || '',
      contact_info: company.contact_info || '',
      trucks: company.trucks || [],
      status: company.status || 'active',
    });
    setTruckInput('');
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setEditing(null);
  };

  const addTruck = () => {
    const val = truckInput.trim();
    if (val && !form.trucks.includes(val)) {
      setForm({ ...form, trucks: [...form.trucks, val] });
    }
    setTruckInput('');
  };

  const removeTruck = (t) => {
    setForm({ ...form, trucks: form.trucks.filter(x => x !== t) });
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    saveMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Companies</h2>
          <p className="text-sm text-slate-500">{companies.length} companies</p>
        </div>
        <Button onClick={openNew} className="bg-slate-900 hover:bg-slate-800">
          <Plus className="h-4 w-4 mr-2" />Add Company
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin h-6 w-6 border-2 border-slate-300 border-t-slate-700 rounded-full" />
        </div>
      ) : companies.length === 0 ? (
        <div className="text-center py-16 text-slate-500 text-sm">No companies yet</div>
      ) : (
        <div className="grid gap-3">
          {companies.map(c => (
            <Card key={c.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-slate-500" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-slate-700">{c.name}</h3>
                        <Badge variant={c.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                          {c.status}
                        </Badge>
                      </div>
                      {c.contact_info && <p className="text-sm text-slate-500 mt-0.5">{c.contact_info}</p>}
                      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                        <Truck className="h-3.5 w-3.5 text-slate-400" />
                        {(c.trucks || []).length === 0 ? (
                          <span className="text-xs text-slate-400">No trucks</span>
                        ) : (
                          (c.trucks || []).map(t => (
                            <Badge key={t} variant="outline" className="text-xs font-mono">{t}</Badge>
                          ))
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
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Company' : 'New Company'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Company Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Contact Info</Label>
              <Input value={form.contact_info} onChange={e => setForm({ ...form, contact_info: e.target.value })} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Trucks</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={truckInput}
                  onChange={e => setTruckInput(e.target.value)}
                  placeholder="Truck number"
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTruck())}
                />
                <Button type="button" variant="outline" onClick={addTruck}>Add</Button>
              </div>
              <div className="flex gap-1.5 flex-wrap mt-2">
                {form.trucks.map(t => (
                  <Badge key={t} variant="secondary" className="gap-1 pr-1">
                    {t}
                    <button onClick={() => removeTruck(t)} className="hover:bg-slate-300 rounded-full p-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
            <Button onClick={handleSave} disabled={saveMutation.isPending} className="w-full bg-slate-900 hover:bg-slate-800">
              {saveMutation.isPending ? 'Saving...' : 'Save Company'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}