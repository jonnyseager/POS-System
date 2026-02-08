import { pgTable, uuid, text, boolean, timestamp, integer, decimal, bigint } from "drizzle-orm/pg-core";
import { tenants, users } from "./tenants.js";
import { locations, devices, shifts } from "./locations.js";
import { menuItems, modifiers } from "./catalog.js";
import { taxRates } from "./tax.js";

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  deviceId: uuid("device_id").references(() => devices.id),
  shiftId: uuid("shift_id").references(() => shifts.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  orderNumber: text("order_number").notNull(),
  status: text("status").notNull().default("open"),
  orderType: text("order_type").notNull().default("sale"),

  // Pricing (all in pence)
  subtotal: integer("subtotal").notNull().default(0),
  taxTotal: integer("tax_total").notNull().default(0),
  discountTotal: integer("discount_total").notNull().default(0),
  total: integer("total").notNull().default(0),
  costTotal: integer("cost_total").notNull().default(0),

  // Discount
  discountType: text("discount_type"),
  discountValue: integer("discount_value"),
  discountReason: text("discount_reason"),

  // Metadata
  notes: text("notes"),
  customerName: text("customer_name"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedBy: uuid("voided_by").references(() => users.id),
  voidReason: text("void_reason"),

  // Sync
  createdOffline: boolean("created_offline").notNull().default(false),
  syncedAt: timestamp("synced_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  hlcTimestamp: bigint("hlc_timestamp", { mode: "bigint" }).notNull().default(0n),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  menuItemId: uuid("menu_item_id").notNull().references(() => menuItems.id),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unitPrice: integer("unit_price").notNull(),
  unitCost: integer("unit_cost").notNull().default(0),
  taxRate: decimal("tax_rate", { precision: 5, scale: 4 }).notNull(),
  taxAmount: integer("tax_amount").notNull().default(0),
  subtotal: integer("subtotal").notNull(),
  total: integer("total").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  hlcTimestamp: bigint("hlc_timestamp", { mode: "bigint" }).notNull().default(0n),
});

export const orderItemModifiers = pgTable("order_item_modifiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  orderItemId: uuid("order_item_id").notNull().references(() => orderItems.id),
  modifierId: uuid("modifier_id").notNull().references(() => modifiers.id),
  name: text("name").notNull(),
  priceAdjustment: integer("price_adjustment").notNull().default(0),
  costAdjustment: integer("cost_adjustment").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  paymentMethod: text("payment_method").notNull(),
  amount: integer("amount").notNull(),
  tipAmount: integer("tip_amount").notNull().default(0),
  status: text("status").notNull().default("pending"),

  // Stripe
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeChargeId: text("stripe_charge_id"),
  cardBrand: text("card_brand"),
  cardLast4: text("card_last4"),

  // Cash
  cashGiven: integer("cash_given"),
  changeGiven: integer("change_given"),

  // Refund
  refundOf: uuid("refund_of"),
  refundedAmount: integer("refunded_amount").notNull().default(0),

  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  hlcTimestamp: bigint("hlc_timestamp", { mode: "bigint" }).notNull().default(0n),
});

export const orderTaxBreakdown = pgTable("order_tax_breakdown", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  orderId: uuid("order_id").notNull().references(() => orders.id),
  taxRateId: uuid("tax_rate_id").notNull().references(() => taxRates.id),
  taxRateName: text("tax_rate_name").notNull(),
  taxRateValue: decimal("tax_rate_value", { precision: 5, scale: 4 }).notNull(),
  taxableAmount: integer("taxable_amount").notNull(),
  taxAmount: integer("tax_amount").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
