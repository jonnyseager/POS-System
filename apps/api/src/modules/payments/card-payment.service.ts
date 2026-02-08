import Stripe from "stripe";
import { eq, and } from "drizzle-orm";
import { schema } from "@commerce-os/db";
import type { Database } from "@commerce-os/db";

/**
 * CardPaymentService handles the Stripe PaymentIntent lifecycle for in-person payments.
 *
 * Flow:
 *   1. POS creates an order (our Orders module)
 *   2. POS calls createPaymentIntent — we create a Stripe PaymentIntent
 *      on the vendor's connected account
 *   3. POS uses Stripe Terminal SDK to collect the card and confirm payment
 *   4. Stripe sends a webhook (payment_intent.succeeded) — we mark payment as completed
 *   5. Order auto-completes when fully paid
 *
 * Key design decisions:
 *   - PaymentIntents are created on the connected account (destination charge model)
 *   - We use `transfer_data` to route funds to the vendor's account
 *   - Application fee is our revenue (configurable per tenant tier)
 *   - capture_method is "automatic" — payment captures immediately on card tap
 */
export class CardPaymentService {
  constructor(
    private readonly db: Database,
    private readonly stripe: Stripe,
  ) {}

  /**
   * Create a PaymentIntent for a card payment on an order.
   *
   * Returns the client_secret which the POS app passes to the Terminal SDK.
   */
  async createPaymentIntent(params: {
    orderId: string;
    tenantId: string;
    amount: number;
    tipAmount?: number;
  }) {
    const { orderId, tenantId, amount, tipAmount = 0 } = params;

    // Get the tenant's Stripe account
    const [tenant] = await this.db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    if (!tenant?.stripeAccountId) {
      throw new PaymentError("No Stripe account connected", "NO_STRIPE_ACCOUNT");
    }

    // Verify the order exists and is open
    const [order] = await this.db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)))
      .limit(1);

    if (!order) throw new PaymentError("Order not found", "ORDER_NOT_FOUND");
    if (order.status !== "open") throw new PaymentError("Order is not open", "ORDER_NOT_OPEN");

    const totalAmount = amount + tipAmount;

    // Calculate application fee (our platform revenue)
    // Phase 1: flat 1.5% — we'll make this configurable per tier later
    const applicationFeePercent = 150; // basis points (1.5%)
    const applicationFeeAmount = Math.round(totalAmount * applicationFeePercent / 10000);

    // Create the PaymentIntent on the connected account
    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: totalAmount,
      currency: "gbp",
      payment_method_types: ["card_present"],
      capture_method: "automatic",
      application_fee_amount: applicationFeeAmount,
      transfer_data: {
        destination: tenant.stripeAccountId,
      },
      metadata: {
        commerce_os_order_id: orderId,
        commerce_os_tenant_id: tenantId,
        commerce_os_tip_amount: String(tipAmount),
      },
    });

    // Create a pending payment record in our database
    const [payment] = await this.db
      .insert(schema.payments)
      .values({
        tenantId,
        orderId,
        paymentMethod: "card",
        amount,
        tipAmount,
        status: "pending",
        stripePaymentIntentId: paymentIntent.id,
      })
      .returning();

    return {
      paymentId: payment!.id,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret!,
      amount: totalAmount,
      applicationFee: applicationFeeAmount,
    };
  }

  /**
   * Handle a successful payment from Stripe webhook.
   *
   * Called when we receive `payment_intent.succeeded`.
   * Updates our payment record and auto-completes the order if fully paid.
   */
  async handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const orderId = paymentIntent.metadata["commerce_os_order_id"];
    const tenantId = paymentIntent.metadata["commerce_os_tenant_id"];

    if (!orderId || !tenantId) {
      throw new PaymentError(
        "PaymentIntent missing commerce_os metadata",
        "MISSING_METADATA",
      );
    }

    // Find our payment record
    const [payment] = await this.db
      .select()
      .from(schema.payments)
      .where(and(
        eq(schema.payments.stripePaymentIntentId, paymentIntent.id),
        eq(schema.payments.tenantId, tenantId),
      ))
      .limit(1);

    if (!payment) {
      throw new PaymentError(
        `No payment record for PaymentIntent ${paymentIntent.id}`,
        "PAYMENT_NOT_FOUND",
      );
    }

    // Extract card details from the charge
    const charge = paymentIntent.latest_charge;
    let cardBrand: string | null = null;
    let cardLast4: string | null = null;

    if (charge && typeof charge === "object" && charge.payment_method_details?.card_present) {
      const card = charge.payment_method_details.card_present;
      cardBrand = card.brand ?? null;
      cardLast4 = card.last4 ?? null;
    }

    // Update payment record
    await this.db
      .update(schema.payments)
      .set({
        status: "completed",
        stripeChargeId: typeof charge === "string" ? charge : charge?.id ?? null,
        cardBrand,
        cardLast4,
        processedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(schema.payments.id, payment.id));

    // Check if order is fully paid and auto-complete
    const allPayments = await this.db
      .select()
      .from(schema.payments)
      .where(and(
        eq(schema.payments.orderId, orderId),
        eq(schema.payments.status, "completed"),
      ));

    const totalPaid = allPayments.reduce((sum, p) => sum + p.amount, 0);

    const [order] = await this.db
      .select()
      .from(schema.orders)
      .where(eq(schema.orders.id, orderId))
      .limit(1);

    if (order && totalPaid >= order.total && order.status === "open") {
      await this.db
        .update(schema.orders)
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.orders.id, orderId));
    }

    return { paymentId: payment.id, orderId, status: "completed" };
  }

  /**
   * Handle a failed payment from Stripe webhook.
   *
   * Called when we receive `payment_intent.payment_failed`.
   */
  async handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
    const [payment] = await this.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.stripePaymentIntentId, paymentIntent.id))
      .limit(1);

    if (payment) {
      await this.db
        .update(schema.payments)
        .set({ status: "failed", updatedAt: new Date() })
        .where(eq(schema.payments.id, payment.id));
    }

    return { paymentIntentId: paymentIntent.id, status: "failed" };
  }

  /**
   * Cancel a pending PaymentIntent (e.g. customer changed their mind).
   */
  async cancelPaymentIntent(paymentIntentId: string, tenantId: string) {
    const [payment] = await this.db
      .select()
      .from(schema.payments)
      .where(and(
        eq(schema.payments.stripePaymentIntentId, paymentIntentId),
        eq(schema.payments.tenantId, tenantId),
      ))
      .limit(1);

    if (!payment) throw new PaymentError("Payment not found", "PAYMENT_NOT_FOUND");
    if (payment.status !== "pending") {
      throw new PaymentError("Can only cancel pending payments", "INVALID_STATUS");
    }

    // Cancel in Stripe
    await this.stripe.paymentIntents.cancel(paymentIntentId);

    // Update our record
    await this.db
      .update(schema.payments)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(schema.payments.id, payment.id));

    return { paymentId: payment.id, status: "cancelled" };
  }

  /**
   * Create a refund for a completed card payment.
   */
  async refundPayment(params: {
    paymentId: string;
    tenantId: string;
    amount?: number;
    reason?: string;
  }) {
    const { paymentId, tenantId, amount, reason } = params;

    const [payment] = await this.db
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.id, paymentId), eq(schema.payments.tenantId, tenantId)))
      .limit(1);

    if (!payment) throw new PaymentError("Payment not found", "PAYMENT_NOT_FOUND");
    if (payment.status !== "completed") {
      throw new PaymentError("Can only refund completed payments", "INVALID_STATUS");
    }
    if (!payment.stripePaymentIntentId) {
      throw new PaymentError("No Stripe PaymentIntent for this payment", "NO_PAYMENT_INTENT");
    }

    const refundAmount = amount ?? payment.amount;
    if (refundAmount > payment.amount - payment.refundedAmount) {
      throw new PaymentError("Refund amount exceeds remaining balance", "EXCESS_REFUND");
    }

    // Create refund in Stripe
    const refund = await this.stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      amount: refundAmount,
      reason: reason === "duplicate" ? "duplicate" : reason === "fraudulent" ? "fraudulent" : "requested_by_customer",
    });

    // Update the original payment's refunded amount
    await this.db
      .update(schema.payments)
      .set({
        refundedAmount: payment.refundedAmount + refundAmount,
        status: refundAmount >= payment.amount ? "refunded" : "completed",
        updatedAt: new Date(),
      })
      .where(eq(schema.payments.id, paymentId));

    // Create a refund payment record
    const [refundPayment] = await this.db
      .insert(schema.payments)
      .values({
        tenantId,
        orderId: payment.orderId,
        paymentMethod: "card",
        amount: -refundAmount,
        tipAmount: 0,
        status: "completed",
        stripePaymentIntentId: refund.id,
        refundOf: paymentId,
        processedAt: new Date(),
      })
      .returning();

    // Update order status if fully refunded
    const allPayments = await this.db
      .select()
      .from(schema.payments)
      .where(and(
        eq(schema.payments.orderId, payment.orderId),
        eq(schema.payments.status, "completed"),
      ));

    const netPaid = allPayments.reduce((sum, p) => sum + p.amount, 0);
    if (netPaid <= 0) {
      await this.db
        .update(schema.orders)
        .set({ status: "refunded", updatedAt: new Date() })
        .where(eq(schema.orders.id, payment.orderId));
    }

    return {
      refundId: refundPayment!.id,
      stripeRefundId: refund.id,
      amount: refundAmount,
      status: refund.status,
    };
  }
}

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}
