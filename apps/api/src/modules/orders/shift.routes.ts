import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc, sum, count } from "drizzle-orm";
import { schema } from "@commerce-os/db";
import { uuidSchema, penceSchema } from "@commerce-os/validation";
import { authenticate, getTenantId, getUserId } from "../../middleware/authenticate.js";

const openShiftSchema = z.object({
  locationId: uuidSchema,
  openingCash: penceSchema.default(0),
});

const closeShiftSchema = z.object({
  closingCash: penceSchema,
  notes: z.string().max(500).optional(),
});

export async function shiftRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  /** POST /shifts — Open a new shift */
  app.post("/", async (request, reply) => {
    const tenantId = getTenantId(request);
    const userId = getUserId(request);
    const body = openShiftSchema.parse(request.body);

    // Check for already-open shift at this location
    const [existing] = await app.db
      .select()
      .from(schema.shifts)
      .where(and(
        eq(schema.shifts.tenantId, tenantId),
        eq(schema.shifts.locationId, body.locationId),
        eq(schema.shifts.status, "open"),
      ))
      .limit(1);

    if (existing) {
      return reply.conflict("A shift is already open at this location. Close it before opening a new one.");
    }

    const [shift] = await app.db
      .insert(schema.shifts)
      .values({
        tenantId,
        locationId: body.locationId,
        openedBy: userId,
        openingCash: body.openingCash,
        status: "open",
      })
      .returning();

    return reply.code(201).send({ success: true, data: shift });
  });

  /** GET /shifts — List shifts */
  app.get<{
    Querystring: { locationId?: string; status?: string; limit?: string };
  }>("/", async (request) => {
    const tenantId = getTenantId(request);
    const { locationId, status, limit } = request.query;

    const conditions = [eq(schema.shifts.tenantId, tenantId)];
    if (locationId) conditions.push(eq(schema.shifts.locationId, locationId));
    if (status) conditions.push(eq(schema.shifts.status, status));

    const shifts = await app.db
      .select()
      .from(schema.shifts)
      .where(and(...conditions))
      .orderBy(desc(schema.shifts.openedAt))
      .limit(limit ? parseInt(limit, 10) : 20);

    return { success: true, data: shifts };
  });

  /** GET /shifts/:id — Get shift with summary */
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;

    const [shift] = await app.db
      .select()
      .from(schema.shifts)
      .where(and(eq(schema.shifts.id, id), eq(schema.shifts.tenantId, tenantId)))
      .limit(1);

    if (!shift) return reply.notFound("Shift not found");

    // Calculate shift summary from orders
    const summary = await getShiftSummary(app, id, tenantId);

    return { success: true, data: { ...shift, summary } };
  });

  /** POST /shifts/:id/close — Close a shift */
  app.post<{ Params: { id: string } }>("/:id/close", async (request, reply) => {
    const tenantId = getTenantId(request);
    const userId = getUserId(request);
    const { id } = request.params;
    const body = closeShiftSchema.parse(request.body);

    const [shift] = await app.db
      .select()
      .from(schema.shifts)
      .where(and(eq(schema.shifts.id, id), eq(schema.shifts.tenantId, tenantId)))
      .limit(1);

    if (!shift) return reply.notFound("Shift not found");
    if (shift.status === "closed") return reply.badRequest("Shift is already closed");

    // Calculate expected cash from orders during this shift
    const [cashPayments] = await app.db
      .select({ total: sum(schema.payments.amount) })
      .from(schema.payments)
      .innerJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
      .where(and(
        eq(schema.orders.shiftId, id),
        eq(schema.orders.tenantId, tenantId),
        eq(schema.payments.paymentMethod, "cash"),
        eq(schema.payments.status, "completed"),
      ));

    const expectedCash = shift.openingCash + (Number(cashPayments?.total) || 0);

    const [closed] = await app.db
      .update(schema.shifts)
      .set({
        status: "closed",
        closedBy: userId,
        closedAt: new Date(),
        closingCash: body.closingCash,
        expectedCash,
        notes: body.notes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(schema.shifts.id, id))
      .returning();

    const cashVariance = body.closingCash - expectedCash;

    return {
      success: true,
      data: {
        ...closed,
        expectedCash,
        cashVariance,
        cashVariancePercent:
          expectedCash > 0
            ? Math.round((cashVariance / expectedCash) * 10000) / 100
            : 0,
      },
    };
  });
}

/** Calculate summary statistics for a shift. */
async function getShiftSummary(app: FastifyInstance, shiftId: string, tenantId: string) {
  // Order totals
  const [orderStats] = await app.db
    .select({
      totalOrders: count(),
      totalRevenue: sum(schema.orders.total),
      totalTax: sum(schema.orders.taxTotal),
      totalDiscount: sum(schema.orders.discountTotal),
      totalCost: sum(schema.orders.costTotal),
    })
    .from(schema.orders)
    .where(and(
      eq(schema.orders.shiftId, shiftId),
      eq(schema.orders.tenantId, tenantId),
      eq(schema.orders.status, "completed"),
    ));

  // Payment breakdown by method
  const paymentBreakdown = await app.db
    .select({
      method: schema.payments.paymentMethod,
      total: sum(schema.payments.amount),
      transactionCount: count(),
    })
    .from(schema.payments)
    .innerJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
    .where(and(
      eq(schema.orders.shiftId, shiftId),
      eq(schema.orders.tenantId, tenantId),
      eq(schema.payments.status, "completed"),
    ))
    .groupBy(schema.payments.paymentMethod);

  // Voided orders
  const [voidedStats] = await app.db
    .select({
      totalVoided: count(),
      voidedValue: sum(schema.orders.total),
    })
    .from(schema.orders)
    .where(and(
      eq(schema.orders.shiftId, shiftId),
      eq(schema.orders.tenantId, tenantId),
      eq(schema.orders.status, "voided"),
    ));

  const revenue = Number(orderStats?.totalRevenue) || 0;
  const cost = Number(orderStats?.totalCost) || 0;

  return {
    totalOrders: orderStats?.totalOrders ?? 0,
    totalRevenue: revenue,
    totalTax: Number(orderStats?.totalTax) || 0,
    totalDiscount: Number(orderStats?.totalDiscount) || 0,
    totalCost: cost,
    grossProfit: revenue - cost,
    marginPercent: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 10000) / 100 : 0,
    averageOrderValue: (orderStats?.totalOrders ?? 0) > 0
      ? Math.round(revenue / (orderStats?.totalOrders ?? 1))
      : 0,
    paymentBreakdown: paymentBreakdown.map((pb) => ({
      method: pb.method,
      total: Number(pb.total) || 0,
      count: pb.transactionCount,
    })),
    voidedOrders: voidedStats?.totalVoided ?? 0,
    voidedValue: Number(voidedStats?.voidedValue) || 0,
  };
}
