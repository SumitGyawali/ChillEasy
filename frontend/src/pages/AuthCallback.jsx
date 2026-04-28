import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Handles the URL fragment redirect from Emergent Google OAuth.
 *   /#session_id=XYZ → POST /api/auth/session → set httpOnly cookie → /
 *
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
 */
export default function AuthCallback() {
  const nav = useNavigate();
  const { onAuthEstablished } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const hash = window.location.hash || '';
    const m = hash.match(/session_id=([^&]+)/);
    const sessionId = m ? decodeURIComponent(m[1]) : null;
    if (!sessionId) { nav('/login', { replace: true }); return; }

    (async () => {
      try {
        const { data } = await axios.post(`${API}/auth/session`, { session_id: sessionId }, { withCredentials: true });
        if (data?.user) onAuthEstablished(data.user);
        // Strip fragment and navigate
        window.history.replaceState(null, '', '/');
        nav('/', { replace: true, state: { user: data?.user } });
      } catch {
        nav('/login', { replace: true });
      }
    })();
  }, [nav, onAuthEstablished]);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: 'var(--vx-bg)', color: 'var(--vx-text-dim)' }} data-testid="auth-callback">
      <Loader2 size={16} className="animate-spin mr-2" /> Establishing session…
    </div>
  );
}
