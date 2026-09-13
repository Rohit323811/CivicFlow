/**
 * Centralized error handler. Keeps error details out of responses in
 * production. Expand later with logger integration and error taxonomy.
 */

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-console
  console.error(`[error] ${req.method} ${req.originalUrl}:`, err.message)

  const status = err.status || err.statusCode || 500

  res.status(status).json({
    error: status === 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message || 'Internal server error',
  })
}
