import { base44 } from '@/api/base44Client';

/**
 * Builds the exact archived/unarchived dispatch patch shape used by current write flows.
 */
export function buildDispatchArchivePatch({ archive, archivedReason, nowIso = new Date().toISOString() }) {
  if (archive) {
    return {
      archived_flag: true,
      archived_at: nowIso,
      archived_reason: archivedReason
    };
  }

  return {
    archived_flag: false,
    archived_at: null,
    archived_reason: null,
    dispatch_html_drive_sync_finalized_at: null
  };
}

/**
 * Preserves the existing admin manual archive/unarchive + final Drive sync orchestration.
 */
export async function runAdminDispatchArchiveMutation({
  dispatch,
  archive,
  session,
  appendAdminActivityLog,
  createAdminActivityEntry,
  getAdminDisplayName,
  runFinalArchiveSync,
  onFinalArchiveSyncError
}) {
  const payload = buildDispatchArchivePatch({
    archive,
    archivedReason: 'Admin archived'
  });

  const nextLog = archive
    ? appendAdminActivityLog(
      dispatch.admin_activity_log,
      createAdminActivityEntry(session, 'archived_dispatch', `${getAdminDisplayName(session)} archived this dispatch`)
    )
    : dispatch.admin_activity_log;

  const updatedDispatch = await base44.entities.Dispatch.update(dispatch.id, {
    ...payload,
    admin_activity_log: nextLog
  });

  if (!archive) return updatedDispatch;

  const shouldRunArchiveFinalSync = !dispatch.dispatch_html_drive_sync_finalized_at;
  if (!shouldRunArchiveFinalSync) return updatedDispatch;

  try {
    await runFinalArchiveSync({
      dispatch: updatedDispatch,
      previousDispatch: dispatch
    });
  } catch (error) {
    await onFinalArchiveSyncError({
      dispatch: updatedDispatch,
      error
    });
  }

  return updatedDispatch;
}

/**
 * Preserves the existing date-based auto-archive write used by time-entry completion flow.
 */
export async function autoArchiveDispatchAfterTimeLogging({
  dispatch,
  allComplete,
  isPastOrToday
}) {
  if (!allComplete || !isPastOrToday || dispatch.archived_flag) return false;

  await base44.entities.Dispatch.update(dispatch.id, buildDispatchArchivePatch({
    archive: true,
    archivedReason: 'Time logged'
  }));

  return true;
}
