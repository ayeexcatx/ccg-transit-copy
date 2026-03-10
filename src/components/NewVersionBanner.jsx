import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  APP_RUNTIME_VERSION_CHECK_INTERVAL_MS,
  APP_RUNTIME_VERSION_CONFIG_KEY,
  APP_RUNTIME_VERSION_KEY,
  normalizeRuntimeVersion,
} from '@/lib/runtimeVersion';

async function fetchRuntimeVersion() {
  const rows = await base44.entities.AppConfig.filter({ key: APP_RUNTIME_VERSION_CONFIG_KEY }, '-updated_date', 1);
  return normalizeRuntimeVersion(rows?.[0]?.value);
}

export default function NewVersionBanner() {
  const [showRefreshModal, setShowRefreshModal] = useState(false);
  const lastSeenVersionRef = useRef('');

  const checkVersion = useCallback(async () => {
    try {
      const runtimeVersion = await fetchRuntimeVersion();
      if (!runtimeVersion) return;

      if (!lastSeenVersionRef.current) {
        const storedVersion = normalizeRuntimeVersion(localStorage.getItem(APP_RUNTIME_VERSION_KEY));
        lastSeenVersionRef.current = storedVersion || runtimeVersion;
        localStorage.setItem(APP_RUNTIME_VERSION_KEY, lastSeenVersionRef.current);
        return;
      }

      if (runtimeVersion !== lastSeenVersionRef.current) {
        localStorage.setItem(APP_RUNTIME_VERSION_KEY, runtimeVersion);
        setShowRefreshModal(true);
      }
    } catch {
      // Version checks should never block normal app usage.
    }
  }, []);

  useEffect(() => {
    const storedVersion = normalizeRuntimeVersion(localStorage.getItem(APP_RUNTIME_VERSION_KEY));
    if (storedVersion) {
      lastSeenVersionRef.current = storedVersion;
    }

    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };

    checkVersion();

    const intervalId = window.setInterval(checkVersion, APP_RUNTIME_VERSION_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
    };
  }, [checkVersion]);

  return (
    <Dialog open={showRefreshModal}>
      <DialogContent
        className="max-w-md [&>button.absolute.right-4.top-4]:hidden"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Refresh Required</DialogTitle>
          <DialogDescription>
            A new version of the app is available. Please refresh to continue.
          </DialogDescription>
        </DialogHeader>
        <div className="pt-1">
          <Button
            onClick={() => window.location.reload()}
            className="h-11 w-full bg-slate-900 text-base font-semibold text-white hover:bg-slate-800"
          >
            Refresh App
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
