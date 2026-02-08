import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { schema } from "@commerce-os/db";
import { authenticate, getTenantId } from "../../middleware/authenticate.js";
import { getEnv } from "../../config/env.js";

/**
 * Stripe Connect routes.
 *
 * These handle the vendor onboarding flow:
 *   1. Vendor clicks "Connect payments" in back office
 *   2. We create a Stripe Connected Account for them
 *   3. We redirect them to Stripe's hosted onboarding
 *   4. Stripe redirects back with account activated
 *   5. We store the Stripe account ID on their tenant record
 *
 * We use Stripe Connect "Standard" accounts — Stripe handles KYC,
 * disputes, and payouts. We get a platform fee on each transaction.
 */
export async function stripeConnectRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  /**
   * POST /payments/connect/create-account — Create a Stripe Connected Account
   *
   * Call this when a vendor first wants to accept card payments.
   * Returns the account ID and an onboarding URL.
   */
  app.post("/create-account", async (request, reply) => {
    const tenantId = getTenantId(request);
    const env = getEnv();

    // Check if tenant already has a Stripe account
    const [tenant] = await app.db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    if (!tenant) return reply.notFound("Tenant not found");

    if (tenant.stripeAccountId) {
      // Already has an account — just generate a new onboarding link
      const accountLink = await app.stripe.accountLinks.create({
        account: tenant.stripeAccountId,
        refresh_url: `${env.FRONTEND_URL}/settings/payments?refresh=true`,
        return_url: `${env.FRONTEND_URL}/settings/payments?success=true`,
        type: "account_onboarding",
      });

      return {
        success: true,
        data: {
          accountId: tenant.stripeAccountId,
          onboardingUrl: accountLink.url,
          alreadyExists: true,
        },
      };
    }

    // Create a new Standard connected account
    const account = await app.stripe.accounts.create({
      type: "standard",
      country: "GB",
      metadata: {
        tenant_id: tenantId,
        tenant_name: tenant.name,
      },
    });

    // Store the account ID on the tenant
    await app.db
      .update(schema.tenants)
      .set({
        stripeAccountId: account.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.tenants.id, tenantId));

    // Create an onboarding link
    const accountLink = await app.stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${env.FRONTEND_URL}/settings/payments?refresh=true`,
      return_url: `${env.FRONTEND_URL}/settings/payments?success=true`,
      type: "account_onboarding",
    });

    return reply.code(201).send({
      success: true,
      data: {
        accountId: account.id,
        onboardingUrl: accountLink.url,
        alreadyExists: false,
      },
    });
  });

  /**
   * GET /payments/connect/status — Check the connected account status
   *
   * Returns whether the vendor's Stripe account is fully onboarded
   * and ready to accept payments.
   */
  app.get("/status", async (request, reply) => {
    const tenantId = getTenantId(request);

    const [tenant] = await app.db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    if (!tenant) return reply.notFound("Tenant not found");

    if (!tenant.stripeAccountId) {
      return {
        success: true,
        data: {
          connected: false,
          chargesEnabled: false,
          payoutsEnabled: false,
          detailsSubmitted: false,
          requirements: null,
        },
      };
    }

    // Fetch account details from Stripe
    const account = await app.stripe.accounts.retrieve(tenant.stripeAccountId);

    return {
      success: true,
      data: {
        connected: true,
        accountId: tenant.stripeAccountId,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
        detailsSubmitted: account.details_submitted,
        requirements: {
          currentlyDue: account.requirements?.currently_due ?? [],
          eventuallyDue: account.requirements?.eventually_due ?? [],
          pastDue: account.requirements?.past_due ?? [],
        },
      },
    };
  });

  /**
   * POST /payments/connect/dashboard-link — Get a link to the Stripe Express Dashboard
   *
   * Vendors can use this to view their payouts, disputes, etc.
   * Only works for Express/Standard accounts.
   */
  app.post("/dashboard-link", async (request, reply) => {
    const tenantId = getTenantId(request);

    const [tenant] = await app.db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    if (!tenant?.stripeAccountId) {
      return reply.badRequest("No Stripe account connected");
    }

    // For Standard accounts, we redirect to the Stripe dashboard directly
    return {
      success: true,
      data: {
        url: `https://dashboard.stripe.com/${tenant.stripeAccountId}`,
      },
    };
  });
}
