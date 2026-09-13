import { useEffect, useState } from 'react'
import { apiFetch } from '../auth.jsx'
import { useAuth } from '../auth.jsx'
import { Card, EmptyState, Stat } from '../components/ui.jsx'

export default function Admin() {
  const { session } = useAuth()
  const [summary, setSummary] = useState(null)
  const [users, setUsers] = useState(null)
  const [sources, setSources] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!session) return
    apiFetch('/api/analytics/summary', { session })
      .then(setSummary)
      .catch((err) => setError(err.message))

    apiFetch('/api/admin/users', { session })
      .then((data) => setUsers(data.users))
      .catch(() => setUsers([]))

    apiFetch('/api/admin/data-sources', { session })
      .then((data) => setSources(data.sources))
      .catch(() => setSources([]))
  }, [session])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin console</h1>
        <p className="mt-1 text-sm text-slate-600">Users, departments, data sources, and platform analytics.</p>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      {summary && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="issues" value={summary.totals.issues} />
            <Stat label="potential" value={summary.totals.potential_issues} />
            <Stat label="active" value={summary.totals.active_issues} />
            <Stat label="resolved" value={summary.totals.resolved_issues} />
            <Stat label="last 24h" value={summary.totals.issues_last_24h} />
            <Stat label="observations" value={summary.totals.observations} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Issues by category">
              <ul className="space-y-1 text-sm">
                {Object.entries(summary.by_category).map(([category, count]) => (
                  <li key={category} className="flex justify-between">
                    <span className="text-slate-600">{category}</span>
                    <span className="font-semibold">{count}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Observations by source">
              <ul className="space-y-1 text-sm">
                {Object.entries(summary.observations_by_source).map(([source, count]) => (
                  <li key={source} className="flex justify-between">
                    <span className="text-slate-600">{source.replace('_', ' ')}</span>
                    <span className="font-semibold">{count}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="Issues by department">
              {Object.keys(summary.issues_by_department).length === 0 ? (
                <EmptyState>No assignments yet.</EmptyState>
              ) : (
                <ul className="space-y-1 text-sm">
                  {Object.entries(summary.issues_by_department).map(([name, count]) => (
                    <li key={name} className="flex justify-between">
                      <span className="text-slate-600">{name}</span>
                      <span className="font-semibold">{count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card title="Recent source runs">
              {summary.recent_source_runs.length === 0 ? (
                <EmptyState>No collector runs yet — start the scheduler to populate this.</EmptyState>
              ) : (
                <ul className="space-y-1 text-sm">
                  {summary.recent_source_runs.map((run) => (
                    <li key={run.id} className="flex justify-between">
                      <span className="text-slate-600">{new Date(run.started_at).toLocaleString()}</span>
                      <span>
                        {run.status} · {run.records_fetched} records
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Users">
          {users === null && <EmptyState>Loading…</EmptyState>}
          {users?.length === 0 && <EmptyState>No users visible.</EmptyState>}
          {users?.length > 0 && (
            <ul className="space-y-1 text-sm">
              {users.map((user) => (
                <li key={user.id} className="flex justify-between">
                  <span>{user.email ?? user.id.slice(0, 8)}</span>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold">{user.role}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Data sources">
          {sources === null && <EmptyState>Loading…</EmptyState>}
          {sources?.length === 0 && <EmptyState>No data sources registered.</EmptyState>}
          {sources?.length > 0 && (
            <ul className="space-y-1 text-sm">
              {sources.map((source) => (
                <li key={source.id} className="flex justify-between">
                  <span>
                    {source.name} <span className="text-xs text-slate-400">({source.type})</span>
                  </span>
                  <span className="text-xs font-semibold text-slate-500">
                    reliability {(source.reliability_score * 100).toFixed(0)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  )
}
