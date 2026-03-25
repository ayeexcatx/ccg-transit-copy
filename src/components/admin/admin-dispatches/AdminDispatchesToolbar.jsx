import React from 'react';
import { Button } from '@/components/ui/button';
import { Filter, Plus } from 'lucide-react';

export default function AdminDispatchesToolbar({ dispatchCountLabel, showFilters, onToggleFilters, onOpenNew }) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900 text-left">Dispatches</h2>
        <p className="text-sm text-slate-500">{dispatchCountLabel}</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onToggleFilters} className="text-xs">
          <Filter className="h-3.5 w-3.5 mr-1" />Filters
        </Button>
        <Button onClick={onOpenNew} className="bg-slate-900 hover:bg-slate-800 text-xs">
          <Plus className="h-3.5 w-3.5 mr-1" />New Dispatch
        </Button>
      </div>
    </div>
  );
}
