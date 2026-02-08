import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { stripeConnectRoutes } from "./stripe-connect.routes.js";
import { stripeTerminalRoutes } from "./stripe-terminal.routes.js";
import { cardPaymentRoutes } from "./card-payment.routes.js";

/**
 * Payments plugin — all Stripe-related routes.
 *
 * Note: webhook routes are registered separately (no auth middleware).
 */
export const paymentsPlugin = fp(async (app: FastifyInstance) => {
  await app.register(stripeConnectRoutes, { prefix: "/connect" });
  await app.register(stripeTerminalRoutes, { prefix: "/terminal" });
  await app.register(cardPaymentRoutes, { prefix: "/card" });
});
