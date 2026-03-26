import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '../utils';
import { useSession } from '../components/session/SessionContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getAvailableWorkspaces } from '@/components/session/workspaceUtils';
import { ArrowRight, AlertCircle } from 'lucide-react';

export default function AccessCodeLogin() {
  const { login } = useSession();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

    login(match);

    const workspaces = getAvailableWorkspaces(match);
    const hasAdminWorkspace = workspaces.some((workspace) => workspace.mode === 'Admin');

    if (hasAdminWorkspace || match.code_type === 'Admin') {
      window.location.href = createPageUrl('AdminDashboard');
    } else {
      window.location.href = createPageUrl('Home');
    }
  };

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
