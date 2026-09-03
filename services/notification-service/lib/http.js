/**
 * Small HTTP helpers shared by the route handlers.
 *
 * Each service owns its copy of these rather than importing a shared package.
 * That is a deliberate trade-off: a little duplication in exchange for services
 * that can be deployed independently without lockstep releases of a common lib.
 */

/** Error carrying an HTTP status code, so handlers can throw instead of branching. */
class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Wraps an async route handler so a rejected promise reaches Express's error
 * middleware. Without this, an async throw becomes an unhandled rejection and
 * the request hangs until the client times out.
 */
function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/** Terminal error middleware. Must be registered last, and must take 4 args. */
function errorHandler(serviceName) {
  return (err, req, res, _next) => {
    const status = err.status || 500;

    if (status >= 500) {
      console.error(`[${serviceName}] ${req.method} ${req.originalUrl} failed:`, err);
    }

    res.status(status).json({
      error: {
        message: status >= 500 ? "Internal server error" : err.message,
        code: err.code || (status >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR"),
        // Field-level validation failures, when present.
        ...(err.details ? { details: err.details } : {}),
      },
    });
  };
}

/** 404 fallback for unmatched routes. */
function notFoundHandler(req, res) {
  res.status(404).json({
    error: { message: `No route for ${req.method} ${req.originalUrl}`, code: "NOT_FOUND" },
  });
}

module.exports = { HttpError, asyncHandler, errorHandler, notFoundHandler };
