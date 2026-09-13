import { useState, useEffect } from 'react'

export default function Authority() {
  const [issues, setIssues] = useState([])
  const [selectedIssue, setSelectedIssue] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionNotes, setActionNotes] = useState('')
  const [deptInput, setDeptInput] = useState('')
  const [statusInput, setStatusInput] = useState('in_progress')
  const [message, setMessage] = useState(null)
  const [error, setError] = useState(null)

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
      setError('Failed to load issues.')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectIssue = async (id) => {
    setMessage(null)
    setError(null)
    try {
      const res = await fetch(`/api/issues/${id}`)
      if (res.ok) {
        const result = await res.json()
        setSelectedIssue(result.data)
      }
    } catch (err) {
      setError('Failed to fetch issue details.')
    }
  }

  const handleVerifyAction = async (action) => {
    if (!selectedIssue) return
    setMessage(null)
    setError(null)

    try {
      const res = await fetch(`/api/issues/${selectedIssue.id}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes: actionNotes }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `Failed to ${action} issue`)

      setMessage(`Issue successfully marked as ${action}.`)
      setActionNotes('')
      handleSelectIssue(selectedIssue.id)
      fetchIssues()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleAssignDept = async (e) => {
    e.preventDefault()
    if (!selectedIssue || !deptInput) return
    setMessage(null)
    setError(null)

    try {
      const res = await fetch(`/api/issues/${selectedIssue.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department_id: deptInput }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to assign department')

      setMessage('Department successfully assigned.')
      setDeptInput('')
      handleSelectIssue(selectedIssue.id)
      fetchIssues()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleUpdateStatus = async (e) => {
    e.preventDefault()
    if (!selectedIssue) return
    setMessage(null)
    setError(null)

    try {
      const res = await fetch(`/api/issues/${selectedIssue.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: statusInput }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to update status')

      setMessage(`Issue status updated to ${statusInput}.`)
      handleSelectIssue(selectedIssue.id)
      fetchIssues()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Authority Operations Console</h1>
        <p className="mt-2 text-slate-600">
          Triage incoming reports, verify potential incidents, assign departments, and track issue resolution.
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Priority Issues List */}
        <div className="lg:col-span-1 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-slate-800">Priority Queue ({issues.length})</h2>
            <button
              onClick={fetchIssues}
              className="text-xs text-sky-600 hover:text-sky-800 font-medium"
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-slate-500">Loading incidents...</p>
          ) : issues.length === 0 ? (
            <p className="text-sm text-slate-500">No active incidents found.</p>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {issues.map((issue) => (
                <div
                  key={issue.id}
                  onClick={() => handleSelectIssue(issue.id)}
                  className={`p-4 rounded-lg border cursor-pointer transition ${
                    selectedIssue?.id === issue.id
                      ? 'border-sky-500 bg-sky-50'
                      : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <span className="font-semibold text-slate-900 text-sm">{issue.category}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-semibold uppercase ${
                        issue.severity === 'critical'
                          ? 'bg-rose-100 text-rose-800'
                          : issue.severity === 'high'
                          ? 'bg-orange-100 text-orange-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {issue.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2 line-clamp-2">
                    {issue.description || 'No description available'}
                  </p>
                  <div className="mt-3 flex justify-between items-center text-xs text-slate-500">
                    <span>Conf: {(issue.confidence * 100).toFixed(0)}%</span>
                    <span className="capitalize font-medium text-slate-700">{issue.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Issue Operations Detail */}
        <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          {!selectedIssue ? (
            <div className="text-center py-16 text-slate-500">
              Select an incident from the priority queue to triage, verify, assign, or update status.
            </div>
          ) : (
            <>
              <div className="border-b border-slate-200 pb-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-slate-900">{selectedIssue.category}</h2>
                  <span className="px-3 py-1 bg-slate-100 text-slate-800 font-semibold rounded-full text-xs uppercase">
                    Status: {selectedIssue.status}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mt-2">{selectedIssue.description || 'No description provided.'}</p>
                <div className="flex space-x-6 mt-4 text-xs text-slate-500">
                  <span>Coordinates: [{selectedIssue.lat}, {selectedIssue.lng}]</span>
                  <span>Confidence: {(selectedIssue.confidence * 100).toFixed(0)}%</span>
                  <span>Department: {selectedIssue.departments?.name || 'Unassigned'}</span>
                </div>
              </div>

              {/* Action 1: Verification / Triage */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                <h3 className="font-semibold text-slate-800 text-sm">1. Verification & Triage</h3>
                <textarea
                  rows="2"
                  placeholder="Verification notes or reasoning..."
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  className="w-full text-sm rounded border-slate-300 border p-2 text-slate-800"
                ></textarea>
                <div className="flex space-x-3">
                  <button
                    onClick={() => handleVerifyAction('verified')}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded shadow"
                  >
                    Verify Incident
                  </button>
                  <button
                    onClick={() => handleVerifyAction('rejected')}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded shadow"
                  >
                    Reject Incident
                  </button>
                  <button
                    onClick={() => handleVerifyAction('merged')}
                    className="px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold rounded shadow"
                  >
                    Merge Duplicate
                  </button>
                </div>
              </div>

              {/* Action 2: Department Assignment */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                <h3 className="font-semibold text-slate-800 text-sm">2. Department Assignment</h3>
                <form onSubmit={handleAssignDept} className="flex space-x-3">
                  <input
                    type="text"
                    placeholder="Enter Department UUID..."
                    value={deptInput}
                    onChange={(e) => setDeptInput(e.target.value)}
                    className="flex-1 text-sm rounded border-slate-300 border p-2 text-slate-800"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold rounded shadow"
                  >
                    Assign Department
                  </button>
                </form>
              </div>

              {/* Action 3: Status Transition */}
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-3">
                <h3 className="font-semibold text-slate-800 text-sm">3. Status Management</h3>
                <form onSubmit={handleUpdateStatus} className="flex space-x-3">
                  <select
                    value={statusInput}
                    onChange={(e) => setStatusInput(e.target.value)}
                    className="flex-1 text-sm rounded border-slate-300 border p-2 text-slate-800"
                  >
                    <option value="potential">potential</option>
                    <option value="verified">verified</option>
                    <option value="in_progress">in_progress</option>
                    <option value="resolved">resolved</option>
                    <option value="rejected">rejected</option>
                  </select>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded shadow"
                  >
                    Update Status
                  </button>
                </form>
              </div>

              {/* Observations & History Tab */}
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-800 text-sm">Attached Observations ({selectedIssue.observations?.length || 0})</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {selectedIssue.observations?.map((obs) => (
                    <div key={obs.id} className="p-2 bg-white rounded border border-slate-200 text-xs flex justify-between">
                      <span>Source: <strong>{obs.source}</strong> ({obs.category})</span>
                      <span className="text-slate-500">{new Date(obs.timestamp).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
