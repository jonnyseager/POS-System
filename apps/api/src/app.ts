import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import { getEnv } from "./config/env.js";
import { dbPlugin } from "./lib/db-plugin.js";
import { authPlugin } from "./modules/auth/auth.plugin.js";
import { catalogPlugin } from "./modules/catalog/catalog.plugin.js";

export async function buildApp() {
  const env = getEnv();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === "development" && {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
    },
  });

  // Core plugins
  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  await app.register(sensible);
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  // Database
  await app.register(dbPlugin);

  // Health check
  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  }));

  // API modules — each is a self-contained Fastify plugin
  await app.register(authPlugin, { prefix: "/api/v1/auth" });
  await app.register(catalogPlugin, { prefix: "/api/v1" });

  // Future modules (uncomment as built):
  // await app.register(ordersPlugin, { prefix: "/api/v1" });
  // await app.register(syncPlugin, { prefix: "/api/v1/sync" });
  // await app.register(paymentsPlugin, { prefix: "/api/v1/payments" });
  // await app.register(reportingPlugin, { prefix: "/api/v1/reports" });

  return app;
}
