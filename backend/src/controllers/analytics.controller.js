import { getAnalyticsSummary } from '../services/analytics.service.js'
import { asyncHandler } from '../utils/httpError.js'

/** GET /api/analytics/summary — authority/admin aggregate dashboard payload. */
export const getSummary = asyncHandler(async (req, res) => {
  const summary = await getAnalyticsSummary()
  res.json(summary)
})
