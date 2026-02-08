import type { FastifyInstance } from "fastify";
import { eq, and, isNull, asc } from "drizzle-orm";
import { schema } from "@commerce-os/db";
import { createIngredientSchema, updateIngredientSchema } from "@commerce-os/validation";
import { authenticate, getTenantId } from "../../middleware/authenticate.js";

export async function ingredientRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  /** GET /ingredients — List all ingredients */
  app.get("/", async (request) => {
    const tenantId = getTenantId(request);

    const ingredients = await app.db
      .select()
      .from(schema.ingredients)
      .where(and(eq(schema.ingredients.tenantId, tenantId), isNull(schema.ingredients.deletedAt)))
      .orderBy(asc(schema.ingredients.name));

    return { success: true, data: ingredients };
  });

  /** GET /ingredients/:id — Get a single ingredient */
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;

    const [ingredient] = await app.db
      .select()
      .from(schema.ingredients)
      .where(and(eq(schema.ingredients.id, id), eq(schema.ingredients.tenantId, tenantId), isNull(schema.ingredients.deletedAt)))
      .limit(1);

    if (!ingredient) return reply.notFound("Ingredient not found");

    return { success: true, data: ingredient };
  });

  /** POST /ingredients — Create a new ingredient */
  app.post("/", async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = createIngredientSchema.parse(request.body);

    const [ingredient] = await app.db
      .insert(schema.ingredients)
      .values({ ...body, tenantId })
      .returning();

    return reply.code(201).send({ success: true, data: ingredient });
  });

  /** PATCH /ingredients/:id — Update an ingredient */
  app.patch<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;
    const body = updateIngredientSchema.parse(request.body);

    const [ingredient] = await app.db
      .update(schema.ingredients)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(schema.ingredients.id, id), eq(schema.ingredients.tenantId, tenantId)))
      .returning();

    if (!ingredient) return reply.notFound("Ingredient not found");

    return { success: true, data: ingredient };
  });

  /** DELETE /ingredients/:id — Soft-delete an ingredient */
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;

    const [ingredient] = await app.db
      .update(schema.ingredients)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.ingredients.id, id), eq(schema.ingredients.tenantId, tenantId)))
      .returning();

    if (!ingredient) return reply.notFound("Ingredient not found");

    return { success: true, data: { deleted: true } };
  });
}
