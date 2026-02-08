import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { schema } from "@commerce-os/db";
import { uuidSchema } from "@commerce-os/validation";
import { authenticate, getTenantId } from "../../middleware/authenticate.js";

/**
 * Stripe Terminal routes.
 *
 * Stripe Terminal enables in-person card payments via physical readers.
 * The flow:
 *   1. POS app requests a connection token (short-lived, per-device)
 *   2. POS app uses the Stripe Terminal SDK to discover and connect to a reader
 *   3. When a card payment is needed, POS creates a PaymentIntent server-side
 *   4. POS passes the PaymentIntent's client_secret to the Terminal SDK
 *   5. Terminal SDK handles the card interaction and confirms the payment
 *   6. Webhook confirms the payment on the server side
 *
 * Supported readers for UK mobile food vendors:
 *   - Stripe Reader M2 (Bluetooth, portable, £49)
 *   - BBPOS WisePOS E (WiFi, countertop, £249)
 */
export async function stripeTerminalRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  /**
   * POST /payments/terminal/connection-token — Get a connection token for the Terminal SDK
   *
   * The POS app calls this before connecting to a reader.
   * Tokens are short-lived and scoped to the connected account.
   */
  app.post("/connection-token", async (request, reply) => {
    const tenantId = getTenantId(request);

    const [tenant] = await app.db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    if (!tenant?.stripeAccountId) {
      return reply.badRequest("No Stripe account connected. Complete payment setup first.");
    }

    const connectionToken = await app.stripe.terminal.connectionTokens.create(
      {},
      { stripeAccount: tenant.stripeAccountId },
    );

    return {
      success: true,
      data: {
        secret: connectionToken.secret,
      },
    };
  });

  /**
   * POST /payments/terminal/create-location — Register a Stripe Terminal location
   *
   * Terminal readers must be registered to a location.
   * Call this when setting up a new trading location.
   */
  app.post("/create-location", async (request, reply) => {
    const tenantId = getTenantId(request);

    const body = z.object({
      locationId: uuidSchema,
    }).parse(request.body);

    const [tenant] = await app.db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    if (!tenant?.stripeAccountId) {
      return reply.badRequest("No Stripe account connected");
    }

    // Get our location details
    const [location] = await app.db
      .select()
      .from(schema.locations)
      .where(and(eq(schema.locations.id, body.locationId), eq(schema.locations.tenantId, tenantId)))
      .limit(1);

    if (!location) return reply.notFound("Location not found");

    // Create a Terminal Location in Stripe
    const terminalLocation = await app.stripe.terminal.locations.create(
      {
        display_name: location.name,
        address: {
          line1: location.addressLine1 || "N/A",
          city: location.city || "N/A",
          postal_code: location.postcode || "N/A",
          country: "GB",
        },
        metadata: {
          commerce_os_location_id: location.id,
          commerce_os_tenant_id: tenantId,
        },
      },
      { stripeAccount: tenant.stripeAccountId },
    );

    return reply.code(201).send({
      success: true,
      data: {
        terminalLocationId: terminalLocation.id,
        displayName: terminalLocation.display_name,
      },
    });
  });

  /**
   * GET /payments/terminal/readers — List registered readers
   */
  app.get("/readers", async (request, reply) => {
    const tenantId = getTenantId(request);

    const [tenant] = await app.db
      .select()
      .from(schema.tenants)
      .where(eq(schema.tenants.id, tenantId))
      .limit(1);

    if (!tenant?.stripeAccountId) {
      return reply.badRequest("No Stripe account connected");
    }

    const readers = await app.stripe.terminal.readers.list(
      { limit: 100 },
      { stripeAccount: tenant.stripeAccountId },
    );

    return {
      success: true,
      data: readers.data.map((reader) => ({
        id: reader.id,
        label: reader.label,
        deviceType: reader.device_type,
        status: reader.status,
        locationId: reader.location,
        serialNumber: reader.serial_number,
      })),
    };
  });
}
