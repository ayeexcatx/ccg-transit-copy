import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Clock, MapPin, Truck, Sun, Moon,
  FileText, ChevronDown, ChevronUp
} from 'lucide-react';
import { format } from 'date-fns';
import DispatchDetailDrawer from './DispatchDetailDrawer';

const statusColors = {
  Confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  Dispatched: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Amended: 'bg-amber-50 text-amber-700 border-amber-200',
  Canceled: 'bg-red-50 text-red-700 border-red-200',
};

const tollColors = {
  Authorized: 'bg-green-50 text-green-700',
  Unauthorized: 'bg-red-50 text-red-700',
  'Included in Rate': 'bg-purple-50 text-purple-700',
};

const DispatchCard = React.forwardRef(function DispatchCard({
  dispatch, session, confirmations, timeEntries, templateNotes,
  onConfirm, onTimeEntry, companyName, forceExpanded
}, ref) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  React.useEffect(() => {
    if (forceExpanded) setDrawerOpen(true);
  }, [forceExpanded]);

  const myTrucks = (session.allowed_trucks || []).filter(t =>
    (dispatch.trucks_assigned || []).includes(t)
  );

  return (
    <div ref={ref}>
      <Card
        className="overflow-hidden border-slate-200 hover:border-slate-400 hover:shadow-md transition-all cursor-pointer"
        onClick={() => setDrawerOpen(true)}
      >
        <CardContent className="p-0">
          <div className="p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`${statusColors[dispatch.status]} border text-xs font-medium`}>
                  {dispatch.status}
                </Badge>
                {dispatch.toll_status && (
                  <Badge className={`${tollColors[dispatch.toll_status]} text-xs font-medium`}>
                    {dispatch.toll_status}
                  </Badge>
                )}
                <span className="text-xs text-slate-400 flex items-center gap-1">
                  {dispatch.shift_time === 'Day' ? <Sun className="h-3 w-3" /> : <Moon className="h-3 w-3" />}
                  {dispatch.shift_time}
                </span>
              </div>
              <span className="text-xs text-slate-500 whitespace-nowrap">
                {dispatch.date && format(new Date(dispatch.date), 'MMM d, yyyy')}
              </span>
            </div>

            <div className="space-y-2">
              {dispatch.status === 'Confirmed' ? (
                <>
                  <h3 className="font-semibold text-slate-900">Confirmed Dispatch</h3>
                  <p className="text-sm text-slate-500">Details to follow</p>
                </>
              ) : (
                <>
                  {dispatch.client_name && (
                    <h3 className="font-semibold text-slate-900">{dispatch.client_name}</h3>
                  )}
                  {companyName && (
                    <p className="text-xs text-slate-400">{companyName}</p>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    {dispatch.job_number && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        Job #{dispatch.job_number}
                      </div>
                    )}
                    {dispatch.start_time && (
                      <div className="flex items-center gap-2 text-slate-600">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {dispatch.start_time}
                      </div>
                    )}
                    {dispatch.start_location && (
                      <div className="flex items-start gap-2 text-slate-600 sm:col-span-2">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <span className="whitespace-pre-wrap">{dispatch.start_location}</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              <div className="flex items-center gap-1.5 flex-wrap mt-2">
                <Truck className="h-3.5 w-3.5 text-slate-400" />
                {session.code_type === 'Truck' ? (
                  <Badge variant="outline" className="text-xs border-slate-900 text-slate-900 font-medium">
                    {myTrucks[0]}
                  </Badge>
                ) : (
                  myTrucks.map(t => (
                    <Badge key={t} variant="outline" className="text-xs border-slate-900 text-slate-900 font-medium">
                      {t}
                    </Badge>
                  ))
                )}
              </div>
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); setDrawerOpen(true); }}
              className="mt-3 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
            >
              <ChevronDown className="h-3.5 w-3.5" />
              View details
            </button>
          </div>
        </CardContent>
      </Card>

      <DispatchDetailDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        dispatch={dispatch}
        session={session}
        confirmations={confirmations}
        timeEntries={timeEntries}
        templateNotes={templateNotes}
        onConfirm={onConfirm}
        onTimeEntry={onTimeEntry}
        companyName={companyName}
      />
    </div>
  );
});

export default DispatchCard;