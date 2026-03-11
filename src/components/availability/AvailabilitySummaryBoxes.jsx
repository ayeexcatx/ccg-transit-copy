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

          const used = countUsedTrucksForCompanyShift(dispatches, company.id, dateKey, target.shift);
          const remaining = Math.max(total - used, 0);

          return {
            companyId: company.id,
            companyName: company.name || company.id,
            total,
            remaining,
          };
        })
        .filter(Boolean)
        .sort((a, b) => a.companyName.localeCompare(b.companyName));

      return {
        ...target,
        dateKey,
        total: rows.reduce((sum, row) => sum + row.total, 0),
        remaining: rows.reduce((sum, row) => sum + row.remaining, 0),
        rows,
      };
    });
  }, [companies, companyId, defaults, dispatches, includeAllCompanies, overrides]);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
      {summaryData.map((box) => (
        <Card key={`${box.label}-${box.dateKey}-${box.shift}`} className="shadow-sm border-slate-200">
          <CardContent className="p-3 space-y-3">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900 leading-tight">{box.label}</p>
              <p className="text-[11px] text-slate-500">{format(box.date, 'EEE, MMM d')}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-md bg-slate-50/70 px-3 py-2.5">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Total</p>
                <p className="text-3xl leading-none font-semibold text-emerald-600 mt-1">{box.total}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Remaining</p>
                <p className="text-3xl leading-none font-semibold text-slate-700 mt-1">{box.remaining}</p>
              </div>
            </div>

            {box.rows.length === 0 ? (
              <p className="text-[11px] text-slate-400">No counted availability</p>
            ) : (
              <ul className="space-y-1">
                {box.rows.map((row) => (
                  <li key={`${box.label}-${row.companyId}`} className="text-[11px] text-slate-600 leading-snug">
                    <span className="font-medium text-slate-700">{row.companyName}</span>
                    <span> — {row.total} total, {row.remaining} remaining</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
