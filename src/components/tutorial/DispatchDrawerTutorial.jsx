import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CircleHelp } from 'lucide-react';
import TutorialOverlay from './TutorialOverlay';
import useTutorialRunner from './useTutorialRunner';
import { tutorialRegistry } from './tutorialConfig';

export default function DispatchDrawerTutorial({ isOwner, drawerOpen }) {
  const tutorialConfig = tutorialRegistry.dispatchDrawer;
  const { seen: seenKey, completed: completedKey } = tutorialConfig.storageKeys;

  const [isRunning, setIsRunning] = useState(false);

  const {
    totalSteps,
    stepIndex,
    targetRect,
    isCompletion,
    currentStep,
    handleStepChange,
    setStepIndex,
    setTargetRect,
    setTooltipVerticalLimit,
  } = useTutorialRunner({
    steps: tutorialConfig.steps,
    active: isRunning,
    getCurrentTarget: (step) => step?.target,
    getScrollContainer: (step) => step?.scrollContainer || '[data-tutorial-scroll="drawer"]',
  });

  const stopTutorial = useCallback(() => {
    setIsRunning(false);
    setTargetRect(null);
  }, [setTargetRect]);

  const startTutorial = useCallback(() => {
    if (!isOwner || !drawerOpen) return;
    localStorage.setItem(seenKey, 'true');
    setStepIndex(0);
    setIsRunning(true);
  }, [drawerOpen, isOwner, seenKey, setStepIndex]);

  const handleFinish = useCallback(() => {
    localStorage.setItem(completedKey, 'true');
    stopTutorial();
  }, [completedKey, stopTutorial]);

  const goToNextStep = useCallback(() => {
    if (isCompletion) {
      handleFinish();
      return;
    }
    handleStepChange(stepIndex + 1);
  }, [handleFinish, handleStepChange, isCompletion, stepIndex]);

  const goToPreviousStep = useCallback(() => {
    if (isCompletion) {
      handleStepChange(totalSteps - 1);
      return;
    }
    handleStepChange(stepIndex - 1);
  }, [handleStepChange, isCompletion, stepIndex, totalSteps]);

  useEffect(() => {
    if (!isOwner || !drawerOpen || isRunning) return;
    const seen = localStorage.getItem(seenKey) === 'true';
    if (!seen) {
      startTutorial();
    }
  }, [drawerOpen, isOwner, isRunning, seenKey, startTutorial]);

  useEffect(() => {
    if (!drawerOpen) {
      stopTutorial();
    }
  }, [drawerOpen, stopTutorial]);

  const tooltipStyle = useMemo(() => setTooltipVerticalLimit(260), [setTooltipVerticalLimit]);

  return (
    <>
      {isOwner && (
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={startTutorial}
          className="h-7 border border-blue-700 bg-blue-600 px-2 text-xs text-white shadow-sm hover:bg-blue-700 focus-visible:ring-blue-500"
          data-tour="dispatch-tutorial-trigger"
        >
          <CircleHelp className="mr-1 h-3.5 w-3.5" />
          Tutorial
        </Button>
      )}

      <TutorialOverlay
        active={isRunning}
        targetRect={targetRect}
        tooltipStyle={tooltipStyle}
        step={isCompletion ? tutorialConfig.completionStep : currentStep}
        stepIndex={stepIndex}
        totalSteps={totalSteps}
        isCompletion={isCompletion}
        onBack={goToPreviousStep}
        onNext={goToNextStep}
        onSkip={stopTutorial}
        onFinish={handleFinish}
        onReplay={startTutorial}
      />
    </>
  );
}
