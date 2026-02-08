import { pgTable, uuid, text, timestamp, integer, decimal, bigint, uniqueIndex } from "drizzle-orm/pg-core";
import { tenants, users } from "./tenants.js";
import { locations } from "./locations.js";
import { ingredients } from "./catalog.js";

export const stockLevels = pgTable("stock_levels", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  ingredientId: uuid("ingredient_id").notNull().references(() => ingredients.id),
  currentQuantity: decimal("current_quantity", { precision: 10, scale: 4 }).notNull().default("0"),
  minQuantity: decimal("min_quantity", { precision: 10, scale: 4 }),
  maxQuantity: decimal("max_quantity", { precision: 10, scale: 4 }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  hlcTimestamp: bigint("hlc_timestamp", { mode: "bigint" }).notNull().default(0n),
}, (table) => [
  uniqueIndex("stock_level_unique").on(table.locationId, table.ingredientId),
]);

export const stockMovements = pgTable("stock_movements", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  ingredientId: uuid("ingredient_id").notNull().references(() => ingredients.id),
  movementType: text("movement_type").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 4 }).notNull(),
  unitCost: integer("unit_cost"),
  referenceType: text("reference_type"),
  referenceId: uuid("reference_id"),
  notes: text("notes"),
  performedBy: uuid("performed_by").references(() => users.id),
  performedAt: timestamp("performed_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  hlcTimestamp: bigint("hlc_timestamp", { mode: "bigint" }).notNull().default(0n),
});

export const wasteRecords = pgTable("waste_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  ingredientId: uuid("ingredient_id").notNull().references(() => ingredients.id),
  quantity: decimal("quantity", { precision: 10, scale: 4 }).notNull(),
  reason: text("reason").notNull(),
  cost: integer("cost").notNull(),
  recordedBy: uuid("recorded_by").notNull().references(() => users.id),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  hlcTimestamp: bigint("hlc_timestamp", { mode: "bigint" }).notNull().default(0n),
});

export const suppliers = pgTable("suppliers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  notes: text("notes"),
  isActive: text("is_active").notNull().default("true"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  hlcTimestamp: bigint("hlc_timestamp", { mode: "bigint" }).notNull().default(0n),
});
