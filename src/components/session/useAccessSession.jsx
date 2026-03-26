import { useCallback, useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { getAvailableWorkspaces, normalizeView } from './workspaceUtils';

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
    const allowedTrucks = Array.isArray(ownerWorkspaceAllowedTrucks)
      ? ownerWorkspaceAllowedTrucks
      : accessCode.allowed_trucks;

    return {
      ...accessCode,
      raw_code_type: accessCode.code_type,
      code_type: 'CompanyOwner',
      company_id: activeCompanyId,
      allowed_trucks: Array.isArray(allowedTrucks) ? allowedTrucks : [],
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

export function useAccessSession() {
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

      if (accessCode.code_type !== 'Admin') {
        setOwnerWorkspaceAllowedTrucks(Array.isArray(accessCode.allowed_trucks) ? accessCode.allowed_trucks : []);
        return;
      }

      if (!workspace.activeCompanyId) {
        setOwnerWorkspaceAllowedTrucks([]);
        return;
      }

      try {
        const companies = await base44.entities.Company.filter({ id: workspace.activeCompanyId }, '-created_date', 1);
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
    async function loadSession() {
      const storedId = localStorage.getItem(STORAGE_ACCESS_CODE_ID);
      if (!storedId) {
        setLoading(false);
        return;
      }
      try {
        const codes = await base44.entities.AccessCode.filter({ id: storedId });
        if (codes.length > 0 && codes[0].active_flag !== false && SUPPORTED_CODE_TYPES.has(codes[0].code_type)) {
          const nextCode = codes[0];
          const nextWorkspace = pickInitialWorkspace(nextCode);
          setAccessCode(nextCode);
          setWorkspace(nextWorkspace);
          persistWorkspace(nextWorkspace);
        } else {
          localStorage.removeItem(STORAGE_ACCESS_CODE_ID);
        }
      } catch (error) {
        localStorage.removeItem(STORAGE_ACCESS_CODE_ID);
      }
      setLoading(false);
    }
    loadSession();
  }, [persistWorkspace]);

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

  const session = useMemo(
    () => buildEffectiveSession(
      accessCode,
      workspace.activeViewMode,
      workspace.activeCompanyId,
      ownerWorkspaceAllowedTrucks,
    ),
    [accessCode, ownerWorkspaceAllowedTrucks, workspace.activeCompanyId, workspace.activeViewMode],
  );

  return {
    session,
    loading,
    login,
    logout,
    setActiveWorkspace,
    rawAccessCode: accessCode,
  };
}
