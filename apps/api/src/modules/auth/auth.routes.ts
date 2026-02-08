import type { FastifyInstance } from "fastify";
import { registerSchema, loginSchema, refreshTokenSchema } from "@commerce-os/validation";
import { AuthService } from "./auth.service.js";

export async function authRoutes(app: FastifyInstance) {
  const authService = new AuthService(app.db, app.jwt);

  /** POST /register — Create a new account and tenant */
  app.post("/register", async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const result = await authService.register(body);
    reply.code(201).send({ success: true, data: result });
  });

  /** POST /login — Authenticate with email and password */
  app.post("/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const result = await authService.login(body);
    if (!result) {
      return reply.unauthorized("Invalid email or password");
    }
    reply.send({ success: true, data: result });
  });

  /** POST /refresh — Exchange a refresh token for new tokens */
  app.post("/refresh", async (request, reply) => {
    const body = refreshTokenSchema.parse(request.body);
    const result = await authService.refresh(body.refreshToken);
    if (!result) {
      return reply.unauthorized("Invalid or expired refresh token");
    }
    reply.send({ success: true, data: result });
  });
}
