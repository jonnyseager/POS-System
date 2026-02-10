import { eq, and, gt, asc } from "drizzle-orm";
import { schema } from "@commerce-os/db";
import type { Database } from "@commerce-os/db";
import { encode } from "@commerce-os/hlc";
import { randomUUID } from "crypto";

/**
 * SyncService implements the push/pull protocol for offline-first sync.
 *
 * Data classification:
 *   - Append-only: orders, payments, stock_movements, waste_records
 *     → INSERT ON CONFLICT DO NOTHING (idempotent, no conflicts possible)
 *   - LWW (Last-Writer-Wins): menu_items, categories, modifiers, etc.
 *     → Column-level HLC comparison, highest HLC wins per column
 *   - Reference: tax_rates
 *     → Cloud → device only (devices cannot push)
 */

// ─── Table Registry ──────────────────────────────────────────────────────────

type SyncClassification = "append-only" | "lww" | "reference";

interface SyncTableConfig {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref: any;
  classification: SyncClassification;
}

const SYNC_TABLES: Record<string, SyncTableConfig> = {
  // Append-only — device creates, cloud stores
  orders:          { ref: schema.orders,          classification: "append-only" },
  order_items:     { ref: schema.orderItems,      classification: "append-only" },
  payments:        { ref: schema.payments,         classification: "append-only" },
  stock_movements: { ref: schema.stockMovements,   classification: "append-only" },
  waste_records:   { ref: schema.wasteRecords,     classification: "append-only" },

  // LWW — bidirectional, column-level Last-Writer-Wins
  menu_items:           { ref: schema.menuItems,          classification: "lww" },
  categories:           { ref: schema.categories,          classification: "lww" },
  modifier_groups:      { ref: schema.modifierGroups,      classification: "lww" },
  modifiers:            { ref: schema.modifiers,           classification: "lww" },
  ingredients:          { ref: schema.ingredients,         classification: "lww" },
  recipe_ingredients:   { ref: schema.recipeIngredients,   classification: "lww" },
  locations:            { ref: schema.locations,           classification: "lww" },
  shifts:               { ref: schema.shifts,              classification: "lww" },

  // Reference — cloud → device only
  tax_rates: { ref: schema.taxRates, classification: "reference" },
};

export const SYNC_TABLE_NAMES = Object.keys(SYNC_TABLES);

/** Columns excluded from LWW merge (server-managed) */
const LWW_EXCLUDED_COLUMNS = new Set([
  "id", "tenantId", "createdAt", "updatedAt", "hlcTimestamp", "syncedAt",
]);

// ─── Pure Conflict Resolution ────────────────────────────────────────────────

/**
 * Resolve column-level Last-Writer-Wins conflict.
 * Pure function — no side effects, fully testable.
 *
 * For each column in incomingColumnHlcs:
 *   - If incoming HLC > current HLC → incoming value wins
 *   - If incoming HLC < current HLC → current value wins (conflict)
 *   - If equal → current wins (server tie-break, deterministic)
 */
export function resolveColumnLWW(
  currentData: Record<string, unknown>,
  currentColumnHlcs: Record<string, string>,
  incomingData: Record<string, unknown>,
  incomingColumnHlcs: Record<string, string>,
): {
  mergedData: Record<string, unknown>;
  mergedColumnHlcs: Record<string, string>;
  hadConflict: boolean;
} {
  const mergedData: Record<string, unknown> = { ...currentData };
  const mergedColumnHlcs: Record<string, string> = { ...currentColumnHlcs };
  let hadConflict = false;

  for (const [column, incomingHlcStr] of Object.entries(incomingColumnHlcs)) {
    if (LWW_EXCLUDED_COLUMNS.has(column)) continue;
    if (!(column in incomingData)) continue;

    const currentHlcStr = currentColumnHlcs[column];

    if (!currentHlcStr) {
      // No existing HLC for this column — incoming wins
      mergedData[column] = incomingData[column];
      mergedColumnHlcs[column] = incomingHlcStr;
      continue;
    }

    const incomingHlc = BigInt(incomingHlcStr);
    const currentHlc = BigInt(currentHlcStr);

    if (incomingHlc > currentHlc) {
      mergedData[column] = incomingData[column];
      mergedColumnHlcs[column] = incomingHlcStr;
    } else {
      // Current wins (either newer or tie — server wins ties)
      if (incomingHlc !== currentHlc || incomingData[column] !== currentData[column]) {
        hadConflict = true;
      }
    }
  }

  return { mergedData, mergedColumnHlcs, hadConflict };
}

/** Build initial column HLCs when inserting a new record (all columns get same HLC) */
export function buildInitialColumnHlcs(
  data: Record<string, unknown>,
  hlcStr: string,
): Record<string, string> {
  const columnHlcs: Record<string, string> = {};
  for (const key of Object.keys(data)) {
    if (!LWW_EXCLUDED_COLUMNS.has(key)) {
      columnHlcs[key] = hlcStr;
    }
  }
  return columnHlcs;
}

/** Strip server-managed columns from data before applying to DB */
function stripServerColumns(data: Record<string, unknown>): Record<string, unknown> {
  const stripped = { ...data };
  for (const col of LWW_EXCLUDED_COLUMNS) {
    delete stripped[col];
  }
  return stripped;
}

/** Serialise a Drizzle record for JSON transport (BigInt → string, Date → ISO) */
function serializeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const serialized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (typeof value === "bigint") {
      serialized[key] = value.toString();
    } else if (value instanceof Date) {
      serialized[key] = value.toISOString();
    } else {
      serialized[key] = value;
    }
  }
  return serialized;
}

/** Generate a server HLC watermark for the current moment */
function serverHlc(): string {
  return encode(Date.now(), 0).toString();
}

// ─── SyncService ─────────────────────────────────────────────────────────────

export class SyncService {
  constructor(private readonly db: Database) {}

  /** Register a new device for sync. Returns device info + auth token. */
  async registerDevice(
    tenantId: string,
    input: {
      deviceName: string;
      deviceType: string;
      platform: string;
      locationId?: string;
      appVersion?: string;
    },
  ) {
    const deviceToken = randomUUID();

    const [device] = await this.db
      .insert(schema.devices)
      .values({
        tenantId,
        locationId: input.locationId ?? null,
        deviceName: input.deviceName,
        deviceType: input.deviceType,
        platform: input.platform,
        appVersion: input.appVersion ?? null,
        deviceToken,
        isActive: true,
      })
      .returning();

    if (!device) throw new Error("Failed to register device");

    // Initialise sync state for all syncable tables
    const tables = SYNC_TABLE_NAMES;
    await this.db.insert(schema.deviceSyncState).values(
      tables.map((tableName) => ({
        deviceId: device.id,
        tenantId,
        tableName,
        lastPulledHlc: 0n,
        lastPushedHlc: 0n,
      })),
    );

    return {
      id: device.id,
      deviceName: device.deviceName,
      deviceToken,
      tables,
    };
  }

  /**
   * Push changes from a device to the cloud.
   *
   * Protocol:
   * 1. For each change, classify the table and apply the right strategy
   * 2. Append-only: INSERT ON CONFLICT DO NOTHING (idempotent)
   * 3. LWW: Column-level merge — highest HLC wins per column
   * 4. Update device sync state
   * 5. Return results with conflict details
   */
  async pushChanges(
    deviceId: string,
    tenantId: string,
    input: {
      batchId: string;
      deviceHlc: string;
      changes: Array<{
        table: string;
        recordId: string;
        operation: string;
        data: Record<string, unknown>;
        hlc: string;
        columnHlcs?: Record<string, string>;
      }>;
    },
  ) {
    let accepted = 0;
    let conflicts = 0;
    const conflictDetails: Array<{
      table: string;
      recordId: string;
      resolution: string;
      resolvedData: Record<string, unknown>;
    }> = [];

    for (const change of input.changes) {
      const tableConfig = SYNC_TABLES[change.table];
      if (!tableConfig) {
        throw new SyncError(`Unknown table: ${change.table}`, "UNKNOWN_TABLE");
      }

      if (tableConfig.classification === "reference") {
        throw new SyncError(
          `Cannot push to reference table: ${change.table}`,
          "READONLY_TABLE",
        );
      }

      const incomingHlc = BigInt(change.hlc);

      if (tableConfig.classification === "append-only") {
        await this.handleAppendOnly(
          tableConfig, change.data, change.recordId, tenantId, incomingHlc,
        );
        accepted++;
      } else {
        const result = await this.handleLWW(
          tableConfig, change.data, change.recordId, tenantId,
          incomingHlc, change.columnHlcs ?? {}, deviceId, change.table,
        );
        accepted++;
        if (result.hadConflict) {
          conflicts++;
          conflictDetails.push({
            table: change.table,
            recordId: change.recordId,
            resolution: "COLUMN_LWW",
            resolvedData: result.mergedData,
          });
        }
      }
    }

    // Update per-table device sync state with max pushed HLC
    const hlcByTable = new Map<string, bigint>();
    for (const change of input.changes) {
      const hlc = BigInt(change.hlc);
      const current = hlcByTable.get(change.table) ?? 0n;
      if (hlc > current) hlcByTable.set(change.table, hlc);
    }

    for (const [tableName, maxHlc] of hlcByTable) {
      await this.db
        .insert(schema.deviceSyncState)
        .values({
          deviceId,
          tenantId,
          tableName,
          lastPushedHlc: maxHlc,
          lastPulledHlc: 0n,
        })
        .onConflictDoUpdate({
          target: [schema.deviceSyncState.deviceId, schema.deviceSyncState.tableName],
          set: { lastPushedHlc: maxHlc, updatedAt: new Date() },
        });
    }

    // Update device timestamps
    await this.db
      .update(schema.devices)
      .set({ lastSyncAt: new Date(), lastSeenAt: new Date() })
      .where(and(eq(schema.devices.id, deviceId), eq(schema.devices.tenantId, tenantId)));

    return {
      batchId: input.batchId,
      accepted,
      conflicts,
      serverHlc: serverHlc(),
      conflictDetails,
    };
  }

  /**
   * Pull changes from cloud to a device.
   *
   * Protocol:
   * 1. For each requested table, query records WHERE hlcTimestamp > sinceHlc
   * 2. For LWW tables, include column HLCs so the device can do local merges
   * 3. Sort by HLC, paginate
   * 4. Update device sync state
   */
  async pullChanges(
    deviceId: string,
    tenantId: string,
    sinceHlc: bigint,
    tables: string[],
    limit: number,
  ) {
    const changes: Array<{
      table: string;
      recordId: string;
      operation: string;
      data: Record<string, unknown>;
      hlc: string;
      columnHlcs?: Record<string, string>;
    }> = [];
    let hasMore = false;

    // Only query valid syncable tables
    const validTables = tables.filter((t) => SYNC_TABLES[t]);

    for (const tableName of validTables) {
      const tableConfig = SYNC_TABLES[tableName]!;

      const records = await this.db
        .select()
        .from(tableConfig.ref)
        .where(
          and(
            eq(tableConfig.ref.tenantId, tenantId),
            gt(tableConfig.ref.hlcTimestamp, sinceHlc),
          ),
        )
        .orderBy(asc(tableConfig.ref.hlcTimestamp))
        .limit(limit + 1);

      if (records.length > limit) {
        hasMore = true;
        records.pop();
      }

      for (const record of records) {
        const rec = record as Record<string, unknown>;
        const isDeleted = "deletedAt" in rec && rec.deletedAt !== null;

        const change: (typeof changes)[number] = {
          table: tableName,
          recordId: rec.id as string,
          operation: isDeleted ? "DELETE" : "UPDATE",
          data: serializeRecord(rec),
          hlc: (rec.hlcTimestamp as bigint).toString(),
        };

        // For LWW tables, include per-column HLCs
        if (tableConfig.classification === "lww") {
          const [colHlcRow] = await this.db
            .select()
            .from(schema.recordColumnHlcs)
            .where(
              and(
                eq(schema.recordColumnHlcs.tenantId, tenantId),
                eq(schema.recordColumnHlcs.tableName, tableName),
                eq(schema.recordColumnHlcs.recordId, rec.id as string),
              ),
            )
            .limit(1);
          if (colHlcRow) {
            change.columnHlcs = colHlcRow.columnHlcs as Record<string, string>;
          }
        }

        changes.push(change);
      }
    }

    // Sort all changes by HLC across tables
    changes.sort((a, b) => {
      const hlcA = BigInt(a.hlc);
      const hlcB = BigInt(b.hlc);
      if (hlcA < hlcB) return -1;
      if (hlcA > hlcB) return 1;
      return 0;
    });

    // Trim to limit if we collected from multiple tables
    if (changes.length > limit) {
      hasMore = true;
      changes.length = limit;
    }

    // Update per-table device sync state with max pulled HLC
    if (changes.length > 0) {
      const hlcByTable = new Map<string, bigint>();
      for (const change of changes) {
        const hlc = BigInt(change.hlc);
        const current = hlcByTable.get(change.table) ?? 0n;
        if (hlc > current) hlcByTable.set(change.table, hlc);
      }

      for (const [tblName, maxHlc] of hlcByTable) {
        await this.db
          .insert(schema.deviceSyncState)
          .values({
            deviceId,
            tenantId,
            tableName: tblName,
            lastPulledHlc: maxHlc,
            lastPushedHlc: 0n,
          })
          .onConflictDoUpdate({
            target: [schema.deviceSyncState.deviceId, schema.deviceSyncState.tableName],
            set: { lastPulledHlc: maxHlc, updatedAt: new Date() },
          });
      }
    }

    // Touch device lastSeenAt
    await this.db
      .update(schema.devices)
      .set({ lastSeenAt: new Date() })
      .where(and(eq(schema.devices.id, deviceId), eq(schema.devices.tenantId, tenantId)));

    return {
      changes,
      serverHlc: serverHlc(),
      hasMore,
      count: changes.length,
    };
  }

  /** Get sync status for a device — last sync times and per-table HLC watermarks. */
  async getDeviceStatus(deviceId: string, tenantId: string) {
    const [device] = await this.db
      .select()
      .from(schema.devices)
      .where(and(eq(schema.devices.id, deviceId), eq(schema.devices.tenantId, tenantId)))
      .limit(1);

    if (!device) throw new SyncError("Device not found", "DEVICE_NOT_FOUND");

    const syncStates = await this.db
      .select()
      .from(schema.deviceSyncState)
      .where(eq(schema.deviceSyncState.deviceId, deviceId));

    return {
      deviceId: device.id,
      deviceName: device.deviceName,
      lastSyncAt: device.lastSyncAt?.toISOString() ?? null,
      lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
      tables: syncStates.map((s) => ({
        tableName: s.tableName,
        lastPulledHlc: s.lastPulledHlc.toString(),
        lastPushedHlc: s.lastPushedHlc.toString(),
      })),
    };
  }

  // ─── Private Handlers ────────────────────────────────────────────────────

  /** Append-only: INSERT ON CONFLICT DO NOTHING (idempotent for retries) */
  private async handleAppendOnly(
    tableConfig: SyncTableConfig,
    data: Record<string, unknown>,
    recordId: string,
    tenantId: string,
    hlc: bigint,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values = {
      ...data,
      id: recordId,
      tenantId,
      hlcTimestamp: hlc,
      syncedAt: new Date(),
      createdOffline: true,
    } as any;

    await this.db
      .insert(tableConfig.ref)
      .values(values)
      .onConflictDoNothing();
  }

  /** LWW: Column-level merge with conflict logging */
  private async handleLWW(
    tableConfig: SyncTableConfig,
    data: Record<string, unknown>,
    recordId: string,
    tenantId: string,
    hlc: bigint,
    columnHlcs: Record<string, string>,
    deviceId: string,
    tableName: string,
  ): Promise<{ mergedData: Record<string, unknown>; hadConflict: boolean }> {
    // Check if record exists
    const existing = await this.db
      .select()
      .from(tableConfig.ref)
      .where(
        and(
          eq(tableConfig.ref.id, recordId),
          eq(tableConfig.ref.tenantId, tenantId),
        ),
      )
      .limit(1);

    if (existing.length === 0) {
      // New record — insert
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const values = {
        ...data,
        id: recordId,
        tenantId,
        hlcTimestamp: hlc,
        updatedAt: new Date(),
      } as any;

      await this.db.insert(tableConfig.ref).values(values);

      // Store initial column HLCs
      const initialColumnHlcs = Object.keys(columnHlcs).length > 0
        ? columnHlcs
        : buildInitialColumnHlcs(data, hlc.toString());

      await this.db
        .insert(schema.recordColumnHlcs)
        .values({
          tenantId,
          tableName,
          recordId,
          columnHlcs: initialColumnHlcs,
        })
        .onConflictDoNothing();

      return { mergedData: data, hadConflict: false };
    }

    // Existing record — resolve conflicts
    const currentRecord = existing[0] as Record<string, unknown>;

    // Get stored column HLCs
    const [currentColumnHlcRow] = await this.db
      .select()
      .from(schema.recordColumnHlcs)
      .where(
        and(
          eq(schema.recordColumnHlcs.tenantId, tenantId),
          eq(schema.recordColumnHlcs.tableName, tableName),
          eq(schema.recordColumnHlcs.recordId, recordId),
        ),
      )
      .limit(1);

    const currentColumnHlcs =
      (currentColumnHlcRow?.columnHlcs as Record<string, string>) ?? {};
    const incomingColumnHlcs = Object.keys(columnHlcs).length > 0
      ? columnHlcs
      : buildInitialColumnHlcs(data, hlc.toString());

    // Fallback to row-level LWW if neither side has column HLCs
    if (
      Object.keys(currentColumnHlcs).length === 0 &&
      Object.keys(incomingColumnHlcs).length === 0
    ) {
      const currentHlc = currentRecord.hlcTimestamp as bigint;
      if (hlc > currentHlc) {
        await this.db
          .update(tableConfig.ref)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .set({
            ...stripServerColumns(data),
            hlcTimestamp: hlc,
            updatedAt: new Date(),
          } as any)
          .where(eq(tableConfig.ref.id, recordId));
        return { mergedData: data, hadConflict: false };
      }
      return { mergedData: currentRecord, hadConflict: true };
    }

    // Column-level LWW resolution
    const { mergedData, mergedColumnHlcs, hadConflict } = resolveColumnLWW(
      currentRecord,
      currentColumnHlcs,
      data,
      incomingColumnHlcs,
    );

    // Max HLC across all merged columns → row-level hlcTimestamp
    const maxHlc = Object.values(mergedColumnHlcs).reduce((max, v) => {
      const h = BigInt(v);
      return h > max ? h : max;
    }, 0n);

    // Update the record with merged data
    await this.db
      .update(tableConfig.ref)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set({
        ...stripServerColumns(mergedData),
        hlcTimestamp: maxHlc,
        updatedAt: new Date(),
      } as any)
      .where(eq(tableConfig.ref.id, recordId));

    // Upsert column HLCs
    await this.db
      .insert(schema.recordColumnHlcs)
      .values({
        tenantId,
        tableName,
        recordId,
        columnHlcs: mergedColumnHlcs,
      })
      .onConflictDoUpdate({
        target: [
          schema.recordColumnHlcs.tenantId,
          schema.recordColumnHlcs.tableName,
          schema.recordColumnHlcs.recordId,
        ],
        set: { columnHlcs: mergedColumnHlcs, updatedAt: new Date() },
      });

    // Audit: log the conflict
    if (hadConflict) {
      await this.db.insert(schema.syncConflicts).values({
        tenantId,
        deviceId,
        tableName,
        recordId,
        localData: currentRecord as Record<string, unknown>,
        remoteData: data,
        resolution: "COLUMN_LWW",
        resolvedData: mergedData,
      });
    }

    return { mergedData, hadConflict };
  }
}

export class SyncError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "SyncError";
  }
}
