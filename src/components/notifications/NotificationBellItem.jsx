import React from 'react';
import { format } from 'date-fns';
import NotificationStatusBadge from './NotificationStatusBadge';

export default function NotificationBellItem({
  notification,
  display,
  effectiveReadFlag,
  dispatch,
  confirmations,
  ownerAllowedTrucks,
  onClick,
}) {
  return (
    <div
      className={`group relative cursor-pointer border-b border-slate-100/90 px-4 py-3.5 transition-all duration-200 last:border-b-0 ${!effectiveReadFlag ? 'bg-blue-50/40' : 'bg-white/40'} hover:bg-slate-50/80 focus-within:bg-slate-50/80`}
      onClick={onClick}
    >
      {!effectiveReadFlag && (
        <span className="absolute left-2.5 top-5 h-2 w-2 rounded-full bg-blue-500 shadow-[0_0_0_4px_rgba(59,130,246,0.12)]" aria-hidden="true" />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className={`min-w-0 flex-1 ${!effectiveReadFlag ? 'pl-4' : ''}`}>
          <p className={`text-sm leading-5 text-slate-800 ${display.isOwnerDispatchStatus ? 'font-semibold' : 'font-medium'}`}>
            {display.title}
          </p>
          <p className="mt-1 whitespace-pre-line text-sm leading-5 text-slate-600">{display.message}</p>
          {notification.required_trucks?.length > 0 && (
            <div className="mt-2">
              <NotificationStatusBadge
                notification={notification}
                confirmations={confirmations}
                dispatch={dispatch}
                ownerAllowedTrucks={ownerAllowedTrucks}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-slate-400">
            {format(new Date(notification.created_date), 'MMM d, h:mm a')}
          </p>
        </div>
      </div>
    </div>
  );
}
