import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm" style={{ background: 'var(--vx-bg)', color: 'var(--vx-text-dim)' }} data-testid="auth-loading">
        <Loader2 size={16} className="animate-spin mr-2" /> Authenticating…
      </div>
    );
  }
  if (isAuthenticated === false) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}
