import React, { useEffect } from 'react';
import { SessionProvider, useSession } from './components/session/SessionContext';
import { createPageUrl } from './utils';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, Truck, Shield, Building2, Megaphone, TriangleAlert, CalendarDays, Home, CheckCircle2, FileText, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationBell from '@/components/notifications/NotificationBell';

function LayoutInner({ children, currentPageName }) {
  const { session, loading, logout } = useSession();
  const location = useLocation();

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
  const isOwner = session.code_type === 'CompanyOwner';
  const isTruck = session.code_type === 'Truck';
  const isDriver = session.code_type === 'Driver';
  const canUsePortalTabs = isOwner || isTruck || isDriver;
  const isActive = (pageName) => location.pathname === createPageUrl(pageName);

  return (
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
                <h1 className="text-sm font-semibold text-slate-900 tracking-tight">CCG Transit</h1>
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
              {(isAdmin || session.code_type === 'CompanyOwner') &&
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
                  <Button variant="ghost" size="sm" className="text-xs flex items-center gap-1"><Shield className="h-3 w-3" />Access Codes</Button>
                </Link>
                <Link to={createPageUrl('AdminTemplateNotes')}>
                  <Button variant="ghost" size="sm" className="text-xs flex items-center gap-1"><FileText className="h-3 w-3" />Notes</Button>
                </Link>
              </nav>
              }
              {canUsePortalTabs &&
              <nav className="flex items-center gap-1">
                <Link to={createPageUrl('Home')}>
                  <Button variant={isActive('Home') ? 'secondary' : 'ghost'} size="sm" className="text-xs">Home</Button>
                </Link>
                <Link to={createPageUrl('Portal')}>
                  <Button variant={isActive('Portal') ? 'secondary' : 'ghost'} size="sm" className="text-xs">Dispatches</Button>
                </Link>
                {isOwner && <Link to={createPageUrl('Availability')}>
                  <Button variant={isActive('Availability') ? 'secondary' : 'ghost'} size="sm" className="text-xs flex items-center gap-1"><CalendarDays className="h-3 w-3" />Availability</Button>
                </Link>}
                {isOwner && <Link to={createPageUrl('Drivers')}>
                  <Button variant={isActive('Drivers') ? 'secondary' : 'ghost'} size="sm" className="text-xs flex items-center gap-1"><UserRound className="h-3 w-3" />Drivers</Button>
                </Link>}
                {isOwner && <Link to={createPageUrl('Notifications')}>
                  <Button variant={isActive('Notifications') ? 'secondary' : 'ghost'} size="sm" className="text-xs">Notifications</Button>
                </Link>}
                <Link to={createPageUrl('Incidents')}>
                  <Button variant={isActive('Incidents') ? 'secondary' : 'ghost'} size="sm" className="text-xs">Incidents</Button>
                </Link>
              </nav>
              }
              </div>
          </div>
          }
        </div>

        {/* Mobile nav for company owner */}
        {canUsePortalTabs &&
        <div className="md:hidden border-t border-slate-100 px-4 py-2 flex gap-1 overflow-x-auto">
            <Link to={createPageUrl('Home')}>
              <Button variant={isActive('Home') ? 'secondary' : 'ghost'} size="sm" className="text-xs whitespace-nowrap">Home</Button>
            </Link>
            <Link to={createPageUrl('Portal')}>
              <Button variant={isActive('Portal') ? 'secondary' : 'ghost'} size="sm" className="text-xs whitespace-nowrap">Dispatches</Button>
            </Link>
            {isOwner && <Link to={createPageUrl('Availability')}>
              <Button variant={isActive('Availability') ? 'secondary' : 'ghost'} size="sm" className="text-xs whitespace-nowrap">Availability</Button>
            </Link>}
            {isOwner && <Link to={createPageUrl('Drivers')}>
              <Button variant={isActive('Drivers') ? 'secondary' : 'ghost'} size="sm" className="text-xs whitespace-nowrap">Drivers</Button>
            </Link>}
            {isOwner && <Link to={createPageUrl('Notifications')}>
              <Button variant={isActive('Notifications') ? 'secondary' : 'ghost'} size="sm" className="text-xs whitespace-nowrap">Notifications</Button>
            </Link>}
            <Link to={createPageUrl('Incidents')}>
              <Button variant={isActive('Incidents') ? 'secondary' : 'ghost'} size="sm" className="text-xs whitespace-nowrap">Incidents</Button>
            </Link>
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
              <Button variant="ghost" size="sm" className="text-xs whitespace-nowrap flex items-center gap-1"><Shield className="h-3 w-3" />Access Codes</Button>
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
    </div>);

}

export default function Layout({ children, currentPageName }) {
  return (
    <SessionProvider>
      <LayoutInner currentPageName={currentPageName}>{children}</LayoutInner>
    </SessionProvider>);

}
