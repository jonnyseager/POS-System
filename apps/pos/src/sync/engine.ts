import { v4 as uuidv4 } from "uuid";
import * as api from "../lib/api";
import { merge as hlcMerge, hlcFromString } from "../lib/hlc";
import {
  getPendingChanges,
  markChangesSynced,
  getGlobalSyncWatermark,
  updateSyncWatermark,
  upsertFromSync,
  getDeviceConfig,
} from "../db/queries";

export type SyncStatus = "idle" | "pushing" | "pulling" | "error";

type StatusListener = (status: SyncStatus, detail?: string) => void;

const PUSH_INTERVAL = 30_000;
const PULL_INTERVAL = 60_000;
const BATCH_SIZE = 500;

export class SyncEngine {
  private pushTimer: ReturnType<typeof setInterval> | null = null;
  private pullTimer: ReturnType<typeof setInterval> | null = null;
  private listeners: StatusListener[] = [];
  private _status: SyncStatus = "idle";
  private _isOnline = false;
  private _lastPushAt: string | null = null;
  private _lastPullAt: string | null = null;
  private _error: string | null = null;

  get status(): SyncStatus {
    return this._status;
  }
  get isOnline(): boolean {
    return this._isOnline;
  }
  get lastPushAt(): string | null {
    return this._lastPushAt;
  }
  get lastPullAt(): string | null {
    return this._lastPullAt;
  }
  get error(): string | null {
    return this._error;
  }

  onStatusChange(listener: StatusListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private emit(status: SyncStatus, detail?: string): void {
    this._status = status;
    if (status === "error") {
      this._error = detail ?? "Unknown error";
    } else {
      this._error = null;
    }
    for (const listener of this.listeners) {
      listener(status, detail);
    }
  }

  start(): void {
    this.stop();
    this._isOnline = true;

    // Initial sync immediately
    void this.fullSync();

    this.pushTimer = setInterval(() => {
      void this.push();
    }, PUSH_INTERVAL);

    this.pullTimer = setInterval(() => {
      void this.pull();
    }, PULL_INTERVAL);
  }

  stop(): void {
    this._isOnline = false;
    if (this.pushTimer) {
      clearInterval(this.pushTimer);
      this.pushTimer = null;
    }
    if (this.pullTimer) {
      clearInterval(this.pullTimer);
      this.pullTimer = null;
    }
  }

  async fullSync(): Promise<void> {
    await this.push();
    await this.pull();
  }

  async push(): Promise<void> {
    const deviceId = getDeviceConfig("deviceId");
    if (!deviceId) return;

    try {
      this.emit("pushing");

      const pending = getPendingChanges(BATCH_SIZE);
      if (pending.length === 0) {
        this.emit("idle");
        return;
      }

      const changes = pending.map((c) => ({
        table: c.table_name,
        recordId: c.record_id,
        operation: c.operation,
        data: JSON.parse(c.data) as Record<string, unknown>,
        hlc: c.hlc,
        ...(c.column_hlcs ? { columnHlcs: JSON.parse(c.column_hlcs) as Record<string, string> } : {}),
      }));

      const batchId = uuidv4();
      const deviceHlc = changes[changes.length - 1]!.hlc;

      const result = await api.pushSync(deviceId, {
        batchId,
        deviceHlc,
        changes,
      });

      // Mark as synced
      markChangesSynced(pending.map((c) => c.id));

      // Merge server HLC
      hlcMerge(hlcFromString(result.serverHlc));

      this._lastPushAt = new Date().toISOString();
      this.emit("idle");

      // If there are more pending changes, push again
      if (pending.length === BATCH_SIZE) {
        void this.push();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Push failed";
      this.emit("error", message);
    }
  }

  async pull(): Promise<void> {
    const deviceId = getDeviceConfig("deviceId");
    if (!deviceId) return;

    try {
      this.emit("pulling");

      const sinceHlc = getGlobalSyncWatermark();
      const result = await api.pullSync(deviceId, sinceHlc, undefined, BATCH_SIZE);

      // Apply changes locally
      for (const change of result.changes) {
        upsertFromSync(
          change.table,
          change.recordId,
          change.data,
          change.hlc,
        );
        updateSyncWatermark(change.table, change.hlc);
      }

      // Merge server HLC
      hlcMerge(hlcFromString(result.serverHlc));

      this._lastPullAt = new Date().toISOString();
      this.emit("idle");

      // If more changes available, pull again
      if (result.hasMore) {
        void this.pull();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Pull failed";
      this.emit("error", message);
    }
  }
}

// Singleton
let engine: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine {
  if (!engine) {
    engine = new SyncEngine();
  }
  return engine;
}
