import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Beaker, UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Register() {
  const { registerPassword, loginGoogle, isAuthenticated } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => { if (isAuthenticated === true) nav('/', { replace: true }); }, [isAuthenticated, nav]);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setBusy(true);
    try { await registerPassword(email, password, name); toast.success('Account created'); }
    catch (err) { toast.error(err?.response?.data?.detail || 'Registration failed'); }
    finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--vx-bg)' }} data-testid="register-page">
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
          <h1 className="text-3xl font-medium tracking-tighter mt-4" style={{ fontFamily: 'Barlow' }}>Create account</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--vx-text-dim)' }}>Sign up with email or use Google instead.</p>

          <Button data-testid="register-google-btn" onClick={loginGoogle} className="mt-6 w-full bg-white text-black hover:bg-gray-200 rounded-sm h-10">
            Continue with Google
          </Button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: 'var(--vx-border)' }} />
            <span className="text-[11px] vx-mono" style={{ color: 'var(--vx-text-dim)' }}>OR EMAIL</span>
            <div className="flex-1 h-px" style={{ background: 'var(--vx-border)' }} />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <div>
              <Label className="vx-label">Name</Label>
              <Input data-testid="register-name" value={name} onChange={(e) => setName(e.target.value)} className="bg-[#0D0F14] border-[#232B36] rounded-sm mt-1" />
            </div>
            <div>
              <Label className="vx-label">Email</Label>
              <Input data-testid="register-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="bg-[#0D0F14] border-[#232B36] rounded-sm mt-1" />
            </div>
            <div>
              <Label className="vx-label">Password (8+ chars)</Label>
              <Input data-testid="register-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="bg-[#0D0F14] border-[#232B36] rounded-sm mt-1" />
            </div>
            <Button data-testid="register-submit-btn" type="submit" disabled={busy} className="w-full bg-[#3B8BD4] hover:bg-[#2A75B8] text-white rounded-sm h-10">
              {busy ? <Loader2 size={14} className="animate-spin mr-2" /> : <UserPlus size={14} className="mr-2" />}
              Create account
            </Button>
          </form>

          <div className="text-xs mt-5" style={{ color: 'var(--vx-text-dim)' }}>
            Already have an account? <Link to="/login" data-testid="register-to-login" className="text-[#3B8BD4] hover:underline">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
