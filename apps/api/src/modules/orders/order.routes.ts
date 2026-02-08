import type { FastifyInstance } from "fastify";
import { createOrderSchema, processPaymentSchema, voidOrderSchema } from "@commerce-os/validation";
import { OrderService, OrderError } from "./order.service.js";
import { authenticate, getTenantId, getUserId } from "../../middleware/authenticate.js";

export async function orderRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  const orderService = new OrderService(app.db);

  /** POST /orders — Create a new order */
  app.post("/", async (request, reply) => {
    const tenantId = getTenantId(request);
    const userId = getUserId(request);
    const body = createOrderSchema.parse(request.body);

    // Optional shift and device context from headers
    const shiftId = (request.headers["x-shift-id"] as string) ?? undefined;
    const deviceId = (request.headers["x-device-id"] as string) ?? undefined;

    try {
      const order = await orderService.createOrder(body, tenantId, userId, shiftId, deviceId);
      return reply.code(201).send({ success: true, data: order });
    } catch (err) {
      if (err instanceof OrderError) {
        return reply.badRequest(err.message);
      }
      throw err;
    }
  });

  /** GET /orders — List orders with filters */
  app.get<{
    Querystring: {
      locationId?: string;
      shiftId?: string;
      status?: string;
      limit?: string;
      offset?: string;
    };
  }>("/", async (request) => {
    const tenantId = getTenantId(request);
    const { locationId, shiftId, status, limit, offset } = request.query;

    const result = await orderService.listOrders(tenantId, {
      locationId,
      shiftId,
      status,
      limit: limit ? parseInt(limit, 10) : undefined,
      offset: offset ? parseInt(offset, 10) : undefined,
    });

    return { success: true, data: result };
  });

  /** GET /orders/:id — Get a single order with full details */
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;

    const order = await orderService.getOrderWithDetails(id, tenantId);
    if (!order) return reply.notFound("Order not found");

    return { success: true, data: order };
  });

  /** POST /orders/:id/pay — Process a payment against an order */
  app.post<{ Params: { id: string } }>("/:id/pay", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;
    const body = processPaymentSchema.parse({ ...request.body as object, orderId: id });

    try {
      const result = await orderService.processPayment(body, tenantId);
      return { success: true, data: result };
    } catch (err) {
      if (err instanceof OrderError) {
        return reply.badRequest(err.message);
      }
      throw err;
    }
  });

  /** POST /orders/:id/void — Void an order */
  app.post<{ Params: { id: string } }>("/:id/void", async (request, reply) => {
    const tenantId = getTenantId(request);
    const userId = getUserId(request);
    const { id } = request.params;
    const body = voidOrderSchema.parse(request.body);

    try {
      const order = await orderService.voidOrder(id, tenantId, userId, body.reason);
      return { success: true, data: order };
    } catch (err) {
      if (err instanceof OrderError) {
        return reply.badRequest(err.message);
      }
      throw err;
    }
  });
}
