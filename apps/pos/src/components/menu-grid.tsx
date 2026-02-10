import { FlatList, StyleSheet, View, Text } from "react-native";
import { useMenuStore } from "../stores/menu";
import { useCartStore } from "../stores/cart";
import { MenuItemCard } from "./menu-item-card";
import { colors } from "../theme/colors";

export function MenuGrid() {
  const getFilteredItems = useMenuStore((s) => s.getFilteredItems);
  const getTaxRateForItem = useMenuStore((s) => s.getTaxRateForItem);
  const addItem = useCartStore((s) => s.addItem);
  const items = getFilteredItems();

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No items found</Text>
        <Text style={styles.emptySubtext}>
          Add menu items from the back office
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      numColumns={4}
      contentContainerStyle={styles.grid}
      columnWrapperStyle={styles.row}
      renderItem={({ item }) => (
        <MenuItemCard
          item={item}
          onPress={() => {
            const taxRate = getTaxRateForItem(item.tax_rate_id);
            addItem(item, taxRate);
          }}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  grid: {
    padding: 12,
  },
  row: {
    gap: 10,
    marginBottom: 10,
  },
  empty: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
});
