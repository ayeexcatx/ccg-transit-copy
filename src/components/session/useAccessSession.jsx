import { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { getAvailableWorkspaces, normalizeView } from './workspaceUtils';
import { useAuth } from '@/lib/AuthContext';
import { normalizeAppRoleToAccessCodeType } from '@/services/currentAppIdentityService';
import { resolveAdminDisplayName, resolveProfileName } from '@/lib/adminIdentity';

const STORAGE_ACCESS_CODE_ID = 'access_code_id';
const STORAGE_WORKSPACE_MODE = 'workspace_mode';
const STORAGE_WORKSPACE_COMPANY_ID = 'workspace_company_id';
const SUPPORTED_CODE_TYPES = new Set(['Admin', 'CompanyOwner', 'Driver']);

function pickInitialWorkspace(accessCode) {
  const storedMode = normalizeView(localStorage.getItem(STORAGE_WORKSPACE_MODE));
  const storedCompanyId = localStorage.getItem(STORAGE_WORKSPACE_COMPANY_ID) || null;

  const workspaces = getAvailableWorkspaces(accessCode);
  if (workspaces.length === 0) {
    return {
      activeViewMode: accessCode.code_type,
      activeCompanyId: accessCode.code_type === 'CompanyOwner' ? accessCode.company_id || null : null,
    };
  }

  const storedMatch = workspaces.find(
    (workspace) => workspace.mode === storedMode && workspace.companyId === storedCompanyId,
  );
  if (storedMatch) {
    return {
      activeViewMode: storedMatch.mode,
      activeCompanyId: storedMatch.companyId,
    };
  }

  const adminWorkspace = workspaces.find((workspace) => workspace.mode === 'Admin');
  if (adminWorkspace) {
    return {
      activeViewMode: adminWorkspace.mode,
      activeCompanyId: adminWorkspace.companyId,
    };
  }

  return {
    activeViewMode: workspaces[0].mode,
    activeCompanyId: workspaces[0].companyId,
  };
}

function buildEffectiveSession(accessCode, activeViewMode, activeCompanyId, ownerWorkspaceAllowedTrucks = null) {
  if (!accessCode) return null;
  if (!SUPPORTED_CODE_TYPES.has(accessCode.code_type)) return null;

  if (accessCode.code_type === 'Driver') {
    return {
      ...accessCode,
      raw_code_type: accessCode.code_type,
      activeViewMode: accessCode.code_type,
      activeCompanyId: accessCode.company_id || null,
    };
  }

  if (activeViewMode === 'CompanyOwner') {
    return {
      ...accessCode,
      raw_code_type: accessCode.code_type,
      code_type: 'CompanyOwner',
      company_id: activeCompanyId,
      owner_scope_trucks: Array.isArray(ownerWorkspaceAllowedTrucks) ? ownerWorkspaceAllowedTrucks : [],
      activeViewMode: 'CompanyOwner',
      activeCompanyId,
    };
  }

  return {
    ...accessCode,
    raw_code_type: accessCode.code_type,
    code_type: accessCode.code_type,
    activeViewMode: activeViewMode || accessCode.code_type,
    activeCompanyId: accessCode.code_type === 'CompanyOwner' ? accessCode.company_id || null : null,
  };
}

function buildLinkedUserSession({
  linkedIdentity,
  authenticatedUser,
  fallbackSession,
  workspace,
}) {
  const codeType = normalizeAppRoleToAccessCodeType(linkedIdentity?.app_role);
  if (!SUPPORTED_CODE_TYPES.has(codeType)) return null;

  if (codeType !== 'Admin' && !fallbackSession?.id) return null;

  const userProfileName = resolveProfileName(authenticatedUser);
  const userDisplayName = resolveAdminDisplayName(authenticatedUser);

  if (codeType === 'Admin') {
    const activeViewMode = workspace.activeViewMode || 'Admin';
    const activeCompanyId = activeViewMode === 'CompanyOwner'
      ? (workspace.activeCompanyId || null)
      : null;

    return {
      ...(fallbackSession || {}),
      id: linkedIdentity.user_id,
      user_id: linkedIdentity.user_id,
      onboarding_complete: true,
      raw_code_type: fallbackSession?.raw_code_type || codeType,
      code_type: codeType,
      company_id: activeViewMode === 'CompanyOwner' ? activeCompanyId : null,
      driver_id: null,
      activeViewMode,
      activeCompanyId,
      label: userDisplayName || 'Admin',
      name: userDisplayName || 'Admin',
      profile_name: userProfileName || '',
      admin_display_name: userDisplayName || 'Admin',
      email: authenticatedUser?.email || '',
      shared_admin_access_code_id: fallbackSession?.id || null,
    };
  }

  const companyId = linkedIdentity?.company_id || fallbackSession?.company_id || null;
  const driverId = linkedIdentity?.driver_id || fallbackSession?.driver_id || null;
  const activeViewMode = codeType === 'Admin'
    ? (workspace.activeViewMode || 'Admin')
    : codeType;
  const activeCompanyId = activeViewMode === 'CompanyOwner'
    ? (workspace.activeCompanyId || companyId || null)
    : null;

  return {
    ...fallbackSession,
    user_id: linkedIdentity.user_id,
    onboarding_complete: true,
    raw_code_type: fallbackSession?.raw_code_type || codeType,
    code_type: codeType,
    company_id: companyId,
    driver_id: driverId,
    activeViewMode,
    activeCompanyId,
  };
}

function isActiveSupportedCode(accessCode) {
  return Boolean(
    accessCode
    && accessCode.active_flag !== false
    && SUPPORTED_CODE_TYPES.has(accessCode.code_type),
  );
}

async function resolveLinkedIdentityAccessCode(linkedIdentity) {
  const codeType = normalizeAppRoleToAccessCodeType(linkedIdentity?.app_role);
  if (!SUPPORTED_CODE_TYPES.has(codeType)) return null;

  if (codeType === 'Admin') {
    const linkedAdminAccessCodeId = linkedIdentity?.linked_admin_access_code_id || null;

    if (linkedAdminAccessCodeId) {
      const linkedAdminAccessCode = await resolveStoredAccessCodeById(linkedAdminAccessCodeId);
      if (linkedAdminAccessCode?.code_type === 'Admin') return linkedAdminAccessCode;
      return null;
    }

    if (linkedIdentity?.user_id) {
      const userLinkedCodes = await base44.entities.AccessCode.filter(
        { code_type: 'Admin', user_id: linkedIdentity.user_id },
        '-created_date',
        20,
      );
      const activeUserLinkedAdminCode = (userLinkedCodes || []).find((accessCode) => isActiveSupportedCode(accessCode));
      if (activeUserLinkedAdminCode) return activeUserLinkedAdminCode;
    }
    return null;
  }

  const candidates = [];

  if (linkedIdentity.user_id) {
    candidates.push(
      base44.entities.AccessCode.filter({ user_id: linkedIdentity.user_id }, '-created_date', 20),
    );
  }

  if (codeType === 'Driver' && linkedIdentity.driver_id) {
    candidates.push(
      base44.entities.AccessCode.filter({ code_type: 'Driver', driver_id: linkedIdentity.driver_id }, '-created_date', 20),
    );
  }

  if (codeType === 'CompanyOwner' && linkedIdentity.company_id) {
    candidates.push(
      base44.entities.AccessCode.filter({ code_type: 'CompanyOwner', company_id: linkedIdentity.company_id }, '-created_date', 20),
    );
  }

  for (const query of candidates) {
    const results = await query;
    const valid = (results || []).find((accessCode) => isActiveSupportedCode(accessCode) && accessCode.code_type === codeType);
    if (valid) return valid;
  }

  return null;
}

async function resolveStoredAccessCodeById(storedId) {
  if (!storedId) return null;

  const codes = await base44.entities.AccessCode.filter({ id: storedId });
  const storedAccessCode = codes?.[0] || null;
  if (!isActiveSupportedCode(storedAccessCode)) return null;
  return storedAccessCode;
}

async function resolveAuthoritativeLinkedIdentity(currentAppIdentity) {
  if (!currentAppIdentity?.user_id) return currentAppIdentity;

  try {
    const users = await base44.entities.User.filter({ id: currentAppIdentity.user_id }, '-created_date', 1);
    const persistedUser = users?.[0];
    if (!persistedUser?.id) return currentAppIdentity;

    return {
      ...currentAppIdentity,
      app_role: persistedUser.app_role || currentAppIdentity.app_role || null,
      company_id: persistedUser.company_id || null,
      driver_id: persistedUser.driver_id || null,
      linked_admin_access_code_id: persistedUser.linked_admin_access_code_id || null,
      onboarding_complete: Boolean(
        persistedUser.onboarding_complete ?? currentAppIdentity.onboarding_complete,
      ),
    };
  } catch {
    return currentAppIdentity;
  }
}

function isAccessCodeCompatibleWithLinkedIdentity(accessCode, linkedIdentity) {
  const codeType = normalizeAppRoleToAccessCodeType(linkedIdentity?.app_role);
  if (!accessCode || !codeType) return false;
  if (accessCode.code_type !== codeType) return false;

  if (codeType === 'Driver') {
    if (linkedIdentity.driver_id) {
      return String(accessCode.driver_id || '') === String(linkedIdentity.driver_id);
    }
    return true;
  }

  if (codeType === 'CompanyOwner') {
    if (linkedIdentity.company_id) {
      return String(accessCode.company_id || '') === String(linkedIdentity.company_id);
    }
    return true;
  }

  if (codeType === 'Admin') {
    const linkedAdminAccessCodeId = linkedIdentity?.linked_admin_access_code_id || null;
    if (linkedAdminAccessCodeId) {
      return String(accessCode.id || '') === String(linkedAdminAccessCodeId);
    }
    return true;
  }

  return true;
}

export function useAccessSession() {
  const { user, currentAppIdentity, isAuthenticated, isLoadingAuth } = useAuth();
  const [accessCode, setAccessCode] = useState(null);
  const [workspace, setWorkspace] = useState({ activeViewMode: null, activeCompanyId: null });
  const [ownerWorkspaceAllowedTrucks, setOwnerWorkspaceAllowedTrucks] = useState(null);
  const [loading, setLoading] = useState(true);

  const persistWorkspace = useCallback((nextWorkspace) => {
    localStorage.setItem(STORAGE_WORKSPACE_MODE, nextWorkspace.activeViewMode);
    if (nextWorkspace.activeCompanyId) {
      localStorage.setItem(STORAGE_WORKSPACE_COMPANY_ID, nextWorkspace.activeCompanyId);
    } else {
      localStorage.removeItem(STORAGE_WORKSPACE_COMPANY_ID);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolveOwnerWorkspaceAllowedTrucks() {
      if (!accessCode) {
        setOwnerWorkspaceAllowedTrucks(null);
        return;
      }

      if (workspace.activeViewMode !== 'CompanyOwner') {
        setOwnerWorkspaceAllowedTrucks(null);
        return;
      }

      const companyId = accessCode.code_type === 'Admin'
        ? workspace.activeCompanyId
        : (accessCode.company_id || null);

      if (!companyId) {
        setOwnerWorkspaceAllowedTrucks([]);
        return;
      }

      try {
        const companies = await base44.entities.Company.filter({ id: companyId }, '-created_date', 1);
        if (cancelled) return;
        const company = companies?.[0];
        setOwnerWorkspaceAllowedTrucks(Array.isArray(company?.trucks) ? company.trucks : []);
      } catch {
        if (cancelled) return;
        setOwnerWorkspaceAllowedTrucks([]);
      }
    }

    resolveOwnerWorkspaceAllowedTrucks();

    return () => {
      cancelled = true;
    };
  }, [accessCode, workspace.activeCompanyId, workspace.activeViewMode]);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      if (isLoadingAuth) return;
      if (isAuthenticated && !currentAppIdentity?.user_id) return;

      setLoading(true);

      const storedId = localStorage.getItem(STORAGE_ACCESS_CODE_ID);
      let restoredAccessCode = null;
      let authoritativeLinkedIdentity = currentAppIdentity;

      try {
        if (isAuthenticated) {
          authoritativeLinkedIdentity = await resolveAuthoritativeLinkedIdentity(currentAppIdentity);
          const linkedAdminAccessCodeId = authoritativeLinkedIdentity?.linked_admin_access_code_id || null;

          if (linkedAdminAccessCodeId) {
            restoredAccessCode = await resolveStoredAccessCodeById(linkedAdminAccessCodeId);
            if (restoredAccessCode?.code_type !== 'Admin') {
              restoredAccessCode = null;
            }
          } else {
            if (storedId) {
              const storedAccessCode = await resolveStoredAccessCodeById(storedId);
              if (isAccessCodeCompatibleWithLinkedIdentity(storedAccessCode, authoritativeLinkedIdentity)) {
                restoredAccessCode = storedAccessCode;
              }
            }

            if (!restoredAccessCode) {
              restoredAccessCode = await resolveLinkedIdentityAccessCode(authoritativeLinkedIdentity);
            }
          }
        } else if (storedId) {
          const storedAccessCode = await resolveStoredAccessCodeById(storedId);
          if (storedAccessCode) {
            restoredAccessCode = storedAccessCode;
          } else {
            localStorage.removeItem(STORAGE_ACCESS_CODE_ID);
          }
        }

        if (cancelled) return;

        if (restoredAccessCode) {
          const nextWorkspace = pickInitialWorkspace(restoredAccessCode);
          localStorage.setItem(STORAGE_ACCESS_CODE_ID, restoredAccessCode.id);
          setAccessCode(restoredAccessCode);
          setWorkspace(nextWorkspace);
          persistWorkspace(nextWorkspace);

          const shouldPersistLinkedAdminAccessCode =
            isAuthenticated
            && restoredAccessCode.code_type === 'Admin'
            && authoritativeLinkedIdentity?.user_id
            && !authoritativeLinkedIdentity?.linked_admin_access_code_id
            && String(authoritativeLinkedIdentity?.linked_admin_access_code_id || '') !== String(restoredAccessCode.id || '');

          if (shouldPersistLinkedAdminAccessCode) {
            try {
              await base44.entities.User.update(authoritativeLinkedIdentity.user_id, {
                linked_admin_access_code_id: restoredAccessCode.id,
              });
            } catch {
              // Ignore persistence sync errors; session restore should still succeed.
            }
          }
        } else {
          if (isAuthenticated) {
            localStorage.removeItem(STORAGE_ACCESS_CODE_ID);
          }
          setAccessCode(null);
          setWorkspace({ activeViewMode: null, activeCompanyId: null });
          setOwnerWorkspaceAllowedTrucks(null);
        }
      } catch {
        if (cancelled) return;
        localStorage.removeItem(STORAGE_ACCESS_CODE_ID);
        setAccessCode(null);
        setWorkspace({ activeViewMode: null, activeCompanyId: null });
        setOwnerWorkspaceAllowedTrucks(null);
      }

      if (cancelled) return;
      setLoading(false);
    }

    loadSession();

    return () => {
      cancelled = true;
    };
  }, [currentAppIdentity, isAuthenticated, isLoadingAuth, persistWorkspace]);

  const login = (nextAccessCode) => {
    if (!nextAccessCode || !SUPPORTED_CODE_TYPES.has(nextAccessCode.code_type)) {
      localStorage.removeItem(STORAGE_ACCESS_CODE_ID);
      return;
    }
    localStorage.setItem(STORAGE_ACCESS_CODE_ID, nextAccessCode.id);
    const nextWorkspace = pickInitialWorkspace(nextAccessCode);
    setAccessCode(nextAccessCode);
    setWorkspace(nextWorkspace);
    persistWorkspace(nextWorkspace);
  };

  const setActiveWorkspace = useCallback((nextWorkspace) => {
    setWorkspace(nextWorkspace);
    persistWorkspace(nextWorkspace);
  }, [persistWorkspace]);

  const logout = () => {
    localStorage.removeItem(STORAGE_ACCESS_CODE_ID);
    localStorage.removeItem(STORAGE_WORKSPACE_MODE);
    localStorage.removeItem(STORAGE_WORKSPACE_COMPANY_ID);
    setAccessCode(null);
    setWorkspace({ activeViewMode: null, activeCompanyId: null });
    setOwnerWorkspaceAllowedTrucks(null);
  };

  const accessCodeSession = useMemo(
    () => buildEffectiveSession(
      accessCode,
      workspace.activeViewMode,
      workspace.activeCompanyId,
      ownerWorkspaceAllowedTrucks,
    ),
    [accessCode, ownerWorkspaceAllowedTrucks, workspace.activeCompanyId, workspace.activeViewMode],
  );

  const session = useMemo(() => {
    if (isAuthenticated) {
      const linkedSession = buildLinkedUserSession({
        linkedIdentity: currentAppIdentity,
        authenticatedUser: user,
        fallbackSession: accessCodeSession,
        workspace,
      });
      if (linkedSession) return linkedSession;
    }
    return accessCodeSession;
  }, [accessCodeSession, currentAppIdentity, isAuthenticated, user, workspace]);

  return {
    session,
    loading,
    login,
    logout,
    setActiveWorkspace,
    rawAccessCode: accessCode,
  };
}
