import { useCallback, useEffect, useMemo, useState } from 'react';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const EDGE_MARGIN = 24;
const CENTER_TOLERANCE = 80;
const SCROLL_SETTLE_TIMEOUT = 800;
const DEBUG_TUTORIAL_SCROLL = true;

const getDebugSequence = () => {
  if (typeof window === 'undefined') return 0;
  window.__tutorialScrollDebugSeq = (window.__tutorialScrollDebugSeq || 0) + 1;
  return window.__tutorialScrollDebugSeq;
};


const logTutorialScroll = (...args) => {
  if (!DEBUG_TUTORIAL_SCROLL) return;
  // eslint-disable-next-line no-console
  const sequence = getDebugSequence();
  const now = typeof performance !== 'undefined' ? performance.now().toFixed(1) : 'n/a';
  console.log(`[TutorialScroll][#${sequence}][t=${now}]`, ...args);
};

const resolveVisibleTarget = (selector) => {
  if (!selector) return null;
  const targets = Array.from(document.querySelectorAll(selector));
  const visible = targets.find((el) => {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  });
  if (!visible) return null;
  return {
    element: visible,
    rect: visible.getBoundingClientRect(),
  };
};

const isScrollableNode = (node) => {
  if (!node || !(node instanceof Element)) return false;
  const style = window.getComputedStyle(node);
  const overflowY = style.overflowY;
  const overflow = style.overflow;
  const overflowX = style.overflowX;
  const supportsScroll = [overflowY, overflow, overflowX].some((value) => value === 'auto' || value === 'scroll');
  return supportsScroll && node.scrollHeight > node.clientHeight;
};

const getNodeDescriptor = (node) => {
  if (!node) return 'window';
  const tag = node.tagName?.toLowerCase() || 'node';
  const idPart = node.id ? `#${node.id}` : '';
  const classPart = node.className && typeof node.className === 'string'
    ? `.${node.className.trim().replace(/\s+/g, '.')}`
    : '';
  return `${tag}${idPart}${classPart}`;
};


const isViewportScrollNode = (node) => node === document.documentElement || node === document.body;

const getScrollableAncestors = (element) => {
  const candidates = [];
  let current = element?.parentElement;

  while (current) {
    if (isScrollableNode(current)) {
      candidates.push(current);
    }
    current = current.parentElement;
  }

  return candidates;
};

const getContainerScore = (container, targetRect) => {
  const containerRect = container.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const visibleTop = Math.max(containerRect.top, 0);
  const visibleBottom = Math.min(containerRect.bottom, viewportHeight);
  const visibleHeight = Math.max(0, visibleBottom - visibleTop);
  const targetCenter = targetRect.top + (targetRect.height / 2);
  const containsTargetCenter = targetCenter >= containerRect.top && targetCenter <= containerRect.bottom;
  const sizeWeight = Math.min(container.clientHeight, viewportHeight);
  const viewportCoverage = visibleHeight;
  const tinyPenalty = container.clientHeight < 220 ? 220 : 0;

  return (containsTargetCenter ? 100000 : 0) + (sizeWeight * 10) + viewportCoverage - tinyPenalty;
};

const resolveScrollContainer = (element, rect) => {
  const scrollableAncestors = getScrollableAncestors(element);

  if (!scrollableAncestors.length) {
    return null;
  }

  const scored = scrollableAncestors
    .map((container) => ({
      container,
      score: getContainerScore(container, rect),
    }))
    .sort((a, b) => b.score - a.score);

  const [best] = scored;

  logTutorialScroll('scrollable ancestors ranked', scored.map((item) => ({
    container: getNodeDescriptor(item.container),
    score: item.score,
    clientHeight: item.container.clientHeight,
    scrollHeight: item.container.scrollHeight,
  })));

  if (!best) return null;

  return best.container;
};

const resolveExplicitScrollContainer = (selector) => {
  if (!selector) {
    logTutorialScroll('main explicit scroll container not provided; using auto/viewport resolution');
    return null;
  }

  const container = document.querySelector(selector);
  if (!container) {
    logTutorialScroll('explicit scroll container not found', { selector });
    return null;
  }

  if (isViewportScrollNode(container)) {
    logTutorialScroll('explicit scroll container resolved to viewport root node; using window scrolling', {
      selector,
      container: getNodeDescriptor(container),
    });
    return null;
  }

  logTutorialScroll('explicit scroll container resolved', {
    selector,
    container: getNodeDescriptor(container),
    clientHeight: container.clientHeight,
    scrollHeight: container.scrollHeight,
  });

  return container;
};

const getIsNearViewportCenter = (rect) => {
  if (!rect) return false;

  const viewportHeight = window.innerHeight;
  const viewportCenter = viewportHeight / 2;
  const targetCenter = rect.top + (rect.height / 2);
  const fullyVisible = rect.top >= EDGE_MARGIN && rect.bottom <= viewportHeight - EDGE_MARGIN;
  const closeToCenter = Math.abs(targetCenter - viewportCenter) <= CENTER_TOLERANCE;

  return fullyVisible && closeToCenter;
};

const getIsNearContainerCenter = (element, container) => {
  if (!element || !container) return false;

  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const targetCenter = elementRect.top + (elementRect.height / 2);
  const containerCenter = containerRect.top + (containerRect.height / 2);
  const fullyVisible = elementRect.top >= containerRect.top + EDGE_MARGIN
    && elementRect.bottom <= containerRect.bottom - EDGE_MARGIN;
  const closeToCenter = Math.abs(targetCenter - containerCenter) <= CENTER_TOLERANCE;

  return fullyVisible && closeToCenter;
};

const waitForCenteredTarget = (element, scrollParent, startedAt = performance.now()) => new Promise((resolve) => {
  const checkPosition = () => {
    const rect = element?.getBoundingClientRect();

    if (!rect || (rect.width === 0 && rect.height === 0)) {
      resolve(null);
      return;
    }

    const isCentered = scrollParent
      ? getIsNearContainerCenter(element, scrollParent)
      : getIsNearViewportCenter(rect);

    if (isCentered) {
      resolve(rect);
      return;
    }

    if (performance.now() - startedAt >= SCROLL_SETTLE_TIMEOUT) {
      resolve(rect);
      return;
    }

    window.requestAnimationFrame(checkPosition);
  };

  window.requestAnimationFrame(checkPosition);
});

const centerInContainer = (element, container) => {
  const containerRect = container.getBoundingClientRect();
  const elementRect = element.getBoundingClientRect();
  const currentScrollTop = container.scrollTop;
  const elementCenterInContainer = (elementRect.top - containerRect.top) + currentScrollTop + (elementRect.height / 2);
  const desiredScrollTop = elementCenterInContainer - (container.clientHeight / 2);
  const maxScrollTop = Math.max(container.scrollHeight - container.clientHeight, 0);
  const nextScrollTop = clamp(desiredScrollTop, 0, maxScrollTop);

  logTutorialScroll('container centering', {
    container: getNodeDescriptor(container),
    currentScrollTop,
    desiredScrollTop,
    nextScrollTop,
    targetRect: {
      top: elementRect.top,
      bottom: elementRect.bottom,
      height: elementRect.height,
    },
    containerRect: {
      top: containerRect.top,
      bottom: containerRect.bottom,
      height: containerRect.height,
    },
  });

  container.scrollTo({
    top: nextScrollTop,
    behavior: 'smooth',
  });
};

const centerInViewport = (rect) => {
  const currentScrollTop = window.scrollY;
  const desiredTop = currentScrollTop + rect.top + (rect.height / 2) - (window.innerHeight / 2);
  const maxScrollTop = Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);
  const nextTop = clamp(desiredTop, 0, maxScrollTop);

  logTutorialScroll('viewport centering', {
    currentScrollTop,
    desiredTop,
    nextTop,
    targetRect: {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
    },
  });

  window.scrollTo({
    top: nextTop,
    behavior: 'smooth',
  });
};

const scrollTargetIntoView = async (element, rect, selector, explicitScrollContainerSelector) => {
  if (!element || !rect) {
    return rect;
  }

  logTutorialScroll('resolving step target', {
    selector,
    explicitScrollContainerSelector,
    target: getNodeDescriptor(element),
    rect: {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
    },
  });

  const explicitScrollParent = resolveExplicitScrollContainer(explicitScrollContainerSelector);
  const scrollParent = explicitScrollParent || resolveScrollContainer(element, rect);

  logTutorialScroll('chosen scroll container', {
    explicitScrollContainerSelector,
    resolved: scrollParent ? getNodeDescriptor(scrollParent) : 'window',
    source: explicitScrollParent ? 'explicit' : 'auto',
    mode: scrollParent ? 'element' : 'window',
  });

  if (scrollParent) {
    const alreadyCentered = getIsNearContainerCenter(element, scrollParent);
    logTutorialScroll('container centered before scroll?', alreadyCentered, {
      scrollTop: scrollParent.scrollTop,
    });
    if (alreadyCentered) {
      return rect;
    }

    const beforeScrollTop = scrollParent.scrollTop;
    const beforeRect = element.getBoundingClientRect();
    centerInContainer(element, scrollParent);
    const settledRect = await waitForCenteredTarget(element, scrollParent);
    const afterScrollTop = scrollParent.scrollTop;
    logTutorialScroll('container settled', {
      activeStepSelector: selector,
      explicitScrollContainerSelector,
      container: getNodeDescriptor(scrollParent),
      beforeScrollTop,
      afterScrollTop,
      targetRectBefore: {
        top: beforeRect.top,
        bottom: beforeRect.bottom,
        height: beforeRect.height,
      },
      rect: settledRect ? {
        top: settledRect.top,
        bottom: settledRect.bottom,
        height: settledRect.height,
      } : null,
      centered: getIsNearContainerCenter(element, scrollParent),
    });
    return settledRect;
  }

  const alreadyCentered = getIsNearViewportCenter(rect);
  logTutorialScroll('viewport centered before scroll?', alreadyCentered, {
    scrollTop: window.scrollY,
  });
  if (alreadyCentered) {
    return rect;
  }

  const beforeScrollTop = window.scrollY;
  const beforeRect = element.getBoundingClientRect();
  centerInViewport(rect);
  const settledRect = await waitForCenteredTarget(element, null);
  const afterScrollTop = window.scrollY;
  logTutorialScroll('viewport settled', {
    activeStepSelector: selector,
    explicitScrollContainerSelector,
    container: 'window',
    beforeScrollTop,
    afterScrollTop,
    targetRectBefore: {
      top: beforeRect.top,
      bottom: beforeRect.bottom,
      height: beforeRect.height,
    },
    rect: settledRect ? {
      top: settledRect.top,
      bottom: settledRect.bottom,
      height: settledRect.height,
    } : null,
    centered: settledRect ? getIsNearViewportCenter(settledRect) : false,
  });
  return settledRect;
};

// Shared runner for tutorial overlays to keep sequencing/target resolution behavior consistent.
export default function useTutorialRunner({
  steps,
  active,
  getCurrentTarget,
  getScrollContainer,
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState(null);

  const totalSteps = steps.length;
  const isCompletion = active && stepIndex >= totalSteps;
  const currentStep = !isCompletion ? steps[stepIndex] : null;

  const handleStepChange = useCallback((nextIndex) => {
    setStepIndex(clamp(nextIndex, 0, totalSteps));
  }, [totalSteps]);

  useEffect(() => {
    if (!active || isCompletion || !currentStep) return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 20;
    let retryTimeoutId = null;
    let initialRafId = null;

    const resolveTarget = async () => {
      const targetSelector = getCurrentTarget(currentStep);
      const explicitScrollContainerSelector = getScrollContainer
        ? getScrollContainer(currentStep)
        : currentStep?.scrollContainer || null;

      logTutorialScroll('resolveTarget start', {
        stepIndex,
        targetSelector,
        explicitScrollContainerSelector,
        attempts,
        cancelled,
        active,
        hasCurrentStep: Boolean(currentStep),
      });

      if (cancelled) return;

      const resolvedTarget = resolveVisibleTarget(targetSelector);
      if (resolvedTarget) {
        const centeredRect = await scrollTargetIntoView(
          resolvedTarget.element,
          resolvedTarget.rect,
          targetSelector,
          explicitScrollContainerSelector,
        );
        if (cancelled) return;

        if (centeredRect) {
          setTargetRect(centeredRect);
          return;
        }

        const measuredTarget = resolveVisibleTarget(getCurrentTarget(currentStep));
        if (measuredTarget) {
          setTargetRect(measuredTarget.rect);
          return;
        }

        attempts += 1;
        if (attempts < maxAttempts) {
          retryTimeoutId = window.setTimeout(() => {
            retryTimeoutId = null;
            resolveTarget();
          }, 120);
          return;
        }

        handleStepChange(stepIndex + 1);
        return;
      }

      logTutorialScroll('resolveTarget target not found', {
        targetSelector,
        attempts,
        page: typeof window !== 'undefined' ? window.location?.pathname : null,
      });

      attempts += 1;
      if (attempts >= maxAttempts) {
        handleStepChange(stepIndex + 1);
        return;
      }

      retryTimeoutId = window.setTimeout(() => {
        retryTimeoutId = null;
        resolveTarget();
      }, 120);
    };

    initialRafId = window.requestAnimationFrame(() => {
      initialRafId = null;
      resolveTarget();
    });

    return () => {
      cancelled = true;
      if (retryTimeoutId) {
        window.clearTimeout(retryTimeoutId);
      }
      if (initialRafId) {
        window.cancelAnimationFrame(initialRafId);
      }
    };
  }, [active, currentStep, getCurrentTarget, getScrollContainer, handleStepChange, isCompletion, stepIndex]);

  useEffect(() => {
    if (!active || isCompletion) return;

    const updatePosition = () => {
      const resolvedTarget = resolveVisibleTarget(getCurrentTarget(currentStep));
      if (resolvedTarget?.rect) setTargetRect(resolvedTarget.rect);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [active, currentStep, getCurrentTarget, isCompletion]);

  const tooltipStyle = useMemo(() => {
    if (isCompletion || !targetRect) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }

    const margin = 16;
    const top = clamp(targetRect.bottom + 14, margin, window.innerHeight - 230);
    const left = clamp(targetRect.left, margin, window.innerWidth - 400);
    return { top: `${top}px`, left: `${left}px` };
  }, [isCompletion, targetRect]);

  const setTooltipVerticalLimit = useCallback((maxHeight) => {
    if (isCompletion || !targetRect) {
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
    }

    const margin = 16;
    const top = clamp(targetRect.bottom + 14, margin, window.innerHeight - maxHeight);
    const left = clamp(targetRect.left, margin, window.innerWidth - 400);
    return { top: `${top}px`, left: `${left}px` };
  }, [isCompletion, targetRect]);

  return {
    totalSteps,
    stepIndex,
    targetRect,
    isCompletion,
    currentStep,
    tooltipStyle,
    setStepIndex,
    setTargetRect,
    handleStepChange,
    setTooltipVerticalLimit,
  };
}
