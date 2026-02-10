import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import type { CartItem } from "../stores/cart";
import { formatPence } from "../lib/format";
import { colors } from "../theme/colors";

interface Props {
  item: CartItem;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}

export function CartItemRow({ item, onIncrement, onDecrement, onRemove }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {item.menuItem.name}
        </Text>
        {item.notes && (
          <Text style={styles.notes} numberOfLines={1}>
            {item.notes}
          </Text>
        )}
        <Text style={styles.unitPrice}>
          {formatPence(item.menuItem.price)} each
        </Text>
      </View>

      <View style={styles.controls}>
        <View style={styles.qty}>
          <TouchableOpacity style={styles.qtyBtn} onPress={onDecrement}>
            <Text style={styles.qtyBtnText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.qtyText}>{item.quantity}</Text>
          <TouchableOpacity style={styles.qtyBtn} onPress={onIncrement}>
            <Text style={styles.qtyBtnText}>+</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.total}>{formatPence(item.subtotal)}</Text>
      </View>

      <TouchableOpacity style={styles.removeBtn} onPress={onRemove}>
        <Text style={styles.removeText}>X</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  info: {
    flex: 1,
    marginRight: 8,
  },
  name: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.text,
  },
  notes: {
    fontSize: 12,
    color: colors.warning,
    fontStyle: "italic",
    marginTop: 2,
  },
  unitPrice: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  controls: {
    alignItems: "flex-end",
  },
  qty: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  qtyBtnText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
  },
  qtyText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    minWidth: 20,
    textAlign: "center",
  },
  total: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    marginTop: 4,
  },
  removeBtn: {
    marginLeft: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.dangerLight,
    justifyContent: "center",
    alignItems: "center",
  },
  removeText: {
    fontSize: 12,
    fontWeight: "700",
    color: colors.textInverse,
  },
});
