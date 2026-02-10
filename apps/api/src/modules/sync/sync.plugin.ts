import type { FastifyInstance } from "fastify";
import { syncRoutes } from "./sync.routes.js";

export async function syncPlugin(app: FastifyInstance) {
  await app.register(syncRoutes);
}
