import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Bell, Truck } from 'lucide-react';
import NotificationStatusBadge from './NotificationStatusBadge';

export default function ActionNeededItem({
  notification,
  dispatch,
  display,
  confirmations,
  ownerAllowedTrucks,
  visibleTrucks,
  onClick,
}) {
  return (
    <div
      className="flex items-start gap-3 px-4 py-3 hover:bg-blue-50/40 cursor-pointer bg-blue-50/20"
      onClick={onClick}
    >
      <Bell className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className={`text-sm text-slate-800 truncate ${display.isOwnerDispatchStatus ? 'font-semibold' : ''}`}>{display.title}</p>
        <p className="text-xs text-slate-600 mt-0.5 line-clamp-2 whitespace-pre-line">{display.message}</p>
        {dispatch && (
          <div className="mt-1 flex items-center gap-1 flex-wrap">
            <Truck className="h-3 w-3 text-slate-500" />
            {visibleTrucks.map((truck) => (
              <Badge key={`${notification.id}-${truck}`} variant="outline" className="text-[10px] font-mono px-1.5 py-0 h-5">
                {truck}
              </Badge>
            ))}
          </div>
        )}
        <div className="mt-1">
          <NotificationStatusBadge
            notification={notification}
            confirmations={confirmations}
            dispatch={dispatch}
            ownerAllowedTrucks={ownerAllowedTrucks}
          />
        </div>
      </div>
      <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
    </div>
  );
}
