import { pgTable, uuid, text, boolean, timestamp, integer, decimal, bigint, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { taxRates } from "./tax.js";

export const categories = pgTable("categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  displayOrder: integer("display_order").notNull().default(0),
  color: text("color"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  hlcTimestamp: bigint("hlc_timestamp", { mode: "bigint" }).notNull().default(0n),
});

export const menuItems = pgTable("menu_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  categoryId: uuid("category_id").references(() => categories.id),
  name: text("name").notNull(),
  description: text("description"),
  sku: text("sku"),
  price: integer("price").notNull(),
  costPrice: integer("cost_price"),
  costMethod: text("cost_method").notNull().default("manual"),
  taxRateId: uuid("tax_rate_id").references(() => taxRates.id),
  imageUrl: text("image_url"),
  barcode: text("barcode"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  trackStock: boolean("track_stock").notNull().default(false),
  allowModifiers: boolean("allow_modifiers").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  hlcTimestamp: bigint("hlc_timestamp", { mode: "bigint" }).notNull().default(0n),
});

export const modifierGroups = pgTable("modifier_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  selectionType: text("selection_type").notNull().default("single"),
  minSelections: integer("min_selections").notNull().default(0),
  maxSelections: integer("max_selections"),
  isRequired: boolean("is_required").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  hlcTimestamp: bigint("hlc_timestamp", { mode: "bigint" }).notNull().default(0n),
});

export const menuItemModifierGroups = pgTable("menu_item_modifier_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  menuItemId: uuid("menu_item_id").notNull().references(() => menuItems.id),
  modifierGroupId: uuid("modifier_group_id").notNull().references(() => modifierGroups.id),
  displayOrder: integer("display_order").notNull().default(0),
}, (table) => [
  uniqueIndex("menu_item_modifier_group_unique").on(table.menuItemId, table.modifierGroupId),
]);

export const modifiers = pgTable("modifiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  modifierGroupId: uuid("modifier_group_id").notNull().references(() => modifierGroups.id),
  name: text("name").notNull(),
  priceAdjustment: integer("price_adjustment").notNull().default(0),
  costAdjustment: integer("cost_adjustment").notNull().default(0),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  hlcTimestamp: bigint("hlc_timestamp", { mode: "bigint" }).notNull().default(0n),
});

export const ingredients = pgTable("ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  unit: text("unit").notNull(),
  costPerUnit: integer("cost_per_unit").notNull(),
  costPrecision: integer("cost_precision").notNull().default(2),
  category: text("category"),
  allergens: text("allergens").array().default([]),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  hlcTimestamp: bigint("hlc_timestamp", { mode: "bigint" }).notNull().default(0n),
});

export const recipeIngredients = pgTable("recipe_ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  menuItemId: uuid("menu_item_id").notNull().references(() => menuItems.id),
  ingredientId: uuid("ingredient_id").notNull().references(() => ingredients.id),
  quantity: decimal("quantity", { precision: 10, scale: 4 }).notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  hlcTimestamp: bigint("hlc_timestamp", { mode: "bigint" }).notNull().default(0n),
}, (table) => [
  uniqueIndex("recipe_ingredient_unique").on(table.menuItemId, table.ingredientId),
]);
