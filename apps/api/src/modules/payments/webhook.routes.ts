import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { CardPaymentService } from "./card-payment.service.js";
import { getEnv } from "../../config/env.js";

/**
 * Stripe webhook handler.
 *
 * This endpoint receives events from Stripe when payment statuses change.
 * It MUST:
 *   1. Verify the webhook signature (prevents replay attacks)
 *   2. Process the event idempotently (Stripe may send the same event twice)
 *   3. Return 200 quickly (Stripe retries on timeout)
 *
 * IMPORTANT: This route does NOT use JWT auth — it's authenticated via
 * Stripe's webhook signature. It must be registered OUTSIDE the auth middleware.
 */
export async function webhookRoutes(app: FastifyInstance) {
  const env = getEnv();
  const cardPaymentService = new CardPaymentService(app.db, app.stripe);

  /**
   * POST /webhooks/stripe — Handle Stripe webhook events
   *
   * Raw body parsing is required for signature verification.
   */
  app.post("/stripe", {
    config: {
      // Tell Fastify to pass the raw body for signature verification
      rawBody: true,
    },
  }, async (request, reply) => {
    const signature = request.headers["stripe-signature"];
    if (!signature) {
      return reply.status(400).send({ error: "Missing stripe-signature header" });
    }

    let event: Stripe.Event;
    try {
      // Verify the webhook signature
      // In production, rawBody comes from fastify-raw-body plugin
      // For now, use the body directly (configure rawBody in production)
      const body = typeof request.body === "string"
        ? request.body
        : JSON.stringify(request.body);

      event = app.stripe.webhooks.constructEvent(
        body,
        signature as string,
        env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      app.log.warn(`Webhook signature verification failed: ${message}`);
      return reply.status(400).send({ error: "Invalid signature" });
    }

    app.log.info(`Processing Stripe event: ${event.type} (${event.id})`);

    try {
      switch (event.type) {
        case "payment_intent.succeeded": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          // Only process events with our metadata (ignore unrelated PaymentIntents)
          if (paymentIntent.metadata["commerce_os_order_id"]) {
            await cardPaymentService.handlePaymentSucceeded(paymentIntent);
          }
          break;
        }

        case "payment_intent.payment_failed": {
          const paymentIntent = event.data.object as Stripe.PaymentIntent;
          if (paymentIntent.metadata["commerce_os_order_id"]) {
            await cardPaymentService.handlePaymentFailed(paymentIntent);
          }
          break;
        }

        case "account.updated": {
          // Connected account was updated — could check onboarding status
          const account = event.data.object as Stripe.Account;
          app.log.info(
            `Connected account ${account.id} updated. charges_enabled=${account.charges_enabled}`,
          );
          break;
        }

        default:
          // Acknowledge events we don't handle
          app.log.debug(`Unhandled Stripe event type: ${event.type}`);
      }
    } catch (err) {
      // Log but still return 200 — we don't want Stripe retrying on our bugs
      app.log.error(err, `Error processing Stripe event ${event.id}`);
    }

    // Always return 200 to acknowledge receipt
    return reply.status(200).send({ received: true });
  });
}
