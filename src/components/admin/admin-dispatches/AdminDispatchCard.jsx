import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Archive, ArchiveX, Copy, Eye, FileText, Lock, Moon, Pencil, Sun, Trash2, Truck } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { scheduledStatusMessage, statusBadgeColors, statusBorderAccent } from '@/components/portal/statusConfig';

export default function AdminDispatchCard({
  dispatch,
  session,
  companyName,
  firstLineTimeText,
  latestActivity,
  latestActivityTimestamp,
  onOpenDispatch,
  onCopyShift,
  onToggleArchive,
  onOpenEdit,
  onOpenDelete,
  onRegisterRef
}) {
  return (
    <div ref={(el) => onRegisterRef(dispatch.id, el)} className="rounded-lg transition-all duration-500">
      <Card
        className={`hover:shadow-md transition-shadow cursor-pointer ${statusBorderAccent[dispatch.status] || ''}`}
        onClick={() => onOpenDispatch(dispatch)}>

        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <Badge className={`${statusBadgeColors[dispatch.status]} border text-xs`}>{dispatch.status}</Badge>
                {dispatch.archived_flag &&
                  <Badge className="bg-amber-50 text-amber-700 border border-amber-200 text-xs flex items-center gap-1">
                    <Archive className="h-2.5 w-2.5" />Archived
                  </Badge>
                }
                <span className="text-slate-400 text-sm text-left normal-case flex items-center gap-1 shrink-0">
                  {dispatch.shift_time === 'Day Shift' ? <Sun className="h-3 w-3 text-amber-400" /> : <Moon className="h-3 w-3 text-slate-400" />}
                  {dispatch.shift_time}
                </span>
                <span className="text-slate-500 text-sm font-semibold w-full sm:w-auto">
                  {dispatch.date && format(parseISO(dispatch.date), 'EEEE, MMM d, yyyy')}
                  {firstLineTimeText ? ` • ${firstLineTimeText}` : ''}
                </span>
              </div>
              {dispatch.status === 'Scheduled' &&
                <p className="text-xs text-blue-600 italic mt-0.5">{scheduledStatusMessage}</p>
              }
              <div className="flex items-center gap-3 text-sm text-slate-700 flex-wrap">
                {dispatch.client_name && <span className="font-medium">{dispatch.client_name}</span>}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                {dispatch.job_number &&
                  <span className="flex items-center gap-1"><FileText className="h-3 w-3" />#{dispatch.job_number}</span>
                }
              </div>
              {dispatch.reference_tag &&
                <p className="text-xs text-slate-400 mt-0.5">Reference Tag: {dispatch.reference_tag}</p>
              }
              <div className="mt-2">
                <div className="text-slate-400 text-xs mb-1">{companyName || '—'}</div>
                <div className="flex items-center gap-1 flex-wrap">
                  <Truck className="h-3 w-3 text-slate-400" />
                  {(dispatch.trucks_assigned || []).map((t) =>
                    <Badge key={t} variant="outline" className="text-xs font-mono">{t}</Badge>
                  )}
                </div>
              </div>
            </div>
            <div className="hidden sm:flex flex-col items-end justify-between gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
              {dispatch.edit_locked && dispatch.edit_locked_by_session_id && dispatch.edit_locked_by_session_id !== session?.id &&
                <div className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                  <Lock className="h-3 w-3" />
                  <span>{dispatch.edit_locked_by_name ? `Locked by ${dispatch.edit_locked_by_name}` : 'Editing in progress'}</span>
                </div>
              }
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" onClick={() => onOpenDispatch(dispatch)} className="h-8 w-8" title="Preview">
                  <Eye className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onCopyShift(dispatch)} className="h-8 w-8" title="Copy Shift">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost" size="icon"
                  onClick={() => onToggleArchive(dispatch)}
                  className="h-8 w-8 text-slate-500 hover:text-amber-600"
                  title={dispatch.archived_flag ? 'Unarchive' : 'Archive'}>
                  {dispatch.archived_flag ? <ArchiveX className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onOpenEdit(dispatch)} className="h-8 w-8">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => onOpenDelete(dispatch)} className="h-8 w-8 text-red-500 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              <div className="text-right max-w-[210px]">
                {latestActivity?.message ?
                  <>
                    <p className="text-[10px] text-slate-500 leading-tight line-clamp-1">{latestActivity.message}</p>
                    {latestActivityTimestamp && <p className="text-[10px] text-slate-400">{latestActivityTimestamp}</p>}
                  </> :
                  <p className="text-[10px] text-slate-400 italic">No activity yet.</p>
                }
              </div>
            </div>
          </div>

          <div className="sm:hidden mt-3 pt-3 border-t border-slate-200/80" onClick={(e) => e.stopPropagation()}>
            {dispatch.edit_locked && dispatch.edit_locked_by_session_id && dispatch.edit_locked_by_session_id !== session?.id &&
              <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                <Lock className="h-3 w-3" />
                <span>{dispatch.edit_locked_by_name ? `Locked by ${dispatch.edit_locked_by_name}` : 'Editing in progress'}</span>
              </div>
            }

            <div className="mb-2">
              {latestActivity?.message ?
                <>
                  <p className="text-[10px] text-slate-500 leading-tight">{latestActivity.message}</p>
                  {latestActivityTimestamp && <p className="text-[10px] text-slate-400">{latestActivityTimestamp}</p>}
                </> :
                <p className="text-[10px] text-slate-400 italic">No activity yet.</p>
              }
            </div>

            <div className="flex items-center justify-between gap-1">
              <Button variant="ghost" size="icon" onClick={() => onOpenDispatch(dispatch)} className="h-9 w-9" title="Preview">
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onCopyShift(dispatch)} className="h-9 w-9" title="Copy Shift">
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost" size="icon"
                onClick={() => onToggleArchive(dispatch)}
                className="h-9 w-9 text-slate-500 hover:text-amber-600"
                title={dispatch.archived_flag ? 'Unarchive' : 'Archive'}>
                {dispatch.archived_flag ? <ArchiveX className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onOpenEdit(dispatch)} className="h-9 w-9">
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onOpenDelete(dispatch)} className="h-9 w-9 text-red-500 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
