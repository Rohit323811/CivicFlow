import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Header from './components/Header.jsx'
import Home from './pages/Home.jsx'
import Map from './pages/Map.jsx'
import Report from './pages/Report.jsx'
import Authority from './pages/Authority.jsx'
import Admin from './pages/Admin.jsx'
import MyReports from './pages/MyReports.jsx'
import Login from './pages/Login.jsx'
import { useAuth } from './auth.jsx'

function RequireRole({ minimumRole, children }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="text-center text-slate-500">Loading…</div>
  }
  if (!session) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }
  if (!profile) {
    return <div className="text-center text-slate-500">Setting up your profile…</div>
  }

  const rank = { citizen: 1, authority: 2, admin: 3 }
  if ((rank[profile.role] ?? 0) < rank[minimumRole]) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
        <h1 className="text-lg font-bold text-amber-900">Not authorized</h1>
        <p className="mt-1 text-sm text-amber-800">
          This area requires the <strong>{minimumRole}</strong> role. Your account is{' '}
          <strong>{profile.role}</strong>.
        </p>
      </div>
    )
  }
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-50 text-slate-900">
        <Header />
        <main className="mx-auto max-w-6xl px-4 py-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/map" element={<Map />} />
            <Route path="/report" element={<Report />} />
            <Route
              path="/my-reports"
              element={
                <RequireRole minimumRole="citizen">
                  <MyReports />
                </RequireRole>
              }
            />
            <Route
              path="/authority"
              element={
                <RequireRole minimumRole="authority">
                  <Authority />
                </RequireRole>
              }
            />
            <Route
              path="/admin"
              element={
                <RequireRole minimumRole="admin">
                  <Admin />
                </RequireRole>
              }
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
