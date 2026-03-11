import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays, addWeeks, addMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  VIEW_MODES,
  STATUS_AVAILABLE,
  STATUS_UNAVAILABLE,
  WEEKDAY_LABELS,
  getOperationalShifts,
  getStatusClass,
  normalizeCount,
  toDateKey,
} from './availabilityRules';

const WEEKDAY_SHORT_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export default function AvailabilityManager({ companyId, canSelectCompany = false }) {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('week');
  const [activeDate, setActiveDate] = useState(new Date());
  const [defaultsEditorOpen, setDefaultsEditorOpen] = useState(false);
  const [defaultsEditorForm, setDefaultsEditorForm] = useState(null);
  const [overrideEditingDate, setOverrideEditingDate] = useState(null);
  const [dateOverrideForm, setDateOverrideForm] = useState(null);
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

  const getDateEditInitialState = (date) => {
    const operationalShifts = getOperationalShifts(date.getDay());
    const createShiftState = (shift) => {
      const availability = resolveAvailability(date, shift);
      return {
        status: availability.status || STATUS_AVAILABLE,
        count: availability.available_truck_count ? String(availability.available_truck_count) : '',
        operational: operationalShifts.includes(shift),
      };
    };

    return {
      Day: createShiftState('Day'),
      Night: createShiftState('Night'),
    };
  };

  const openOverrideEditorForDate = (date) => {
    setOverrideEditingDate(date);
    setDateOverrideForm(getDateEditInitialState(date));
    setFormError('');
  };

  const openDefaultsEditor = () => {
    const form = {};
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const operationalShifts = getOperationalShifts(weekday);
      form[weekday] = {
        Day: {
          operational: operationalShifts.includes('Day'),
          checked: (defaultMap.get(`${weekday}-Day`)?.status || STATUS_AVAILABLE) === STATUS_AVAILABLE,
        },
        Night: {
          operational: operationalShifts.includes('Night'),
          checked: (defaultMap.get(`${weekday}-Night`)?.status || STATUS_AVAILABLE) === STATUS_AVAILABLE,
        },
      };
    }
    setDefaultsEditorForm(form);
    setDefaultsEditorOpen(true);
    setFormError('');
  };

  const saveWeeklyDefaults = async () => {
    if (!selectedCompanyId || !defaultsEditorForm) return;

    const jobs = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      for (const shift of ['Day', 'Night']) {
        const shiftState = defaultsEditorForm[weekday]?.[shift];
        if (!shiftState?.operational) continue;

        const existing = defaultMap.get(`${weekday}-${shift}`);
        jobs.push(
          upsertDefaultMutation.mutateAsync({
            company_id: selectedCompanyId,
            weekday,
            shift,
            status: shiftState.checked ? STATUS_AVAILABLE : STATUS_UNAVAILABLE,
            available_truck_count: shiftState.checked ? existing?.available_truck_count ?? null : null,
          })
        );
      }
    }

    await Promise.all(jobs);
    setDefaultsEditorOpen(false);
    setDefaultsEditorForm(null);
  };

  const saveDateOverride = async () => {
    if (!overrideEditingDate || !selectedCompanyId || !dateOverrideForm) return;

    for (const shift of ['Day', 'Night']) {
      const shiftState = dateOverrideForm[shift];
      if (!shiftState?.operational) continue;

      const count = shiftState.status === STATUS_AVAILABLE ? normalizeCount(shiftState.count) : null;
      if (shiftState.status === STATUS_AVAILABLE && shiftState.count !== '' && count === null) {
        setFormError(`${shift} shift available truck count must be a whole number greater than 0.`);
        return;
      }
    }

    const savePromises = ['Day', 'Night'].map(async (shift) => {
      const shiftState = dateOverrideForm[shift];
      if (!shiftState?.operational) return;

      const count = shiftState.status === STATUS_AVAILABLE ? normalizeCount(shiftState.count) : null;
      await upsertOverrideMutation.mutateAsync({
        company_id: selectedCompanyId,
        status: shiftState.status,
        available_truck_count: shiftState.status === STATUS_UNAVAILABLE ? null : count,
        date: toDateKey(overrideEditingDate),
        shift,
      });
    });

    await Promise.all(savePromises);
    setOverrideEditingDate(null);
    setDateOverrideForm(null);
  };

  const clearDateOverrides = async (date) => {
    await Promise.all(
      ['Day', 'Night'].map((shift) => clearOverrideMutation.mutateAsync({ date: toDateKey(date), shift }))
    );
    setOverrideEditingDate(null);
    setDateOverrideForm(null);
  };

  const updateOverrideShiftField = (shift, field, value) => {
    setDateOverrideForm((prev) => ({
      ...prev,
      [shift]: {
        ...prev[shift],
        [field]: value,
        ...(field === 'status' && value === STATUS_UNAVAILABLE ? { count: '' } : {}),
      },
    }));
  };

  const getCompactShiftDisplay = (date, shift) => {
    if (!getOperationalShifts(date.getDay()).includes(shift)) {
      return { label: 'N/A', className: 'text-slate-400' };
    }

    const availability = resolveAvailability(date, shift);
    if (availability.status === STATUS_UNAVAILABLE) {
      return { label: 'None', className: getStatusClass(availability.status) };
    }

    if (availability.available_truck_count) {
      return { label: String(availability.available_truck_count), className: getStatusClass(availability.status) };
    }

    return { label: 'Avail', className: getStatusClass(availability.status) };
  };

  const getDefaultMatrixDisplay = (weekday, shift) => {
    if (!getOperationalShifts(weekday).includes(shift)) return { label: 'N/A', className: 'text-slate-400' };
    const availability = defaultMap.get(`${weekday}-${shift}`) || { status: STATUS_AVAILABLE, available_truck_count: null };
    if (availability.status === STATUS_UNAVAILABLE) return { label: 'No', className: 'text-red-700' };
    if (availability.available_truck_count) return { label: String(availability.available_truck_count), className: 'text-green-700' };
    return { label: 'Yes', className: 'text-green-700' };
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

  const renderCompactCalendarSection = (dates, keyPrefix, outsideMonth = false) => (
    <div className="space-y-1" key={keyPrefix}>
      <div className={`grid gap-1 ${viewMode === 'day' ? 'grid-cols-[16px_repeat(3,minmax(0,1fr))]' : 'grid-cols-[16px_repeat(7,minmax(0,1fr))]'}`}>
        <div />
        {dates.map((date) => (
          <p key={`${keyPrefix}-head-${toDateKey(date)}`} className="text-[10px] text-center font-semibold text-slate-500">
            {WEEKDAY_SHORT_LABELS[date.getDay()]}
          </p>
        ))}
      </div>
      <div className={`grid gap-1 ${viewMode === 'day' ? 'grid-cols-[16px_repeat(3,minmax(0,1fr))]' : 'grid-cols-[16px_repeat(7,minmax(0,1fr))]'}`}>
        <div />
        {dates.map((date) => (
          <p
            key={`${keyPrefix}-date-${toDateKey(date)}`}
            className={`text-[10px] text-center font-semibold ${outsideMonth && !isSameMonth(date, activeDate) ? 'text-slate-400' : 'text-slate-700'}`}
          >
            {format(date, 'd')}
          </p>
        ))}
      </div>

      {['Day', 'Night'].map((shift) => (
        <div key={`${keyPrefix}-${shift}`} className={`grid gap-1 ${viewMode === 'day' ? 'grid-cols-[16px_repeat(3,minmax(0,1fr))]' : 'grid-cols-[16px_repeat(7,minmax(0,1fr))]'}`}>
          <p className="text-[10px] font-semibold text-slate-500 self-center">{shift === 'Day' ? 'D' : 'N'}</p>
          {dates.map((date) => {
            const shiftDisplay = getCompactShiftDisplay(date, shift);
            const faded = outsideMonth && !isSameMonth(date, activeDate);
            return (
              <button
                key={`${keyPrefix}-${shift}-${toDateKey(date)}`}
                type="button"
                onClick={() => openOverrideEditorForDate(date)}
                className={`rounded border p-1 text-[10px] font-semibold ${faded ? 'bg-slate-50/70 border-slate-200' : 'bg-white border-slate-300'} hover:bg-slate-50`}
              >
                <span className={shiftDisplay.className}>{shiftDisplay.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );

  const renderCompactCalendarView = () => {
    if (viewMode === 'day') return renderCompactCalendarSection(visibleDates, 'day');
    if (viewMode === 'week') return renderCompactCalendarSection(visibleDates, 'week');

    return (
      <div className="space-y-2">
        {Array.from({ length: Math.ceil(visibleDates.length / 7) }).map((_, weekIndex) => {
          const start = weekIndex * 7;
          const weekDates = visibleDates.slice(start, start + 7);
          return renderCompactCalendarSection(weekDates, `month-${weekIndex}`, true);
        })}
      </div>
    );
  };

  const renderWeeklyDefaultsMatrix = () => (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h3 className="text-sm font-semibold text-slate-800">Recurring Weekly Defaults</h3>
        <p className="text-xs text-slate-500">Defaults apply when no date-specific override exists.</p>
        <div className="overflow-x-auto">
          <div className="min-w-[320px] divide-y divide-slate-200 rounded border border-slate-200">
            <div className="grid grid-cols-[1.6fr_1fr_1fr] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              <span>Weekday</span>
              <span className="text-center">Day</span>
              <span className="text-center">Night</span>
            </div>
            {[1, 2, 3, 4, 5, 6, 0].map((weekday) => {
              const dayDisplay = getDefaultMatrixDisplay(weekday, 'Day');
              const nightDisplay = getDefaultMatrixDisplay(weekday, 'Night');
              return (
                <div key={`default-${weekday}`} className="grid grid-cols-[1.6fr_1fr_1fr] px-3 py-2 text-sm">
                  <span className="text-slate-700">{WEEKDAY_LABELS[weekday]}</span>
                  <span className={`text-center font-semibold ${dayDisplay.className}`}>{dayDisplay.label}</span>
                  <span className={`text-center font-semibold ${nightDisplay.className}`}>{nightDisplay.label}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={openDefaultsEditor}>Edit Defaults</Button>
        </div>
      </CardContent>
    </Card>
  );

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
              <div className="text-center text-xs font-medium text-slate-600">{dateRangeLabel}</div>
              <div className="grid grid-cols-3 items-center">
                <div className="justify-self-start">
                  <Button size="icon" variant="outline" onClick={() => shiftActiveDate(-1)} aria-label="Previous period">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                </div>
                <div className="justify-self-center">
                  <Button size="sm" variant="outline" onClick={() => setActiveDate(new Date())}>Today</Button>
                </div>
                <div className="justify-self-end">
                  <Button size="icon" variant="outline" onClick={() => shiftActiveDate(1)} aria-label="Next period">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">{renderCompactCalendarView()}</div>
            </CardContent>
          </Card>

          {renderWeeklyDefaultsMatrix()}
        </>
      )}

      <Dialog
        open={!!overrideEditingDate}
        onOpenChange={(open) => {
          if (!open) {
            setOverrideEditingDate(null);
            setDateOverrideForm(null);
            setFormError('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit day override</DialogTitle>
          </DialogHeader>

          {overrideEditingDate && dateOverrideForm && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">{format(overrideEditingDate, 'EEE, MMM d, yyyy')}</p>

              {['Day', 'Night'].map((shift) => {
                const shiftState = dateOverrideForm[shift];
                return (
                  <div key={shift} className="space-y-2 rounded border border-slate-200 p-3">
                    <p className="text-sm font-medium text-slate-700">{shift} Shift</p>
                    {!shiftState.operational ? (
                      <p className="text-xs text-slate-400">N/A (non-operational for this date)</p>
                    ) : (
                      <>
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Status</p>
                          <Select
                            value={shiftState.status}
                            onValueChange={(value) => updateOverrideShiftField(shift, 'status', value)}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={STATUS_AVAILABLE}>Available</SelectItem>
                              <SelectItem value={STATUS_UNAVAILABLE}>Unavailable</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {shiftState.status === STATUS_AVAILABLE && (
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Available Trucks (optional)</p>
                            <Input
                              type="number"
                              min="1"
                              value={shiftState.count}
                              onChange={(e) => updateOverrideShiftField(shift, 'count', e.target.value)}
                              placeholder="Leave blank for general availability"
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}

              {formError && <p className="text-xs text-red-600">{formError}</p>}

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => clearDateOverrides(overrideEditingDate)}>Use Weekly Default</Button>
                <Button variant="outline" onClick={() => { setOverrideEditingDate(null); setDateOverrideForm(null); setFormError(''); }}>Cancel</Button>
                <Button onClick={saveDateOverride}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={defaultsEditorOpen}
        onOpenChange={(open) => {
          setDefaultsEditorOpen(open);
          if (!open) {
            setDefaultsEditorForm(null);
            setFormError('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit weekly defaults</DialogTitle>
          </DialogHeader>

          {defaultsEditorForm && (
            <div className="space-y-4">
              <div className="divide-y divide-slate-200 rounded border border-slate-200">
                <div className="grid grid-cols-[1.5fr_1fr_1fr] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
                  <span>Weekday</span>
                  <span className="text-center">Day</span>
                  <span className="text-center">Night</span>
                </div>
                {[1, 2, 3, 4, 5, 6, 0].map((weekday) => (
                  <div key={`edit-default-${weekday}`} className="grid grid-cols-[1.5fr_1fr_1fr] items-center px-3 py-2 text-sm">
                    <span className="text-slate-700">{WEEKDAY_LABELS[weekday]}</span>
                    {['Day', 'Night'].map((shift) => {
                      const shiftState = defaultsEditorForm[weekday][shift];
                      if (!shiftState.operational) {
                        return <span key={`${weekday}-${shift}`} className="text-center text-xs text-slate-400">N/A</span>;
                      }

                      return (
                        <label key={`${weekday}-${shift}`} className="mx-auto flex items-center gap-2 text-xs text-slate-700">
                          <Checkbox
                            checked={shiftState.checked}
                            onCheckedChange={(checked) => {
                              setDefaultsEditorForm((prev) => ({
                                ...prev,
                                [weekday]: {
                                  ...prev[weekday],
                                  [shift]: {
                                    ...prev[weekday][shift],
                                    checked: !!checked,
                                  },
                                },
                              }));
                            }}
                          />
                          {shift}
                        </label>
                      );
                    })}
                  </div>
                ))}
              </div>

              {formError && <p className="text-xs text-red-600">{formError}</p>}

              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => { setDefaultsEditorOpen(false); setDefaultsEditorForm(null); setFormError(''); }}>Cancel</Button>
                <Button onClick={saveWeeklyDefaults}>Save</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
