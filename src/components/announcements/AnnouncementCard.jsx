import React from 'react';
import { Megaphone } from 'lucide-react';
import { format } from 'date-fns';

const priorityCard = {
  1: 'border-red-200 bg-red-50/50',
  2: 'border-orange-200 bg-orange-50/50',
  3: 'border-yellow-200 bg-yellow-50/50',
  4: 'border-blue-200 bg-blue-50/50',
  5: 'border-slate-200 bg-slate-50/80',
};

const priorityIcon = {
  1: 'bg-red-100 text-red-700',
  2: 'bg-orange-100 text-orange-700',
  3: 'bg-yellow-100 text-yellow-700',
  4: 'bg-blue-100 text-blue-700',
  5: 'bg-slate-100 text-slate-700',
};

const priorityText = {
  1: 'text-red-800',
  2: 'text-orange-800',
  3: 'text-yellow-800',
  4: 'text-blue-800',
  5: 'text-slate-700',
};

export default function AnnouncementCard({ announcement, footer, showCreatedAt = false }) {
  const cardClass = priorityCard[announcement.priority] || priorityCard[3];
  const iconClass = priorityIcon[announcement.priority] || priorityIcon[3];
  const textClass = priorityText[announcement.priority] || priorityText[3];

  return (
    <div className={`rounded-lg border p-3 sm:p-4 ${cardClass}`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-md p-1.5 ${iconClass}`}>
          <Megaphone className="h-4 w-4 shrink-0" />
        </div>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold leading-tight ${textClass}`}>{announcement.title}</p>
          <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap break-words">{announcement.message}</p>
          {showCreatedAt && announcement.created_at && (
            <p className="mt-2 text-[11px] text-slate-500">
              {format(new Date(announcement.created_at), 'MMM d, yyyy · h:mm a')}
            </p>
          )}
          {footer}
        </div>
      </div>
    </div>
  );
}
