import { useState, useEffect } from 'react'

export default function Admin() {
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('analytics')

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/analytics/summary')
      if (res.ok) {
        const result = await res.json()
        setAnalytics(result.data)
      }
    } catch (err) {
      console.error('Error loading analytics:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Admin Management Console</h1>
        <p className="mt-2 text-slate-600">
          Manage system users, departments, external data sources, collector runs, and platform analytics.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 border-b border-slate-200">
        {['analytics', 'departments', 'sources', 'runs'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 text-sm font-semibold capitalize border-b-2 transition ${
              activeTab === tab
                ? 'border-sky-600 text-sky-600'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'analytics' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Total Tracked Issues</p>
                <h3 className="text-3xl font-bold text-slate-900 mt-1">{analytics?.total_issues || 0}</h3>
              </div>
              <div className="w-12 h-12 bg-sky-100 rounded-full flex items-center justify-center text-sky-600 font-bold">
                #
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 font-medium">Total Ingested Observations</p>
                <h3 className="text-3xl font-bold text-slate-900 mt-1">{analytics?.total_observations || 0}</h3>
              </div>
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 font-bold">
                Obs
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3 text-sm">Issues by Category</h3>
              <div className="space-y-2">
                {Object.entries(analytics?.by_category || {}).map(([cat, count]) => (
                  <div key={cat} className="flex justify-between text-xs py-1 border-b border-slate-100">
                    <span className="text-slate-600 font-medium">{cat}</span>
                    <span className="font-bold text-slate-900">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3 text-sm">Issues by Severity</h3>
              <div className="space-y-2">
                {Object.entries(analytics?.by_severity || {}).map(([sev, count]) => (
                  <div key={sev} className="flex justify-between text-xs py-1 border-b border-slate-100">
                    <span className="text-slate-600 font-medium uppercase">{sev}</span>
                    <span className="font-bold text-slate-900">{count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
              <h3 className="font-semibold text-slate-800 mb-3 text-sm">Issues by Status</h3>
              <div className="space-y-2">
                {Object.entries(analytics?.by_status || {}).map(([st, count]) => (
                  <div key={st} className="flex justify-between text-xs py-1 border-b border-slate-100">
                    <span className="text-slate-600 font-medium capitalize">{st}</span>
                    <span className="font-bold text-slate-900">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'departments' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 text-slate-800">Municipal Departments</h2>
          <div className="space-y-3">
            <div className="p-3 bg-slate-50 border rounded-lg flex justify-between text-sm">
              <span>Department of Transportation & Public Works</span>
              <span className="text-slate-500">dot@city.gov</span>
            </div>
            <div className="p-3 bg-slate-50 border rounded-lg flex justify-between text-sm">
              <span>Water and Sewerage Authority</span>
              <span className="text-slate-500">water@city.gov</span>
            </div>
            <div className="p-3 bg-slate-50 border rounded-lg flex justify-between text-sm">
              <span>Bureau of Street Lighting</span>
              <span className="text-slate-500">lighting@city.gov</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'sources' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 text-slate-800">Configured Data Sources</h2>
          <div className="space-y-3">
            <div className="p-3 bg-slate-50 border rounded-lg flex justify-between text-sm">
              <span>Citizen Reports (Mobile / Web)</span>
              <span className="text-emerald-600 font-medium">Reliability: 1.00</span>
            </div>
            <div className="p-3 bg-slate-50 border rounded-lg flex justify-between text-sm">
              <span>Weather API Signal Service</span>
              <span className="text-emerald-600 font-medium">Reliability: 0.90</span>
            </div>
            <div className="p-3 bg-slate-50 border rounded-lg flex justify-between text-sm">
              <span>OpenStreetMap Road Features</span>
              <span className="text-emerald-600 font-medium">Reliability: 0.85</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'runs' && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 text-slate-800">Collector Execution Logs</h2>
          <div className="space-y-3">
            <div className="p-3 bg-slate-50 border rounded-lg flex justify-between text-sm">
              <span>Weather API Collector</span>
              <span className="text-emerald-700 font-semibold">Status: Completed (1 fetched)</span>
            </div>
            <div className="p-3 bg-slate-50 border rounded-lg flex justify-between text-sm">
              <span>OpenStreetMap Collector</span>
              <span className="text-emerald-700 font-semibold">Status: Completed (1 fetched)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
