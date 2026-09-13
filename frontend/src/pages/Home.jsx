import { Link } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { Card } from '../components/ui.jsx'

const PIPELINE = [
  { step: '1', title: 'Collect', text: 'Citizen reports, open data, weather signals, and OpenStreetMap feeds flow into one normalized stream of observations.' },
  { step: '2', title: 'Match', text: 'Deduplication and geospatial clustering turn scattered observations into single, actionable incidents.' },
  { step: '3', title: 'Analyze', text: 'An AI service assesses cause, severity, confidence, and the right department — never auto-verifying.' },
  { step: '4', title: 'Act', text: 'Authorities verify, assign departments, and track issues from potential to resolved.' },
]

export default function Home() {
  const { session } = useAuth()

  return (
    <div className="space-y-10">
      <section className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">CivicFlow</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          AI-powered civic damage intelligence — combining citizen reports, public datasets, weather
          signals, and geospatial data to detect, verify, prioritize, and track civic infrastructure
          issues.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to="/report"
            className="rounded-lg bg-slate-900 px-5 py-2.5 font-semibold text-white hover:bg-slate-700"
          >
            Report an issue
          </Link>
          <Link
            to="/map"
            className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 font-semibold text-slate-700 hover:bg-slate-100"
          >
            View the map
          </Link>
          {!session && (
            <Link to="/login" className="rounded-lg px-5 py-2.5 font-semibold text-slate-600 hover:bg-slate-100">
              Sign in
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PIPELINE.map(({ step, title, text }) => (
          <Card key={step}>
            <div className="text-sm font-extrabold text-slate-400">STEP {step}</div>
            <h2 className="mt-1 text-lg font-bold">{title}</h2>
            <p className="mt-2 text-sm text-slate-600">{text}</p>
          </Card>
        ))}
      </section>

      <section className="flex flex-wrap gap-2 text-sm">
        {['Potholes', 'Water leaks', 'Streetlights', 'Garbage', 'Flooding', 'Drainage', 'Traffic signals'].map(
          (tag) => (
            <span key={tag} className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">
              {tag}
            </span>
          )
        )}
      </section>
    </div>
  )
}
