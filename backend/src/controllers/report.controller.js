import * as reportService from '../services/report.service.js'

export async function submitReport(req, res, next) {
  try {
    const { category, description, lat, lng, severity, evidence } = req.body

    if (!category || lat === undefined || lng === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: category, lat, and lng are required.',
      })
    }

    const userId = req.user ? req.user.id : null

    const result = await reportService.createReportData({
      category,
      description,
      lat,
      lng,
      severity,
      evidence,
      userId,
    })

    return res.status(201).json({
      message: 'Report submitted successfully.',
      data: result,
    })
  } catch (err) {
    next(err)
  }
}
