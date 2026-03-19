import React from 'react';
import { Button } from '@/components/ui/button';

export default function TutorialWelcomeModal({
  open,
  title = 'Welcome to CCG Dispatch Hub',
  description = 'This quick tour will walk you through the main parts of your portal so you know where to find dispatches, announcements, availability, drivers, and incidents.',
  startLabel = 'Start Tour',
  portugueseLabel = 'Inciar Tour em Portugues',
  dismissLabel = "Don't show again",
  skipLabel = 'Skip for Now',
  showDismiss = true,
  onStart,
  onStartPortuguese,
  onSkip,
  onDismiss,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[1px] transition-opacity duration-200">
      <div className="w-full max-w-lg rounded-2xl border-4 border-slate-300 bg-slate-50 p-6 shadow-[0_24px_70px_-24px_rgba(15,23,42,0.55)] ring-1 ring-slate-200/80">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{description}</p>
        <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
          {showDismiss && <Button variant="outline" onClick={onDismiss}>{dismissLabel}</Button>}
          <Button variant="ghost" onClick={onSkip}>{skipLabel}</Button>
          <Button variant="secondary" onClick={onStartPortuguese}>{portugueseLabel}</Button>
          <Button onClick={onStart}>{startLabel}</Button>
        </div>
      </div>
    </div>
  );
}
