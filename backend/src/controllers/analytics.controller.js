import * as analyticsService from '../services/analytics.service.js'

export async function getSummary(req, res, next) {
  try {
    const summary = await analyticsService.getSummaryAnalytics()
    return res.json({ data: summary })
  } catch (err) {
    next(err)
  }
}
