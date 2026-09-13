import {
  CATEGORY_VALUES,
  SEVERITY_VALUES,
  requireFields,
  requireNumber,
  requireEnum,
  requireEnumIfPresent,
} from '../utils/validation.js'
import { createReport, listMyReports } from '../services/report.service.js'
import { asyncHandler } from '../utils/httpError.js'

/**
 * POST /api/reports — citizen submits a report.
 * Creates an observation; the database trigger auto-creates the potential issue.
 */
export const postReport = asyncHandler(async (req, res) => {
  const body = req.body ?? {}

  requireFields(body, ['category', 'lat', 'lng'])
  const category = requireEnum(body, 'category', CATEGORY_VALUES)
  const severity = requireEnumIfPresent(body, 'severity', SEVERITY_VALUES)
  const lat = requireNumber(body, 'lat')
  const lng = requireNumber(body, 'lng')

  if (lat < -90 || lat > 90) throw httpError4('lat must be within [-90, 90]')
  if (lng < -180 || lng > 180) throw httpError4('lng must be within [-180, 180]')
  if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') {
    throw httpError4('description must be a string')
  }
  if (body.evidence !== undefined && (typeof body.evidence !== 'object' || Array.isArray(body.evidence))) {
    throw httpError4('evidence must be a JSON object')
  }

  const result = await createReport(req.user.profile.id, {
    category,
    description: body.description ?? null,
    lat,
    lng,
    severity,
    evidence: body.evidence,
  })

  res.status(201).json(result)
})

/** GET /api/reports/mine — observations submitted by the caller. */
export const getMyReports = asyncHandler(async (req, res) => {
  const reports = await listMyReports(req.user.profile.id)
  res.json({ reports })
})

function httpError4(message) {
  const error = new Error(message)
  error.status = 400
  return error
}
