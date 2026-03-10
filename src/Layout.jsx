import React, { useEffect } from 'react';
import { SessionProvider, useSession } from './components/session/SessionContext';
import { createPageUrl } from './utils';
import { Link, useLocation } from 'react-router-dom';
import { LogOut, Truck, Shield, Building2, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NotificationBell from '@/components/notifications/NotificationBell';

function LayoutInner({ children, currentPageName }) {
  const { session, loading, logout } = useSession();

  useEffect(() => {
    if (loading) return;
    if (currentPageName === 'AccessCodeLogin') return;
    if (!session) {
      window.location.href = createPageUrl('AccessCodeLogin');
      return;
    }
    // Admin guard
    const adminPages = ['AdminDashboard', 'AdminCompanies', 'AdminConfirmations', 'AdminAccessCodes', 'AdminDispatches', 'AdminTemplateNotes', 'AdminAnnouncements'];
    if (adminPages.includes(currentPageName) && session.code_type !== 'Admin') {
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
  const location = useLocation();
  const isActive = (pageName) => location.pathname === createPageUrl(pageName);

  return (
    <div className="bg-zinc-50 min-h-screen">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="bg-yellow-300 mx-auto px-4 max-w-7xl sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src="/transitlogo.png"
              alt="CCG Transit logo"
              className="h-7 w-7 object-contain"
            />
            <div>
              <h1 className="text-sm font-semibold text-slate-900 tracking-tight">CCG Transit</h1>
              <p className="text-xs text-slate-500 flex items-center gap-1">
                {session.code_type === 'Admin' && <Shield className="h-3 w-3" />}
                {session.code_type === 'CompanyOwner' && <Building2 className="h-3 w-3" />}
                {session.code_type === 'Truck' && <Truck className="h-3 w-3" />}
                {session.label || session.code_type}
              </p>
            </div>
          </div>

          <div className="bg-yellow-300 flex items-center gap-2">
            {isAdmin &&
            <nav className="hidden md:flex items-center gap-1 mr-4">
                <Link to={createPageUrl('AdminDashboard')}>
                  <Button variant="ghost" size="sm" className="text-xs">Dashboard</Button>
                </Link>
                <Link to={createPageUrl('AdminDispatches')}>
                  <Button variant="ghost" size="sm" className="text-xs">Dispatches</Button>
                </Link>
                <Link to={createPageUrl('AdminConfirmations')}>
                  <Button variant="ghost" size="sm" className="text-xs">Confirmations</Button>
                </Link>
                <Link to={createPageUrl('AdminCompanies')}>
                  <Button variant="ghost" size="sm" className="text-xs">Companies</Button>
                </Link>
                <Link to={createPageUrl('AdminAccessCodes')}>
                  <Button variant="ghost" size="sm" className="text-xs">Access Codes</Button>
                </Link>
                <Link to={createPageUrl('AdminTemplateNotes')}>
                  <Button variant="ghost" size="sm" className="text-xs">Notes</Button>
                </Link>
                <Link to={createPageUrl('AdminAnnouncements')}>
                  <Button variant="ghost" size="sm" className="text-xs flex items-center gap-1">
                    <Megaphone className="h-3 w-3" />Announcements
                  </Button>
                </Link>
              </nav>
            }
            {isOwner &&
            <nav className="hidden md:flex items-center gap-1 mr-4">
                <Link to={createPageUrl('Home')}>
                  <Button variant={isActive('Home') ? 'secondary' : 'ghost'} size="sm" className="text-xs">Home</Button>
                </Link>
                <Link to={createPageUrl('Portal')}>
                  <Button variant={isActive('Portal') ? 'secondary' : 'ghost'} size="sm" className="text-xs">Dispatches</Button>
                </Link>
                <Link to={createPageUrl('Notifications')}>
                  <Button variant={isActive('Notifications') ? 'secondary' : 'ghost'} size="sm" className="text-xs">Notifications</Button>
                </Link>
              </nav>
            }
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

        {/* Mobile nav for company owner */}
        {isOwner &&
        <div className="md:hidden border-t border-slate-100 px-4 py-2 flex gap-1 overflow-x-auto">
            <Link to={createPageUrl('Home')}>
              <Button variant={isActive('Home') ? 'secondary' : 'ghost'} size="sm" className="text-xs whitespace-nowrap">Home</Button>
            </Link>
            <Link to={createPageUrl('Portal')}>
              <Button variant={isActive('Portal') ? 'secondary' : 'ghost'} size="sm" className="text-xs whitespace-nowrap">Dispatches</Button>
            </Link>
            <Link to={createPageUrl('Notifications')}>
              <Button variant={isActive('Notifications') ? 'secondary' : 'ghost'} size="sm" className="text-xs whitespace-nowrap">Notifications</Button>
            </Link>
          </div>
        }

        {/* Mobile nav for admin */}
        {isAdmin &&
        <div className="md:hidden border-t border-slate-100 px-4 py-2 flex gap-1 overflow-x-auto">
            <Link to={createPageUrl('AdminDashboard')}>
              <Button variant="ghost" size="sm" className="text-xs whitespace-nowrap">Dashboard</Button>
            </Link>
            <Link to={createPageUrl('AdminDispatches')}>
              <Button variant="ghost" size="sm" className="text-xs whitespace-nowrap">Dispatches</Button>
            </Link>
            <Link to={createPageUrl('AdminConfirmations')}>
              <Button variant="ghost" size="sm" className="text-xs whitespace-nowrap">Confirmations</Button>
            </Link>
            <Link to={createPageUrl('AdminCompanies')}>
              <Button variant="ghost" size="sm" className="text-xs whitespace-nowrap">Companies</Button>
            </Link>
            <Link to={createPageUrl('AdminAccessCodes')}>
              <Button variant="ghost" size="sm" className="text-xs whitespace-nowrap">Access Codes</Button>
            </Link>
            <Link to={createPageUrl('AdminTemplateNotes')}>
              <Button variant="ghost" size="sm" className="text-xs whitespace-nowrap">Notes</Button>
            </Link>
            <Link to={createPageUrl('AdminAnnouncements')}>
              <Button variant="ghost" size="sm" className="text-xs whitespace-nowrap">Announcements</Button>
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
