import React from 'react';
import { Button } from '@/components/ui/button';

export default function TutorialTooltip({
  step,
  stepIndex,
  totalSteps,
  style,
  isFirst,
  isLast,
  isCompletion,
  onBack,
  onNext,
  onSkip,
  onFinish,
  onReplay,
}) {
  if (!step) return null;

  return (
    <div
      className="fixed z-[230] w-[min(92vw,380px)] rounded-xl border-4 border-slate-300 bg-slate-50 p-4 shadow-[0_20px_60px_-24px_rgba(15,23,42,0.6)] ring-1 ring-slate-200/80 transition-all duration-200"
      style={style}
    >
      <p className="text-xs font-medium text-slate-500">{isCompletion ? 'Completed' : `Step ${stepIndex + 1} of ${totalSteps}`}</p>
      <h3 className="mt-1 text-lg font-semibold text-slate-900">{step.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.description}</p>
      {step.warningText ? (
        <p className="mt-2 text-sm leading-relaxed text-red-600 font-medium">{step.warningText}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {isCompletion ? (
          <>
            <Button variant="outline" onClick={onReplay}>Replay Tour</Button>
            <Button onClick={onFinish}>Finish</Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={onBack} disabled={isFirst}>Back</Button>
              <Button onClick={onNext}>{isLast ? 'Finish' : 'Next'}</Button>
            </div>
            <Button variant="ghost" onClick={onSkip}>Skip</Button>
          </>
        )}
      </div>
    </div>
  );
}
