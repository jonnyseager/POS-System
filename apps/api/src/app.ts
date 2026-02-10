import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import { getEnv } from "./config/env.js";
import { dbPlugin } from "./lib/db-plugin.js";
import { setupErrorHandler } from "./lib/error-handler.js";
import { stripePlugin } from "./lib/stripe-plugin.js";
import { authPlugin } from "./modules/auth/auth.plugin.js";
import { catalogPlugin } from "./modules/catalog/catalog.plugin.js";
import { ordersPlugin } from "./modules/orders/orders.plugin.js";
import { paymentsPlugin } from "./modules/payments/payments.plugin.js";
import { webhookRoutes } from "./modules/payments/webhook.routes.js";
import { reportingPlugin } from "./modules/reporting/reporting.plugin.js";
import { syncPlugin } from "./modules/sync/sync.plugin.js";

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

  // Global error handler (Zod validation, HTTP errors, unexpected errors)
  setupErrorHandler(app);

  // Core plugins
  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  await app.register(sensible);
  await app.register(jwt, { secret: env.JWT_SECRET });
  await app.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
  });

  // Database & Stripe
  await app.register(dbPlugin);
  await app.register(stripePlugin);

  // Health check
  app.get("/health", async () => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "0.1.0",
  }));

  // API modules — each is a self-contained Fastify plugin
  await app.register(authPlugin, { prefix: "/api/v1/auth" });
  await app.register(catalogPlugin, { prefix: "/api/v1" });
  await app.register(ordersPlugin, { prefix: "/api/v1" });
  await app.register(paymentsPlugin, { prefix: "/api/v1/payments" });
  await app.register(reportingPlugin, { prefix: "/api/v1" });

  // Sync — offline-first push/pull protocol
  await app.register(syncPlugin, { prefix: "/api/v1/sync" });

  // Webhook routes — NO auth middleware (verified via Stripe signature)
  await app.register(webhookRoutes, { prefix: "/webhooks" });

  return app;
}
