import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { reportingRoutes } from "./reporting.routes.js";

export const reportingPlugin = fp(async (app: FastifyInstance) => {
  await app.register(reportingRoutes, { prefix: "/reports" });
});
