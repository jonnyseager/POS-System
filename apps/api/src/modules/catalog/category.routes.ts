import type { FastifyInstance } from "fastify";
import { eq, and, isNull, asc } from "drizzle-orm";
import { schema } from "@commerce-os/db";
import { createCategorySchema, updateCategorySchema } from "@commerce-os/validation";
import { authenticate, getTenantId } from "../../middleware/authenticate.js";

export async function categoryRoutes(app: FastifyInstance) {
  // All routes require authentication
  app.addHook("preHandler", authenticate);

  /** GET /categories — List all categories for the tenant */
  app.get("/", async (request) => {
    const tenantId = getTenantId(request);

    const categories = await app.db
      .select()
      .from(schema.categories)
      .where(and(eq(schema.categories.tenantId, tenantId), isNull(schema.categories.deletedAt)))
      .orderBy(asc(schema.categories.displayOrder));

    return { success: true, data: categories };
  });

  /** GET /categories/:id — Get a single category */
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;

    const [category] = await app.db
      .select()
      .from(schema.categories)
      .where(and(eq(schema.categories.id, id), eq(schema.categories.tenantId, tenantId), isNull(schema.categories.deletedAt)))
      .limit(1);

    if (!category) return reply.notFound("Category not found");

    return { success: true, data: category };
  });

  /** POST /categories — Create a new category */
  app.post("/", async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = createCategorySchema.parse(request.body);

    const [category] = await app.db
      .insert(schema.categories)
      .values({ ...body, tenantId })
      .returning();

    return reply.code(201).send({ success: true, data: category });
  });

  /** PATCH /categories/:id — Update a category */
  app.patch<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;
    const body = updateCategorySchema.parse(request.body);

    const [category] = await app.db
      .update(schema.categories)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(schema.categories.id, id), eq(schema.categories.tenantId, tenantId)))
      .returning();

    if (!category) return reply.notFound("Category not found");

    return { success: true, data: category };
  });

  /** DELETE /categories/:id — Soft-delete a category */
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;

    const [category] = await app.db
      .update(schema.categories)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.categories.id, id), eq(schema.categories.tenantId, tenantId)))
      .returning();

    if (!category) return reply.notFound("Category not found");

    return { success: true, data: { deleted: true } };
  });
}
