import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { categoryRoutes } from "./category.routes.js";
import { menuItemRoutes } from "./menu-item.routes.js";
import { ingredientRoutes } from "./ingredient.routes.js";

export const catalogPlugin = fp(async (app: FastifyInstance) => {
  await app.register(categoryRoutes, { prefix: "/categories" });
  await app.register(menuItemRoutes, { prefix: "/menu-items" });
  await app.register(ingredientRoutes, { prefix: "/ingredients" });
});
