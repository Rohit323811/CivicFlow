import { useEffect, useState } from 'react'
import { useAuth, apiFetch } from '../auth.jsx'
import { Card, CategoryBadge, EmptyState, SeverityBadge } from '../components/ui.jsx'

export default function MyReports() {
  const { session } = useAuth()
  const [reports, setReports] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!session) return
    apiFetch('/api/reports/mine', { session })
      .then((data) => setReports(data.reports))
      .catch((err) => setError(err.message))
  }, [session])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">My reports</h1>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {reports === null && !error && <EmptyState>Loading…</EmptyState>}
      {reports?.length === 0 && <EmptyState>You have not submitted any reports yet.</EmptyState>}

      {reports?.length > 0 && (
        <div className="space-y-3">
          {reports.map((report) => (
            <Card key={report.id}>
              <div className="flex flex-wrap items-center gap-2">
                <CategoryBadge value={report.category} />
                <SeverityBadge value={report.severity} />
                <span className="text-xs text-slate-500">
                  {new Date(report.timestamp).toLocaleString()}
                </span>
              </div>
              {report.description && <p className="mt-2 text-sm text-slate-700">{report.description}</p>}
              <p className="mt-1 text-xs text-slate-400">
                {report.lat.toFixed(5)}, {report.lng.toFixed(5)}
              </p>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
