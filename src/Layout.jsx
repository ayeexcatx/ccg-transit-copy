import React, { useEffect, useMemo } from 'react';
import { SessionProvider, useSession } from './components/session/SessionContext';
import { createPageUrl } from './utils';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, Truck, Shield, Building2, Megaphone, TriangleAlert, CalendarDays, Home, CheckCircle2, FileText, UserRound, Bell, Menu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import NotificationBell from '@/components/notifications/NotificationBell';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import TutorialProvider from '@/components/tutorial/TutorialProvider';
import { getActiveCompanyId, getAvailableWorkspaces, getEffectiveView, getWorkspaceDisplayLabel } from '@/components/session/workspaceUtils';

function LayoutInner({ children, currentPageName }) {
  const { session, rawAccessCode, loading, logout, setActiveWorkspace } = useSession();
  const location = useLocation();

  const { data: companies = [] } = useQuery({
    queryKey: ['companies-workspace'],
    queryFn: () => base44.entities.Company.list(),
    enabled: !!session,
  });

  const effectiveView = getEffectiveView(session);
  const activeCompanyId = getActiveCompanyId(session);
  const workspaceOptions = useMemo(
    () => getAvailableWorkspaces(rawAccessCode || session, companies),
    [companies, rawAccessCode, session],
  );
  const selectedWorkspaceKey = useMemo(() => {
    const match = workspaceOptions.find(
      (workspace) => workspace.mode === effectiveView && workspace.companyId === activeCompanyId,
    );
    return match?.key || workspaceOptions[0]?.key || '';
  }, [workspaceOptions, effectiveView, activeCompanyId]);

  const isAdmin = effectiveView === 'Admin';
  const isOwner = effectiveView === 'CompanyOwner';
  const isDriver = session?.code_type === 'Driver';
  const canUsePortalTabs = isOwner || isDriver;

  const { data: allDrivers = [] } = useQuery({
    queryKey: ['drivers-all-nav'],
    queryFn: () => base44.entities.Driver.list('-created_date', 500),
    enabled: isAdmin,
  });

  const pendingDriverRequestsCount = allDrivers.filter((driver) => driver.access_code_status === 'Pending').length;
  const pendingCompanyProfileRequestsCount = companies.filter((company) => company?.pending_profile_change?.status === 'Pending').length;

  const activeCompany = companies.find((company) => company.id === activeCompanyId) || null;
  const sessionCompanyName =
    session?.company_name ||
    (typeof session?.company === 'object' ? session.company?.name : null) ||
    (!session?.company_id && typeof session?.company === 'string' ? session.company : null);
  const headerTitle = isAdmin ? 'CCG Transit' : activeCompany?.name || sessionCompanyName || 'CCG Transit';
  const workspaceDisplayLabel = getWorkspaceDisplayLabel(session, activeCompany?.name || sessionCompanyName);

  useEffect(() => {
    if (loading) return;
    if (currentPageName === 'AccessCodeLogin') return;
    if (!session) {
      window.location.href = createPageUrl('AccessCodeLogin');
      return;
    }

    const adminPages = ['AdminDashboard', 'AdminCompanies', 'AdminConfirmations', 'AdminAccessCodes', 'AdminDispatches', 'AdminTemplateNotes', 'AdminAnnouncements', 'AdminAvailability'];
    const ownerPages = ['Availability', 'Drivers'];

    if (adminPages.includes(currentPageName) && !isAdmin) {
      window.location.href = createPageUrl('Home');
      return;
    }

    if (ownerPages.includes(currentPageName) && !isOwner) {
      window.location.href = isAdmin ? createPageUrl('AdminDashboard') : createPageUrl('Home');
      return;
    }

    if (currentPageName === 'Profile' && !(isAdmin || isOwner || isDriver)) {
      window.location.href = isAdmin ? createPageUrl('AdminDashboard') : createPageUrl('Home');
      return;
    }

    if (currentPageName === 'Notifications' && !(isAdmin || isOwner || isDriver)) {
      window.location.href = isAdmin ? createPageUrl('AdminDashboard') : createPageUrl('Home');
      return;
    }

    if ((currentPageName === 'Home' || currentPageName === 'Portal') && isAdmin) {
      window.location.href = createPageUrl('AdminDashboard');
    }
  }, [session, loading, currentPageName, isAdmin, isOwner]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-slate-300 border-t-slate-700 rounded-full" />
      </div>
    );
  }

  if (currentPageName === 'AccessCodeLogin') return <>{children}</>;
  if (!session) return null;

  const isActive = (pageName) => location.pathname === createPageUrl(pageName);
  const navBaseClassName = 'text-xs flex items-center gap-1 rounded-lg px-3 py-1 transition-all duration-200';
  const mobileNavBaseClassName = 'text-xs whitespace-nowrap flex items-center gap-1 rounded-lg px-3 py-1 transition-all duration-200';
  const getNavItemClassName = (active) =>
    active
      ? `${navBaseClassName} bg-slate-900 text-white font-medium hover:bg-slate-900 hover:text-white [&_svg]:text-white hover:[&_svg]:text-white`
      : `${navBaseClassName} text-slate-600 hover:bg-slate-100 hover:text-slate-800 [&_svg]:text-slate-500 hover:[&_svg]:text-slate-700`;

  const getMobileNavItemClassName = (active) =>
    active
      ? `${mobileNavBaseClassName} bg-slate-900 text-white font-medium hover:bg-slate-900 hover:text-white [&_svg]:text-white hover:[&_svg]:text-white`
      : `${mobileNavBaseClassName} text-slate-600 hover:bg-slate-100 hover:text-slate-800 [&_svg]:text-slate-500 hover:[&_svg]:text-slate-700`;

  const portalNavItems = [
    { page: 'Home', label: 'Home', icon: Home, tour: 'home-overview', visible: true },
    { page: 'Portal', label: 'Dispatches', icon: Truck, tour: 'dispatches-nav', visible: true },
    { page: 'Availability', label: 'Availability', icon: CalendarDays, tour: 'availability-nav', visible: isOwner },
    { page: 'Drivers', label: 'Drivers', icon: UserRound, tour: 'drivers-nav', visible: isOwner },
    { page: 'Notifications', label: 'Notifications', icon: Bell, visible: isOwner },
    { page: 'Incidents', label: 'Incidents', icon: TriangleAlert, tour: 'incidents-nav', visible: true },
  ].filter((item) => item.visible);

  return (
    <TutorialProvider session={session}>
      <div className="bg-zinc-50 min-h-screen">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
          <div className="bg-slate-50 mx-auto max-w-7xl px-4 sm:px-6">
            <div className="h-16 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img src="/transitlogo.png" alt="CCG Transit logo" className="h-12 w-12 object-contain" />
                <div className="min-w-0">
                  <h1 className="text-sm font-semibold text-slate-900 tracking-tight">{headerTitle}</h1>
                  <p className="text-xs text-slate-500 flex items-center gap-1 truncate">
                    {isAdmin && <Shield className="h-3 w-3 shrink-0" />}
                    {isOwner && <Building2 className="h-3 w-3 shrink-0" />}
                    {isDriver && <UserRound className="h-3 w-3 shrink-0" />}
                    <span className="truncate">{workspaceDisplayLabel || effectiveView}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {workspaceOptions.length > 1 && (
                  <div className="hidden sm:flex items-center gap-2">
                    <span className="text-xs text-slate-500">Workspace</span>
                    <Select
                      value={selectedWorkspaceKey}
                      onValueChange={(nextKey) => {
                        const nextWorkspace = workspaceOptions.find((workspace) => workspace.key === nextKey);
                        if (!nextWorkspace) return;
                        setActiveWorkspace({ activeViewMode: nextWorkspace.mode, activeCompanyId: nextWorkspace.companyId });
                        window.location.href = createPageUrl(nextWorkspace.mode === 'Admin' ? 'AdminDashboard' : 'Home');
                      }}
                    >
                      <SelectTrigger className="h-8 min-w-36 text-xs bg-white">
                        <SelectValue placeholder="Workspace" />
                      </SelectTrigger>
                      <SelectContent>
                        {workspaceOptions.map((workspace) => (
                          <SelectItem key={workspace.key} value={workspace.key}>
                            {workspace.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(isAdmin || isOwner || isDriver) && <NotificationBell session={session} />}

                {(isAdmin || isOwner || isDriver) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-slate-500 hover:text-slate-700" aria-label="Open menu">
                        <Menu className="h-5 w-5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link to={createPageUrl('Profile')} className="cursor-pointer">
                          <UserRound className="h-4 w-4" />
                          Profile
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    logout();
                    window.location.href = createPageUrl('AccessCodeLogin');
                  }}
                  className="text-slate-500 hover:text-slate-700"
                >
                  <LogOut className="h-4 w-4 mr-1" />
                  <span className="bg-transparent text-xs">Log out</span>
                </Button>
              </div>
            </div>

            {(isAdmin || canUsePortalTabs) && (
              <div className="hidden md:flex border-t border-slate-200 py-2 justify-center">
                <div className="flex items-center gap-4 overflow-x-auto whitespace-nowrap">
                  {isAdmin && (
                    <nav className="flex items-center gap-1">
                      <Link to={createPageUrl('AdminDashboard')}><Button variant="ghost" size="sm" className={getNavItemClassName(isActive('AdminDashboard'))}><Home className="h-3 w-3" />Dashboard</Button></Link>
                      <Link to={createPageUrl('AdminDispatches')}><Button variant="ghost" size="sm" className={getNavItemClassName(isActive('AdminDispatches'))}><Truck className="h-3 w-3" />Dispatches</Button></Link>
                      <Link to={createPageUrl('AdminAvailability')}><Button variant="ghost" size="sm" className={getNavItemClassName(isActive('AdminAvailability'))}><CalendarDays className="h-3 w-3" />Availability</Button></Link>
                      <Link to={createPageUrl('AdminConfirmations')}><Button variant="ghost" size="sm" className={getNavItemClassName(isActive('AdminConfirmations'))}><CheckCircle2 className="h-3 w-3" />Confirmations</Button></Link>
                      <Link to={createPageUrl('Incidents')}><Button variant="ghost" size="sm" className={getNavItemClassName(isActive('Incidents'))}><TriangleAlert className="h-3 w-3" />Incidents</Button></Link>
                      <Link to={createPageUrl('AdminAnnouncements')}><Button variant="ghost" size="sm" className={getNavItemClassName(isActive('AdminAnnouncements'))}><Megaphone className="h-3 w-3" />Announcements</Button></Link>
                      <Link to={createPageUrl('AdminCompanies')}><Button variant="ghost" size="sm" className={getNavItemClassName(isActive('AdminCompanies'))}><Building2 className="h-3 w-3" /><span>Companies</span>{pendingCompanyProfileRequestsCount > 0 && (<span className="ml-1 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">{pendingCompanyProfileRequestsCount}</span>)}</Button></Link>
                      <Link to={createPageUrl('AdminAccessCodes')}><Button variant="ghost" size="sm" className={getNavItemClassName(isActive('AdminAccessCodes'))}><Shield className="h-3 w-3" /><span>Access Codes</span>{pendingDriverRequestsCount > 0 && (<span className="ml-1 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">{pendingDriverRequestsCount}</span>)}</Button></Link>
                      <Link to={createPageUrl('AdminTemplateNotes')}><Button variant="ghost" size="sm" className={getNavItemClassName(isActive('AdminTemplateNotes'))}><FileText className="h-3 w-3" />Notes</Button></Link>
                    </nav>
                  )}
                  {canUsePortalTabs && (
                    <nav className="flex items-center gap-1">
                      {portalNavItems.map((item) => {
                        const Icon = item.icon;
                        return (
                          <Link key={item.page} to={createPageUrl(item.page)}>
                            <Button variant="ghost" size="sm" className={getNavItemClassName(isActive(item.page))} data-tour={item.tour}>
                              <Icon className="h-3 w-3" />
                              {item.label}
                            </Button>
                          </Link>
                        );
                      })}
                    </nav>
                  )}
                </div>
              </div>
            )}
          </div>

          {canUsePortalTabs && (
            <div className="md:hidden border-t border-slate-100 px-4 py-2 flex gap-1 overflow-x-auto">
              {portalNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.page} to={createPageUrl(item.page)}>
                    <Button variant="ghost" size="sm" className={getMobileNavItemClassName(isActive(item.page))} data-tour={item.tour}>
                      <Icon className="h-3 w-3" />
                      {item.label}
                    </Button>
                  </Link>
                );
              })}
            </div>
          )}

          {isAdmin && (
            <div className="md:hidden border-t border-slate-100 px-4 py-2 flex gap-1 overflow-x-auto">
              <Link to={createPageUrl('AdminDashboard')}><Button variant="ghost" size="sm" className={getMobileNavItemClassName(isActive('AdminDashboard'))}><Home className="h-3 w-3" />Dashboard</Button></Link>
              <Link to={createPageUrl('AdminDispatches')}><Button variant="ghost" size="sm" className={getMobileNavItemClassName(isActive('AdminDispatches'))}><Truck className="h-3 w-3" />Dispatches</Button></Link>
              <Link to={createPageUrl('AdminAvailability')}><Button variant="ghost" size="sm" className={getMobileNavItemClassName(isActive('AdminAvailability'))}><CalendarDays className="h-3 w-3" />Availability</Button></Link>
              <Link to={createPageUrl('AdminConfirmations')}><Button variant="ghost" size="sm" className={getMobileNavItemClassName(isActive('AdminConfirmations'))}><CheckCircle2 className="h-3 w-3" />Confirmations</Button></Link>
              <Link to={createPageUrl('Incidents')}><Button variant="ghost" size="sm" className={getMobileNavItemClassName(isActive('Incidents'))}><TriangleAlert className="h-3 w-3" />Incidents</Button></Link>
              <Link to={createPageUrl('AdminAnnouncements')}><Button variant="ghost" size="sm" className={getMobileNavItemClassName(isActive('AdminAnnouncements'))}><Megaphone className="h-3 w-3" />Announcements</Button></Link>
              <Link to={createPageUrl('AdminCompanies')}><Button variant="ghost" size="sm" className={getMobileNavItemClassName(isActive('AdminCompanies'))}><Building2 className="h-3 w-3" /><span>Companies</span>{pendingCompanyProfileRequestsCount > 0 && (<span className="ml-1 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">{pendingCompanyProfileRequestsCount}</span>)}</Button></Link>
              <Link to={createPageUrl('AdminAccessCodes')}><Button variant="ghost" size="sm" className={getMobileNavItemClassName(isActive('AdminAccessCodes'))}><Shield className="h-3 w-3" /><span>Access Codes</span>{pendingDriverRequestsCount > 0 && (<span className="ml-1 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">{pendingDriverRequestsCount}</span>)}</Button></Link>
              <Link to={createPageUrl('AdminTemplateNotes')}><Button variant="ghost" size="sm" className={getMobileNavItemClassName(isActive('AdminTemplateNotes'))}><FileText className="h-3 w-3" />Notes</Button></Link>
            </div>
          )}
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6" data-tutorial-scroll="main">{children}</main>
      </div>
    </TutorialProvider>
  );
}

export default function Layout({ children, currentPageName }) {
  return (
    <SessionProvider>
      <LayoutInner currentPageName={currentPageName}>{children}</LayoutInner>
    </SessionProvider>
  );
}
