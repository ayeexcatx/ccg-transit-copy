import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { CircleHelp } from 'lucide-react';
import TutorialOverlay from './TutorialOverlay';
import TutorialWelcomeModal from './TutorialWelcomeModal';
import useTutorialRunner from './useTutorialRunner';
import {
  COMPANY_OWNER_TUTORIAL_ID,
  tutorialRegistry,
} from './tutorialConfig';

const TutorialContext = createContext({
  startTutorial: () => {},
});

const DEBUG_TUTORIAL_SCROLL = true;

const logTutorialScroll = (...args) => {
  if (!DEBUG_TUTORIAL_SCROLL) return;
  if (typeof window !== 'undefined') {
    window.__tutorialScrollDebugSeq = (window.__tutorialScrollDebugSeq || 0) + 1;
    const now = typeof performance !== 'undefined' ? performance.now().toFixed(1) : 'n/a';
    // eslint-disable-next-line no-console
    console.log(`[TutorialScroll][#${window.__tutorialScrollDebugSeq}][t=${now}]`, ...args);
    return;
  }
  // eslint-disable-next-line no-console
  console.log('[TutorialScroll]', ...args);
};

export default function TutorialProvider({ session, children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const isCompanyOwner = session?.code_type === 'CompanyOwner';

  const tutorialConfig = tutorialRegistry[COMPANY_OWNER_TUTORIAL_ID];
  const { completed: completedKey, dismissed: dismissedKey } = tutorialConfig.storageKeys;

  const [isRunning, setIsRunning] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [isDispatchDrawerOpen, setIsDispatchDrawerOpen] = useState(() => (
    typeof window !== 'undefined' && window.__dispatchDetailDrawerOpen === true
  ));

  const {
    totalSteps,
    stepIndex,
    targetRect,
    isCompletion,
    currentStep,
    tooltipStyle,
    handleStepChange,
    setStepIndex,
    setTargetRect,
  } = useTutorialRunner({
    steps: tutorialConfig.steps,
    active: isRunning,
    getCurrentTarget: (step) => step?.target,
    getScrollContainer: (step) => step?.scrollContainer || null,
  });

  const stopTutorial = useCallback(() => {
    setIsRunning(false);
    setTargetRect(null);
  }, [setTargetRect]);

  const startTutorial = useCallback(() => {
    if (!isCompanyOwner) return;
    setShowWelcome(false);
    setStepIndex(0);
    setIsRunning(true);
  }, [isCompanyOwner, setStepIndex]);

  const markCompleted = useCallback(() => {
    localStorage.setItem(completedKey, 'true');
  }, [completedKey]);

  const handleSkipForNow = useCallback(() => {
    setShowWelcome(false);
    stopTutorial();
  }, [stopTutorial]);

  const handleDismissPermanently = useCallback(() => {
    localStorage.setItem(dismissedKey, 'true');
    setShowWelcome(false);
    stopTutorial();
  }, [dismissedKey, stopTutorial]);

  const handleFinish = useCallback(() => {
    markCompleted();
    stopTutorial();
  }, [markCompleted, stopTutorial]);

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
    if (typeof window === 'undefined') return undefined;

    const syncDispatchDrawerOpen = (event) => {
      if (typeof event?.detail?.open === 'boolean') {
        setIsDispatchDrawerOpen(event.detail.open);
        return;
      }
      setIsDispatchDrawerOpen(window.__dispatchDetailDrawerOpen === true);
    };

    window.addEventListener('dispatch-detail-drawer-state', syncDispatchDrawerOpen);

    return () => {
      window.removeEventListener('dispatch-detail-drawer-state', syncDispatchDrawerOpen);
    };
  }, []);

  useEffect(() => {
    if (!isCompanyOwner) {
      setShowWelcome(false);
      stopTutorial();
      return;
    }

    const dismissed = localStorage.getItem(dismissedKey) === 'true';
    const completed = localStorage.getItem(completedKey) === 'true';

    if (!dismissed && !completed) {
      setShowWelcome(true);
    }
  }, [completedKey, dismissedKey, isCompanyOwner, stopTutorial]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.__tutorialActive = isRunning;
    logTutorialScroll('tutorial active state updated', { isRunning, stepIndex, page: currentStep?.page || null });

    return () => {
      window.__tutorialActive = false;
      logTutorialScroll('tutorial active state cleared');
    };
  }, [currentStep?.page, isRunning, stepIndex]);

  useEffect(() => {
    if (!isRunning || isCompletion || !currentStep?.page) return;
    if (location.pathname !== currentStep.page) {
      navigate(currentStep.page);
    }
  }, [currentStep?.page, isCompletion, isRunning, location.pathname, navigate]);

  const value = useMemo(() => ({ startTutorial }), [startTutorial]);

  return (
    <TutorialContext.Provider value={value}>
      {children}

      {isCompanyOwner && !isDispatchDrawerOpen && (
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={startTutorial}
          className="fixed bottom-5 right-5 z-[180] border border-blue-700 bg-blue-600 text-white shadow-lg hover:bg-blue-700 focus-visible:ring-blue-500"
        >
          <CircleHelp className="mr-1 h-4 w-4" />
          Tutorial
        </Button>
      )}

      <TutorialWelcomeModal
        open={showWelcome}
        onStart={startTutorial}
        onSkip={handleSkipForNow}
        onDismiss={handleDismissPermanently}
      />

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
        onSkip={handleSkipForNow}
        onFinish={handleFinish}
        onReplay={startTutorial}
      />
    </TutorialContext.Provider>
  );
}

export function useTutorial() {
  return useContext(TutorialContext);
}
