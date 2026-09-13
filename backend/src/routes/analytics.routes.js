import { Router } from 'express'

import { getSummary } from '../controllers/analytics.controller.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

router.get('/summary', requireAuth, requireRole('authority'), getSummary)

export default router
