import { Router } from 'express'

import { postReport, getMyReports } from '../controllers/report.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.use(requireAuth)

router.post('/', postReport)
router.get('/mine', getMyReports)

export default router
