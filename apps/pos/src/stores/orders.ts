import { create } from "zustand";
import {
  createLocalOrder,
  completeOrder,
  getLocalOrders,
  getOrderItems,
  getOrderPayments,
  getOrderTotalPaid,
  insertPayment,
  voidLocalOrder,
  type LocalOrder,
  type LocalOrderItem,
  type LocalPayment,
  type CreateOrderParams,
} from "../db/queries";
import { useCartStore } from "./cart";
import { useShiftStore } from "./shift";

interface OrderDetail {
  order: LocalOrder;
  items: LocalOrderItem[];
  payments: LocalPayment[];
  totalPaid: number;
  balanceDue: number;
}

interface OrdersState {
  orders: LocalOrder[];
  currentOrder: OrderDetail | null;
  isLoading: boolean;
  error: string | null;

  createOrder: (params: CreateOrderParams) => LocalOrder | null;
  loadOrders: (shiftId?: string) => void;
  selectOrder: (id: string) => void;
  clearSelection: () => void;
  addPayment: (params: {
    tenantId: string;
    orderId: string;
    paymentMethod: string;
    amount: number;
    tipAmount?: number;
    cashGiven?: number;
    changeGiven?: number;
  }) => LocalPayment | null;
  voidOrder: (orderId: string, reason: string, userId: string) => void;
}

export const useOrdersStore = create<OrdersState>((set, get) => ({
  orders: [],
  currentOrder: null,
  isLoading: false,
  error: null,

  createOrder: (params) => {
    try {
      const order = createLocalOrder(params);
      set((state) => ({ orders: [order, ...state.orders] }));
      return order;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Failed to create order",
      });
      return null;
    }
  },

  loadOrders: (shiftId) => {
    set({ isLoading: true });
    const orders = getLocalOrders(shiftId);
    set({ orders, isLoading: false });
  },

  selectOrder: (id) => {
    const order =
      get().orders.find((o) => o.id === id) ?? null;
    if (!order) return;
    const items = getOrderItems(id);
    const payments = getOrderPayments(id);
    const totalPaid = getOrderTotalPaid(id);
    set({
      currentOrder: {
        order,
        items,
        payments,
        totalPaid,
        balanceDue: order.total - totalPaid,
      },
    });
  },

  clearSelection: () => set({ currentOrder: null }),

  addPayment: (params) => {
    try {
      const payment = insertPayment(params);

      // Check if order is fully paid
      const totalPaid = getOrderTotalPaid(params.orderId);
      const order = get().orders.find((o) => o.id === params.orderId);
      if (order && totalPaid >= order.total) {
        completeOrder(params.orderId);
        // Update order status in local state
        set((state) => ({
          orders: state.orders.map((o) =>
            o.id === params.orderId
              ? { ...o, status: "completed", completed_at: new Date().toISOString() }
              : o,
          ),
        }));
        // Clear cart after successful payment
        useCartStore.getState().clear();
        // Refresh shift summary
        useShiftStore.getState().refreshSummary();
      }

      // Update current order if selected
      if (get().currentOrder?.order.id === params.orderId) {
        get().selectOrder(params.orderId);
      }

      return payment;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Payment failed",
      });
      return null;
    }
  },

  voidOrder: (orderId, reason, userId) => {
    try {
      voidLocalOrder(orderId, reason, userId);
      set((state) => ({
        orders: state.orders.map((o) =>
          o.id === orderId ? { ...o, status: "voided" } : o,
        ),
        currentOrder: null,
      }));
      useShiftStore.getState().refreshSummary();
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "Void failed",
      });
    }
  },
}));
