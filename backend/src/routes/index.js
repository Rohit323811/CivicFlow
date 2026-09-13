import { Router } from 'express'

import healthRoutes from './health.routes.js'
import reportRoutes from './reports.routes.js'
import issueRoutes from './issues.routes.js'
import analyticsRoutes from './analytics.routes.js'
import adminRoutes from './admin.routes.js'

const router = Router()

router.use('/reports', reportRoutes)
router.use('/issues', issueRoutes)
router.use('/analytics', analyticsRoutes)
router.use('/', adminRoutes)

router.use(healthRoutes)

export default router
