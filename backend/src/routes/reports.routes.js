import { Router } from 'express'
import * as reportController from '../controllers/report.controller.js'
import { optionalAuthenticateToken } from '../middleware/auth.middleware.js'

const router = Router()

// POST /api/reports - Citizens submit a report (optional authentication)
router.post('/', optionalAuthenticateToken, reportController.submitReport)

export default router
