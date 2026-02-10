import { z } from "zod";
import { uuidSchema } from "./common.js";

/** HLC timestamp as string (BigInt serialised for JSON) */
const hlcStringSchema = z.string().regex(/^\d+$/, "HLC must be a numeric string");

/** Per-column HLC map for LWW resolution */
const columnHlcsSchema = z.record(z.string(), hlcStringSchema).optional();

/** A single sync change */
export const syncChangeSchema = z.object({
  table: z.string().min(1).max(100),
  recordId: uuidSchema,
  operation: z.enum(["INSERT", "UPDATE", "DELETE"]),
  data: z.record(z.string(), z.unknown()),
  hlc: hlcStringSchema,
  columnHlcs: columnHlcsSchema,
});

/** Push request body — max 500 changes per batch */
export const syncPushSchema = z.object({
  batchId: uuidSchema,
  deviceHlc: hlcStringSchema,
  changes: z.array(syncChangeSchema).min(1).max(500),
});

/** Pull request query parameters */
export const syncPullSchema = z.object({
  sinceHlc: hlcStringSchema.default("0"),
  tables: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

/** Device registration */
export const registerDeviceSchema = z.object({
  deviceName: z.string().trim().min(1).max(255),
  deviceType: z.enum(["tablet", "phone", "terminal", "web"]).default("tablet"),
  platform: z.enum(["ios", "android", "web"]),
  locationId: uuidSchema.optional(),
  appVersion: z.string().max(50).optional(),
});

export type SyncPushInput = z.infer<typeof syncPushSchema>;
export type SyncPullInput = z.infer<typeof syncPullSchema>;
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
