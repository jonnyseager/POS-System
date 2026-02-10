import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
} from "react-native";
import { useCartStore } from "../stores/cart";
import { useOrdersStore } from "../stores/orders";
import { useShiftStore } from "../stores/shift";
import { useAuthStore } from "../stores/auth";
import { useMenuStore } from "../stores/menu";
import { CashPayment } from "./cash-payment";
import { formatPence } from "../lib/format";
import { colors } from "../theme/colors";

interface Props {
  onClose: () => void;
  onComplete: (orderId: string) => void;
}

type PaymentStep = "method" | "cash" | "card" | "processing";

export function PaymentModal({ onClose, onComplete }: Props) {
  const [step, setStep] = useState<PaymentStep>("method");
  const [error, setError] = useState("");

  const cartItems = useCartStore((s) => s.items);
  const total = useCartStore((s) => s.total);
  const discountType = useCartStore((s) => s.discountType);
  const discountValue = useCartStore((s) => s.discountValue);
  const discountReason = useCartStore((s) => s.discountReason);
  const orderNotes = useCartStore((s) => s.orderNotes);
  const customerName = useCartStore((s) => s.customerName);

  const { createOrder, addPayment } = useOrdersStore();
  const currentShift = useShiftStore((s) => s.currentShift);
  const { user, tenant, deviceId } = useAuthStore();
  const getTaxRateForItem = useMenuStore((s) => s.getTaxRateForItem);

  const handleCashPayment = (cashGiven: number) => {
    if (!currentShift || !user || !tenant) return;
    setError("");

    try {
      // Create order locally
      const order = createOrder({
        tenantId: tenant.id,
        locationId: currentShift.location_id,
        deviceId: deviceId ?? "unknown",
        shiftId: currentShift.id,
        userId: user.id,
        items: cartItems.map((item) => {
          const taxRate = getTaxRateForItem(item.menuItem.tax_rate_id);
          return {
            menuItemId: item.menuItem.id,
            name: item.menuItem.name,
            quantity: item.quantity,
            unitPrice: item.menuItem.price,
            unitCost: item.menuItem.cost_price,
            taxRate: taxRate?.rate ?? "0",
            notes: item.notes ?? undefined,
          };
        }),
        discountType: discountType ?? undefined,
        discountValue: discountValue || undefined,
        discountReason: discountReason || undefined,
        notes: orderNotes || undefined,
        customerName: customerName || undefined,
      });

      if (!order) {
        setError("Failed to create order");
        return;
      }

      const changeGiven = cashGiven - total();

      // Add cash payment
      const payment = addPayment({
        tenantId: tenant.id,
        orderId: order.id,
        paymentMethod: "cash",
        amount: total(),
        cashGiven,
        changeGiven: changeGiven > 0 ? changeGiven : 0,
      });

      if (!payment) {
        setError("Failed to process payment");
        return;
      }

      onComplete(order.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Payment failed");
    }
  };

  const handleCardPayment = () => {
    if (!currentShift || !user || !tenant) return;
    setError("");
    setStep("processing");

    try {
      // Create order first
      const order = createOrder({
        tenantId: tenant.id,
        locationId: currentShift.location_id,
        deviceId: deviceId ?? "unknown",
        shiftId: currentShift.id,
        userId: user.id,
        items: cartItems.map((item) => {
          const taxRate = getTaxRateForItem(item.menuItem.tax_rate_id);
          return {
            menuItemId: item.menuItem.id,
            name: item.menuItem.name,
            quantity: item.quantity,
            unitPrice: item.menuItem.price,
            unitCost: item.menuItem.cost_price,
            taxRate: taxRate?.rate ?? "0",
            notes: item.notes ?? undefined,
          };
        }),
        discountType: discountType ?? undefined,
        discountValue: discountValue || undefined,
        discountReason: discountReason || undefined,
        notes: orderNotes || undefined,
        customerName: customerName || undefined,
      });

      if (!order) {
        setError("Failed to create order");
        setStep("method");
        return;
      }

      // In production, this would use Stripe Terminal SDK to collect card payment.
      // For now, record as completed card payment locally.
      const payment = addPayment({
        tenantId: tenant.id,
        orderId: order.id,
        paymentMethod: "card",
        amount: total(),
      });

      if (!payment) {
        setError("Card payment failed");
        setStep("method");
        return;
      }

      onComplete(order.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Card payment failed");
      setStep("method");
    }
  };

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Payment</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeBtn}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.totalDisplay}>
            <Text style={styles.totalLabel}>Amount Due</Text>
            <Text style={styles.totalAmount}>{formatPence(total())}</Text>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {step === "method" && (
            <View style={styles.methods}>
              <TouchableOpacity
                style={styles.methodBtn}
                onPress={() => setStep("cash")}
              >
                <Text style={styles.methodIcon}>£</Text>
                <Text style={styles.methodLabel}>Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.methodBtn, styles.cardMethodBtn]}
                onPress={handleCardPayment}
              >
                <Text style={styles.methodIcon}>💳</Text>
                <Text style={styles.methodLabel}>Card</Text>
              </TouchableOpacity>
            </View>
          )}

          {step === "cash" && (
            <CashPayment
              total={total()}
              onPay={handleCashPayment}
              onBack={() => setStep("method")}
            />
          )}

          {step === "processing" && (
            <View style={styles.processing}>
              <Text style={styles.processingText}>Processing card...</Text>
              <Text style={styles.processingSubtext}>
                Present card to reader
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    width: 480,
    maxHeight: "80%",
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
  },
  closeBtn: {
    fontSize: 15,
    color: colors.primary,
    fontWeight: "500",
  },
  totalDisplay: {
    alignItems: "center",
    paddingVertical: 24,
    backgroundColor: colors.background,
  },
  totalLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  totalAmount: {
    fontSize: 36,
    fontWeight: "700",
    color: colors.text,
    marginTop: 4,
  },
  errorBox: {
    backgroundColor: "#fef2f2",
    padding: 12,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 8,
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
  },
  methods: {
    flexDirection: "row",
    padding: 20,
    gap: 16,
  },
  methodBtn: {
    flex: 1,
    paddingVertical: 32,
    borderRadius: 12,
    backgroundColor: colors.success,
    alignItems: "center",
    gap: 8,
  },
  cardMethodBtn: {
    backgroundColor: colors.primary,
  },
  methodIcon: {
    fontSize: 32,
    color: colors.textInverse,
  },
  methodLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textInverse,
  },
  processing: {
    padding: 40,
    alignItems: "center",
  },
  processingText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.text,
  },
  processingSubtext: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 8,
  },
});
