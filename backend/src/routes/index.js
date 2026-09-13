import { Router } from 'express'

import healthRoutes from './health.routes.js'
import reportsRoutes from './reports.routes.js'
import issuesRoutes from './issues.routes.js'
import analyticsRoutes from './analytics.routes.js'

const router = Router()

router.use(healthRoutes)
router.use('/reports', reportsRoutes)
router.use('/issues', issuesRoutes)
router.use('/analytics', analyticsRoutes)

export default router
