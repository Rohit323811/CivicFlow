import { useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

import { useAuth, apiFetch } from '../auth.jsx'
import { Card, CATEGORY_LABELS, StatusBadge, SeverityBadge, markerColorForSeverity } from '../components/ui.jsx'

const CATEGORIES = Object.keys(CATEGORY_LABELS)
const SEVERITIES = ['low', 'medium', 'high', 'critical']
const DEFAULT_CENTER = [30.3256, 78.0413] // Dehradun Clock Tower

// Each category gets its own recognisable symbol and colour. Severity is
// shown as a small corner dot so the issue type remains immediately readable.
const CATEGORY_MARKERS = {
  ROAD_DAMAGE: { emoji: '🛣️', label: 'Road damage', color: '#159E91' },
  WATER_LEAK: { emoji: '💧', label: 'Water leak', color: '#3E82A8' },
  STREETLIGHT: { emoji: '💡', label: 'Streetlight', color: '#F5A400' },
  FLOODING: { emoji: '🌊', label: 'Flooding', color: '#E95032' },
  DRAINAGE: { emoji: '🌊', label: 'Drainage', color: '#C2410C' },
  GARBAGE: { emoji: '🗑️', label: 'Garbage', color: '#64748B' },
  TRAFFIC_SIGNAL: { emoji: '🚦', label: 'Traffic signal', color: '#7C3AED' },
  DAMAGED_SIGN: { emoji: '⚠️', label: 'Damaged sign', color: '#B45309' },
  OTHER: { emoji: '📍', label: 'Other issue', color: '#475569' },
}

function makeIssueIcon(category, severity) {
  const marker = CATEGORY_MARKERS[category] ?? CATEGORY_MARKERS.OTHER
  const severityColor = markerColorForSeverity(severity)
  return L.divIcon({
    className: 'civicflow-category-marker',
    html: `<span role="img" aria-label="${marker.label}" title="${marker.label}" style="position:relative;display:flex;align-items:center;justify-content:center;width:38px;height:38px;border:2px solid #fff;border-radius:50%;background:${marker.color};box-shadow:0 2px 9px #0005;font-size:22px;line-height:1"><span>${marker.emoji}</span><i style="position:absolute;right:-2px;bottom:-2px;width:10px;height:10px;border:2px solid #fff;border-radius:50%;background:${severityColor}"></i></span>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -17],
  })
}

function ViewportLoader({ onBoundsChange }) {
  function sendBounds(map) {
    const bounds = map.getBounds()
    onBoundsChange({
      minLat: bounds.getSouth(),
      minLng: bounds.getWest(),
      maxLat: bounds.getNorth(),
      maxLng: bounds.getEast(),
    })
  }
  return <BoundsBridge onMoveEnd={sendBounds} />
}

function BoundsBridge({ onMoveEnd }) {
  const map = useMap()
  useEffect(() => {
    onMoveEnd(map)
    const handler = () => onMoveEnd(map)
    map.on('moveend', handler)
    return () => map.off('moveend', handler)
  }, [map, onMoveEnd])
  return null
}

export default function MapPage() {
  const { session, isAuthority } = useAuth()
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [bounds, setBounds] = useState(null)
  const [filters, setFilters] = useState({ category: '', severity: '', status: '' })

  const query = useMemo(() => {
    const params = new URLSearchParams()
    if (bounds) {
      params.set('minLat', bounds.minLat.toFixed(5))
      params.set('minLng', bounds.minLng.toFixed(5))
      params.set('maxLat', bounds.maxLat.toFixed(5))
      params.set('maxLng', bounds.maxLng.toFixed(5))
    }
    if (filters.category) params.set('category', filters.category)
    if (filters.severity) params.set('severity', filters.severity)
    if (filters.status) params.set('status', filters.status)
    return params.toString()
  }, [bounds, filters])

  useEffect(() => {
    apiFetch(`/api/issues?${query}`)
      .then((data) => {
        setIssues(data.issues)
        setError(null)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [query])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold">Issue map</h1>
        <div className="flex flex-wrap gap-2 text-sm">
          <select
            value={filters.category}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
            className="rounded-lg border border-slate-300 px-2 py-1.5"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
          <select
            value={filters.severity}
            onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
            className="rounded-lg border border-slate-300 px-2 py-1.5"
          >
            <option value="">All severities</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {isAuthority && (
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              className="rounded-lg border border-slate-300 px-2 py-1.5"
            >
              <option value="">All statuses</option>
              {['potential', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected', 'merged'].map((s) => (
                <option key={s} value={s}>{s.replace('_', ' ')}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="h-[480px] overflow-hidden rounded-xl border border-slate-200">
        <MapContainer center={DEFAULT_CENTER} zoom={12} className="h-full w-full">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ViewportLoader onBoundsChange={setBounds} />
          {issues.map((issue) => {
            const marker = CATEGORY_MARKERS[issue.category] ?? CATEGORY_MARKERS.OTHER
            const popup = (
              <Popup>
                <div className="min-w-[180px]">
                  <div className="flex items-center gap-2 font-semibold">
                    <span aria-hidden="true" style={{ fontSize: '22px' }}>{marker.emoji}</span>
                    <span>{CATEGORY_LABELS[issue.category] ?? issue.category}</span>
                  </div>
                  <div className="mt-1 flex gap-1">
                    <SeverityBadge value={issue.severity} />
                    <StatusBadge value={issue.status} />
                  </div>
                  {issue.description && <p className="mt-2 text-xs text-slate-600">{issue.description}</p>}
                  <p className="mt-1 text-[10px] text-slate-400">confidence {issue.confidence}/100</p>
                  {session && (
                    <a className="mt-2 inline-block text-xs text-blue-600 underline" href={`/authority?issue=${issue.id}`}>
                      open in dashboard
                    </a>
                  )}
                </div>
              </Popup>
            )
            return (
              <Marker
                key={issue.id}
                position={[issue.lat, issue.lng]}
                icon={makeIssueIcon(issue.category, issue.severity)}
              >
                {popup}
              </Marker>
            )
          })}
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
        <span>Issue types:</span>
        {Object.entries(CATEGORY_MARKERS).slice(0, 8).map(([category, marker]) => (
          <span key={category} className="flex items-center gap-1">
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full text-base" style={{ background: marker.color, color: '#fff' }}>{marker.emoji}</span>
            {CATEGORY_LABELS[category] ?? marker.label}
          </span>
        ))}
        <span className="ml-auto">
          {loading ? 'loading…' : `${issues.length} issue(s) in view`}
          {!isAuthority && ' · potential issues are hidden until verified'}
        </span>
      </div>
    </div>
  )
}
