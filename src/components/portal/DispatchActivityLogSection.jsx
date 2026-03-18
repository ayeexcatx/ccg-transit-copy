import React from 'react';
import { History } from 'lucide-react';

export default function DispatchActivityLogSection({ activityLog, formatActivityTimestamp }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5">
      <p className="text-[11px] text-amber-800 uppercase tracking-wide mb-1.5 flex items-center gap-1">
        <History className="h-3.5 w-3.5" />Activity
      </p>
      {Array.isArray(activityLog) && activityLog.length > 0 ? (
        <ul className="space-y-1">
          {activityLog.map((entry, idx) => (
            <li key={`${entry.timestamp || 'activity'}-${idx}`} className="text-[11px] leading-tight text-slate-700 flex items-start gap-1.5">
              <span className="text-amber-600 mt-[1px]">•</span>
              <span className="min-w-0">
                {entry.message || entry.action || 'Activity update'}
                <span className="text-slate-400">{' — '}{formatActivityTimestamp(entry.timestamp)}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-slate-500 italic">No activity yet.</p>
      )}
    </div>
  );
}
