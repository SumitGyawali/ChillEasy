import React, { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useSession, haversine } from '../context/SessionContext';
import { Compass } from 'lucide-react';

const userIcon = new L.DivIcon({ className: '', html: '<div class="vx-marker"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
const destIcon = new L.DivIcon({ className: '', html: '<div class="vx-marker dest"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });

const TILE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

export default function TransportTracker() {
  const { telemetry, latest, settings } = useSession();
  const route = telemetry.filter((p) => Number.isFinite(p.lat)).map((p) => [p.lat, p.lng]);
  const dest = settings.geofence;

  const stats = useMemo(() => {
    let dist = 0;
    for (let i = 1; i < route.length; i++) {
      dist += haversine(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1]);
    }
    const t0 = telemetry[0]?.t ? new Date(telemetry[0].t).getTime() : null;
    const tn = telemetry[telemetry.length - 1]?.t ? new Date(telemetry[telemetry.length - 1].t).getTime() : null;
    const durH = t0 && tn ? (tn - t0) / 3600000 : 0;
    const speed = durH > 0 ? dist / 1000 / durH : 0;
    const remaining = latest && dest ? haversine(latest.lat, latest.lng, dest.lat, dest.lng) : 0;
    const etaMin = speed > 0 ? (remaining / 1000) / speed * 60 : null;
    return { dist, speed, remaining, etaMin };
  }, [route, telemetry, latest, dest]);

  const center = latest ? [latest.lat, latest.lng] : [12.9716, 77.5946];

  return (
    <div className="vx-card p-4" data-testid="transport-tracker">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Compass size={16} style={{ color: 'var(--vx-primary)' }} />
          <h3 className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>GPS TRANSPORT TRACKER</h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="vx-chip info" data-testid="transport-distance">{(stats.dist / 1000).toFixed(2)} km</span>
          <span className="vx-chip" data-testid="transport-speed">{stats.speed.toFixed(1)} km/h</span>
          <span className="vx-chip" data-testid="transport-eta">ETA {stats.etaMin ? `${Math.round(stats.etaMin)}m` : '—'}</span>
          <span className="vx-chip ok" data-testid="transport-remaining">{(stats.remaining / 1000).toFixed(2)} km left</span>
        </div>
      </div>

      <div className="mt-4 h-[360px] rounded overflow-hidden border" style={{ borderColor: 'var(--vx-border)' }} data-testid="transport-map">
        <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }} preferCanvas>
          <TileLayer url={TILE} attribution="&copy; CARTO" />
          {route.length > 0 && (
            <Polyline positions={route} pathOptions={{ color: '#3B8BD4', weight: 3, opacity: 0.85 }} />
          )}
          {latest && <Marker position={[latest.lat, latest.lng]} icon={userIcon} />}
          {dest && <Marker position={[dest.lat, dest.lng]} icon={destIcon} />}
          {dest && <Circle center={[dest.lat, dest.lng]} radius={dest.radiusM} pathOptions={{ color: '#1D9E75', weight: 1, opacity: 0.4, fillOpacity: 0.06 }} />}
        </MapContainer>
      </div>
    </div>
  );
}
