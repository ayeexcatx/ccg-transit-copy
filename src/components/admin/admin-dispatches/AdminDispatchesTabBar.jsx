import React from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function AdminDispatchesTabBar({ tab, onChange, todayCount, upcomingCount, historyCount }) {
  return (
    <Tabs value={tab} onValueChange={onChange} className="bg-slate-600 rounded">
      <TabsList className="bg-slate-700 text-violet-50 p-1 rounded-[10007px] inline-flex h-9 items-center justify-center flex-wrap h-auto">
        <TabsTrigger value="live-board" className="text-xs">Live Dispatch Board</TabsTrigger>
        <TabsTrigger value="today" className="text-xs">Today ({todayCount})</TabsTrigger>
        <TabsTrigger value="upcoming" className="text-xs">Upcoming ({upcomingCount})</TabsTrigger>
        <TabsTrigger value="history" className="text-xs">History ({historyCount})</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
