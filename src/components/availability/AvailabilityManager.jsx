import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, addWeeks, addMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  VIEW_MODES,
  STATUS_AVAILABLE,
  STATUS_UNAVAILABLE,
  WEEKDAY_LABELS,
  getOperationalShifts,
  buildShiftLabel,
  getStatusClass,
  normalizeCount,
  toDateKey,
} from './availabilityRules';

const WEEKDAY_SHORT_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function AvailabilityManager({ companyId, canSelectCompany = false }) {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('week');
  const [activeDate, setActiveDate] = useState(new Date());
  const [editing, setEditing] = useState(null);
  const [editStatus, setEditStatus] = useState(STATUS_AVAILABLE);
  const [editCount, setEditCount] = useState('');
  const [formError, setFormError] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [adminCompanyId, setAdminCompanyId] = useState('');

  const selectedCompanyId = canSelectCompany ? adminCompanyId : companyId;

  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => base44.entities.Company.list(),
    enabled: canSelectCompany,
  });

  const filteredCompanies = useMemo(() => {
    const term = companySearch.trim().toLowerCase();
    if (!term) return companies;
    return companies.filter((company) => (company.name || company.id || '').toLowerCase().includes(term));
  }, [companies, companySearch]);

  const { data: defaults = [] } = useQuery({
    queryKey: ['company-availability-defaults', selectedCompanyId],
    queryFn: () => base44.entities.CompanyAvailabilityDefault.filter({ company_id: selectedCompanyId }, '-created_date', 200),
    enabled: !!selectedCompanyId,
  });

  const { data: overrides = [] } = useQuery({
    queryKey: ['company-availability-overrides', selectedCompanyId],
    queryFn: () => base44.entities.CompanyAvailabilityOverride.filter({ company_id: selectedCompanyId }, '-created_date', 500),
    enabled: !!selectedCompanyId,
  });

  const upsertDefaultMutation = useMutation({
    mutationFn: async (payload) => {
      const existing = defaults.find((item) => item.weekday === payload.weekday && item.shift === payload.shift);
      if (existing) return base44.entities.CompanyAvailabilityDefault.update(existing.id, payload);
      return base44.entities.CompanyAvailabilityDefault.create(payload);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company-availability-defaults', selectedCompanyId] }),
  });

  const upsertOverrideMutation = useMutation({
    mutationFn: async (payload) => {
      const existing = overrides.find((item) => item.date === payload.date && item.shift === payload.shift);
      if (existing) return base44.entities.CompanyAvailabilityOverride.update(existing.id, payload);
      return base44.entities.CompanyAvailabilityOverride.create(payload);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company-availability-overrides', selectedCompanyId] }),
  });

  const clearOverrideMutation = useMutation({
    mutationFn: async ({ date, shift }) => {
      const existing = overrides.find((item) => item.date === date && item.shift === shift);
      if (existing) await base44.entities.CompanyAvailabilityOverride.delete(existing.id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company-availability-overrides', selectedCompanyId] }),
  });

  const defaultMap = useMemo(() => {
    const map = new Map();
    defaults.forEach((d) => map.set(`${d.weekday}-${d.shift}`, d));
    return map;
  }, [defaults]);

  const overrideMap = useMemo(() => {
    const map = new Map();
    overrides.forEach((o) => map.set(`${o.date}-${o.shift}`, o));
    return map;
  }, [overrides]);

  const resolveAvailability = (date, shift) => {
    const override = overrideMap.get(`${toDateKey(date)}-${shift}`);
    if (override) return override;

    const recurring = defaultMap.get(`${date.getDay()}-${shift}`);
    if (recurring) return recurring;

    return { status: STATUS_AVAILABLE, available_truck_count: null };
  };

  const openEditor = (mode, date, shift) => {
    const initial = mode === 'override'
      ? resolveAvailability(date, shift)
      : defaultMap.get(`${date.getDay()}-${shift}`) || { status: STATUS_AVAILABLE, available_truck_count: null };

    setEditing({ mode, date, shift });
    setEditStatus(initial.status || STATUS_AVAILABLE);
    setEditCount(initial.available_truck_count ? String(initial.available_truck_count) : '');
    setFormError('');
  };

  const saveEdit = async () => {
    if (!editing || !selectedCompanyId) return;

    const count = editStatus === STATUS_AVAILABLE ? normalizeCount(editCount) : null;
    if (editStatus === STATUS_AVAILABLE && editCount !== '' && count === null) {
      setFormError('Available truck count must be a whole number greater than 0.');
      return;
    }

    const payload = {
      company_id: selectedCompanyId,
      status: editStatus,
      available_truck_count: editStatus === STATUS_UNAVAILABLE ? null : count,
    };

    if (editing.mode === 'default') {
      await upsertDefaultMutation.mutateAsync({ ...payload, weekday: editing.date.getDay(), shift: editing.shift });
    } else {
      await upsertOverrideMutation.mutateAsync({ ...payload, date: toDateKey(editing.date), shift: editing.shift });
    }

    setEditing(null);
  };

  const shiftActiveDate = (direction) => {
    if (viewMode === 'day') return setActiveDate((prev) => addDays(prev, direction));
    if (viewMode === 'week') return setActiveDate((prev) => addWeeks(prev, direction));
    return setActiveDate((prev) => addMonths(prev, direction));
  };

  const dateRangeLabel = useMemo(() => {
    if (viewMode === 'day') return format(activeDate, 'EEE, MMM d, yyyy');
    if (viewMode === 'week') {
      const start = startOfWeek(activeDate, { weekStartsOn: 0 });
      const end = endOfWeek(activeDate, { weekStartsOn: 0 });
      return `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`;
    }
    return format(activeDate, 'MMMM yyyy');
  }, [activeDate, viewMode]);

  const visibleDates = useMemo(() => {
    if (viewMode === 'day') {
      return eachDayOfInterval({ start: addDays(activeDate, -1), end: addDays(activeDate, 1) });
    }

    if (viewMode === 'week') {
      const start = startOfWeek(activeDate, { weekStartsOn: 0 });
      const end = endOfWeek(activeDate, { weekStartsOn: 0 });
      return eachDayOfInterval({ start, end });
    }

    const monthStart = startOfMonth(activeDate);
    const monthEnd = endOfMonth(activeDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [activeDate, viewMode]);

  const getShiftDisplayValue = (availability) => {
    if (availability.status === STATUS_UNAVAILABLE) return 'Unavailable';
    if (availability.available_truck_count) return String(availability.available_truck_count);
    return 'Available';
  };

  const getPrimaryEditableShift = (date) => {
    const shifts = getOperationalShifts(date.getDay());
    if (!shifts.length) return null;
    return shifts.includes('Day') ? 'Day' : shifts[0];
  };

  const renderCompactCalendarDayCell = (date, weekIndex) => {
    const key = `${toDateKey(date)}-${weekIndex}`;
    const shifts = getOperationalShifts(date.getDay());
    const isOutsideActiveMonth = viewMode === 'month' && !isSameMonth(date, activeDate);
    const dayAvailability = shifts.includes('Day') ? resolveAvailability(date, 'Day') : null;
    const nightAvailability = shifts.includes('Night') ? resolveAvailability(date, 'Night') : null;
    const primaryShift = getPrimaryEditableShift(date);

    return (
      <button
        key={key}
        type="button"
        disabled={!primaryShift}
        onClick={() => primaryShift && openEditor('override', date, primaryShift)}
        className={`min-w-0 rounded border p-1 text-left transition-colors ${
          isOutsideActiveMonth ? 'bg-slate-50/70 border-slate-200' : 'bg-white border-slate-300'
        } ${
          primaryShift ? 'hover:bg-slate-50' : 'cursor-default'
        }`}
      >
        <p className={`text-[10px] font-semibold leading-tight ${isOutsideActiveMonth ? 'text-slate-400' : 'text-slate-700'}`}>
          {format(date, 'd')}
        </p>
        <div className="mt-1 space-y-0.5 text-[10px] leading-tight">
          <p className={dayAvailability ? getStatusClass(dayAvailability.status) : 'text-slate-400'}>
            {dayAvailability ? getShiftDisplayValue(dayAvailability) : '—'}
          </p>
          <p className={nightAvailability ? getStatusClass(nightAvailability.status) : 'text-slate-400'}>
            {nightAvailability ? getShiftDisplayValue(nightAvailability) : '—'}
          </p>
        </div>
      </button>
    );
  };

  const renderCalendarWeekRow = (weekDates, weekIndex) => (
    <div key={`week-${weekIndex}`} className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] gap-1">
      <div className="flex flex-col justify-center text-[10px] leading-tight text-slate-500">
        <span>Day Shift</span>
        <span className="mt-2">Night Shift</span>
      </div>
      {weekDates.map((date) => renderCompactCalendarDayCell(date, weekIndex))}
    </div>
  );

  const renderDayCardCell = (date) => {
    const shifts = getOperationalShifts(date.getDay());

    if (!shifts.length) {
      return (
        <Card key={toDateKey(date)}>
          <CardContent className="p-3">
            <p className="font-medium text-sm">{format(date, 'EEE, MMM d')}</p>
            <p className="text-xs text-slate-400 mt-2">Non-operational day</p>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card key={toDateKey(date)}>
        <CardContent className="p-3 space-y-2">
          <p className="font-medium text-sm">{format(date, 'EEE, MMM d')}</p>
          {shifts.map((shift) => {
            const availability = resolveAvailability(date, shift);
            return (
              <button
                key={shift}
                type="button"
                onClick={() => openEditor('override', date, shift)}
                className="w-full rounded border border-slate-200 px-3 py-2 text-left hover:bg-slate-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-slate-600">{shift}</span>
                  <span className={`text-xs font-semibold ${getStatusClass(availability.status)}`}>
                    {buildShiftLabel(availability)}
                  </span>
                </div>
              </button>
            );
          })}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Availability</h2>
          <p className="text-sm text-slate-500">Manage company-level shift availability.</p>
        </div>
        <div className="flex items-center gap-2">
          {VIEW_MODES.map((mode) => (
            <Button key={mode} variant={viewMode === mode ? 'default' : 'outline'} size="sm" onClick={() => setViewMode(mode)}>
              {mode[0].toUpperCase() + mode.slice(1)}
            </Button>
          ))}
        </div>
      </div>
      {canSelectCompany && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div>
              <p className="text-xs text-slate-500 mb-1">Search companies</p>
              <Input
                value={companySearch}
                onChange={(e) => setCompanySearch(e.target.value)}
                placeholder="Type a company name"
              />
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1">Company</p>
              <Select value={selectedCompanyId || ''} onValueChange={setAdminCompanyId}>
                <SelectTrigger className="w-full md:w-[360px]">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCompanies.map((company) => (
                    <SelectItem key={company.id} value={company.id}>{company.name || company.id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {!selectedCompanyId ? (
        <Card><CardContent className="p-6 text-sm text-slate-500">Select a company to view availability.</CardContent></Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium text-slate-700">{dateRangeLabel}</div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => shiftActiveDate(-1)}>Prev</Button>
                  <Button size="sm" variant="outline" onClick={() => setActiveDate(new Date())}>Today</Button>
                  <Button size="sm" variant="outline" onClick={() => shiftActiveDate(1)}>Next</Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                {(viewMode === 'week' || viewMode === 'month') && (
                  <div className="space-y-1 min-w-0">
                    <div className="grid grid-cols-[48px_repeat(7,minmax(0,1fr))] gap-1">
                      <div />
                      {WEEKDAY_SHORT_LABELS.map((weekday, index) => (
                        <p key={`${weekday}-${index}`} className="text-[10px] text-center font-semibold text-slate-500">{weekday}</p>
                      ))}
                    </div>

                    {viewMode === 'week' && renderCalendarWeekRow(visibleDates, 0)}
                    {viewMode === 'month' && Array.from({ length: Math.ceil(visibleDates.length / 7) }).map((_, weekIndex) => {
                      const start = weekIndex * 7;
                      const weekDates = visibleDates.slice(start, start + 7);
                      return renderCalendarWeekRow(weekDates, weekIndex);
                    })}
                  </div>
                )}

                {viewMode === 'day' && (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                    {visibleDates.map(renderDayCardCell)}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="text-xs text-slate-500">
            <Badge variant="outline" className="mr-2 text-green-700 border-green-300">Available</Badge>
            <Badge variant="outline" className="text-red-700 border-red-300">Unavailable</Badge>
          </div>

          <Card>
            <CardContent className="p-4 space-y-3">
              <h3 className="text-sm font-semibold text-slate-800">Recurring Weekly Defaults</h3>
              <p className="text-xs text-slate-500">Defaults apply when no date-specific override exists.</p>
              <div className="grid gap-2 md:grid-cols-2">
                {[1, 2, 3, 4, 5, 0].map((weekday) => (
                  getOperationalShifts(weekday).map((shift) => {
                    const date = addDays(startOfWeek(new Date(), { weekStartsOn: 1 }), weekday === 0 ? 6 : weekday - 1);
                    const availability = defaultMap.get(`${weekday}-${shift}`) || { status: STATUS_AVAILABLE, available_truck_count: null };
                    return (
                      <button
                        key={`${weekday}-${shift}`}
                        type="button"
                        onClick={() => openEditor('default', date, shift)}
                        className="rounded border border-slate-200 p-2 text-left hover:bg-slate-50"
                      >
                        <p className="text-xs text-slate-500">{WEEKDAY_LABELS[weekday]} · {shift}</p>
                        <p className={`text-sm font-semibold ${getStatusClass(availability.status)}`}>{buildShiftLabel(availability)}</p>
                      </button>
                    );
                  })
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.mode === 'default' ? 'Edit weekly default' : 'Edit date override'}</DialogTitle>
          </DialogHeader>

          {editing && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">{format(editing.date, 'EEE, MMM d, yyyy')} · {editing.shift} Shift</p>
              <div>
                <p className="text-xs text-slate-500 mb-1">Status</p>
                <Select
                  value={editStatus}
                  onValueChange={(value) => {
                    setEditStatus(value);
                    if (value === STATUS_UNAVAILABLE) setEditCount('');
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={STATUS_AVAILABLE}>Available</SelectItem>
                    <SelectItem value={STATUS_UNAVAILABLE}>Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {editStatus === STATUS_AVAILABLE && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Available Trucks (optional)</p>
                  <Input
                    type="number"
                    min="1"
                    value={editCount}
                    onChange={(e) => setEditCount(e.target.value)}
                    placeholder="Leave blank for general availability"
                  />
                </div>
              )}

              {formError && <p className="text-xs text-red-600">{formError}</p>}

              <div className="flex flex-wrap justify-end gap-2">
                {editing.mode === 'override' && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      await clearOverrideMutation.mutateAsync({ date: toDateKey(editing.date), shift: editing.shift });
                      setEditing(null);
                    }}
                  >
                    Use Weekly Default
                  </Button>
                )}
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={saveEdit}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
