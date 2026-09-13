import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth, apiFetch } from '../auth.jsx'
import { Card, CATEGORY_LABELS } from '../components/ui.jsx'

const CATEGORIES = Object.keys(CATEGORY_LABELS)

export default function Report() {
  const { session } = useAuth()

  const [form, setForm] = useState({
    category: 'ROAD_DAMAGE',
    description: '',
    lat: '',
    lng: '',
    photoUrl: '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [created, setCreated] = useState(null)

  function update(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('Geolocation is not available in this browser')
      return
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        update('lat', coords.latitude.toFixed(6))
        update('lng', coords.longitude.toFixed(6))
        setError(null)
      },
      () => setError('Could not get your location — enter coordinates manually'),
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setError(null)
    setCreated(null)

    if (!session) {
      setError('Please sign in to submit a report')
      return
    }

    const lat = Number(form.lat)
    const lng = Number(form.lng)
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) return setError('Latitude must be between -90 and 90')
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) return setError('Longitude must be between -180 and 180')

    setBusy(true)
    try {
      const evidence = form.photoUrl ? { photo_url: form.photoUrl } : {}
      const result = await apiFetch('/api/reports', {
        method: 'POST',
        session,
        body: {
          category: form.category,
          description: form.description || null,
          lat,
          lng,
          evidence,
        },
      })
      setCreated(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <h1 className="text-xl font-bold text-green-700">Report received ✔</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your report was recorded and a <strong>potential issue</strong> was created for review.
            Authorities verify reports before they appear publicly on the map.
          </p>
          {created.issue && (
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
              <div className="font-semibold">Issue #{created.issue.id.slice(0, 8)}</div>
              <div className="mt-1 text-slate-600">
                {CATEGORY_LABELS[created.issue.category]} · status: {created.issue.status}
              </div>
            </div>
          )}
          <div className="mt-4 flex gap-3">
            <button
              onClick={() => {
                setCreated(null)
                setForm({ category: 'ROAD_DAMAGE', description: '', lat: '', lng: '', photoUrl: '' })
              }}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
            >
              Submit another
            </button>
            <Link to="/my-reports" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-100">
              View my reports
            </Link>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-bold">Report an issue</h1>
      <p className="mt-1 text-sm text-slate-600">
        Spotted a pothole, leak, or broken streetlight? Report it in under a minute.
      </p>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="category">Category</label>
            <select
              id="category"
              value={form.category}
              onChange={(e) => update('category', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {CATEGORIES.map((value) => (
                <option key={value} value={value}>{CATEGORY_LABELS[value]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="description">Description</label>
            <textarea
              id="description"
              rows={3}
              placeholder="What did you see?"
              value={form.description}
              onChange={(e) => update('description', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor="photoUrl">Photo URL (optional)</label>
            <input
              id="photoUrl"
              type="url"
              placeholder="https://…"
              value={form.photoUrl}
              onChange={(e) => update('photoUrl', e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="lat">Latitude</label>
              <input
                id="lat"
                inputMode="decimal"
                required
                value={form.lat}
                onChange={(e) => update('lat', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700" htmlFor="lng">Longitude</label>
              <input
                id="lng"
                inputMode="decimal"
                required
                value={form.lng}
                onChange={(e) => update('lng', e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </div>
          </div>

          <button type="button" onClick={useMyLocation} className="text-sm font-medium text-blue-700 underline">
            📍 Use my current location
          </button>

          {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-slate-900 py-2.5 font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {busy ? 'Submitting…' : 'Submit report'}
          </button>
        </form>
      </Card>
    </div>
  )
}
