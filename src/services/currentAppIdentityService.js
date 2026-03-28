const ACCESS_CODE_TYPE_TO_APP_ROLE = {
  Admin: 'admin',
  CompanyOwner: 'company_owner',
  Driver: 'driver',
};

const APP_ROLE_TO_ACCESS_CODE_TYPE = {
  admin: 'Admin',
  company_owner: 'CompanyOwner',
  driver: 'Driver',
};

export function normalizeAccessCodeTypeToAppRole(codeType) {
  if (!codeType) return null;
  return ACCESS_CODE_TYPE_TO_APP_ROLE[codeType] || null;
}

export function normalizeAppRoleToAccessCodeType(appRole) {
  if (!appRole) return null;
  return APP_ROLE_TO_ACCESS_CODE_TYPE[String(appRole).toLowerCase()] || null;
}

export function getCurrentAppIdentity(authenticatedUser) {
  if (!authenticatedUser?.id) {
    return null;
  }

  return {
    user_id: authenticatedUser.id,
    app_role: authenticatedUser.app_role || null,
    company_id: authenticatedUser.company_id || null,
    driver_id: authenticatedUser.driver_id || null,
    linked_admin_access_code_id: authenticatedUser.linked_admin_access_code_id || null,
    onboarding_complete: Boolean(authenticatedUser.onboarding_complete),
  };
}

export function resolveDriverIdentity({ currentAppIdentity, authenticatedUser, session } = {}) {
  return currentAppIdentity?.driver_id
    || authenticatedUser?.driver_id
    || session?.driver_id
    || null;
}

export function resolveCompanyOwnerCompanyId({ currentAppIdentity, authenticatedUser, session } = {}) {
  return currentAppIdentity?.company_id
    || authenticatedUser?.company_id
    || session?.company_id
    || null;
}
