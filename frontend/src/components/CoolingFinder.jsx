import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useSession, haversine } from '../context/SessionContext';
import { MapPin, Navigation, Loader2, Hospital } from 'lucide-react';

const userIcon = new L.DivIcon({ className: '', html: '<div class="vx-marker"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
const coolIcon = new L.DivIcon({ className: '', html: '<div class="vx-marker cool"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });

const TILE = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

export default function CoolingFinder({ autoTrigger = false }) {
  const { latest, alerts } = useSession();
  const [origin, setOrigin] = useState(null);
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [manualAddr, setManualAddr] = useState('');
  const lastRefRef = useRef(null);

  // Initialize from telemetry GPS (low-latency) or browser geo
  useEffect(() => {
    if (latest && Number.isFinite(latest.lat)) {
      setOrigin({ lat: latest.lat, lng: latest.lng, source: 'device' });
      return;
    }
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setOrigin({ lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'browser' }),
        () => setErr('Geolocation denied. Enter an address.'),
        { enableHighAccuracy: true, timeout: 6000 }
      );
    }
  }, [latest]);

  const search = async (lat, lng) => {
    setBusy(true); setErr(null);
    try {
      // Overpass for hospitals/pharmacies/cold-storage within 10km
      const radius = 10000;
      const q = `[out:json][timeout:25];(
        node(around:${radius},${lat},${lng})[amenity~"hospital|pharmacy|clinic"];
        node(around:${radius},${lat},${lng})[healthcare~"hospital|pharmacy|clinic"];
      );out body 30;`;
      const r = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`);
      const data = await r.json();
      const items = (data.elements || [])
        .map((e) => ({
          id: e.id,
          name: e.tags?.name || e.tags?.amenity || 'Cooling unit',
          type: e.tags?.amenity || e.tags?.healthcare || 'facility',
          addr: [e.tags?.['addr:street'], e.tags?.['addr:city']].filter(Boolean).join(', '),
          lat: e.lat,
          lng: e.lon,
          distance: haversine(lat, lng, e.lat, e.lon),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3);
      setResults(items);
      lastRefRef.current = { lat, lng };
    } catch (e) {
      setErr('Failed to query nearby cooling units.');
    } finally {
      setBusy(false);
    }
  };

  // Auto-trigger when POTENCY_CRITICAL fires
  useEffect(() => {
    if (!autoTrigger || !origin) return;
    const fired = alerts.find((a) => a.type === 'POTENCY_CRITICAL' && !a.dismissed);
    if (fired && results.length === 0) search(origin.lat, origin.lng);
  }, [autoTrigger, alerts, origin]); // eslint-disable-line

  // Re-query when origin moves > 500m
  useEffect(() => {
    if (!origin) return;
    const ref = lastRefRef.current;
    if (!ref) return;
    if (haversine(origin.lat, origin.lng, ref.lat, ref.lng) > 500) {
      search(origin.lat, origin.lng);
    }
  }, [origin]); // eslint-disable-line

  const geocodeManual = async () => {
    if (!manualAddr.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(manualAddr)}&limit=1`);
      const d = await r.json();
      if (d[0]) setOrigin({ lat: +d[0].lat, lng: +d[0].lon, source: 'manual' });
    } finally { setBusy(false); }
  };

  return (
    <div className="vx-card p-4" data-testid="cooling-finder">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Hospital size={16} style={{ color: 'var(--vx-warning)' }} />
          <h3 className="text-sm font-semibold tracking-wide" style={{ fontFamily: 'Barlow' }}>NEAREST COOLING UNIT</h3>
        </div>
        <Button
          data-testid="cooling-search-btn"
          size="sm"
          className="bg-[#3B8BD4] hover:bg-[#2A75B8] text-white rounded-sm"
          disabled={!origin || busy}
          onClick={() => origin && search(origin.lat, origin.lng)}
        >
          {busy ? <Loader2 size={14} className="mr-1.5 animate-spin" /> : <Navigation size={14} className="mr-1.5" />} Search 10km
        </Button>
      </div>

      <div className="mt-3 flex gap-2">
        <Input data-testid="cooling-manual-addr" value={manualAddr} onChange={(e) => setManualAddr(e.target.value)} placeholder="Or enter address…" className="bg-[#0D0F14] border-[#232B36] rounded-sm h-9 text-sm" />
        <Button data-testid="cooling-manual-go" variant="outline" className="border-[#232B36] hover:bg-[#1E2430] rounded-sm h-9" onClick={geocodeManual}>Go</Button>
      </div>
      {err && <div className="mt-2 text-xs" style={{ color: 'var(--vx-warning)' }} data-testid="cooling-error">{err}</div>}

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="space-y-2 max-h-[340px] overflow-auto pr-1" data-testid="cooling-results">
          {results.length === 0 && !busy && <div className="text-sm" style={{ color: 'var(--vx-text-dim)' }}>No results yet. Click search.</div>}
          {results.map((r) => (
            <div key={r.id} className="p-3 rounded border vx-card-hover transition-all" style={{ borderColor: 'var(--vx-border)' }} data-testid={`cooling-result-${r.id}`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{r.name}</div>
                  <div className="text-[11px] vx-mono mt-0.5" style={{ color: 'var(--vx-text-dim)' }}>{r.type.toUpperCase()} · {r.addr || '—'}</div>
                </div>
                <span className="vx-chip info">{(r.distance / 1000).toFixed(2)} km</span>
              </div>
              <div className="text-[11px] vx-mono mt-1" style={{ color: 'var(--vx-text-dim)' }}>~{Math.max(1, Math.round((r.distance / 1000) * 2.5))} min drive</div>
              <Button
                data-testid={`cooling-directions-${r.id}`}
                size="sm"
                variant="outline"
                className="mt-2 border-[#3B8BD4]/40 text-[#3B8BD4] hover:bg-[#3B8BD4]/10 hover:text-[#3B8BD4] rounded-sm h-7"
                onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lng}`, '_blank')}
              >
                <MapPin size={12} className="mr-1" /> Directions
              </Button>
            </div>
          ))}
        </div>
        <div className="h-[340px] rounded overflow-hidden border" style={{ borderColor: 'var(--vx-border)' }} data-testid="cooling-map">
          {origin ? (
            <MapContainer center={[origin.lat, origin.lng]} zoom={13} style={{ height: '100%', width: '100%' }} preferCanvas>
              <TileLayer url={TILE} attribution="&copy; CARTO" />
              <Marker position={[origin.lat, origin.lng]} icon={userIcon}><Popup>You</Popup></Marker>
              <Circle center={[origin.lat, origin.lng]} radius={10000} pathOptions={{ color: '#3B8BD4', weight: 1, opacity: 0.3, fillOpacity: 0.04 }} />
              {results.map((r) => (
                <Marker key={r.id} position={[r.lat, r.lng]} icon={coolIcon}>
                  <Popup>{r.name} — {(r.distance / 1000).toFixed(2)}km</Popup>
                </Marker>
              ))}
              {results[0] && (
                <Polyline positions={[[origin.lat, origin.lng], [results[0].lat, results[0].lng]]}
                  pathOptions={{ color: '#EF9F27', weight: 2, dashArray: '6 4' }} />
              )}
            </MapContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-sm" style={{ color: 'var(--vx-text-dim)' }}>Locating…</div>
          )}
        </div>
      </div>
    </div>
  );
}
