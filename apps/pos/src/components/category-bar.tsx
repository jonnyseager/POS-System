import { ScrollView, TouchableOpacity, Text, StyleSheet } from "react-native";
import { useMenuStore } from "../stores/menu";
import { colors } from "../theme/colors";

export function CategoryBar() {
  const { categories, selectedCategoryId, selectCategory } = useMenuStore();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <TouchableOpacity
        style={[styles.chip, !selectedCategoryId && styles.chipActive]}
        onPress={() => selectCategory(null)}
      >
        <Text
          style={[styles.chipText, !selectedCategoryId && styles.chipTextActive]}
        >
          All
        </Text>
      </TouchableOpacity>

      {categories.map((cat) => (
        <TouchableOpacity
          key={cat.id}
          style={[
            styles.chip,
            selectedCategoryId === cat.id && styles.chipActive,
            cat.color
              ? {
                  borderColor: cat.color,
                  ...(selectedCategoryId === cat.id
                    ? { backgroundColor: cat.color }
                    : {}),
                }
              : null,
          ]}
          onPress={() => selectCategory(cat.id)}
        >
          <Text
            style={[
              styles.chipText,
              selectedCategoryId === cat.id && styles.chipTextActive,
            ]}
          >
            {cat.name}
          </Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 52,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  content: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    flexDirection: "row",
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.borderDark,
    backgroundColor: "transparent",
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textInverse,
  },
});
