import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/map', label: 'Map' },
  { to: '/report', label: 'Report' },
  { to: '/my-reports', label: 'My reports' },
  { to: '/authority', label: 'Authority' },
  { to: '/admin', label: 'Admin' },
]

export default function Header() {
  const { session, profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSignOut() {
    await signOut()
    setMenuOpen(false)
    navigate('/')
  }

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
        <NavLink to="/" className="text-xl font-extrabold tracking-tight text-slate-900">
          CivicFlow
        </NavLink>

        <nav className="flex flex-wrap gap-1">
          {links.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="text-sm">
          {session ? (
            <div className="relative">
              <button
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-100"
              >
                <span className="font-medium text-slate-800">{profile?.name ?? session.user.email}</span>
                {profile?.role && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                    {profile.role}
                  </span>
                )}
              </button>
              {menuOpen && (
                <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <div className="px-3 py-1.5 text-xs text-slate-500">{session.user.email}</div>
                  <button
                    onClick={handleSignOut}
                    className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <NavLink
              to="/login"
              className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white hover:bg-slate-700"
            >
              Sign in
            </NavLink>
          )}
        </div>
      </div>
    </header>
  )
}
