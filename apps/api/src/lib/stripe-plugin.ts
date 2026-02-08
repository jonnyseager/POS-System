import fp from "fastify-plugin";
import Stripe from "stripe";
import { getEnv } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    stripe: Stripe;
  }
}

/**
 * Fastify plugin that provides a configured Stripe client.
 *
 * Access via `app.stripe` in any route handler.
 * Uses the Stripe API version pinned at build time for stability.
 */
export const stripePlugin = fp(async (app) => {
  const env = getEnv();

  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    typescript: true,
    appInfo: {
      name: "Commerce OS",
      version: "0.1.0",
    },
  });

  app.decorate("stripe", stripe);

  app.log.info("Stripe client initialised");
});
