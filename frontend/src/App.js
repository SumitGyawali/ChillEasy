import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SessionProvider } from './context/SessionContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import AlertCenter from './components/AlertCenter';
import CoolingFinder from './components/CoolingFinder';
import TransportTracker from './components/TransportTracker';
import SessionLog from './components/SessionLog';
import SettingsPanel from './components/SettingsPanel';

function PageHeader({ title, subtitle }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl md:text-4xl font-medium tracking-tighter" style={{ fontFamily: 'Barlow' }}>{title}</h1>
      {subtitle && <div className="text-sm mt-1" style={{ color: 'var(--vx-text-dim)' }}>{subtitle}</div>}
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/alerts" element={<><PageHeader title="Alert Centre" subtitle="Unified live alert feed" /><AlertCenter /></>} />
            <Route path="/cooling" element={<><PageHeader title="Nearest Cooling Unit" subtitle="Auto-triggered on potency-critical events" /><CoolingFinder autoTrigger /></>} />
            <Route path="/transport" element={<><PageHeader title="Transport Tracker" subtitle="Live route trace + geofence" /><TransportTracker /></>} />
            <Route path="/sessions" element={<><PageHeader title="Sessions" subtitle="Current + history with replay & CSV export" /><SessionLog /></>} />
            <Route path="/settings" element={<><PageHeader title="Settings" subtitle="Data source, thresholds, geofence, demo tools" /><SettingsPanel /></>} />
          </Routes>
        </Layout>
      </SessionProvider>
    </BrowserRouter>
  );
}

export default App;
