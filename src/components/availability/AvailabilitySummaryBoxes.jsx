import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import {
  STATUS_AVAILABLE,
  countUsedTrucksForCompanyShift,
  getAvailabilitySummaryTargets,
  getOperationalShifts,
  normalizeCount,
  resolveAvailabilityForCompanyShift,
  toDateKey,
} from './availabilityRules';

export default function AvailabilitySummaryBoxes({ companyId = null, includeAllCompanies = false }) {
  const { data: companies = [] } = useQuery({
    queryKey: ['availability-summary-companies', companyId, includeAllCompanies],
    queryFn: () => base44.entities.Company.list(),
  });

  const { data: defaults = [] } = useQuery({
    queryKey: ['availability-summary-defaults'],
    queryFn: () => base44.entities.CompanyAvailabilityDefault.list('-created_date', 5000),
  });

  const { data: overrides = [] } = useQuery({
    queryKey: ['availability-summary-overrides'],
    queryFn: () => base44.entities.CompanyAvailabilityOverride.list('-created_date', 5000),
  });

  const { data: dispatches = [] } = useQuery({
    queryKey: ['availability-summary-dispatches'],
    queryFn: () => base44.entities.Dispatch.list('-date', 1000),
  });

  const summaryData = useMemo(() => {
    const eligibleCompanies = includeAllCompanies
      ? companies
      : companies.filter((company) => company.id === companyId);

    const defaultMap = new Map();
    defaults.forEach((d) => defaultMap.set(`${d.company_id}-${d.weekday}-${d.shift}`, d));

    const overrideMap = new Map();
    overrides.forEach((o) => overrideMap.set(`${o.company_id}-${o.date}-${o.shift}`, o));

    return getAvailabilitySummaryTargets(new Date()).map((target) => {
      const dateKey = toDateKey(target.date);
      const isOperational = getOperationalShifts(target.date.getDay()).includes(target.shift);

      if (!isOperational) {
        return {
          ...target,
          dateKey,
          total: 0,
          dispatched: 0,
          remaining: 0,
          rows: [],
        };
      }

      const rows = eligibleCompanies
        .map((company) => {
          const resolved = resolveAvailabilityForCompanyShift({
            companyId: company.id,
            date: target.date,
            shift: target.shift,
            defaultMap,
            overrideMap,
          });

          if (resolved.status !== STATUS_AVAILABLE) return null;

          const total = normalizeCount(resolved.available_truck_count);
          if (!total) return null;

          const dispatched = countUsedTrucksForCompanyShift(dispatches, company.id, dateKey, target.shift);
          const remaining = Math.max(total - dispatched, 0);

          return {
            companyId: company.id,
            companyName: company.name || company.id,
            total,
            dispatched,
            remaining,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.companyName.localeCompare(b.companyName));

      return {
        ...target,
        dateKey,
        total: rows.reduce((sum, row) => sum + row.total, 0),
        dispatched: rows.reduce((sum, row) => sum + row.dispatched, 0),
        remaining: rows.reduce((sum, row) => sum + row.remaining, 0),
        rows,
      };
    });
  }, [companies, companyId, defaults, dispatches, includeAllCompanies, overrides]);

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {summaryData.map((box) => (
        <Card
          key={`${box.label}-${box.dateKey}-${box.shift}`}
          className="overflow-hidden border-slate-200 bg-white shadow-sm"
        >
          <CardContent className="p-0">
            <div className="border-b border-slate-200/80 bg-slate-50/80 px-3.5 py-3">
              <p className="text-sm font-semibold leading-tight text-slate-900">{box.label}</p>
              <p className="mt-1 text-[11px] font-medium text-slate-500">{format(box.date, 'EEE, MMM d')}</p>
            </div>

            <div className="space-y-3 px-3.5 py-3">
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/70 px-2.5 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Total</p>
                  <p className="mt-1.5 text-2xl font-semibold leading-none text-emerald-600 sm:text-3xl">{box.total}</p>
                </div>
                <div className="rounded-lg border border-sky-100 bg-sky-50/70 px-2.5 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Dispatched</p>
                  <p className="mt-1.5 text-2xl font-semibold leading-none text-sky-700 sm:text-3xl">{box.dispatched}</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Remaining</p>
                  <p className="mt-1.5 text-2xl font-semibold leading-none text-slate-700 sm:text-3xl">{box.remaining}</p>
                </div>
              </div>

              {box.rows.length === 0 ? (
                <div className="rounded-md border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2 text-center">
                  <p className="text-[11px] font-medium text-slate-500">No counted availability</p>
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {box.rows.map((row) => (
                    <li
                      key={`${box.label}-${row.companyId}`}
                      className="rounded-md bg-slate-50/70 px-2.5 py-2 text-[11px] leading-snug text-slate-600"
                    >
                      <span className="font-medium text-slate-700">{row.companyName}</span>
                      <span> — {row.total} total, {row.dispatched} dispatched, {row.remaining} remaining</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
