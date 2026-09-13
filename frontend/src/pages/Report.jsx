import { useState, useEffect } from 'react'

export default function Report() {
  const [formData, setFormData] = useState({
    category: 'ROAD_DAMAGE',
    description: '',
    lat: '37.7749',
    lng: '-122.4194',
    severity: 'medium',
    photoUrl: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)
  const [myReports, setMyReports] = useState([])
  const [nearbyIssues, setNearbyIssues] = useState([])

  useEffect(() => {
    // Get user location if available
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setFormData((prev) => ({
            ...prev,
            lat: pos.coords.latitude.toFixed(6),
            lng: pos.coords.longitude.toFixed(6),
          }))
        },
        () => {}
      )
    }
    fetchNearbyIssues()
  }, [])

  const fetchNearbyIssues = async () => {
    try {
      const res = await fetch('/api/issues')
      if (res.ok) {
        const result = await res.json()
        setNearbyIssues(result.data || [])
      }
    } catch (err) {
      console.error('Error fetching issues:', err)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setMessage(null)
    setError(null)

    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: formData.category,
          description: formData.description,
          lat: parseFloat(formData.lat),
          lng: parseFloat(formData.lng),
          severity: formData.severity,
          evidence: formData.photoUrl ? { photo_url: formData.photoUrl } : {},
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit report')
      }

      setMessage('Report submitted successfully! Thank you for contributing to civic safety.')
      setMyReports((prev) => [data.data.issue, ...prev])
      setFormData({
        category: 'ROAD_DAMAGE',
        description: '',
        lat: formData.lat,
        lng: formData.lng,
        severity: 'medium',
        photoUrl: '',
      })
      fetchNearbyIssues()
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Citizen Report Center</h1>
        <p className="mt-2 text-slate-600">
          Report infrastructure defects, hazardous conditions, or public property damage to city authorities.
        </p>
      </div>

      {message && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg">
          {message}
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Report Form */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 text-slate-800">Submit New Report</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Category</label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2 text-slate-800"
              >
                <option value="ROAD_DAMAGE">Road Damage / Pothole</option>
                <option value="WATER_INFRASTRUCTURE">Water Leak / Drainage / Flood</option>
                <option value="ELECTRICAL_LIGHTING">Streetlight / Electrical Hazard</option>
                <option value="WASTE_MANAGEMENT">Garbage / Trash / Dumping</option>
                <option value="VEGETATION">Fallen Tree / Overgrown Vegetation</option>
                <option value="OTHER">Other Public Infrastructure Issue</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Severity</label>
              <select
                value={formData.severity}
                onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2 text-slate-800"
              >
                <option value="low">Low (Minor inconvenience)</option>
                <option value="medium">Medium (Moderate concern)</option>
                <option value="high">High (Urgent / Dangerous)</option>
                <option value="critical">Critical (Immediate Hazard)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={formData.lat}
                  onChange={(e) => setFormData({ ...formData, lat: e.target.value })}
                  className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2 text-slate-800"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={formData.lng}
                  onChange={(e) => setFormData({ ...formData, lng: e.target.value })}
                  className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2 text-slate-800"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Photo URL / Evidence</label>
              <input
                type="url"
                placeholder="https://example.com/photo.jpg"
                value={formData.photoUrl}
                onChange={(e) => setFormData({ ...formData, photoUrl: e.target.value })}
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2 text-slate-800"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Description</label>
              <textarea
                rows="3"
                placeholder="Describe the issue, location markers, or hazard details..."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="mt-1 block w-full rounded-md border-slate-300 shadow-sm border p-2 text-slate-800"
              ></textarea>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 px-4 bg-sky-600 hover:bg-sky-700 text-white font-medium rounded-lg shadow transition disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit Report'}
            </button>
          </form>
        </div>

        {/* My Reports & Nearby List */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-xl font-semibold mb-3 text-slate-800">Recent Submissions ({myReports.length})</h2>
            {myReports.length === 0 ? (
              <p className="text-sm text-slate-500">You have not submitted any reports in this session.</p>
            ) : (
              <div className="space-y-3">
                {myReports.map((item) => (
                  <div key={item.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-slate-800">{item.category}</span>
                      <span className="text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded font-medium">
                        {item.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mt-1">{item.description || 'No description provided'}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <h2 className="text-xl font-semibold mb-3 text-slate-800">Nearby Incidents ({nearbyIssues.length})</h2>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {nearbyIssues.slice(0, 5).map((issue) => (
                <div key={issue.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex justify-between items-center">
                  <div>
                    <span className="text-sm font-medium text-slate-800">{issue.category}</span>
                    <p className="text-xs text-slate-500">[{issue.lat}, {issue.lng}]</p>
                  </div>
                  <span className="text-xs px-2 py-1 bg-slate-200 text-slate-700 rounded capitalize">
                    {issue.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
