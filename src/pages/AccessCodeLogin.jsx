import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { useSession } from '../components/session/SessionContext';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { getAvailableWorkspaces } from '@/components/session/workspaceUtils';
import { normalizeAccessCodeTypeToAppRole } from '@/services/currentAppIdentityService';
import { ArrowRight, AlertCircle, Lock, Mail } from 'lucide-react';

export default function AccessCodeLogin() {
  const { login } = useSession();
  const { user, isAuthenticated, isLoadingAuth, checkAppState } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeAuthTab, setActiveAuthTab] = useState('signin');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError('');

    const results = await base44.entities.AccessCode.filter({ code: code.trim() });
    const match = results.find(c => c.active_flag !== false);

    if (!match) {
      setError('Invalid or inactive access code');
      setLoading(false);
      return;
    }
    if (match.code_type === 'Truck') {
      setError('This access code type is no longer supported');
      setLoading(false);
      return;
    }

    const appRole = normalizeAccessCodeTypeToAppRole(match.code_type);
    if (!user?.id || !appRole) {
      setError('Unable to link this login. Please sign in again.');
      setLoading(false);
      return;
    }

    const userUpdatePayload = {
      app_role: appRole,
      onboarding_complete: true,
      linked_admin_access_code_id: match.code_type === 'Admin' ? match.id : null,
    };

    if (match.code_type === 'Admin') {
      userUpdatePayload.company_id = null;
      userUpdatePayload.driver_id = null;
    }

    if (match.code_type === 'CompanyOwner') {
      userUpdatePayload.company_id = match.company_id || null;
      userUpdatePayload.driver_id = null;
    }

    if (match.code_type === 'Driver') {
      let derivedCompanyId = match.company_id || null;

      if (!derivedCompanyId && match.driver_id) {
        const drivers = await base44.entities.Driver.filter({ id: match.driver_id }, '-created_date', 1);
        derivedCompanyId = drivers?.[0]?.company_id || null;
      }

      userUpdatePayload.driver_id = match.driver_id || null;
      userUpdatePayload.company_id = derivedCompanyId;
    }

    await base44.entities.User.update(user.id, userUpdatePayload);

    const linkedAccessCode = match;

    await checkAppState();
    login(linkedAccessCode);

    const workspaces = getAvailableWorkspaces(linkedAccessCode);
    const hasAdminWorkspace = workspaces.some((workspace) => workspace.mode === 'Admin');

    if (hasAdminWorkspace || linkedAccessCode.code_type === 'Admin') {
      window.location.href = createPageUrl('AdminDashboard');
    } else {
      window.location.href = createPageUrl('Home');
    }
  };

  const authPrimaryActionLabel = useMemo(() => (activeAuthTab === 'signup' ? 'Create account' : 'Sign in'), [activeAuthTab]);

  const handleGoogleAuth = () => {
    setAuthError('');
    setAuthMessage('');
    base44.auth.loginWithProvider('google', window.location.href);
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');

    const normalizedEmail = email.trim();
    if (!normalizedEmail || !password) {
      setAuthError('Please enter your email and password.');
      return;
    }

    if (activeAuthTab === 'signup' && password !== confirmPassword) {
      setAuthError('Passwords do not match.');
      return;
    }

    setAuthLoading(true);
    try {
      if (activeAuthTab === 'signup') {
        await base44.auth.register({
          email: normalizedEmail,
          password,
        });
        await base44.auth.loginViaEmailPassword(normalizedEmail, password);
        setAuthMessage('Account created successfully.');
      } else {
        await base44.auth.loginViaEmailPassword(normalizedEmail, password);
      }
      await checkAppState();
    } catch (err) {
      setAuthError(err?.response?.data?.message || err?.message || 'Authentication failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthMessage('');

    const normalizedResetEmail = resetEmail.trim();
    if (!normalizedResetEmail) {
      setAuthError('Enter your email address to receive a reset link.');
      return;
    }

    setAuthLoading(true);
    try {
      await base44.auth.resetPasswordRequest(normalizedResetEmail);
      setAuthMessage('Password reset instructions were sent if the account exists.');
    } catch (err) {
      setAuthError(err?.response?.data?.message || err?.message || 'Unable to send password reset request.');
    } finally {
      setAuthLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 p-4 md:p-8">
        <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl items-stretch overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 shadow-2xl md:min-h-[calc(100vh-4rem)]">
          <div className="hidden w-1/2 flex-col justify-between bg-gradient-to-b from-slate-900 via-slate-900 to-slate-800 p-10 lg:flex">
            <div>
              <img src="/transitlogo.png" alt="CCG Transit logo" className="h-20 w-20 object-contain" />
              <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">CCG Transit Dispatch</h1>
              <p className="mt-3 max-w-sm text-sm text-slate-300">
                Secure access for dispatchers, owners, and drivers. Sign in to continue to your access-code step.
              </p>
            </div>
            <div className="space-y-3 text-sm text-slate-300">
              <p>• Professional dispatch workflow</p>
              <p>• Real-time updates and notifications</p>
              <p>• Multi-workspace support</p>
            </div>
          </div>

          <div className="flex w-full items-center justify-center p-6 sm:p-10 lg:w-1/2">
            <div className="w-full max-w-md space-y-6">
              <div className="space-y-2 text-center lg:text-left">
                <img src="/transitlogo.png" alt="CCG Transit logo" className="mx-auto h-16 w-16 object-contain lg:mx-0 lg:hidden" />
                <h2 className="text-2xl font-semibold text-white">Welcome</h2>
                <p className="text-sm text-slate-400">Sign in to your Base44 account before entering your CCG Transit access code.</p>
              </div>

              <Button
                type="button"
                onClick={handleGoogleAuth}
                disabled={authLoading || isLoadingAuth}
                className="h-11 w-full bg-white text-slate-900 hover:bg-slate-100"
              >
                Continue with Google
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-xs uppercase tracking-wide">
                  <span className="bg-slate-900 px-2 text-slate-400">or continue with email</span>
                </div>
              </div>

              <Tabs value={activeAuthTab} onValueChange={setActiveAuthTab} className="w-full">
                <TabsList className="grid h-10 w-full grid-cols-2 bg-slate-800/70">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Sign up</TabsTrigger>
                </TabsList>

                <TabsContent value="signin" className="mt-4">
                  <form onSubmit={handleEmailAuth} className="space-y-3">
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        type="email"
                        autoComplete="email"
                        className="h-11 border-white/10 bg-white/5 pl-9 text-white placeholder:text-slate-500"
                      />
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        type="password"
                        autoComplete="current-password"
                        className="h-11 border-white/10 bg-white/5 pl-9 text-white placeholder:text-slate-500"
                      />
                    </div>
                    <Button type="submit" disabled={authLoading || isLoadingAuth} className="h-11 w-full bg-blue-600 text-white hover:bg-blue-500">
                      {authLoading ? 'Please wait...' : authPrimaryActionLabel}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="signup" className="mt-4">
                  <form onSubmit={handleEmailAuth} className="space-y-3">
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        type="email"
                        autoComplete="email"
                        className="h-11 border-white/10 bg-white/5 pl-9 text-white placeholder:text-slate-500"
                      />
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password"
                        type="password"
                        autoComplete="new-password"
                        className="h-11 border-white/10 bg-white/5 pl-9 text-white placeholder:text-slate-500"
                      />
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Confirm password"
                        type="password"
                        autoComplete="new-password"
                        className="h-11 border-white/10 bg-white/5 pl-9 text-white placeholder:text-slate-500"
                      />
                    </div>
                    <Button type="submit" disabled={authLoading || isLoadingAuth} className="h-11 w-full bg-blue-600 text-white hover:bg-blue-500">
                      {authLoading ? 'Please wait...' : authPrimaryActionLabel}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>

              <form onSubmit={handlePasswordReset} className="space-y-3 rounded-xl border border-white/10 bg-slate-800/40 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Forgot password?</p>
                <Input
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  placeholder="Email for password reset"
                  type="email"
                  autoComplete="email"
                  className="h-10 border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                />
                <Button type="submit" variant="outline" disabled={authLoading || isLoadingAuth} className="h-10 w-full border-white/20 text-slate-100 hover:bg-white/10">
                  Send reset instructions
                </Button>
              </form>

              {authError && (
                <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                  <AlertCircle className="h-4 w-4" />
                  <span>{authError}</span>
                </div>
              )}
              {authMessage && <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{authMessage}</div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-6">
            <img
              src="/transitlogo.png"
              alt="CCG Transit logo"
              className="w-full max-w-[160px] h-auto"
            />
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">CCG Transit</h1>
          <p className="text-slate-400 text-sm mt-2">Enter your access code to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Input
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(''); }}
              placeholder="Access Code"
              className="h-12 bg-white/5 border-white/10 text-white placeholder:text-slate-500 text-center text-lg tracking-widest font-mono focus:border-white/30 focus:ring-white/10"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm justify-center">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full h-12 bg-white text-slate-900 hover:bg-slate-100 font-semibold text-sm"
          >
            {loading ? (
              <div className="animate-spin h-5 w-5 border-2 border-slate-400 border-t-slate-900 rounded-full" />
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
