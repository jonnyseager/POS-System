import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { orderRoutes } from "./order.routes.js";
import { shiftRoutes } from "./shift.routes.js";

export const ordersPlugin = fp(async (app: FastifyInstance) => {
  await app.register(orderRoutes, { prefix: "/orders" });
  await app.register(shiftRoutes, { prefix: "/shifts" });
});
