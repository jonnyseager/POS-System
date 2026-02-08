import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { uuidSchema, penceSchema } from "@commerce-os/validation";
import { CardPaymentService, PaymentError } from "./card-payment.service.js";
import { authenticate, getTenantId } from "../../middleware/authenticate.js";

export async function cardPaymentRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  const cardPaymentService = new CardPaymentService(app.db, app.stripe);

  /**
   * POST /payments/card/create-intent — Create a PaymentIntent for a card payment
   *
   * The POS app calls this when the customer wants to pay by card.
   * Returns a client_secret that the POS passes to the Stripe Terminal SDK.
   */
  app.post("/create-intent", async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = z.object({
      orderId: uuidSchema,
      amount: penceSchema.min(1),
      tipAmount: penceSchema.default(0),
    }).parse(request.body);

    try {
      const result = await cardPaymentService.createPaymentIntent({
        orderId: body.orderId,
        tenantId,
        amount: body.amount,
        tipAmount: body.tipAmount,
      });

      return reply.code(201).send({ success: true, data: result });
    } catch (err) {
      if (err instanceof PaymentError) {
        return reply.badRequest(err.message);
      }
      throw err;
    }
  });

  /**
   * POST /payments/card/cancel — Cancel a pending PaymentIntent
   *
   * Called when the customer cancels before tapping their card.
   */
  app.post("/cancel", async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = z.object({
      paymentIntentId: z.string().min(1),
    }).parse(request.body);

    try {
      const result = await cardPaymentService.cancelPaymentIntent(
        body.paymentIntentId,
        tenantId,
      );
      return { success: true, data: result };
    } catch (err) {
      if (err instanceof PaymentError) {
        return reply.badRequest(err.message);
      }
      throw err;
    }
  });

  /**
   * POST /payments/card/refund — Refund a completed card payment
   *
   * Supports full and partial refunds.
   */
  app.post("/refund", async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = z.object({
      paymentId: uuidSchema,
      amount: penceSchema.optional(),
      reason: z.string().max(500).optional(),
    }).parse(request.body);

    try {
      const result = await cardPaymentService.refundPayment({
        paymentId: body.paymentId,
        tenantId,
        amount: body.amount,
        reason: body.reason,
      });
      return { success: true, data: result };
    } catch (err) {
      if (err instanceof PaymentError) {
        return reply.badRequest(err.message);
      }
      throw err;
    }
  });
}
