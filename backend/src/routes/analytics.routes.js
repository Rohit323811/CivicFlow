import { Router } from 'express'
import * as analyticsController from '../controllers/analytics.controller.js'
import { optionalAuthenticateToken } from '../middleware/auth.middleware.js'

const router = Router()

// GET /api/analytics/summary
router.get('/summary', optionalAuthenticateToken, analyticsController.getSummary)

export default router
