import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useCartStore } from "../stores/cart";
import { CartItemRow } from "./cart-item";
import { formatPence } from "../lib/format";
import { colors } from "../theme/colors";

interface Props {
  onPay: () => void;
}

export function Cart({ onPay }: Props) {
  const items = useCartStore((s) => s.items);
  const subtotal = useCartStore((s) => s.subtotal);
  const taxTotal = useCartStore((s) => s.taxTotal);
  const discountTotal = useCartStore((s) => s.discountTotal);
  const total = useCartStore((s) => s.total);
  const itemCount = useCartStore((s) => s.itemCount);
  const clear = useCartStore((s) => s.clear);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Current Order</Text>
        <Text style={styles.itemCount}>
          {itemCount()} {itemCount() === 1 ? "item" : "items"}
        </Text>
      </View>

      {/* Items */}
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Tap items to add</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(_, i) => String(i)}
          style={styles.list}
          renderItem={({ item, index }) => (
            <CartItemRow
              item={item}
              onIncrement={() => updateQuantity(index, item.quantity + 1)}
              onDecrement={() => updateQuantity(index, item.quantity - 1)}
              onRemove={() => removeItem(index)}
            />
          )}
        />
      )}

      {/* Totals */}
      {items.length > 0 && (
        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal</Text>
            <Text style={styles.totalValue}>{formatPence(subtotal())}</Text>
          </View>
          {discountTotal() > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Discount</Text>
              <Text style={[styles.totalValue, { color: colors.danger }]}>
                -{formatPence(discountTotal())}
              </Text>
            </View>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Tax</Text>
            <Text style={styles.totalValue}>{formatPence(taxTotal())}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.grandTotalLabel}>Total</Text>
            <Text style={styles.grandTotalValue}>{formatPence(total())}</Text>
          </View>
        </View>
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {items.length > 0 && (
          <>
            <TouchableOpacity style={styles.clearBtn} onPress={clear}>
              <Text style={styles.clearBtnText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.payBtn} onPress={onPay}>
              <Text style={styles.payBtnText}>
                Pay {formatPence(total())}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.cart,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: colors.cartHeader,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.textInverse,
  },
  itemCount: {
    fontSize: 13,
    color: colors.sidebarText,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: colors.textMuted,
  },
  list: {
    flex: 1,
  },
  totals: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  totalLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 8,
  },
  grandTotalLabel: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  grandTotalValue: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  actions: {
    flexDirection: "row",
    padding: 12,
    gap: 8,
  },
  clearBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.borderDark,
    alignItems: "center",
  },
  clearBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  payBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: colors.success,
    alignItems: "center",
  },
  payBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textInverse,
  },
});
