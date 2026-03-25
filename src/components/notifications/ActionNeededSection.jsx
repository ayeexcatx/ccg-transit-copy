import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';
import { getNotificationDisplay } from './formatNotificationDetailsMessage';
import ActionNeededItem from './ActionNeededItem';

const homeSectionCardClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden';
const homeSectionHeaderClass = 'flex min-h-14 items-center justify-between gap-2 border-b border-slate-200 px-4 py-3';

export default function ActionNeededSection({
  unreadCount,
  actionItems,
  confirmations,
  ownerAllowedTrucks,
  getVisibleTrucksForDispatch,
  onNotificationClick,
}) {
  return (
    <section data-tour="action-needed">
      <Card className={homeSectionCardClass}>
        <div className={`${homeSectionHeaderClass} bg-red-700`}>
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="h-4 w-4 text-white shrink-0" />
            <h3 className="text-sm font-semibold text-white truncate">Action Needed</h3>
            {unreadCount > 0 && (
              <Badge className="bg-white text-red-700 text-xs px-1.5 py-0">{unreadCount}</Badge>
            )}
          </div>
          <Link to={createPageUrl('Notifications')} className="text-xs text-red-100 hover:text-white shrink-0">
            View all notifications
          </Link>
        </div>
        <CardContent className="p-0 divide-y divide-slate-100">
          {actionItems.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">No actions needed</p>
          ) : (
            actionItems.map(({ notification, dispatch }) => {
              const display = getNotificationDisplay(notification, dispatch);
              return (
                <ActionNeededItem
                  key={notification.id}
                  notification={notification}
                  dispatch={dispatch}
                  display={display}
                  confirmations={confirmations}
                  ownerAllowedTrucks={ownerAllowedTrucks}
                  visibleTrucks={dispatch ? getVisibleTrucksForDispatch(dispatch) : []}
                  onClick={() => onNotificationClick(notification)}
                />
              );
            })
          )}
        </CardContent>
      </Card>
    </section>
  );
}
