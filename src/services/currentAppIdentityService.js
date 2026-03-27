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
