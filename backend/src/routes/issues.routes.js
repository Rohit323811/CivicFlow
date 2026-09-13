import { Router } from 'express'

import {
  getIssues,
  getIssueById,
  postVerify,
  postAssign,
  postStatus,
} from '../controllers/issue.controller.js'
import { requireAuth, requireRole, optionalAuth } from '../middleware/auth.js'

const router = Router()

// Public reads (visibility filtering happens in the service per viewer role)
router.get('/', optionalAuth, getIssues)
router.get('/:id', optionalAuth, getIssueById)

// Authority lifecycle actions
router.post('/:id/verify', requireAuth, requireRole('authority'), postVerify)
router.post('/:id/assign', requireAuth, requireRole('authority'), postAssign)
router.post('/:id/status', requireAuth, requireRole('authority'), postStatus)

export default router
