import { useCallback, useEffect, useState } from 'react'
import { useAuth, apiFetch } from '../auth.jsx'
import { Card, CategoryBadge, EmptyState, SeverityBadge, Stat, StatusBadge, CATEGORY_LABELS } from '../components/ui.jsx'

const STATUS_OPTIONS = ['verified', 'assigned', 'in_progress', 'resolved', 'rejected']

export default function Authority() {
  const { session } = useAuth()
  const [issues, setIssues] = useState(null)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({ status: 'potential', category: '', severity: '' })
  const [selectedId, setSelectedId] = useState(null)
  const [detail, setDetail] = useState(null)
  const [departments, setDepartments] = useState([])
  const [actionError, setActionError] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)

  const loadIssues = useCallback(() => {
    const params = new URLSearchParams()
    if (filters.status) params.set('status', filters.status)
    if (filters.category) params.set('category', filters.category)
    if (filters.severity) params.set('severity', filters.severity)
    apiFetch(`/api/issues?${params}`, { session })
      .then((data) => setIssues(data.issues))
      .catch((err) => setError(err.message))
  }, [session, filters])

  useEffect(() => {
    loadIssues()
  }, [loadIssues])

  useEffect(() => {
    apiFetch('/api/analytics/summary', { session })
      .then(setSummary)
      .catch(() => setSummary(null))
    apiFetch('/api/departments', { session })
      .then((data) => setDepartments(data.departments))
      .catch(() => setDepartments([]))
  }, [session])

  const loadDetail = useCallback(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    apiFetch(`/api/issues/${selectedId}`, { session })
      .then(setDetail)
      .catch((err) => setActionError(err.message))
  }, [session, selectedId])

  useEffect(() => {
    loadDetail()
  }, [loadDetail])

  async function act(path, body) {
    setActionBusy(true)
    setActionError(null)
    try {
      await apiFetch(path, { method: 'POST', session, body })
      loadDetail()
      loadIssues()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Authority dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Verify, prioritize, assign, and track civic issues.</p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="potential" value={summary.totals.potential_issues} />
          <Stat label="active" value={summary.totals.active_issues} />
          <Stat label="resolved" value={summary.totals.resolved_issues} />
          <Stat label="observations" value={summary.totals.observations} />
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-sm">
        <select
          value={filters.status}
          onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          className="rounded-lg border border-slate-300 px-2 py-1.5"
        >
          {['potential', 'verified', 'assigned', 'in_progress', 'resolved', 'rejected', 'merged'].map((s) => (
            <option key={s} value={s}>{s.replace('_', ' ')}</option>
          ))}
        </select>
        <select
          value={filters.category}
          onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value }))}
          className="rounded-lg border border-slate-300 px-2 py-1.5"
        >
          <option value="">All categories</option>
          {Object.keys(CATEGORY_LABELS).map((c) => (
            <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        <select
          value={filters.severity}
          onChange={(e) => setFilters((f) => ({ ...f, severity: e.target.value }))}
          className="rounded-lg border border-slate-300 px-2 py-1.5"
        >
          <option value="">All severities</option>
          {['low', 'medium', 'high', 'critical'].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {issues === null && <EmptyState>Loading…</EmptyState>}
          {issues?.length === 0 && <EmptyState>No issues match these filters.</EmptyState>}
          {issues?.map((issue) => (
            <button
              key={issue.id}
              onClick={() => setSelectedId(issue.id)}
              className={`block w-full rounded-xl border bg-white p-4 text-left shadow-sm transition-colors hover:bg-slate-50 ${
                selectedId === issue.id ? 'border-slate-900' : 'border-slate-200'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <CategoryBadge value={issue.category} />
                <SeverityBadge value={issue.severity} />
                <StatusBadge value={issue.status} />
                <span className="ml-auto text-xs font-semibold text-slate-500">confidence {issue.confidence}</span>
              </div>
              {issue.description && <p className="mt-2 line-clamp-2 text-sm text-slate-700">{issue.description}</p>}
              <p className="mt-1 text-xs text-slate-400">{issue.lat.toFixed(5)}, {issue.lng.toFixed(5)}</p>
            </button>
          ))}
        </div>

        <div>
          {!selectedId && <EmptyState>Select an issue to review it.</EmptyState>}
          {selectedId && detail && (
            <Card title={`Issue #${detail.issue.id.slice(0, 8)}`}>
              <div className="flex flex-wrap gap-2">
                <CategoryBadge value={detail.issue.category} />
                <SeverityBadge value={detail.issue.severity} />
                <StatusBadge value={detail.issue.status} />
                <span className="text-xs text-slate-500">{detail.observations.length} observation(s)</span>
              </div>

              {detail.issue.ai_analysis && (
                <div className="mt-3 rounded-lg bg-indigo-50 p-3 text-sm">
                  <div className="font-semibold text-indigo-900">AI analysis ({detail.issue.ai_analysis.source})</div>
                  <div className="mt-1 text-indigo-800">{detail.issue.ai_analysis.potential_cause}</div>
                  <div className="mt-1 text-xs text-indigo-600">
                    recommended: {detail.issue.ai_analysis.recommended_department ?? '—'} · confidence{' '}
                    {detail.issue.ai_analysis.confidence}
                  </div>
                  {detail.issue.ai_analysis.reasoning && (
                    <div className="mt-1 text-xs text-indigo-500">{detail.issue.ai_analysis.reasoning}</div>
                  )}
                </div>
              )}

              <div className="mt-4 space-y-2">
                <div className="flex flex-wrap gap-2">
                  {detail.issue.status === 'potential' && (
                    <>
                      <button
                        disabled={actionBusy}
                        onClick={() => act(`/api/issues/${detail.issue.id}/verify`, { decision: 'verified' })}
                        className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-50"
                      >
                        Verify
                      </button>
                      <button
                        disabled={actionBusy}
                        onClick={() => act(`/api/issues/${detail.issue.id}/verify`, { decision: 'rejected' })}
                        className="rounded-lg bg-slate-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-400 disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </>
                  )}
                </div>

                {['potential', 'verified'].includes(detail.issue.status) && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      defaultValue=""
                      onChange={(e) =>
                        e.target.value &&
                        act(`/api/issues/${detail.issue.id}/assign`, { departmentId: e.target.value })
                      }
                      className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value="">Assign to department…</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {!['potential', 'resolved', 'merged'].includes(detail.issue.status) && (
                  <div className="flex flex-wrap gap-2">
                    {STATUS_OPTIONS.filter((s) => s !== detail.issue.status).map((status) => (
                      <button
                        key={status}
                        disabled={actionBusy}
                        onClick={() => act(`/api/issues/${detail.issue.id}/status`, { status })}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-100 disabled:opacity-50"
                      >
                        → {status.replace('_', ' ')}
                      </button>
                    ))}
                  </div>
                )}

                {actionError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</div>}
              </div>

              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-slate-600">
                  Observations & history
                </summary>
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {detail.observations.map((o) => (
                    <li key={o.id}>
                      [{o.source}] {o.category} · {o.severity} · {new Date(o.timestamp).toLocaleString()}
                    </li>
                  ))}
                </ul>
                <ul className="mt-2 space-y-1 text-xs text-slate-500">
                  {detail.history.slice(0, 10).map((h) => (
                    <li key={h.id}>
                      {new Date(h.created_at).toLocaleString()} — {h.status_change}
                    </li>
                  ))}
                </ul>
              </details>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
