import { pgTable, uuid, text, boolean, timestamp, decimal, bigint } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";

export const taxRates = pgTable("tax_rates", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  rate: decimal("rate", { precision: 5, scale: 4 }).notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  hlcTimestamp: bigint("hlc_timestamp", { mode: "bigint" }).notNull().default(0n),
});
