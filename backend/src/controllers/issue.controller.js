import * as issueService from '../services/issue.service.js'

export async function listIssues(req, res, next) {
  try {
    const { category, severity, status, bounds } = req.query
    const issues = await issueService.getIssues({ category, severity, status, bounds })
    return res.json({ data: issues })
  } catch (err) {
    next(err)
  }
}

export async function getIssueDetails(req, res, next) {
  try {
    const { id } = req.params
    const issue = await issueService.getIssueById(id)

    if (!issue) {
      return res.status(404).json({ error: 'Issue not found.' })
    }

    return res.json({ data: issue })
  } catch (err) {
    next(err)
  }
}

export async function verifyIssue(req, res, next) {
  try {
    const { id } = req.params
    const { action, notes } = req.body
    const actorId = req.user ? req.user.id : null

    if (!action) {
      return res.status(400).json({ error: 'Action is required (verified, rejected, or merged).' })
    }

    const result = await issueService.verifyIssue(id, { action, notes, actorId })
    return res.json({
      message: `Issue successfully marked as ${action}.`,
      data: result,
    })
  } catch (err) {
    next(err)
  }
}

export async function assignDepartment(req, res, next) {
  try {
    const { id } = req.params
    const { department_id } = req.body
    const actorId = req.user ? req.user.id : null

    if (!department_id) {
      return res.status(400).json({ error: 'department_id is required.' })
    }

    const updatedIssue = await issueService.assignDepartment(id, { departmentId: department_id, actorId })
    return res.json({
      message: 'Department assigned successfully.',
      data: updatedIssue,
    })
  } catch (err) {
    next(err)
  }
}

export async function updateStatus(req, res, next) {
  try {
    const { id } = req.params
    const { status } = req.body
    const actorId = req.user ? req.user.id : null

    if (!status) {
      return res.status(400).json({ error: 'status is required.' })
    }

    const updatedIssue = await issueService.updateStatus(id, { status, actorId })
    return res.json({
      message: 'Issue status updated successfully.',
      data: updatedIssue,
    })
  } catch (err) {
    next(err)
  }
}
