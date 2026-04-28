import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const TOKEN_KEY = 'vxc_jwt';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

axios.interceptors.request.use((config) => {
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) config.headers = { ...config.headers, Authorization: `Bearer ${t}` };
  config.withCredentials = true;
  return config;
});

export function AuthProvider({ children }) {
  // null = checking, true = authed, false = anon
  const [isAuthenticated, setIsAuthenticated] = useState(null);
  const [user, setUser] = useState(null);

  const checkAuth = useCallback(async () => {
    // CRITICAL: skip /me when returning from Emergent OAuth (#session_id=...).
    // AuthCallback handles the exchange first.
    if (typeof window !== 'undefined' && window.location.hash?.includes('session_id=')) {
      setIsAuthenticated(null);
      return;
    }
    try {
      const { data } = await axios.get(`${API}/auth/me`);
      setUser(data); setIsAuthenticated(true);
    } catch {
      setUser(null); setIsAuthenticated(false);
    }
  }, []);

  useEffect(() => { checkAuth(); }, [checkAuth]);

  const loginPassword = useCallback(async (email, password) => {
    const { data } = await axios.post(`${API}/auth/login`, { email, password });
    localStorage.setItem(TOKEN_KEY, data.access_token);
    setUser(data.user); setIsAuthenticated(true);
    return data.user;
  }, []);

  const registerPassword = useCallback(async (email, password, name) => {
    const { data } = await axios.post(`${API}/auth/register`, { email, password, name });
    localStorage.setItem(TOKEN_KEY, data.access_token);
    setUser(data.user); setIsAuthenticated(true);
    return data.user;
  }, []);

  const loginGoogle = useCallback(() => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  }, []);

  const logout = useCallback(async () => {
    try { await axios.post(`${API}/auth/logout`); } catch {}
    localStorage.removeItem(TOKEN_KEY);
    setUser(null); setIsAuthenticated(false);
  }, []);

  // Called by AuthCallback after Emergent session_id exchange completes
  const onAuthEstablished = useCallback((u) => {
    setUser(u); setIsAuthenticated(true);
  }, []);

  return (
    <AuthCtx.Provider value={{ isAuthenticated, user, loginPassword, registerPassword, loginGoogle, logout, onAuthEstablished, refreshAuth: checkAuth }}>
      {children}
    </AuthCtx.Provider>
  );
}
