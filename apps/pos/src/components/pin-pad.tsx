import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

interface Props {
  pin: string;
  onDigit: (digit: string) => void;
  onDelete: () => void;
  onClear: () => void;
  maxLength?: number;
}

export function PinPad({
  pin,
  onDigit,
  onDelete,
  onClear,
  maxLength = 4,
}: Props) {
  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <View style={styles.container}>
      {/* PIN dots */}
      <View style={styles.dots}>
        {Array.from({ length: maxLength }).map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i < pin.length && styles.dotFilled]}
          />
        ))}
      </View>

      {/* Number grid */}
      <View style={styles.grid}>
        {digits.map((d) => (
          <TouchableOpacity
            key={d}
            style={styles.key}
            onPress={() => onDigit(d)}
          >
            <Text style={styles.keyText}>{d}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={styles.key} onPress={onClear}>
          <Text style={styles.actionText}>CLR</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.key} onPress={() => onDigit("0")}>
          <Text style={styles.keyText}>0</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.key} onPress={onDelete}>
          <Text style={styles.actionText}>DEL</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
  },
  dots: {
    flexDirection: "row",
    gap: 14,
    marginBottom: 24,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: colors.border,
  },
  dotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 252,
    gap: 8,
  },
  key: {
    width: 76,
    height: 56,
    borderRadius: 12,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  keyText: {
    fontSize: 26,
    fontWeight: "600",
    color: colors.text,
  },
  actionText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.textSecondary,
  },
});
