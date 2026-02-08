import type { FastifyInstance, FastifyError } from "fastify";
import { ZodError } from "zod";

/**
 * Global error handler.
 *
 * Catches Zod validation errors and returns structured 400 responses.
 * All other errors return 500 (in production) or the full error (in development).
 */
export function setupErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError | Error, _request, reply) => {
    // Zod validation errors → 400 with field-level detail
    if (error instanceof ZodError) {
      return reply.status(400).send({
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Request validation failed",
          details: error.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        },
      });
    }

    // Fastify's built-in HTTP errors (from @fastify/sensible)
    if ("statusCode" in error && typeof error.statusCode === "number") {
      return reply.status(error.statusCode).send({
        success: false,
        error: {
          code: "code" in error ? (error.code ?? "HTTP_ERROR") : "HTTP_ERROR",
          message: error.message,
        },
      });
    }

    // Unexpected errors
    app.log.error(error);
    return reply.status(500).send({
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message:
          process.env["NODE_ENV"] === "production"
            ? "An internal error occurred"
            : error.message,
      },
    });
  });
}
