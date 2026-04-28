import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Beaker, LogIn, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const { loginPassword, loginGoogle, isAuthenticated } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => { if (isAuthenticated === true) nav(loc.state?.from || '/', { replace: true }); }, [isAuthenticated, nav, loc.state]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try { await loginPassword(email, password); toast.success('Welcome back'); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Login failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--vx-bg)' }} data-testid="login-page">
      <div className="vx-card p-8 w-full max-w-md relative overflow-hidden">
        <div className="absolute inset-0 vx-grid-bg pointer-events-none" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded flex items-center justify-center" style={{ background: 'rgba(59,139,212,0.12)', border: '1px solid rgba(59,139,212,0.4)' }}>
              <Beaker size={16} style={{ color: 'var(--vx-primary)' }} />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>VAXCHAIN</div>
              <div className="text-[10px] vx-mono" style={{ color: 'var(--vx-text-dim)' }}>COLD CHAIN MONITOR</div>
            </div>
          </div>
          <h1 className="text-3xl font-medium tracking-tighter mt-4" style={{ fontFamily: 'Barlow' }}>Sign in</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--vx-text-dim)' }}>Use Google or your email to access the dashboard.</p>

          <Button data-testid="login-google-btn" onClick={loginGoogle} className="mt-6 w-full bg-white text-black hover:bg-gray-200 rounded-sm h-10">
            <svg width="16" height="16" viewBox="0 0 18 18" className="mr-2"><path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.49h4.84a4.13 4.13 0 0 1-1.79 2.71v2.26h2.9c1.7-1.56 2.69-3.86 2.69-6.62z"/><path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.94v2.34A9 9 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.66 9c0-.59.1-1.16.29-1.7V4.96H.94A9 9 0 0 0 0 9c0 1.45.35 2.83.94 4.04l3.01-2.34z"/><path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A8.95 8.95 0 0 0 9 0 9 9 0 0 0 .94 4.96L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z"/></svg>
            Continue with Google
          </Button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: 'var(--vx-border)' }} />
            <span className="text-[11px] vx-mono" style={{ color: 'var(--vx-text-dim)' }}>OR EMAIL</span>
            <div className="flex-1 h-px" style={{ background: 'var(--vx-border)' }} />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label className="vx-label">Email</Label>
              <Input data-testid="login-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-[#0D0F14] border-[#232B36] rounded-sm mt-1" />
            </div>
            <div>
              <Label className="vx-label">Password</Label>
              <Input data-testid="login-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="bg-[#0D0F14] border-[#232B36] rounded-sm mt-1" />
            </div>
            <Button data-testid="login-submit-btn" type="submit" disabled={busy} className="w-full bg-[#3B8BD4] hover:bg-[#2A75B8] text-white rounded-sm h-10">
              {busy ? <Loader2 size={14} className="animate-spin mr-2" /> : <LogIn size={14} className="mr-2" />}
              Sign in
            </Button>
          </form>

          <div className="text-xs mt-5" style={{ color: 'var(--vx-text-dim)' }}>
            Don't have an account? <Link to="/register" data-testid="login-to-register" className="text-[#3B8BD4] hover:underline">Register</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
