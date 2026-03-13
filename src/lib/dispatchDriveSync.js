import { format, parseISO } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { buildDispatchHtml, getDispatchJobNumberString } from '@/lib/dispatchHtml';

export const DRIVE_DISPATCH_ROOT_FOLDER_ID = '1zCnqCZj0kdTLwcjQoZ47Ct_-2Gqyqt17';
export const DRIVE_DISPATCH_ROOT_FOLDER_NAME = 'Dispatch Records';

const cleanSegment = (value, fallback) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return fallback;
  return normalized.replace(/[\\/:*?"<>|]/g, '-');
};

const formatFileDate = (value) => {
  if (!value) return format(new Date(), 'MM-dd-yyyy');
  try {
    return format(parseISO(value), 'MM-dd-yyyy');
  } catch {
    return value;
  }
};

export const getTruckSpecificRecordTargets = (dispatch, companyName) => {
  const trucks = Array.from(new Set((dispatch?.trucks_assigned || []).map((truck) => cleanSegment(truck, '')).filter(Boolean)));
  const fileDate = formatFileDate(dispatch?.date);
  const jobs = cleanSegment(getDispatchJobNumberString(dispatch), 'NoJobNumber');
  const companyFolderName = cleanSegment(companyName, 'Unknown Company');

  return trucks.map((truckNumber) => {
    const fileName = `${fileDate}_${truckNumber}_${jobs}.html`;
    return {
      truckNumber,
      fileName,
      companyFolderName,
      truckFolderName: truckNumber,
      pathKey: `${companyFolderName}/${truckNumber}/${fileName}`
    };
  });
};

export const syncDispatchHtmlToDrive = async ({
  dispatch,
  previousDispatch,
  companyName,
  confirmations,
  timeEntries,
  driverAssignments = [],
  finalizeAfterSync = false,
  allowArchivedFinalizedSync = false
}) => {
  if (!dispatch?.id) return { skipped: true, reason: 'missing_dispatch_id' };

  const alreadyFinalized = Boolean(dispatch?.archived_flag && dispatch?.dispatch_html_drive_sync_finalized_at);
  if (alreadyFinalized && !allowArchivedFinalizedSync) {
    return { skipped: true, reason: 'already_finalized' };
  }

  const targets = getTruckSpecificRecordTargets(dispatch, companyName);
  const previousRecords = Array.isArray(previousDispatch?.dispatch_html_drive_records) ? previousDispatch.dispatch_html_drive_records : [];

  const payload = {
    dispatchId: dispatch.id,
    rootFolderId: DRIVE_DISPATCH_ROOT_FOLDER_ID,
    rootFolderName: DRIVE_DISPATCH_ROOT_FOLDER_NAME,
    companyName,
    desiredFiles: targets.map((target) => ({
      ...target,
      htmlContent: buildDispatchHtml({
        dispatch,
        companyName,
        truckNumber: target.truckNumber,
        confirmations,
        timeEntries,
        driverAssignments
      })
    })),
    previousFiles: previousRecords,
    status: dispatch.status,
    updatedAt: new Date().toISOString()
  };

  const response = await base44.functions.invoke('syncDispatchHtmlToDrive/entry', payload);
  const responseData = response?.data || response || {};
  const syncedRecords = Array.isArray(responseData.files)
    ? responseData.files
    : payload.desiredFiles.map((file) => ({
      dispatch_id: dispatch.id,
      truck_number: file.truckNumber,
      file_name: file.fileName,
      company_folder_name: file.companyFolderName,
      truck_folder_name: file.truckFolderName,
      path_key: file.pathKey,
      root_folder_id: DRIVE_DISPATCH_ROOT_FOLDER_ID,
      status: dispatch.status,
      synced_at: payload.updatedAt
    }));

  const metadataPayload = {
    dispatch_html_drive_records: syncedRecords,
    dispatch_html_drive_root_folder_id: DRIVE_DISPATCH_ROOT_FOLDER_ID,
    dispatch_html_drive_last_synced_at: payload.updatedAt,
    dispatch_html_drive_last_sync_status: finalizeAfterSync ? 'finalized' : 'synced',
    dispatch_html_drive_sync_finalized_at: finalizeAfterSync ? payload.updatedAt : dispatch?.dispatch_html_drive_sync_finalized_at || null,
    dispatch_html_drive_last_sync_error: null
  };

  await base44.entities.Dispatch.update(dispatch.id, metadataPayload);

  return {
    skipped: false,
    syncedRecords,
    removedRecords: responseData.removedFiles || []
  };
};
