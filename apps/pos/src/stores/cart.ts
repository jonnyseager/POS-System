import { create } from "zustand";
import type { LocalMenuItem, LocalTaxRate } from "../db/queries";

export interface CartItem {
  menuItem: LocalMenuItem;
  quantity: number;
  notes: string | null;
  taxRate: LocalTaxRate | null;
  // Computed
  subtotal: number;
  taxAmount: number;
  total: number;
}

interface CartState {
  items: CartItem[];
  discountType: "percentage" | "fixed" | null;
  discountValue: number; // percentage: basis points (100 = 1%), fixed: pence
  discountReason: string;
  customerName: string;
  orderNotes: string;

  // Actions
  addItem: (menuItem: LocalMenuItem, taxRate: LocalTaxRate | null) => void;
  removeItem: (index: number) => void;
  updateQuantity: (index: number, quantity: number) => void;
  setItemNotes: (index: number, notes: string) => void;
  setDiscount: (
    type: "percentage" | "fixed" | null,
    value: number,
    reason?: string,
  ) => void;
  setCustomerName: (name: string) => void;
  setOrderNotes: (notes: string) => void;
  clear: () => void;

  // Computed
  subtotal: () => number;
  taxTotal: () => number;
  discountTotal: () => number;
  total: () => number;
  itemCount: () => number;
}

function computeItem(
  menuItem: LocalMenuItem,
  quantity: number,
  taxRate: LocalTaxRate | null,
  notes: string | null,
): CartItem {
  const subtotal = menuItem.price * quantity;
  const rate = taxRate ? parseFloat(taxRate.rate) : 0;
  const taxAmount = Math.round(subtotal * rate);
  return {
    menuItem,
    quantity,
    notes,
    taxRate,
    subtotal,
    taxAmount,
    total: subtotal + taxAmount,
  };
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  discountType: null,
  discountValue: 0,
  discountReason: "",
  customerName: "",
  orderNotes: "",

  addItem: (menuItem, taxRate) => {
    set((state) => {
      // Check if item already in cart
      const existing = state.items.findIndex(
        (i) => i.menuItem.id === menuItem.id && !i.notes,
      );
      if (existing >= 0) {
        const updated = [...state.items];
        const item = updated[existing]!;
        updated[existing] = computeItem(
          item.menuItem,
          item.quantity + 1,
          item.taxRate,
          item.notes,
        );
        return { items: updated };
      }
      return {
        items: [
          ...state.items,
          computeItem(menuItem, 1, taxRate, null),
        ],
      };
    });
  },

  removeItem: (index) => {
    set((state) => ({
      items: state.items.filter((_, i) => i !== index),
    }));
  },

  updateQuantity: (index, quantity) => {
    if (quantity <= 0) {
      get().removeItem(index);
      return;
    }
    set((state) => {
      const updated = [...state.items];
      const item = updated[index];
      if (item) {
        updated[index] = computeItem(
          item.menuItem,
          quantity,
          item.taxRate,
          item.notes,
        );
      }
      return { items: updated };
    });
  },

  setItemNotes: (index, notes) => {
    set((state) => {
      const updated = [...state.items];
      const item = updated[index];
      if (item) {
        updated[index] = computeItem(
          item.menuItem,
          item.quantity,
          item.taxRate,
          notes || null,
        );
      }
      return { items: updated };
    });
  },

  setDiscount: (type, value, reason) => {
    set({
      discountType: type,
      discountValue: value,
      discountReason: reason ?? "",
    });
  },

  setCustomerName: (name) => set({ customerName: name }),
  setOrderNotes: (notes) => set({ orderNotes: notes }),

  clear: () =>
    set({
      items: [],
      discountType: null,
      discountValue: 0,
      discountReason: "",
      customerName: "",
      orderNotes: "",
    }),

  subtotal: () => get().items.reduce((sum, i) => sum + i.subtotal, 0),
  taxTotal: () => get().items.reduce((sum, i) => sum + i.taxAmount, 0),

  discountTotal: () => {
    const state = get();
    if (!state.discountType || !state.discountValue) return 0;
    const sub = state.subtotal();
    if (state.discountType === "percentage") {
      return Math.round(sub * (state.discountValue / 10000));
    }
    return Math.min(state.discountValue, sub);
  },

  total: () => {
    const state = get();
    return state.subtotal() + state.taxTotal() - state.discountTotal();
  },

  itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
}));
