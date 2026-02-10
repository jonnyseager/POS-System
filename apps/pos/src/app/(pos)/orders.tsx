import { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useOrdersStore } from "../../stores/orders";
import { useShiftStore } from "../../stores/shift";
import { formatPence, formatTime } from "../../lib/format";
import { colors } from "../../theme/colors";

const STATUS_COLORS: Record<string, string> = {
  open: colors.warning,
  completed: colors.success,
  voided: colors.danger,
  refunded: colors.textMuted,
};

export default function OrdersScreen() {
  const { orders, loadOrders, currentOrder, selectOrder, clearSelection, voidOrder } =
    useOrdersStore();
  const currentShift = useShiftStore((s) => s.currentShift);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    loadOrders(currentShift?.id);
  }, [loadOrders, currentShift?.id]);

  const filtered =
    filter === "all" ? orders : orders.filter((o) => o.status === filter);

  return (
    <View style={styles.container}>
      {/* Order list */}
      <View style={styles.listSide}>
        <View style={styles.header}>
          <Text style={styles.title}>Orders</Text>
          <View style={styles.filters}>
            {["all", "open", "completed", "voided"].map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.filterBtn, filter === f && styles.filterActive]}
                onPress={() => setFilter(f)}
              >
                <Text
                  style={[
                    styles.filterText,
                    filter === f && styles.filterTextActive,
                  ]}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.orderRow,
                currentOrder?.order.id === item.id && styles.orderRowActive,
              ]}
              onPress={() => selectOrder(item.id)}
            >
              <View style={styles.orderInfo}>
                <Text style={styles.orderNumber}>#{item.order_number}</Text>
                <Text style={styles.orderTime}>
                  {formatTime(item.created_at)}
                </Text>
              </View>
              <View style={styles.orderRight}>
                <Text style={styles.orderTotal}>
                  {formatPence(item.total)}
                </Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        STATUS_COLORS[item.status] ?? colors.textMuted,
                    },
                  ]}
                >
                  <Text style={styles.statusText}>{item.status}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No orders yet</Text>
            </View>
          }
        />
      </View>

      {/* Order detail */}
      <View style={styles.detailSide}>
        {currentOrder ? (
          <OrderDetail
            detail={currentOrder}
            onVoid={(reason) =>
              voidOrder(
                currentOrder.order.id,
                reason,
                currentOrder.order.user_id ?? "",
              )
            }
            onClose={clearSelection}
          />
        ) : (
          <View style={styles.noSelection}>
            <Text style={styles.noSelectionText}>
              Select an order to view details
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function OrderDetail({
  detail,
  onVoid,
  onClose,
}: {
  detail: {
    order: { id: string; order_number: number; status: string; subtotal: number; tax_total: number; discount_total: number; total: number; customer_name: string | null; created_at: string };
    items: Array<{ id: string; name: string; quantity: number; unit_price: number; total: number; notes: string | null }>;
    payments: Array<{ id: string; payment_method: string; amount: number; cash_given: number | null; change_given: number | null }>;
    totalPaid: number;
    balanceDue: number;
  };
  onVoid: (reason: string) => void;
  onClose: () => void;
}) {
  const { order, items, payments } = detail;

  return (
    <View style={styles.detail}>
      <View style={styles.detailHeader}>
        <Text style={styles.detailTitle}>Order #{order.order_number}</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      {order.customer_name && (
        <Text style={styles.customerName}>{order.customer_name}</Text>
      )}

      <Text style={styles.sectionTitle}>Items</Text>
      {items.map((item) => (
        <View key={item.id} style={styles.detailItem}>
          <Text style={styles.detailItemName}>
            {item.quantity}x {item.name}
          </Text>
          <Text style={styles.detailItemPrice}>
            {formatPence(item.total)}
          </Text>
        </View>
      ))}

      <View style={styles.divider} />

      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Subtotal</Text>
        <Text style={styles.summaryValue}>{formatPence(order.subtotal)}</Text>
      </View>
      {order.discount_total > 0 && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryLabel}>Discount</Text>
          <Text style={[styles.summaryValue, { color: colors.danger }]}>
            -{formatPence(order.discount_total)}
          </Text>
        </View>
      )}
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>Tax</Text>
        <Text style={styles.summaryValue}>{formatPence(order.tax_total)}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={styles.totalLabel}>Total</Text>
        <Text style={styles.totalValue}>{formatPence(order.total)}</Text>
      </View>

      {payments.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: 16 }]}>
            Payments
          </Text>
          {payments.map((p) => (
            <View key={p.id} style={styles.detailItem}>
              <Text style={styles.detailItemName}>
                {p.payment_method.toUpperCase()}
              </Text>
              <Text style={styles.detailItemPrice}>
                {formatPence(p.amount)}
              </Text>
            </View>
          ))}
        </>
      )}

      {order.status === "open" && (
        <TouchableOpacity
          style={styles.voidBtn}
          onPress={() => onVoid("Voided from POS")}
        >
          <Text style={styles.voidText}>Void Order</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, flexDirection: "row" },
  listSide: { flex: 1, borderRightWidth: 1, borderRightColor: colors.border },
  detailSide: { flex: 1, backgroundColor: colors.surface },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { fontSize: 20, fontWeight: "700", color: colors.text },
  filters: { flexDirection: "row", gap: 6 },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: colors.background,
  },
  filterActive: { backgroundColor: colors.primary },
  filterText: { fontSize: 13, color: colors.textSecondary, fontWeight: "500" },
  filterTextActive: { color: colors.textInverse },
  orderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  orderRowActive: { backgroundColor: colors.background },
  orderInfo: {},
  orderNumber: { fontSize: 16, fontWeight: "600", color: colors.text },
  orderTime: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  orderRight: { alignItems: "flex-end" },
  orderTotal: { fontSize: 16, fontWeight: "700", color: colors.text },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, marginTop: 4 },
  statusText: { color: colors.textInverse, fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { color: colors.textMuted, fontSize: 16 },
  noSelection: { flex: 1, justifyContent: "center", alignItems: "center" },
  noSelectionText: { color: colors.textMuted, fontSize: 16 },
  detail: { flex: 1, padding: 20 },
  detailHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  detailTitle: { fontSize: 22, fontWeight: "700", color: colors.text },
  closeText: { color: colors.primary, fontSize: 15, fontWeight: "500" },
  customerName: { fontSize: 15, color: colors.textSecondary, marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: colors.textSecondary, textTransform: "uppercase", marginBottom: 8 },
  detailItem: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  detailItemName: { fontSize: 15, color: colors.text },
  detailItemPrice: { fontSize: 15, fontWeight: "600", color: colors.text },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  summaryLabel: { fontSize: 14, color: colors.textSecondary },
  summaryValue: { fontSize: 14, fontWeight: "500", color: colors.text },
  totalLabel: { fontSize: 16, fontWeight: "700", color: colors.text },
  totalValue: { fontSize: 16, fontWeight: "700", color: colors.text },
  voidBtn: {
    marginTop: 24,
    backgroundColor: colors.danger,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  voidText: { color: colors.textInverse, fontSize: 16, fontWeight: "700" },
});
