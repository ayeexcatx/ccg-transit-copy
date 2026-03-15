import React, { useEffect } from 'react';
import { SessionProvider, useSession } from './components/session/SessionContext';
import { createPageUrl } from './utils';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, Truck, Shield, Building2, Megaphone, TriangleAlert, CalendarDays, Home, CheckCircle2, FileText, UserRound, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationBell from '@/components/notifications/NotificationBell';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import TutorialProvider from '@/components/tutorial/TutorialProvider';

function LayoutInner({ children, currentPageName }) {
  const { session, loading, logout } = useSession();
  const location = useLocation();
  const isAdminSession = session?.code_type === 'Admin';
  const sessionCompanyId = session?.company_id ||
  (typeof session?.company === 'string' ? session.company : session?.company?.id) ||
  null;

  const { data: allDrivers = [] } = useQuery({
    queryKey: ['drivers-all-nav'],
    queryFn: () => base44.entities.Driver.list('-created_date', 500),
    enabled: isAdminSession,
  });

  const pendingDriverRequestsCount = allDrivers.filter((driver) => driver.access_code_status === 'Pending').length;

  const { data: headerCompany } = useQuery({
    queryKey: ['header-company', sessionCompanyId],
    queryFn: async () => {
      const companies = await base44.entities.Company.filter({ id: sessionCompanyId });
      return companies[0] || null;
    },
    enabled: !!sessionCompanyId && !isAdminSession,
  });

  useEffect(() => {
    if (loading) return;
    if (currentPageName === 'AccessCodeLogin') return;
    if (!session) {
      window.location.href = createPageUrl('AccessCodeLogin');
      return;
    }
    // Admin guard
    const adminPages = ['AdminDashboard', 'AdminCompanies', 'AdminConfirmations', 'AdminAccessCodes', 'AdminDispatches', 'AdminTemplateNotes', 'AdminAnnouncements', 'AdminAvailability'];
    if (adminPages.includes(currentPageName) && session.code_type !== 'Admin') {
      window.location.href = createPageUrl('Home');
      return;
    }

    const ownerPages = ['Availability', 'Drivers'];
    if (ownerPages.includes(currentPageName) && session.code_type !== 'CompanyOwner') {
      window.location.href = createPageUrl('Home');
    }
  }, [session, loading, currentPageName]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-slate-300 border-t-slate-700 rounded-full" />
      </div>);

  }

  if (currentPageName === 'AccessCodeLogin') {
    return <>{children}</>;
  }

  if (!session) return null;

  const isAdmin = session.code_type === 'Admin';
  const sessionCompanyName =
  session?.company_name ||
  (typeof session?.company === 'object' ? session.company?.name : null) ||
  (!session?.company_id && typeof session?.company === 'string' ? session.company : null);
  const headerTitle = isAdmin ? 'CCG Transit' : headerCompany?.name || sessionCompanyName || 'CCG Transit';
  const isOwner = session.code_type === 'CompanyOwner';
  const isTruck = session.code_type === 'Truck';
  const isDriver = session.code_type === 'Driver';
  const canUsePortalTabs = isOwner || isTruck || isDriver;
  const isActive = (pageName) => location.pathname === createPageUrl(pageName);
  const portalNavItems = [
  {
    page: 'Home',
    label: 'Home',
    icon: Home,
    tour: 'home-overview',
    visible: true,
  },
  {
    page: 'Portal',
    label: 'Dispatches',
    icon: Truck,
    tour: 'dispatches-nav',
    visible: true,
  },
  {
    page: 'Availability',
    label: 'Availability',
    icon: CalendarDays,
    tour: 'availability-nav',
    visible: isOwner,
  },
  {
    page: 'Drivers',
    label: 'Drivers',
    icon: UserRound,
    tour: 'drivers-nav',
    visible: isOwner,
  },
  {
    page: 'Notifications',
    label: 'Notifications',
    icon: Bell,
    visible: isOwner,
  },
  {
    page: 'Incidents',
    label: 'Incidents',
    icon: TriangleAlert,
    tour: 'incidents-nav',
    visible: true,
  }].filter((item) => item.visible);

  return (
    <TutorialProvider session={session}>
    <div className="bg-zinc-50 min-h-screen">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="bg-slate-50 mx-auto max-w-7xl px-4 sm:px-6">
          <div className="h-16 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src="/transitlogo.png"
                alt="CCG Transit logo"
                className="h-12 w-12 object-contain" />

              <div className="min-w-0">
                <h1 className="text-sm font-semibold text-slate-900 tracking-tight">{headerTitle}</h1>
                <p className="text-xs text-slate-500 flex items-center gap-1 truncate">
                  {session.code_type === 'Admin' && <Shield className="h-3 w-3 shrink-0" />}
                  {session.code_type === 'CompanyOwner' && <Building2 className="h-3 w-3 shrink-0" />}
                  {session.code_type === 'Truck' && <Truck className="h-3 w-3 shrink-0" />}
                  {session.code_type === 'Driver' && <UserRound className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{session.label || session.code_type}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {(isAdmin || session.code_type === 'CompanyOwner' || session.code_type === 'Driver') &&
              <NotificationBell session={session} />
              }
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  logout();
                  window.location.href = createPageUrl('AccessCodeLogin');
                }}
                className="text-slate-500 hover:text-slate-700">

                <LogOut className="h-4 w-4 mr-1" />
                <span className="bg-transparent text-xs">Log out</span>
              </Button>
            </div>
          </div>

          {(isAdmin || canUsePortalTabs) &&
          <div className="hidden md:flex border-t border-slate-200 py-2 justify-center">
              <div className="flex items-center gap-4 overflow-x-auto whitespace-nowrap">
              {isAdmin &&
              <nav className="flex items-center gap-1">
                <Link to={createPageUrl('AdminDashboard')}>
                  <Button variant="ghost" size="sm" className="text-xs flex items-center gap-1"><Home className="h-3 w-3" />Dashboard</Button>
                </Link>
                <Link to={createPageUrl('AdminDispatches')}>
                  <Button variant="ghost" size="sm" className="text-xs flex items-center gap-1"><Truck className="h-3 w-3" />Dispatches</Button>
                </Link>
                <Link to={createPageUrl('AdminAvailability')}>
                  <Button variant={isActive('AdminAvailability') ? 'secondary' : 'ghost'} size="sm" className="text-xs flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />Availability
                  </Button>
                </Link>
                <Link to={createPageUrl('AdminConfirmations')}>
                  <Button variant="ghost" size="sm" className="text-xs flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Confirmations</Button>
                </Link>
                <Link to={createPageUrl('Incidents')}>
                   <Button variant={isActive('Incidents') ? 'secondary' : 'ghost'} size="sm" className="text-xs flex items-center gap-1">
                     <TriangleAlert className="h-3 w-3" />Incidents
                   </Button>
                 </Link>
                <Link to={createPageUrl('AdminAnnouncements')}>
                  <Button variant="ghost" size="sm" className="text-xs flex items-center gap-1">
                    <Megaphone className="h-3 w-3" />Announcements
                  </Button>
                </Link>
                <Link to={createPageUrl('AdminCompanies')}>
                  <Button variant="ghost" size="sm" className="text-xs flex items-center gap-1"><Building2 className="h-3 w-3" />Companies</Button>
                </Link>
                <Link to={createPageUrl('AdminAccessCodes')}>
                  <Button variant="ghost" size="sm" className="text-xs flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    <span>Access Codes</span>
                    {pendingDriverRequestsCount > 0 && (
                      <span className="ml-1 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
                        {pendingDriverRequestsCount}
                      </span>
                    )}
                  </Button>
                </Link>
                <Link to={createPageUrl('AdminTemplateNotes')}>
                  <Button variant="ghost" size="sm" className="text-xs flex items-center gap-1"><FileText className="h-3 w-3" />Notes</Button>
                </Link>
              </nav>
              }
              {canUsePortalTabs &&
              <nav className="flex items-center gap-1">
                {portalNavItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link key={item.page} to={createPageUrl(item.page)}>
                      <Button
                        variant={isActive(item.page) ? 'secondary' : 'ghost'}
                        size="sm"
                        className="text-xs flex items-center gap-1"
                        data-tour={item.tour}>
                        <Icon className="h-3 w-3" />
                        {item.label}
                      </Button>
                    </Link>);

                })}
              </nav>
              }
              </div>
          </div>
          }
        </div>

        {/* Mobile nav for company owner */}
        {canUsePortalTabs &&
        <div className="md:hidden border-t border-slate-100 px-4 py-2 flex gap-1 overflow-x-auto">
            {portalNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.page} to={createPageUrl(item.page)}>
                <Button
                  variant={isActive(item.page) ? 'secondary' : 'ghost'}
                  size="sm"
                  className="text-xs whitespace-nowrap flex items-center gap-1"
                  data-tour={item.tour}>
                  <Icon className="h-3 w-3" />
                  {item.label}
                </Button>
              </Link>);

          })}
          </div>
        }

        {/* Mobile nav for admin */}
        {isAdmin &&
        <div className="md:hidden border-t border-slate-100 px-4 py-2 flex gap-1 overflow-x-auto">
            <Link to={createPageUrl('AdminDashboard')}>
              <Button variant="ghost" size="sm" className="text-xs whitespace-nowrap flex items-center gap-1"><Home className="h-3 w-3" />Dashboard</Button>
            </Link>
            <Link to={createPageUrl('AdminDispatches')}>
              <Button variant="ghost" size="sm" className="text-xs whitespace-nowrap flex items-center gap-1"><Truck className="h-3 w-3" />Dispatches</Button>
            </Link>
            <Link to={createPageUrl('AdminAvailability')}>
              <Button variant={isActive('AdminAvailability') ? 'secondary' : 'ghost'} size="sm" className="text-xs whitespace-nowrap flex items-center gap-1"><CalendarDays className="h-3 w-3" />Availability</Button>
            </Link>
            <Link to={createPageUrl('AdminConfirmations')}>
              <Button variant="ghost" size="sm" className="text-xs whitespace-nowrap flex items-center gap-1"><CheckCircle2 className="h-3 w-3" />Confirmations</Button>
            </Link>
            <Link to={createPageUrl('Incidents')}>
              <Button variant={isActive('Incidents') ? 'secondary' : 'ghost'} size="sm" className="text-xs whitespace-nowrap flex items-center gap-1"><TriangleAlert className="h-3 w-3" />Incidents</Button>
            </Link>
            <Link to={createPageUrl('AdminAnnouncements')}>
              <Button variant="ghost" size="sm" className="text-xs whitespace-nowrap flex items-center gap-1"><Megaphone className="h-3 w-3" />Announcements</Button>
            </Link>
            <Link to={createPageUrl('AdminCompanies')}>
              <Button variant="ghost" size="sm" className="text-xs whitespace-nowrap flex items-center gap-1"><Building2 className="h-3 w-3" />Companies</Button>
            </Link>
            <Link to={createPageUrl('AdminAccessCodes')}>
              <Button variant="ghost" size="sm" className="text-xs whitespace-nowrap flex items-center gap-1">
                <Shield className="h-3 w-3" />
                <span>Access Codes</span>
                {pendingDriverRequestsCount > 0 && (
                  <span className="ml-1 inline-flex min-w-4 h-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold leading-none text-white">
                    {pendingDriverRequestsCount}
                  </span>
                )}
              </Button>
            </Link>
            <Link to={createPageUrl('AdminTemplateNotes')}>
              <Button variant="ghost" size="sm" className="text-xs whitespace-nowrap flex items-center gap-1"><FileText className="h-3 w-3" />Notes</Button>
            </Link>
          </div>
        }
      </header>

    <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
    </TutorialProvider>);

}

export default function Layout({ children, currentPageName }) {
  return (
    <SessionProvider>
      <LayoutInner currentPageName={currentPageName}>{children}</LayoutInner>
    </SessionProvider>);

}
