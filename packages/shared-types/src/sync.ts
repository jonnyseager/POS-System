import type { UUID, ISODateString } from "./common.js";

/** Sync change operations */
export type SyncOperation = "INSERT" | "UPDATE" | "DELETE";

/** Data classification for sync conflict resolution */
export type SyncDataClassification = "append-only" | "lww" | "reference";

/** A single change in a sync batch */
export interface SyncChange {
  table: string;
  recordId: UUID;
  operation: SyncOperation;
  data: Record<string, unknown>;
  hlc: string; // BigInt serialised as string for JSON transport
  columnHlcs?: Record<string, string>; // Per-column HLCs for LWW tables
}

/** Push request from device to cloud */
export interface SyncPushRequest {
  batchId: UUID;
  deviceHlc: string;
  changes: SyncChange[];
}

/** Push response from cloud to device */
export interface SyncPushResponse {
  batchId: UUID;
  accepted: number;
  conflicts: number;
  serverHlc: string;
  conflictDetails: SyncConflictDetail[];
}

/** Detail of a resolved conflict */
export interface SyncConflictDetail {
  table: string;
  recordId: UUID;
  resolution: string;
  resolvedData: Record<string, unknown>;
}

/** Pull response from cloud to device */
export interface SyncPullResponse {
  changes: SyncChange[];
  serverHlc: string;
  hasMore: boolean;
  count: number;
}

/** Device sync status */
export interface DeviceSyncStatus {
  deviceId: UUID;
  deviceName: string;
  lastSyncAt: ISODateString | null;
  lastSeenAt: ISODateString | null;
  tables: Array<{
    tableName: string;
    lastPulledHlc: string;
    lastPushedHlc: string;
  }>;
}
