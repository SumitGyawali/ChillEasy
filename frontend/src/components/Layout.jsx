import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, AlertTriangle, MapPin, Compass, FileText, Settings, Menu, X, Power, Beaker } from 'lucide-react';
import { useSession } from '../context/SessionContext';
import { Button } from './ui/button';
import { Toaster } from 'sonner';

const NAV = [
  { to: '/', label: 'Live Monitor', icon: Activity, testid: 'nav-monitor' },
  { to: '/alerts', label: 'Alerts', icon: AlertTriangle, testid: 'nav-alerts' },
  { to: '/cooling', label: 'Cooling Units', icon: MapPin, testid: 'nav-cooling' },
  { to: '/transport', label: 'Transport', icon: Compass, testid: 'nav-transport' },
  { to: '/sessions', label: 'Sessions', icon: FileText, testid: 'nav-sessions' },
  { to: '/settings', label: 'Settings', icon: Settings, testid: 'nav-settings' },
];

export default function Layout({ children }) {
  const { session, running, startSession, stopSession, latest, alerts, linkStatus } = useSession();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  const criticalCount = alerts.filter((a) => a.severity === 'critical' && !a.dismissed).length;
  const linkChipClass =
    linkStatus.status === 'connected' ? 'ok'
    : linkStatus.status === 'error' || linkStatus.status === 'closed' ? 'crit'
    : linkStatus.status === 'connecting' || linkStatus.status === 'reconnecting' ? 'warn'
    : '';

  const NavList = ({ idPrefix = '' }) => (
    <nav className="p-3 flex flex-col gap-1">
      {NAV.map(({ to, label, icon: Icon, testid }) => {
        const active = location.pathname === to;
        return (
          <Link key={to} to={to} data-testid={`${idPrefix}${testid}`} onClick={() => setOpen(false)}
            className={`flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors ${active ? 'text-white' : 'text-[#94A3B8] hover:text-white'}`}
            style={{
              background: active ? 'rgba(59,139,212,0.12)' : 'transparent',
              border: active ? '1px solid rgba(59,139,212,0.35)' : '1px solid transparent',
            }}>
            <Icon size={15} /><span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen text-white" style={{ background: 'var(--vx-bg)' }}>
      <Toaster theme="dark" richColors position="top-right" />

      <header className="sticky top-0 z-40 backdrop-blur-xl border-b" style={{ background: 'rgba(13,15,20,0.85)', borderColor: 'var(--vx-border)' }}>
        <div className="flex items-center justify-between px-4 md:px-6 h-14">
          <div className="flex items-center gap-3">
            <button data-testid="menu-toggle-btn" className="md:hidden p-1.5 rounded border" style={{ borderColor: 'var(--vx-border)' }} onClick={() => setOpen(true)}>
              <Menu size={18} />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded flex items-center justify-center" style={{ background: 'rgba(59,139,212,0.12)', border: '1px solid rgba(59,139,212,0.4)' }}>
                <Beaker size={14} style={{ color: 'var(--vx-primary)' }} />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>VAXCHAIN</div>
                <div className="text-[10px] vx-mono" style={{ color: 'var(--vx-text-dim)' }}>COLD CHAIN MONITOR</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className={`vx-chip ${running ? 'ok' : ''}`} data-testid="session-status-chip">
              <span className={`vx-pulse-dot ${running ? '' : 'crit'}`} />
              {running ? 'LIVE' : 'STOPPED'}
            </div>
            {running && (
              <div className={`vx-chip ${linkChipClass} hidden md:inline-flex`} data-testid="link-status-chip" title={linkStatus.error || linkStatus.broker || ''}>
                LINK · {(linkStatus.status || 'idle').toUpperCase()}
              </div>
            )}
            {latest && (
              <div className="vx-chip info hidden sm:inline-flex" data-testid="topbar-temp-chip">
                {((latest.sensor1 + latest.sensor2) / 2).toFixed(2)}°C
              </div>
            )}
            {criticalCount > 0 && (
              <Link to="/alerts" className="vx-chip crit" data-testid="topbar-alert-chip">
                <AlertTriangle size={12} /> {criticalCount} CRIT
              </Link>
            )}
            {!running ? (
              <Button data-testid="start-session-btn" size="sm" className="bg-[#3B8BD4] hover:bg-[#2A75B8] text-white rounded-sm" onClick={startSession}>
                <Power size={14} className="mr-1.5" /> Start
              </Button>
            ) : (
              <Button data-testid="stop-session-btn" size="sm" variant="outline" className="border-[#E24B4A]/50 text-[#E24B4A] hover:bg-[#E24B4A]/10 hover:text-[#E24B4A] rounded-sm" onClick={stopSession}>
                <Power size={14} className="mr-1.5" /> Stop
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Mobile overlay drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" data-testid="mobile-drawer">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r" style={{ borderColor: 'var(--vx-border)', background: 'var(--vx-surface)' }}>
            <div className="flex items-center justify-between p-3 border-b" style={{ borderColor: 'var(--vx-border)' }}>
              <span className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>MENU</span>
              <button data-testid="mobile-drawer-close" className="p-1.5 rounded border" style={{ borderColor: 'var(--vx-border)' }} onClick={() => setOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <NavList idPrefix="m-" />
          </aside>
        </div>
      )}

      <div className="flex">
        <aside className="hidden md:block w-60 shrink-0 border-r min-h-[calc(100vh-3.5rem)] sticky top-14" style={{ borderColor: 'var(--vx-border)', background: 'rgba(22,26,34,0.4)' }}>
          <NavList />
          <div className="px-4 mt-3">
            <div className="vx-label mb-2">Session</div>
            <div className="text-xs vx-mono break-all" style={{ color: 'var(--vx-text-dim)' }}>
              {session?.id ? session.id.slice(0, 8) + '…' : '— none —'}
            </div>
          </div>
        </aside>

        <main className="flex-1 min-w-0 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
