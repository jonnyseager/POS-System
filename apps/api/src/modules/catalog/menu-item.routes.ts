import type { FastifyInstance } from "fastify";
import { eq, and, isNull, asc } from "drizzle-orm";
import { schema } from "@commerce-os/db";
import { createMenuItemSchema, updateMenuItemSchema, setRecipeSchema } from "@commerce-os/validation";
import { authenticate, getTenantId } from "../../middleware/authenticate.js";

export async function menuItemRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  /** GET /menu-items — List all menu items with optional category filter */
  app.get<{ Querystring: { categoryId?: string } }>("/", async (request) => {
    const tenantId = getTenantId(request);
    const { categoryId } = request.query;

    const conditions = [eq(schema.menuItems.tenantId, tenantId), isNull(schema.menuItems.deletedAt)];
    if (categoryId) {
      conditions.push(eq(schema.menuItems.categoryId, categoryId));
    }

    const items = await app.db
      .select()
      .from(schema.menuItems)
      .where(and(...conditions))
      .orderBy(asc(schema.menuItems.displayOrder));

    return { success: true, data: items };
  });

  /** GET /menu-items/:id — Get a single menu item with recipe details */
  app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;

    const [item] = await app.db
      .select()
      .from(schema.menuItems)
      .where(and(eq(schema.menuItems.id, id), eq(schema.menuItems.tenantId, tenantId), isNull(schema.menuItems.deletedAt)))
      .limit(1);

    if (!item) return reply.notFound("Menu item not found");

    // Fetch recipe ingredients
    const recipe = await app.db
      .select({
        id: schema.recipeIngredients.id,
        ingredientId: schema.recipeIngredients.ingredientId,
        quantity: schema.recipeIngredients.quantity,
        notes: schema.recipeIngredients.notes,
        ingredientName: schema.ingredients.name,
        ingredientUnit: schema.ingredients.unit,
        ingredientCostPerUnit: schema.ingredients.costPerUnit,
        ingredientCostPrecision: schema.ingredients.costPrecision,
      })
      .from(schema.recipeIngredients)
      .innerJoin(schema.ingredients, eq(schema.recipeIngredients.ingredientId, schema.ingredients.id))
      .where(and(eq(schema.recipeIngredients.menuItemId, id), eq(schema.recipeIngredients.tenantId, tenantId)));

    // Calculate cost from recipe
    let calculatedCost: number | null = null;
    if (recipe.length > 0) {
      calculatedCost = recipe.reduce((total, ri) => {
        const qty = parseFloat(ri.quantity);
        const costPerUnit = ri.ingredientCostPerUnit;
        const precision = ri.ingredientCostPrecision;
        const cost = qty * (costPerUnit / Math.pow(10, precision));
        return total + cost;
      }, 0);
      calculatedCost = Math.round(calculatedCost); // round to pence
    }

    const marginPercent =
      calculatedCost !== null && item.price > 0
        ? Math.round(((item.price - calculatedCost) / item.price) * 10000) / 100
        : null;

    return {
      success: true,
      data: {
        ...item,
        recipe,
        calculatedCost,
        marginPercent,
      },
    };
  });

  /** POST /menu-items — Create a new menu item */
  app.post("/", async (request, reply) => {
    const tenantId = getTenantId(request);
    const body = createMenuItemSchema.parse(request.body);

    const [item] = await app.db
      .insert(schema.menuItems)
      .values({ ...body, tenantId })
      .returning();

    return reply.code(201).send({ success: true, data: item });
  });

  /** PATCH /menu-items/:id — Update a menu item */
  app.patch<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;
    const body = updateMenuItemSchema.parse(request.body);

    const [item] = await app.db
      .update(schema.menuItems)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(schema.menuItems.id, id), eq(schema.menuItems.tenantId, tenantId)))
      .returning();

    if (!item) return reply.notFound("Menu item not found");

    return { success: true, data: item };
  });

  /** PUT /menu-items/:id/recipe — Set the recipe for a menu item */
  app.put<{ Params: { id: string } }>("/:id/recipe", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;
    const body = setRecipeSchema.parse(request.body);

    // Verify the menu item exists
    const [item] = await app.db
      .select()
      .from(schema.menuItems)
      .where(and(eq(schema.menuItems.id, id), eq(schema.menuItems.tenantId, tenantId)))
      .limit(1);

    if (!item) return reply.notFound("Menu item not found");

    // Delete existing recipe ingredients and replace
    await app.db
      .delete(schema.recipeIngredients)
      .where(and(eq(schema.recipeIngredients.menuItemId, id), eq(schema.recipeIngredients.tenantId, tenantId)));

    // Insert new recipe ingredients
    const recipeRows = body.ingredients.map((ing) => ({
      tenantId,
      menuItemId: id,
      ingredientId: ing.ingredientId,
      quantity: ing.quantity.toString(),
      notes: ing.notes ?? null,
    }));

    await app.db.insert(schema.recipeIngredients).values(recipeRows);

    // Update cost method to recipe
    await app.db
      .update(schema.menuItems)
      .set({ costMethod: "recipe", updatedAt: new Date() })
      .where(eq(schema.menuItems.id, id));

    return { success: true, data: { updated: true } };
  });

  /** DELETE /menu-items/:id — Soft-delete a menu item */
  app.delete<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const tenantId = getTenantId(request);
    const { id } = request.params;

    const [item] = await app.db
      .update(schema.menuItems)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.menuItems.id, id), eq(schema.menuItems.tenantId, tenantId)))
      .returning();

    if (!item) return reply.notFound("Menu item not found");

    return { success: true, data: { deleted: true } };
  });
}
