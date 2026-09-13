/**
 * 404 handler for API routes that don't exist.
 */
export function notFound(req, res) {
  res.status(404).json({
    error: 'Not found',
    path: req.originalUrl,
  })
}
