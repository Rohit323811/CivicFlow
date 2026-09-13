import { Router } from 'express'

import healthRoutes from './health.routes.js'

const router = Router()

// Feature routes will be mounted here in future commits
// e.g. router.use('/reports', reportRoutes)

router.use(healthRoutes)

export default router
