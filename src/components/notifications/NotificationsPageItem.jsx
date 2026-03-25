import React from 'react';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ExternalLink } from 'lucide-react';
import NotificationStatusBadge from './NotificationStatusBadge';

export default function NotificationsPageItem({
  notification,
  display,
  effectiveReadFlag,
  dispatch,
  confirmations,
  ownerAllowedTrucks,
  onClick,
}) {
  return (
    <Card
      className={`hover:shadow-sm transition-shadow cursor-pointer ${!effectiveReadFlag ? 'border-blue-200 bg-blue-50/30' : ''}`}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className={`text-sm text-slate-900 ${display.isOwnerDispatchStatus ? 'font-semibold' : ''}`}>{display.title}</h3>
              {!effectiveReadFlag && <Badge className="bg-blue-500 text-xs">New</Badge>}
              {notification.related_dispatch_id && (
                <ExternalLink className="h-3.5 w-3.5 text-slate-400 ml-auto shrink-0" />
              )}
            </div>
            <p className="text-sm text-slate-600 whitespace-pre-line">{display.message}</p>
            <div className="mt-1.5">
              <NotificationStatusBadge
                notification={notification}
                confirmations={confirmations}
                dispatch={dispatch}
                ownerAllowedTrucks={ownerAllowedTrucks}
              />
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {format(new Date(notification.created_date), 'MMM d, yyyy h:mm a')}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
