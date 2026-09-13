/**
 * Legal status transitions for issues. Single source of truth for the API
 * layer; the database records every change in issue_history via trigger.
 *
 * Rules encoded:
 *  - nothing ever auto-verifies: 'potential' -> 'verified' requires an
 *    explicit authority action (POST /issues/:id/verify)
 *  - authority may assign directly from 'potential' (skips a redundant
 *    verify step when dispatching crews)
 *  - 'resolved', 'merged' are terminal
 *  - 'rejected' can be reopened to 'potential' (e.g. mistaken rejection)
 */
export const ISSUE_TRANSITIONS = {
  potential: ['verified', 'assigned', 'rejected', 'merged'],
  verified: ['assigned', 'rejected', 'merged'],
  assigned: ['in_progress', 'rejected', 'merged'],
  in_progress: ['resolved', 'rejected', 'merged'],
  resolved: [],
  rejected: ['potential'],
  merged: [],
}

export class TransitionError extends Error {
  constructor(from, to) {
    super(`Invalid status transition: ${from} -> ${to}`)
    this.name = 'TransitionError'
    this.from = from
    this.to = to
    this.status = 409
  }
}

export function canTransition(from, to) {
  return (ISSUE_TRANSITIONS[from] ?? []).includes(to)
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    throw new TransitionError(from, to)
  }
}
