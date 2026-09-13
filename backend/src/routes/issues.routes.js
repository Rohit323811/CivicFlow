import { Router } from 'express'
import * as issueController from '../controllers/issue.controller.js'
import { authenticateToken, optionalAuthenticateToken, requireRole } from '../middleware/auth.middleware.js'

const router = Router()

// GET /api/issues - list with filters
router.get('/', optionalAuthenticateToken, issueController.listIssues)

// GET /api/issues/:id - details + observations + history
router.get('/:id', optionalAuthenticateToken, issueController.getIssueDetails)

// POST /api/issues/:id/verify - Authority & Admin only
router.post(
  '/:id/verify',
  authenticateToken,
  requireRole('authority', 'admin'),
  issueController.verifyIssue
)

// POST /api/issues/:id/assign - Authority & Admin only
router.post(
  '/:id/assign',
  authenticateToken,
  requireRole('authority', 'admin'),
  issueController.assignDepartment
)

// POST /api/issues/:id/status - Authority & Admin only
router.post(
  '/:id/status',
  authenticateToken,
  requireRole('authority', 'admin'),
  issueController.updateStatus
)

export default router
