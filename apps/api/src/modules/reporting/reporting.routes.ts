import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, sql, sum, count, desc, gte, lte } from "drizzle-orm";
import { schema } from "@commerce-os/db";
import { authenticate, getTenantId } from "../../middleware/authenticate.js";

const dateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  locationId: z.string().uuid().optional(),
});

export async function reportingRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  /**
   * GET /reports/dashboard — Real-time dashboard metrics
   *
   * Returns today's snapshot: revenue, orders, margin, top items.
   * This is the first thing a vendor sees when they open the back office.
   */
  app.get<{
    Querystring: { locationId?: string };
  }>("/dashboard", async (request) => {
    const tenantId = getTenantId(request);
    const { locationId } = request.query;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const conditions = [
      eq(schema.orders.tenantId, tenantId),
      eq(schema.orders.status, "completed"),
      gte(schema.orders.completedAt, startOfDay),
    ];
    if (locationId) conditions.push(eq(schema.orders.locationId, locationId));

    // Core metrics
    const [metrics] = await app.db
      .select({
        totalOrders: count(),
        totalRevenue: sum(schema.orders.total),
        totalCost: sum(schema.orders.costTotal),
        totalTax: sum(schema.orders.taxTotal),
        totalDiscount: sum(schema.orders.discountTotal),
      })
      .from(schema.orders)
      .where(and(...conditions));

    const revenue = Number(metrics?.totalRevenue) || 0;
    const cost = Number(metrics?.totalCost) || 0;
    const orders = metrics?.totalOrders ?? 0;

    // Top selling items today
    const topItems = await app.db
      .select({
        name: schema.orderItems.name,
        quantitySold: sum(schema.orderItems.quantity),
        revenue: sum(schema.orderItems.total),
        cost: sql<number>`SUM(${schema.orderItems.unitCost} * ${schema.orderItems.quantity})`,
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .where(and(...conditions))
      .groupBy(schema.orderItems.name)
      .orderBy(desc(sum(schema.orderItems.quantity)))
      .limit(10);

    // Payment method breakdown
    const paymentMethods = await app.db
      .select({
        method: schema.payments.paymentMethod,
        total: sum(schema.payments.amount),
        transactionCount: count(),
      })
      .from(schema.payments)
      .innerJoin(schema.orders, eq(schema.payments.orderId, schema.orders.id))
      .where(and(
        ...conditions,
        eq(schema.payments.status, "completed"),
      ))
      .groupBy(schema.payments.paymentMethod);

    return {
      success: true,
      data: {
        period: "today",
        date: startOfDay.toISOString().split("T")[0],
        totalOrders: orders,
        totalRevenue: revenue,
        totalCost: cost,
        grossProfit: revenue - cost,
        marginPercent: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 10000) / 100 : 0,
        totalTax: Number(metrics?.totalTax) || 0,
        totalDiscount: Number(metrics?.totalDiscount) || 0,
        averageOrderValue: orders > 0 ? Math.round(revenue / orders) : 0,
        topItems: topItems.map((item) => ({
          name: item.name,
          quantitySold: Number(item.quantitySold) || 0,
          revenue: Number(item.revenue) || 0,
          cost: Number(item.cost) || 0,
          marginPercent:
            Number(item.revenue) > 0
              ? Math.round(((Number(item.revenue) - Number(item.cost)) / Number(item.revenue)) * 10000) / 100
              : 0,
        })),
        paymentMethods: paymentMethods.map((pm) => ({
          method: pm.method,
          total: Number(pm.total) || 0,
          count: pm.transactionCount,
        })),
      },
    };
  });

  /**
   * GET /reports/sales — Sales report for a date range
   *
   * Aggregated daily revenue, cost, margin, and order count.
   */
  app.get<{
    Querystring: { from: string; to: string; locationId?: string };
  }>("/sales", async (request, reply) => {
    const tenantId = getTenantId(request);
    const parsed = dateRangeSchema.safeParse(request.query);
    if (!parsed.success) return reply.badRequest("Invalid date range");
    const { from, to, locationId } = parsed.data;

    const conditions = [
      eq(schema.orders.tenantId, tenantId),
      eq(schema.orders.status, "completed"),
      gte(schema.orders.completedAt, from),
      lte(schema.orders.completedAt, to),
    ];
    if (locationId) conditions.push(eq(schema.orders.locationId, locationId));

    // Daily breakdown
    const dailySales = await app.db
      .select({
        date: sql<string>`DATE(${schema.orders.completedAt})`.as("date"),
        totalOrders: count(),
        totalRevenue: sum(schema.orders.total),
        totalCost: sum(schema.orders.costTotal),
        totalTax: sum(schema.orders.taxTotal),
        totalDiscount: sum(schema.orders.discountTotal),
      })
      .from(schema.orders)
      .where(and(...conditions))
      .groupBy(sql`DATE(${schema.orders.completedAt})`)
      .orderBy(sql`DATE(${schema.orders.completedAt})`);

    // Period totals
    const [totals] = await app.db
      .select({
        totalOrders: count(),
        totalRevenue: sum(schema.orders.total),
        totalCost: sum(schema.orders.costTotal),
        totalTax: sum(schema.orders.taxTotal),
        totalDiscount: sum(schema.orders.discountTotal),
      })
      .from(schema.orders)
      .where(and(...conditions));

    const revenue = Number(totals?.totalRevenue) || 0;
    const cost = Number(totals?.totalCost) || 0;

    return {
      success: true,
      data: {
        from: from.toISOString().split("T")[0],
        to: to.toISOString().split("T")[0],
        totals: {
          totalOrders: totals?.totalOrders ?? 0,
          totalRevenue: revenue,
          totalCost: cost,
          grossProfit: revenue - cost,
          marginPercent: revenue > 0 ? Math.round(((revenue - cost) / revenue) * 10000) / 100 : 0,
          totalTax: Number(totals?.totalTax) || 0,
          totalDiscount: Number(totals?.totalDiscount) || 0,
        },
        daily: dailySales.map((day) => {
          const dayRevenue = Number(day.totalRevenue) || 0;
          const dayCost = Number(day.totalCost) || 0;
          return {
            date: day.date,
            totalOrders: day.totalOrders,
            totalRevenue: dayRevenue,
            totalCost: dayCost,
            grossProfit: dayRevenue - dayCost,
            marginPercent: dayRevenue > 0 ? Math.round(((dayRevenue - dayCost) / dayRevenue) * 10000) / 100 : 0,
            totalTax: Number(day.totalTax) || 0,
            totalDiscount: Number(day.totalDiscount) || 0,
          };
        }),
      },
    };
  });

  /**
   * GET /reports/items — Item-level performance report
   *
   * Revenue, quantity sold, cost, and margin per menu item.
   */
  app.get<{
    Querystring: { from: string; to: string; locationId?: string };
  }>("/items", async (request, reply) => {
    const tenantId = getTenantId(request);
    const parsed = dateRangeSchema.safeParse(request.query);
    if (!parsed.success) return reply.badRequest("Invalid date range");
    const { from, to, locationId } = parsed.data;

    const conditions = [
      eq(schema.orders.tenantId, tenantId),
      eq(schema.orders.status, "completed"),
      gte(schema.orders.completedAt, from),
      lte(schema.orders.completedAt, to),
    ];
    if (locationId) conditions.push(eq(schema.orders.locationId, locationId));

    const itemPerformance = await app.db
      .select({
        menuItemId: schema.orderItems.menuItemId,
        name: schema.orderItems.name,
        quantitySold: sum(schema.orderItems.quantity),
        revenue: sum(schema.orderItems.subtotal),
        taxCollected: sum(schema.orderItems.taxAmount),
        cost: sql<number>`SUM(${schema.orderItems.unitCost} * ${schema.orderItems.quantity})`,
      })
      .from(schema.orderItems)
      .innerJoin(schema.orders, eq(schema.orderItems.orderId, schema.orders.id))
      .where(and(...conditions))
      .groupBy(schema.orderItems.menuItemId, schema.orderItems.name)
      .orderBy(desc(sum(schema.orderItems.subtotal)));

    return {
      success: true,
      data: {
        from: from.toISOString().split("T")[0],
        to: to.toISOString().split("T")[0],
        items: itemPerformance.map((item) => {
          const rev = Number(item.revenue) || 0;
          const cst = Number(item.cost) || 0;
          return {
            menuItemId: item.menuItemId,
            name: item.name,
            quantitySold: Number(item.quantitySold) || 0,
            revenue: rev,
            taxCollected: Number(item.taxCollected) || 0,
            cost: cst,
            grossProfit: rev - cst,
            marginPercent: rev > 0 ? Math.round(((rev - cst) / rev) * 10000) / 100 : 0,
          };
        }),
      },
    };
  });

  /**
   * GET /reports/vat — VAT summary for a date range
   *
   * Grouped by tax rate. Essential for VAT returns.
   */
  app.get<{
    Querystring: { from: string; to: string };
  }>("/vat", async (request, reply) => {
    const tenantId = getTenantId(request);
    const parsed = dateRangeSchema.safeParse(request.query);
    if (!parsed.success) return reply.badRequest("Invalid date range");
    const { from, to } = parsed.data;

    const vatSummary = await app.db
      .select({
        taxRateName: schema.orderTaxBreakdown.taxRateName,
        taxRateValue: schema.orderTaxBreakdown.taxRateValue,
        totalTaxableAmount: sum(schema.orderTaxBreakdown.taxableAmount),
        totalTaxAmount: sum(schema.orderTaxBreakdown.taxAmount),
        orderCount: count(),
      })
      .from(schema.orderTaxBreakdown)
      .innerJoin(schema.orders, eq(schema.orderTaxBreakdown.orderId, schema.orders.id))
      .where(and(
        eq(schema.orders.tenantId, tenantId),
        eq(schema.orders.status, "completed"),
        gte(schema.orders.completedAt, from),
        lte(schema.orders.completedAt, to),
      ))
      .groupBy(schema.orderTaxBreakdown.taxRateName, schema.orderTaxBreakdown.taxRateValue);

    const totalTax = vatSummary.reduce((sum, v) => sum + (Number(v.totalTaxAmount) || 0), 0);
    const totalTaxable = vatSummary.reduce((sum, v) => sum + (Number(v.totalTaxableAmount) || 0), 0);

    return {
      success: true,
      data: {
        from: from.toISOString().split("T")[0],
        to: to.toISOString().split("T")[0],
        totalTaxableAmount: totalTaxable,
        totalTaxAmount: totalTax,
        breakdown: vatSummary.map((v) => ({
          rateName: v.taxRateName,
          rateValue: parseFloat(v.taxRateValue),
          taxableAmount: Number(v.totalTaxableAmount) || 0,
          taxAmount: Number(v.totalTaxAmount) || 0,
          orderCount: v.orderCount,
        })),
      },
    };
  });
}
