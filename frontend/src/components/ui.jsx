const CATEGORY_VALUES = [
  'ROAD_DAMAGE',
  'WATER_LEAK',
  'STREETLIGHT',
  'GARBAGE',
  'FLOODING',
  'DRAINAGE',
  'TRAFFIC_SIGNAL',
  'DAMAGED_SIGN',
  'OTHER',
]

const CATEGORY_LABELS = {
  ROAD_DAMAGE: 'Road damage',
  WATER_LEAK: 'Water leak',
  STREETLIGHT: 'Streetlight',
  GARBAGE: 'Garbage',
  FLOODING: 'Flooding',
  DRAINAGE: 'Drainage',
  TRAFFIC_SIGNAL: 'Traffic signal',
  DAMAGED_SIGN: 'Damaged sign',
  OTHER: 'Other',
}

const SEVERITY_STYLES = {
  low: 'bg-slate-100 text-slate-700',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
}

const STATUS_STYLES = {
  potential: 'bg-yellow-100 text-yellow-800',
  verified: 'bg-blue-100 text-blue-800',
  assigned: 'bg-indigo-100 text-indigo-800',
  in_progress: 'bg-cyan-100 text-cyan-700',
  resolved: 'bg-green-100 text-green-800',
  rejected: 'bg-slate-200 text-slate-600',
  merged: 'bg-slate-100 text-slate-500',
}

const MARKER_COLORS = {
  low: '#94a3b8',
  medium: '#f59e0b',
  high: '#f97316',
  critical: '#dc2626',
}

export function Badge({ children, tone = 'bg-slate-100 text-slate-700' }) {
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{children}</span>
}

export function SeverityBadge({ value }) {
  return <Badge tone={SEVERITY_STYLES[value] ?? SEVERITY_STYLES.low}>{value}</Badge>
}

export function StatusBadge({ value }) {
  return <Badge tone={STATUS_STYLES[value] ?? STATUS_STYLES.potential}>{String(value).replace('_', ' ')}</Badge>
}

export function CategoryBadge({ value }) {
  return <Badge>{CATEGORY_LABELS[value] ?? value}</Badge>
}

export function markerColorForSeverity(severity) {
  return MARKER_COLORS[severity] ?? MARKER_COLORS.low
}

export { CATEGORY_VALUES, CATEGORY_LABELS }

export function Card({ title, children, actions = null }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {title && (
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          {actions}
        </div>
      )}
      {children}
    </div>
  )
}

export function Stat({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm">
      <div className="text-2xl font-extrabold text-slate-900">{value ?? '–'}</div>
      <div className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  )
}

export function EmptyState({ children }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>
}
