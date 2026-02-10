import { TouchableOpacity, Text, View, StyleSheet } from "react-native";
import type { LocalMenuItem } from "../db/queries";
import { formatPence } from "../lib/format";
import { colors } from "../theme/colors";

interface Props {
  item: LocalMenuItem;
  onPress: () => void;
}

export function MenuItemCard({ item, onPress }: Props) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.name} numberOfLines={2}>
        {item.name}
      </Text>
      {item.description ? (
        <Text style={styles.description} numberOfLines={1}>
          {item.description}
        </Text>
      ) : null}
      <View style={styles.footer}>
        <Text style={styles.price}>{formatPence(item.price)}</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 100,
    justifyContent: "space-between",
    maxWidth: "25%",
  },
  name: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
    lineHeight: 20,
  },
  description: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
  },
  footer: {
    marginTop: 8,
  },
  price: {
    fontSize: 17,
    fontWeight: "700",
    color: colors.primary,
  },
});
