import { Router } from 'express'

import { getDepartments, listUsers, listDataSources } from '../controllers/admin.controller.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

router.get('/departments', requireAuth, getDepartments)
router.get('/admin/users', requireAuth, requireRole('admin'), listUsers)
router.get('/admin/data-sources', requireAuth, requireRole('admin'), listDataSources)

export default router
