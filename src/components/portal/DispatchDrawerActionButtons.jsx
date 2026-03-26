import React from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Camera } from 'lucide-react';

export default function DispatchDrawerActionButtons({
  isDriverUser,
  isOwner,
  isCreatingScreenshot,
  isEditingTrucks,
  onReportIncident,
  onScreenshotDispatch,
}) {
  return (
    <>
      {isDriverUser && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            data-screenshot-exclude="true"
            onClick={onReportIncident}
            data-tour="dispatch-report-incident"
          >
            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
            Report Incident
          </Button>
        </div>
      )}

      {isOwner && (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            data-screenshot-exclude="true"
            onClick={onReportIncident}
            data-tour="dispatch-report-incident"
          >
            <AlertTriangle className="h-3.5 w-3.5 mr-1" />
            Report Incident
          </Button>
          {isOwner && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              disabled={isCreatingScreenshot || isEditingTrucks}
              onClick={onScreenshotDispatch}
              data-tour="dispatch-screenshot"
            >
              <Camera className="h-3.5 w-3.5 mr-1" />
              {isCreatingScreenshot ? 'Creating…' : 'Screenshot Dispatch'}
            </Button>
          )}
        </div>
      )}
    </>
  );
}
