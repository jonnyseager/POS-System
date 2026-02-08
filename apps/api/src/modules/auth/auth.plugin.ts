import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { authRoutes } from "./auth.routes.js";

export const authPlugin = fp(async (app: FastifyInstance) => {
  await app.register(authRoutes);
});
