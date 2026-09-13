/**
 * Create an Error carrying an HTTP status so the centralized error handler
 * (middleware/errorHandler.js) responds with the right code.
 */
export function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

/**
 * Wrap an async route handler so rejections reach the error handler
 * (Express 4 does not catch rejected promises from async handlers).
 */
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}
