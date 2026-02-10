import { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { formatPence } from "../lib/format";
import { colors } from "../theme/colors";

interface Props {
  total: number;
  onPay: (cashGiven: number) => void;
  onBack: () => void;
}

const QUICK_AMOUNTS = [500, 1000, 2000, 5000];

export function CashPayment({ total, onPay, onBack }: Props) {
  const [input, setInput] = useState("");

  const cashGiven = input ? parseInt(input, 10) : 0;
  const change = cashGiven - total;
  const canPay = cashGiven >= total;

  const handleDigit = (d: string) => {
    setInput((prev) => prev + d);
  };

  const handleDelete = () => {
    setInput((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setInput("");
  };

  const handleQuickAmount = (amount: number) => {
    setInput(String(amount));
  };

  const handleExact = () => {
    setInput(String(total));
  };

  return (
    <View style={styles.container}>
      {/* Display */}
      <View style={styles.display}>
        <View style={styles.displayRow}>
          <Text style={styles.displayLabel}>Tendered</Text>
          <Text style={styles.displayValue}>
            {input ? formatPence(parseInt(input, 10)) : "£0.00"}
          </Text>
        </View>
        {cashGiven > 0 && (
          <View style={styles.displayRow}>
            <Text style={styles.displayLabel}>Change</Text>
            <Text
              style={[
                styles.changeValue,
                { color: change >= 0 ? colors.success : colors.danger },
              ]}
            >
              {change >= 0
                ? formatPence(change)
                : `-${formatPence(Math.abs(change))}`}
            </Text>
          </View>
        )}
      </View>

      {/* Quick amounts */}
      <View style={styles.quickRow}>
        <TouchableOpacity style={styles.quickBtn} onPress={handleExact}>
          <Text style={styles.quickText}>Exact</Text>
        </TouchableOpacity>
        {QUICK_AMOUNTS.map((amount) => (
          <TouchableOpacity
            key={amount}
            style={styles.quickBtn}
            onPress={() => handleQuickAmount(amount)}
          >
            <Text style={styles.quickText}>{formatPence(amount)}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Numpad */}
      <View style={styles.numpad}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "CLR", "0", "DEL"].map(
          (key) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.numKey,
                (key === "CLR" || key === "DEL") && styles.numKeyAction,
              ]}
              onPress={() => {
                if (key === "CLR") handleClear();
                else if (key === "DEL") handleDelete();
                else handleDigit(key);
              }}
            >
              <Text
                style={[
                  styles.numKeyText,
                  (key === "CLR" || key === "DEL") && styles.numKeyActionText,
                ]}
              >
                {key}
              </Text>
            </TouchableOpacity>
          ),
        )}
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.confirmBtn, !canPay && styles.confirmDisabled]}
          onPress={() => canPay && onPay(cashGiven)}
          disabled={!canPay}
        >
          <Text style={styles.confirmText}>
            {canPay ? "Confirm Payment" : "Insufficient"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
  },
  display: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  displayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  displayLabel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  displayValue: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
  },
  changeValue: {
    fontSize: 20,
    fontWeight: "700",
  },
  quickRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  numpad: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  numKey: {
    width: "31%",
    paddingVertical: 16,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: "center",
  },
  numKeyAction: {
    backgroundColor: colors.surfaceAlt,
  },
  numKeyText: {
    fontSize: 22,
    fontWeight: "600",
    color: colors.text,
  },
  numKeyActionText: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  backBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  backBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 8,
    backgroundColor: colors.success,
    alignItems: "center",
  },
  confirmDisabled: {
    backgroundColor: colors.textMuted,
  },
  confirmText: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.textInverse,
  },
});
