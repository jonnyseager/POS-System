import { View, Text, StyleSheet } from "react-native";
import { useState } from "react";
import { CategoryBar } from "../../components/category-bar";
import { MenuGrid } from "../../components/menu-grid";
import { Cart } from "../../components/cart";
import { PaymentModal } from "../../components/payment-modal";
import { OrderCompleteModal } from "../../components/order-complete-modal";
import { useShiftStore } from "../../stores/shift";
import { colors } from "../../theme/colors";

export default function OrderScreen() {
  const [showPayment, setShowPayment] = useState(false);
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);
  const isShiftOpen = useShiftStore((s) => s.isShiftOpen);

  if (!isShiftOpen()) {
    return (
      <View style={styles.noShift}>
        <Text style={styles.noShiftTitle}>No Active Shift</Text>
        <Text style={styles.noShiftText}>
          Open a shift from the Shift tab to start taking orders.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Left side: menu browsing */}
      <View style={styles.menuSide}>
        <CategoryBar />
        <MenuGrid />
      </View>

      {/* Right side: cart */}
      <View style={styles.cartSide}>
        <Cart onPay={() => setShowPayment(true)} />
      </View>

      {/* Payment modal */}
      {showPayment && (
        <PaymentModal
          onClose={() => setShowPayment(false)}
          onComplete={(orderId) => {
            setShowPayment(false);
            setCompletedOrderId(orderId);
          }}
        />
      )}

      {/* Order complete */}
      {completedOrderId && (
        <OrderCompleteModal
          orderId={completedOrderId}
          onClose={() => setCompletedOrderId(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: "row",
  },
  menuSide: {
    flex: 7,
    borderRightWidth: 1,
    borderRightColor: colors.border,
  },
  cartSide: {
    flex: 3,
    backgroundColor: colors.cart,
  },
  noShift: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  noShiftTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 8,
  },
  noShiftText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
