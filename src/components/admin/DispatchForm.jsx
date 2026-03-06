import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import { notifyDispatchChange, reconcileOwnerNotificationsForDispatch } from '@/components/notifications/createNotifications';

export default function DispatchForm({ dispatch, companies, accessCodes, onSave, onCancel, saving }) {
  const [form, setForm] = useState({
    company_id: '', date: '', shift_time: 'Day Shift', client_name: '', job_number: '',
    start_time: '', start_location: '', instructions: 'Deliver material to / from',
    notes: '', toll_status: '', trucks_assigned: [],
    status: 'Scheduled', additional_assignments: [],
    amendment_history: [], canceled_reason: ''
  });

  useEffect(() => {
    if (dispatch) {
      setForm({
        company_id: dispatch.company_id || '',
        date: dispatch.date || '',
        shift_time: dispatch.shift_time || 'Day Shift',
        client_name: dispatch.client_name || '',
        job_number: dispatch.job_number || '',
        start_time: dispatch.start_time || '',
        start_location: dispatch.start_location || '',
        instructions: dispatch.instructions || 'Deliver material to / from',
        notes: dispatch.notes || '',
        toll_status: dispatch.toll_status || '',
        trucks_assigned: dispatch.trucks_assigned || [],
        status: dispatch.status || 'Scheduled',
        additional_assignments: dispatch.additional_assignments || [],
        amendment_history: dispatch.amendment_history || [],
        canceled_reason: dispatch.canceled_reason || ''
      });
    }
  }, [dispatch]);

  const selectedCompany = companies.find((c) => c.id === form.company_id);
  const availableTrucks = selectedCompany?.trucks || [];

  const isConfirmed = form.status === 'Scheduled';
  const isFullDispatch = form.status === 'Dispatch' || form.status === 'Amended';
  const isCanceled = form.status === 'Cancelled';

  const toggleTruck = (t) => {
    setForm((prev) => ({
      ...prev,
      trucks_assigned: prev.trucks_assigned.includes(t) ?
      prev.trucks_assigned.filter((x) => x !== t) :
      [...prev.trucks_assigned, t]
    }));
  };

  const addAssignment = () => {
    setForm((prev) => ({
      ...prev,
      additional_assignments: [...prev.additional_assignments, { job_number: '', start_time: '', start_location: '', instructions: '', notes: '', toll_status: '' }]
    }));
  };

  const updateAssignment = (idx, field, val) => {
    const arr = [...form.additional_assignments];
    arr[idx] = { ...arr[idx], [field]: val };
    setForm({ ...form, additional_assignments: arr });
  };

  const removeAssignment = (idx) => {
    setForm({ ...form, additional_assignments: form.additional_assignments.filter((_, i) => i !== idx) });
  };

  const handleSubmit = async () => {
    // Base validation
    if (!form.company_id || !form.date || !form.shift_time || form.trucks_assigned.length === 0) {
      alert('Please fill in Company, Date, Shift Time, and assign at least one truck');
      return;
    }

    // Status-specific validation
    if (isFullDispatch && !form.start_location) {
      alert('Start Location is required for Dispatch/Amended status');
      return;
    }

    if (isCanceled && !form.canceled_reason) {
      alert('Cancellation reason is required for Cancelled status');
      return;
    }

    // Warnings for recommended fields
    if (isFullDispatch) {
      if (!form.start_time && !window.confirm('Start Time is blank. Continue anyway?')) return;
      if (!form.instructions && !window.confirm('Instructions are blank. Continue anyway?')) return;
    }

    // Track amendments
    let finalForm = { ...form };
    if (dispatch && form.status === 'Amended' && dispatch.status !== 'Amended') {
      const changes = [];
      if (dispatch.start_location !== form.start_location) changes.push('location');
      if (dispatch.start_time !== form.start_time) changes.push('time');
      if (dispatch.instructions !== form.instructions) changes.push('instructions');
      if (JSON.stringify(dispatch.trucks_assigned) !== JSON.stringify(form.trucks_assigned)) changes.push('trucks');

      if (changes.length > 0) {
        finalForm.amendment_history = [
        ...(finalForm.amendment_history || []),
        { amended_at: new Date().toISOString(), changes: `Updated: ${changes.join(', ')}` }];

      }
    }

    // Ensure date is stored as plain YYYY-MM-DD string (no Date conversion)
    finalForm.date = form.date;

    const oldStatus = dispatch && !dispatch._isCopy ? dispatch.status : null;
    const newStatus = finalForm.status;

    const savedDispatch = await onSave(finalForm);
    const dispatchForNotifications = savedDispatch || finalForm;

    await notifyDispatchChange(dispatchForNotifications, oldStatus, newStatus, companies, accessCodes);
    await reconcileOwnerNotificationsForDispatch(dispatchForNotifications, accessCodes);
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label>Company *</Label>
          <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v, trucks_assigned: [] })}>
            <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
            <SelectContent>
              {companies.filter((c) => c.status === 'active').map((c) =>
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Scheduled">Scheduled (pending dispatch)</SelectItem>
              <SelectItem value="Dispatch">Dispatch (full details)</SelectItem>
              <SelectItem value="Amended">Amended</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Date *</Label>
          {/* value is kept as YYYY-MM-DD string — no Date object conversion */}
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div>
          <Label>Shift *</Label>
          <Select value={form.shift_time} onValueChange={(v) => setForm({ ...form, shift_time: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Day Shift">Day Shift</SelectItem>
              <SelectItem value="Night Shift">Night Shift</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {!isConfirmed &&
        <>
            <div>
              <Label>Client Name</Label>
              <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
            </div>
          </>
        }
      </div>

      {!isConfirmed &&
      <>
          {/* Assignment 1 — primary */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assignment 1 (Primary)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Job Number</Label>
                <Input placeholder="Job #" value={form.job_number || ''} onChange={(e) => setForm({ ...form, job_number: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Start Time</Label>
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Start Location {isFullDispatch && '*'}</Label>
              <Textarea value={form.start_location} onChange={(e) => setForm({ ...form, start_location: e.target.value })} rows={2} placeholder="Enter address (multi-line supported)" />
            </div>
            <div>
              <Label>Instructions {isFullDispatch && '(recommended)'}</Label>
              <Textarea value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} rows={2} />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
            <div>
              <Label className="text-xs">Toll Status</Label>
              <Select value={form.toll_status} onValueChange={(v) => setForm({ ...form, toll_status: v })}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Authorized">Authorized</SelectItem>
                  <SelectItem value="Unauthorized">Unauthorized</SelectItem>
                  <SelectItem value="Included in Rate">Included in Rate</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isCanceled &&
          <div>
                <Label>Cancellation Reason *</Label>
                <Textarea value={form.canceled_reason} onChange={(e) => setForm({ ...form, canceled_reason: e.target.value })} rows={2} placeholder="Reason for cancellation..." />
              </div>
          }
          </div>
        </>
      }

      {/* Trucks */}
      <div>
        <Label>Trucks Assigned * {!form.company_id && <span className="text-xs text-slate-400 ml-1">(select company first)</span>}</Label>
        <div className="flex gap-2 flex-wrap mt-1">
          {availableTrucks.map((t) =>
          <button
            key={t}
            onClick={() => toggleTruck(t)}
            disabled={!form.company_id}
            className={`px-3 py-1.5 rounded-lg border text-sm font-mono transition-colors ${
            form.trucks_assigned.includes(t) ?
            'bg-slate-900 text-white border-slate-900' :
            'bg-white text-slate-700 border-slate-200 hover:border-slate-400'} disabled:opacity-40`
            }>

              {t}
            </button>
          )}
          {form.company_id && availableTrucks.length === 0 &&
          <span className="text-xs text-slate-400">No trucks on this company</span>
          }
        </div>
      </div>

      {/* Additional Assignments - only for non-confirmed dispatches */}
      {!isConfirmed &&
      <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Additional Assignments</Label>
            <Button type="button" variant="outline" size="sm" onClick={addAssignment} className="text-xs">
              <Plus className="h-3 w-3 mr-1" />Add Assignment
            </Button>
          </div>
          {form.additional_assignments.map((a, i) =>
        <div key={i} className={`rounded-lg border border-slate-200 p-4 space-y-3 ${i % 2 === 0 ? 'bg-slate-50' : 'bg-blue-50/40'}`}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Assignment {i + 2}</p>
                <Button variant="ghost" size="icon" onClick={() => removeAssignment(i)} className="h-7 w-7 text-red-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Job Number</Label>
                  <Input placeholder="Job #" value={a.job_number || ''} onChange={(e) => updateAssignment(i, 'job_number', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Start Time</Label>
                  <Input type="time" value={a.start_time} onChange={(e) => updateAssignment(i, 'start_time', e.target.value)} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Start Location</Label>
                <Textarea placeholder="Enter address (multi-line supported)" value={a.start_location} onChange={(e) => updateAssignment(i, 'start_location', e.target.value)} rows={2} />
              </div>
              <div>
                <Label className="text-xs">Instructions</Label>
                <Textarea placeholder="Instructions" value={a.instructions} onChange={(e) => updateAssignment(i, 'instructions', e.target.value)} rows={2} />
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea placeholder="Notes" value={a.notes || ''} onChange={(e) => updateAssignment(i, 'notes', e.target.value)} rows={2} />
              </div>
              <div>
                <Label className="text-xs">Toll Status</Label>
                <Select value={a.toll_status || ''} onValueChange={(v) => updateAssignment(i, 'toll_status', v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Authorized">Authorized</SelectItem>
                    <SelectItem value="Unauthorized">Unauthorized</SelectItem>
                    <SelectItem value="Included in Rate">Included in Rate</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
        )}
        </div>
      }

      <div className="flex gap-3 pt-2">
        <Button variant="outline" onClick={onCancel} className="bg-background text-red-600 px-4 py-2 text-sm font-medium rounded-md inline-flex items-center justify-center gap-2 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 border border-input shadow-sm hover:bg-accent hover:text-accent-foreground h-9 flex-1">Cancel</Button>
        <Button onClick={handleSubmit} disabled={saving} className="flex-1 bg-slate-900 hover:bg-slate-800">
          {saving ? 'Saving...' : dispatch ? 'Update Dispatch' : 'Create Dispatch'}
        </Button>
      </div>
    </div>);

}
