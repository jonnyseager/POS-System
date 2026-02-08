import type { FastifyRequest, FastifyReply } from "fastify";

export interface JWTPayload {
  userId: string;
  tenantId: string;
  role: string;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload;
  }
}

/**
 * Authentication middleware. Verifies JWT and attaches user to request.
 * Use as a preHandler on routes that require authentication.
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    await request.jwtVerify();
  } catch (_err) {
    reply.unauthorized("Invalid or expired authentication token");
  }
}

/**
 * Extracts the tenant ID from the authenticated user's JWT.
 * Must be called after authenticate middleware.
 */
export function getTenantId(request: FastifyRequest): string {
  return request.user.tenantId;
}

/**
 * Extracts the user ID from the authenticated user's JWT.
 * Must be called after authenticate middleware.
 */
export function getUserId(request: FastifyRequest): string {
  return request.user.userId;
}
