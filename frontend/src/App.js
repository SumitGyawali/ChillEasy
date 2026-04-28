import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SessionProvider } from './context/SessionContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AlertCenter from './components/AlertCenter';
import CoolingFinder from './components/CoolingFinder';
import TransportTracker from './components/TransportTracker';
import SessionLog from './components/SessionLog';
import SettingsPanel from './components/SettingsPanel';
import Login from './pages/Login';
import Register from './pages/Register';
import AuthCallback from './pages/AuthCallback';
import ProtectedRoute from './components/ProtectedRoute';

function PageHeader({ title, subtitle }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl md:text-4xl font-medium tracking-tighter" style={{ fontFamily: 'Barlow' }}>{title}</h1>
      {subtitle && <div className="text-sm mt-1" style={{ color: 'var(--vx-text-dim)' }}>{subtitle}</div>}
    </div>
  );
}

function AppRouter() {
  // CRITICAL: handle Emergent OAuth callback (URL fragment) BEFORE protected routes evaluate.
  const location = useLocation();
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route path="/" element={<ProtectedRoute><SessionProvider><Layout><Dashboard /></Layout></SessionProvider></ProtectedRoute>} />
      <Route path="/alerts" element={<ProtectedRoute><SessionProvider><Layout><PageHeader title="Alert Centre" subtitle="Unified live alert feed" /><AlertCenter /></Layout></SessionProvider></ProtectedRoute>} />
      <Route path="/cooling" element={<ProtectedRoute><SessionProvider><Layout><PageHeader title="Nearest Cooling Unit" subtitle="Auto-triggered on potency-critical events" /><CoolingFinder autoTrigger /></Layout></SessionProvider></ProtectedRoute>} />
      <Route path="/transport" element={<ProtectedRoute><SessionProvider><Layout><PageHeader title="Transport Tracker" subtitle="Live route trace + geofence" /><TransportTracker /></Layout></SessionProvider></ProtectedRoute>} />
      <Route path="/sessions" element={<ProtectedRoute><SessionProvider><Layout><PageHeader title="Sessions" subtitle="Current + history with replay & CSV export" /><SessionLog /></Layout></SessionProvider></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SessionProvider><Layout><PageHeader title="Settings" subtitle="Data source, thresholds, geofence, demo tools" /><SettingsPanel /></Layout></SessionProvider></ProtectedRoute>} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
