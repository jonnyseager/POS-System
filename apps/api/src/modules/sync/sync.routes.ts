import type { FastifyInstance } from "fastify";
import { authenticate, getTenantId } from "../../middleware/authenticate.js";
import {
  syncPushSchema,
  syncPullSchema,
  registerDeviceSchema,
} from "@commerce-os/validation";
import { SyncService, SyncError, SYNC_TABLE_NAMES } from "./sync.service.js";

export async function syncRoutes(app: FastifyInstance) {
  // All sync routes require authentication
  app.addHook("preHandler", authenticate);

  // ── POST /register-device ──────────────────────────────────────────────
  // Register a new device for sync. Returns device ID, auth token, and
  // list of syncable tables so the client knows what to push/pull.
  app.post("/register-device", async (request, reply) => {
    const tenantId = getTenantId(request);
    const input = registerDeviceSchema.parse(request.body);
    const service = new SyncService(app.db);

    try {
      const result = await service.registerDevice(tenantId, input);
      return reply.status(201).send({ success: true, data: result });
    } catch (error) {
      if (error instanceof SyncError) {
        return reply
          .status(400)
          .send({ success: false, error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  // ── POST /push ─────────────────────────────────────────────────────────
  // Push a batch of changes from the device to the cloud.
  // Requires X-Device-Id header to identify the syncing device.
  //
  // Append-only tables → INSERT ON CONFLICT DO NOTHING
  // LWW tables → column-level merge (highest HLC wins per column)
  // Reference tables → rejected (read-only for devices)
  app.post("/push", async (request, reply) => {
    const tenantId = getTenantId(request);
    const deviceId = request.headers["x-device-id"] as string;
    if (!deviceId) {
      return reply.status(400).send({
        success: false,
        error: { code: "MISSING_DEVICE_ID", message: "X-Device-Id header is required" },
      });
    }

    const input = syncPushSchema.parse(request.body);
    const service = new SyncService(app.db);

    try {
      const result = await service.pushChanges(deviceId, tenantId, input);
      return reply.send({ success: true, data: result });
    } catch (error) {
      if (error instanceof SyncError) {
        return reply
          .status(400)
          .send({ success: false, error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  // ── GET /pull ──────────────────────────────────────────────────────────
  // Pull changes from cloud since a given HLC watermark.
  // Supports filtering by table (comma-separated) and pagination via limit.
  //
  // Query params:
  //   sinceHlc  — HLC watermark (default "0" for initial sync)
  //   tables    — comma-separated table names (default: all)
  //   limit     — max changes per response (default 200, max 500)
  app.get("/pull", async (request, reply) => {
    const tenantId = getTenantId(request);
    const deviceId = request.headers["x-device-id"] as string;
    if (!deviceId) {
      return reply.status(400).send({
        success: false,
        error: { code: "MISSING_DEVICE_ID", message: "X-Device-Id header is required" },
      });
    }

    const query = syncPullSchema.parse(request.query);
    const sinceHlc = BigInt(query.sinceHlc);

    // Parse tables — comma-separated or all
    const tables = query.tables
      ? query.tables.split(",").map((t) => t.trim())
      : SYNC_TABLE_NAMES;

    const service = new SyncService(app.db);

    try {
      const result = await service.pullChanges(
        deviceId, tenantId, sinceHlc, tables, query.limit,
      );
      return reply.send({ success: true, data: result });
    } catch (error) {
      if (error instanceof SyncError) {
        return reply
          .status(400)
          .send({ success: false, error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });

  // ── GET /status ────────────────────────────────────────────────────────
  // Get sync status for a device: last sync times and per-table HLC watermarks.
  app.get("/status", async (request, reply) => {
    const tenantId = getTenantId(request);
    const deviceId = request.headers["x-device-id"] as string;
    if (!deviceId) {
      return reply.status(400).send({
        success: false,
        error: { code: "MISSING_DEVICE_ID", message: "X-Device-Id header is required" },
      });
    }

    const service = new SyncService(app.db);

    try {
      const result = await service.getDeviceStatus(deviceId, tenantId);
      return reply.send({ success: true, data: result });
    } catch (error) {
      if (error instanceof SyncError) {
        return reply
          .status(400)
          .send({ success: false, error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });
}
