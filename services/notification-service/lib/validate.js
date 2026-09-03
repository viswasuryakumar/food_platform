const { HttpError } = require("./http");

/**
 * Express middleware factory that validates a request against a Zod schema and
 * replaces the raw input with the parsed (and coerced) result.
 *
 * Validating at the edge means route handlers can assume well-formed input, so
 * they contain business logic instead of defensive type checks.
 *
 * @param {import('zod').ZodTypeAny} schema
 * @param {"body"|"query"|"params"} source
 */
function validate(schema, source = "body") {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join(".") || source,
        message: issue.message,
      }));

      const error = new HttpError(400, "Request validation failed", "VALIDATION_ERROR");
      error.details = details;
      return next(error);
    }

    // `query` and `params` are getter-only on Express 5, so assign in place.
    if (source === "body") {
      req.body = result.data;
    } else {
      req.validated = { ...(req.validated || {}), [source]: result.data };
    }

    return next();
  };
}

module.exports = { validate };
