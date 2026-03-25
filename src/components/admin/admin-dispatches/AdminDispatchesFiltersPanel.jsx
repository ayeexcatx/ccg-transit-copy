import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function AdminDispatchesFiltersPanel({ showFilters, filters, companies, onChange }) {
  if (!showFilters) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
          <Select value={filters.status} onValueChange={(v) => onChange({ ...filters, status: v })}>
            <SelectTrigger className="text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {['Scheduled', 'Dispatch', 'Amended', 'Cancelled'].map((s) =>
                <SelectItem key={s} value={s}>{s}</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Select value={filters.company_id} onValueChange={(v) => onChange({ ...filters, company_id: v })}>
            <SelectTrigger className="text-xs"><SelectValue placeholder="Company" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Companies</SelectItem>
              {companies.map((c) =>
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Input placeholder="Truck #" value={filters.truck} onChange={(e) => onChange({ ...filters, truck: e.target.value })} className="text-xs" />
          <Input placeholder="Search job / reference" value={filters.query} onChange={(e) => onChange({ ...filters, query: e.target.value })} className="text-xs" />
          <Input type="date" value={filters.dateFrom} onChange={(e) => onChange({ ...filters, dateFrom: e.target.value })} className="text-xs" />
          <Input type="date" value={filters.dateTo} onChange={(e) => onChange({ ...filters, dateTo: e.target.value })} className="text-xs" />
        </div>
      </CardContent>
    </Card>
  );
}
