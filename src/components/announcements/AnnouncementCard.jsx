import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Megaphone } from 'lucide-react';
import { format } from 'date-fns';

const priorityBg = {
  1: 'bg-red-50 border-red-200',
  2: 'bg-orange-50 border-orange-200',
  3: 'bg-yellow-50 border-yellow-200',
  4: 'bg-blue-50 border-blue-200',
  5: 'bg-slate-50 border-slate-200',
};

const priorityText = {
  1: 'text-red-800',
  2: 'text-orange-800',
  3: 'text-yellow-800',
  4: 'text-blue-800',
  5: 'text-slate-700',
};

export default function AnnouncementCard({ announcement, footer }) {
  const bgClass = priorityBg[announcement.priority] || priorityBg[3];
  const textClass = priorityText[announcement.priority] || priorityText[3];

  return (
    <Card className={`rounded-lg border border-l-4 ${bgClass}`}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex items-start gap-3">
          <div className={`rounded-md p-1.5 ${bgClass}`}>
            <Megaphone className={`h-4 w-4 shrink-0 ${textClass}`} />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold leading-tight ${textClass}`}>{announcement.title}</p>
            <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap break-words">{announcement.message}</p>
            {announcement.created_at && (
              <p className="mt-2 text-[11px] text-slate-500">
                {format(new Date(announcement.created_at), 'MMM d, yyyy · h:mm a')}
              </p>
            )}
            {footer}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

