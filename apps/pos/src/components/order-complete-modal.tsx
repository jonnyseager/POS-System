import { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Modal } from "react-native";
import { useOrdersStore } from "../stores/orders";
import { formatPence } from "../lib/format";
import { colors } from "../theme/colors";

interface Props {
  orderId: string;
  onClose: () => void;
}

export function OrderCompleteModal({ orderId, onClose }: Props) {
  const { currentOrder, selectOrder, clearSelection } = useOrdersStore();

  useEffect(() => {
    selectOrder(orderId);
    return () => clearSelection();
  }, [orderId, selectOrder, clearSelection]);

  if (!currentOrder) return null;

  const { order, items, payments } = currentOrder;

  return (
    <Modal visible transparent animationType="fade">
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.successIcon}>
            <Text style={styles.checkmark}>✓</Text>
          </View>

          <Text style={styles.title}>Order Complete</Text>
          <Text style={styles.orderNumber}>#{order.order_number}</Text>

          <View style={styles.divider} />

          {items.map((item) => (
            <View key={item.id} style={styles.itemRow}>
              <Text style={styles.itemText}>
                {item.quantity}x {item.name}
              </Text>
              <Text style={styles.itemPrice}>{formatPence(item.total)}</Text>
            </View>
          ))}

          <View style={styles.divider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatPence(order.total)}</Text>
          </View>

          {payments.map((p) => (
            <View key={p.id} style={styles.paymentRow}>
              <Text style={styles.paymentMethod}>
                Paid by {p.payment_method}
              </Text>
              <Text style={styles.paymentAmount}>{formatPence(p.amount)}</Text>
            </View>
          ))}

          {payments.some(
            (p) => p.payment_method === "cash" && p.change_given && p.change_given > 0,
          ) && (
            <View style={styles.changeRow}>
              <Text style={styles.changeLabel}>Change</Text>
              <Text style={styles.changeValue}>
                {formatPence(
                  payments.find((p) => p.payment_method === "cash")
                    ?.change_given ?? 0,
                )}
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
            <Text style={styles.doneBtnText}>Done</Text>
          </TouchableOpacity>
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
    padding: 32,
    width: 400,
    alignItems: "center",
  },
  successIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.success,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  checkmark: {
    fontSize: 32,
    color: colors.textInverse,
    fontWeight: "700",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: colors.text,
  },
  orderNumber: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 4,
    marginBottom: 16,
  },
  divider: {
    width: "100%",
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 12,
  },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingVertical: 4,
  },
  itemText: {
    fontSize: 14,
    color: colors.text,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingVertical: 4,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingVertical: 3,
  },
  paymentMethod: {
    fontSize: 14,
    color: colors.textSecondary,
    textTransform: "capitalize",
  },
  paymentAmount: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  changeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    paddingVertical: 3,
    marginTop: 4,
  },
  changeLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.success,
  },
  changeValue: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.success,
  },
  doneBtn: {
    marginTop: 24,
    width: "100%",
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  doneBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textInverse,
  },
});
