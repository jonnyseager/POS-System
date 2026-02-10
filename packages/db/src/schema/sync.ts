import { pgTable, uuid, text, timestamp, integer, bigint, jsonb, uniqueIndex, index } from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import { devices } from "./locations.js";

export const deviceSyncState = pgTable("device_sync_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  deviceId: uuid("device_id").notNull().references(() => devices.id),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  tableName: text("table_name").notNull(),
  lastPulledHlc: bigint("last_pulled_hlc", { mode: "bigint" }).notNull().default(0n),
  lastPushedHlc: bigint("last_pushed_hlc", { mode: "bigint" }).notNull().default(0n),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("device_sync_state_unique").on(table.deviceId, table.tableName),
]);

export const syncConflicts = pgTable("sync_conflicts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  deviceId: uuid("device_id").notNull().references(() => devices.id),
  tableName: text("table_name").notNull(),
  recordId: uuid("record_id").notNull(),
  localData: jsonb("local_data").notNull(),
  remoteData: jsonb("remote_data").notNull(),
  resolution: text("resolution").notNull(),
  resolvedData: jsonb("resolved_data").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const recordColumnHlcs = pgTable("record_column_hlcs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  tableName: text("table_name").notNull(),
  recordId: uuid("record_id").notNull(),
  columnHlcs: jsonb("column_hlcs").notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("record_column_hlcs_unique").on(table.tenantId, table.tableName, table.recordId),
]);

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  eventType: text("event_type").notNull(),
  eventData: jsonb("event_data").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  version: integer("version").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("events_aggregate_version").on(table.aggregateId, table.version),
  index("events_aggregate_lookup").on(table.aggregateType, table.aggregateId, table.version),
  index("events_tenant_type").on(table.tenantId, table.eventType, table.createdAt),
]);
