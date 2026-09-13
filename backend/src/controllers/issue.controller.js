import { CATEGORY_VALUES, SEVERITY_VALUES, ISSUE_STATUS_VALUES, requireEnum, parseBounds } from '../utils/validation.js'
import { listIssues, getIssueDetail, verifyIssue, assignIssue, updateIssueStatus } from '../services/issue.service.js'
import { httpError, asyncHandler } from '../utils/httpError.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function requireIssueId(value) {
  if (!UUID_RE.test(String(value ?? ''))) {
    throw httpError(400, 'issue id must be a valid uuid')
  }
  return value
}

/** GET /api/issues?category=&severity=&status=&minLat=&minLng=&maxLat=&maxLng=&limit= */
export const getIssues = asyncHandler(async (req, res) => {
  const viewerRole = req.user?.profile?.role ?? null

  let category
  if (req.query.category) {
    category = requireEnum({ category: req.query.category }, 'category', CATEGORY_VALUES)
  }
  let severity
  if (req.query.severity) {
    severity = requireEnum({ severity: req.query.severity }, 'severity', SEVERITY_VALUES)
  }
  let status
  if (req.query.status) {
    status = requireEnum({ status: req.query.status }, 'status', ISSUE_STATUS_VALUES)
  }

  const issues = await listIssues(
    {
      category,
      severity,
      status,
      bounds: parseBounds(req.query),
      limit: req.query.limit ? Math.min(Number(req.query.limit) || 200, 500) : undefined,
    },
    viewerRole
  )

  res.json({ issues })
})

/** GET /api/issues/:id — detail with observations, history, verification events. */
export const getIssueById = asyncHandler(async (req, res) => {
  const id = requireIssueId(req.params.id)
  const viewerRole = req.user?.profile?.role ?? null
  const detail = await getIssueDetail(id, viewerRole)
  res.json(detail)
})

/** POST /api/issues/:id/verify — authority verify/reject/merge. */
export const postVerify = asyncHandler(async (req, res) => {
  const id = requireIssueId(req.params.id)
  const body = req.body ?? {}

  if (!['verified', 'rejected', 'merged'].includes(body.decision)) {
    throw httpError(400, "decision must be one of 'verified', 'rejected', 'merged'")
  }

  const result = await verifyIssue(id, req.user.profile.id, body.decision, {
    notes: typeof body.notes === 'string' ? body.notes.slice(0, 1000) : null,
    mergeIntoIssueId: body.mergeIntoIssueId ?? null,
  })

  res.status(200).json(result)
})

/** POST /api/issues/:id/assign — authority assigns a department. */
export const postAssign = asyncHandler(async (req, res) => {
  const id = requireIssueId(req.params.id)
  const departmentId = req.body?.departmentId

  const UUID_STRICT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_STRICT.test(String(departmentId ?? ''))) {
    throw httpError(400, 'departmentId must be a valid uuid')
  }

  const issue = await assignIssue(id, departmentId, req.user.profile.id)
  res.status(200).json(issue)
})

/** POST /api/issues/:id/status — authority changes status (validated transition). */
export const postStatus = asyncHandler(async (req, res) => {
  const id = requireIssueId(req.params.id)
  const status = requireEnum(req.body ?? {}, 'status', ISSUE_STATUS_VALUES)

  const issue = await updateIssueStatus(id, status, req.user.profile.id)
  res.status(200).json(issue)
})
