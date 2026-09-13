export default function Home() {
  return (
    <section>
      <h1 className="text-4xl font-extrabold tracking-tight">CivicFlow</h1>
      <p className="mt-4 max-w-2xl text-lg text-slate-600">
        AI-powered civic damage intelligence — combining citizen reports, public datasets,
        weather signals, and geospatial data to detect, verify, prioritize, and track civic
        infrastructure issues.
      </p>
      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        {['Potholes', 'Water leaks', 'Streetlights', 'Garbage', 'Flooding'].map((tag) => (
          <span key={tag} className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">
            {tag}
          </span>
        ))}
      </div>
      <p className="mt-10 text-sm text-slate-500">
        Project scaffold only — features are coming in future commits.
      </p>
    </section>
  )
}
