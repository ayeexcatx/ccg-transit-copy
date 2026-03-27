export function getCurrentAppIdentity(authenticatedUser) {
  if (!authenticatedUser?.id) {
    return null;
  }

  return {
    user_id: authenticatedUser.id,
    app_role: authenticatedUser.app_role || null,
    company_id: authenticatedUser.company_id || null,
    driver_id: authenticatedUser.driver_id || null,
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
