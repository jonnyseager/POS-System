import { pgTable, uuid, text, boolean, timestamp, integer, decimal, bigint } from "drizzle-orm/pg-core";
import { tenants, users } from "./tenants.js";

export const locations = pgTable("locations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: text("name").notNull(),
  locationType: text("location_type").notNull().default("fixed"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  postcode: text("postcode"),
  countryCode: text("country_code").default("GB"),
  latitude: decimal("latitude", { precision: 10, scale: 8 }),
  longitude: decimal("longitude", { precision: 11, scale: 8 }),
  isActive: boolean("is_active").notNull().default(true),
  settings: text("settings").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  hlcTimestamp: bigint("hlc_timestamp", { mode: "bigint" }).notNull().default(0n),
});

export const devices = pgTable("devices", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  locationId: uuid("location_id").references(() => locations.id),
  deviceName: text("device_name").notNull(),
  deviceType: text("device_type").notNull().default("tablet"),
  platform: text("platform").notNull(),
  appVersion: text("app_version"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  deviceToken: text("device_token").notNull().unique(),
  pushToken: text("push_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shifts = pgTable("shifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  locationId: uuid("location_id").notNull().references(() => locations.id),
  openedBy: uuid("opened_by").notNull().references(() => users.id),
  closedBy: uuid("closed_by").references(() => users.id),
  openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  openingCash: integer("opening_cash").notNull().default(0),
  closingCash: integer("closing_cash"),
  expectedCash: integer("expected_cash"),
  notes: text("notes"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  hlcTimestamp: bigint("hlc_timestamp", { mode: "bigint" }).notNull().default(0n),
});
