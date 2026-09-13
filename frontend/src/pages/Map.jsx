import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Fix default Leaflet icon assets
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const getSeverityColor = (severity) => {
  switch (severity) {
    case 'critical': return '#ef4444' // red
    case 'high': return '#f97316' // orange
    case 'medium': return '#f59e0b' // amber
    case 'low':
    default: return '#10b981' // emerald
  }
}

const createCustomIcon = (severity) => {
  const color = getSeverityColor(severity)
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `<div style="background-color: ${color}; width: 18px; height: 18px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.4);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

export default function Map() {
  const [issues, setIssues] = useState([])
  const [loading, setLoading] = useState(true)
  const [filters, setFilters] = useState({
    status: 'all',
    severity: 'all',
    category: 'all',
  })

  useEffect(() => {
    fetchIssues()
  }, [])

  const fetchIssues = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/issues')
      if (res.ok) {
        const result = await res.json()
        setIssues(result.data || [])
      }
    } catch (err) {
      console.error('Error fetching map issues:', err)
    } finally {
      setLoading(false)
    }
  }

  const filteredIssues = issues.filter((issue) => {
    if (filters.status !== 'all' && issue.status !== filters.status) return false
    if (filters.severity !== 'all' && issue.severity !== filters.severity) return false
    if (filters.category !== 'all' && issue.category !== filters.category) return false
    return true
  })

  const defaultCenter = [37.7749, -122.4194] // SF Default

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Geospatial Damage Map</h1>
          <p className="mt-1 text-slate-600">
            Real-time interactive Leaflet map layer displaying verified and potential civic damage incidents.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="text-xs rounded border-slate-300 border p-1.5 text-slate-800"
            >
              <option value="all">All Statuses</option>
              <option value="potential">Potential</option>
              <option value="verified">Verified</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="rejected">Rejected</option>
            </select>
          </div>

          <div>
            <select
              value={filters.severity}
              onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
              className="text-xs rounded border-slate-300 border p-1.5 text-slate-800"
            >
              <option value="all">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="text-xs rounded border-slate-300 border p-1.5 text-slate-800"
            >
              <option value="all">All Categories</option>
              <option value="ROAD_DAMAGE">Road Damage</option>
              <option value="WATER_INFRASTRUCTURE">Water Infrastructure</option>
              <option value="ELECTRICAL_LIGHTING">Electrical / Lighting</option>
              <option value="WASTE_MANAGEMENT">Waste Management</option>
              <option value="VEGETATION">Vegetation</option>
            </select>
          </div>
        </div>
      </div>

      {/* Leaflet Interactive Map Container */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-sm overflow-hidden">
        <div className="h-[520px] w-full rounded-xl overflow-hidden relative">
          {loading && (
            <div className="absolute inset-0 bg-slate-100/80 backdrop-blur z-[1000] flex items-center justify-center text-slate-600 font-medium">
              Loading Leaflet map layers...
            </div>
          )}

          <MapContainer
            center={defaultCenter}
            zoom={12}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {filteredIssues.map((issue) => (
              <Marker
                key={issue.id}
                position={[issue.lat, issue.lng]}
                icon={createCustomIcon(issue.severity)}
              >
                <Popup>
                  <div className="space-y-1 text-slate-800">
                    <div className="flex justify-between items-center space-x-2">
                      <strong className="text-sm font-bold">{issue.category}</strong>
                      <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-100">
                        {issue.severity}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{issue.description || 'No description'}</p>
                    <div className="text-[11px] text-slate-500 pt-1 flex justify-between">
                      <span>Status: <strong className="capitalize">{issue.status}</strong></span>
                      <span>Conf: {(issue.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <div className="p-3 bg-slate-50 flex justify-between items-center text-xs text-slate-600 border-t border-slate-100">
          <span>Active Map Markers: <strong>{filteredIssues.length}</strong></span>
          <div className="flex space-x-4">
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
              <span>Critical</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block"></span>
              <span>High</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block"></span>
              <span>Medium</span>
            </span>
            <span className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
              <span>Low</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
