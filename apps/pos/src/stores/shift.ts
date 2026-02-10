import { create } from "zustand";
import {
  getOpenShift,
  insertShift,
  closeLocalShift,
  getShiftSummary,
  type LocalShift,
} from "../db/queries";

interface ShiftSummary {
  totalOrders: number;
  totalRevenue: number;
  cashTotal: number;
  cardTotal: number;
}

interface ShiftState {
  currentShift: LocalShift | null;
  summary: ShiftSummary | null;
  isLoading: boolean;
  error: string | null;

  loadCurrentShift: () => void;
  openShift: (params: {
    tenantId: string;
    locationId: string;
    userId: string;
    openingCash: number;
  }) => void;
  closeShift: (closingCash: number, notes?: string) => void;
  refreshSummary: () => void;
  isShiftOpen: () => boolean;
}

export const useShiftStore = create<ShiftState>((set, get) => ({
  currentShift: null,
  summary: null,
  isLoading: false,
  error: null,

  loadCurrentShift: () => {
    const shift = getOpenShift();
    set({ currentShift: shift });
    if (shift) {
      get().refreshSummary();
    }
  },

  openShift: (params) => {
    set({ isLoading: true, error: null });
    try {
      const shift = insertShift(params);
      set({
        currentShift: shift,
        summary: { totalOrders: 0, totalRevenue: 0, cashTotal: 0, cardTotal: 0 },
        isLoading: false,
      });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to open shift",
        isLoading: false,
      });
    }
  },

  closeShift: (closingCash, notes) => {
    const shift = get().currentShift;
    if (!shift) return;
    set({ isLoading: true, error: null });
    try {
      closeLocalShift(shift.id, closingCash, notes);
      set({ currentShift: null, summary: null, isLoading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to close shift",
        isLoading: false,
      });
    }
  },

  refreshSummary: () => {
    const shift = get().currentShift;
    if (!shift) return;
    const summary = getShiftSummary(shift.id);
    set({ summary });
  },

  isShiftOpen: () => get().currentShift !== null,
}));
