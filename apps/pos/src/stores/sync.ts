import { create } from "zustand";
import { getSyncEngine, type SyncStatus } from "../sync/engine";
import { getPendingChangeCount } from "../db/queries";

interface SyncState {
  status: SyncStatus;
  isOnline: boolean;
  lastPushAt: string | null;
  lastPullAt: string | null;
  pendingChanges: number;
  error: string | null;

  init: () => () => void;
  startSync: () => void;
  stopSync: () => void;
  manualSync: () => Promise<void>;
  refreshPendingCount: () => void;
}

export const useSyncStore = create<SyncState>((set) => ({
  status: "idle",
  isOnline: false,
  lastPushAt: null,
  lastPullAt: null,
  pendingChanges: 0,
  error: null,

  init: () => {
    const engine = getSyncEngine();
    const unsubscribe = engine.onStatusChange((status) => {
      set({
        status,
        isOnline: engine.isOnline,
        lastPushAt: engine.lastPushAt,
        lastPullAt: engine.lastPullAt,
        error: engine.error,
        pendingChanges: getPendingChangeCount(),
      });
    });
    return unsubscribe;
  },

  startSync: () => {
    const engine = getSyncEngine();
    engine.start();
    set({ isOnline: true });
  },

  stopSync: () => {
    const engine = getSyncEngine();
    engine.stop();
    set({ isOnline: false });
  },

  manualSync: async () => {
    const engine = getSyncEngine();
    await engine.fullSync();
    set({ pendingChanges: getPendingChangeCount() });
  },

  refreshPendingCount: () => {
    set({ pendingChanges: getPendingChangeCount() });
  },
}));
