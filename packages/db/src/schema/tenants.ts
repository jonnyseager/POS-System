import { pgTable, uuid, text, boolean, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  businessType: text("business_type").notNull().default("food_vendor"),
  countryCode: text("country_code").notNull().default("GB"),
  currencyCode: text("currency_code").notNull().default("GBP"),
  timezone: text("timezone").notNull().default("Europe/London"),
  vatRegistered: boolean("vat_registered").notNull().default(false),
  vatNumber: text("vat_number"),
  stripeAccountId: text("stripe_account_id"),
  subscriptionTier: text("subscription_tier").notNull().default("free"),
  subscriptionStatus: text("subscription_status").notNull().default("trialing"),
  trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  emailVerified: boolean("email_verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("users_email_unique").on(table.email).where(sql`deleted_at IS NULL`),
]);

export const tenantUsers = pgTable("tenant_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  role: text("role").notNull().default("staff"),
  pinCode: text("pin_code"),
  hourlyRate: text("hourly_rate"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("tenant_users_unique").on(table.tenantId, table.userId),
]);

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
