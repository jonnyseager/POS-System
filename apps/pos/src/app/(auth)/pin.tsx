import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { router } from "expo-router";
import { colors } from "../../theme/colors";

export default function PinScreen() {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleDigit = (digit: string) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    setError("");

    if (newPin.length === 4) {
      void handlePinSubmit(newPin);
    }
  };

  const handleDelete = () => {
    setPin((p) => p.slice(0, -1));
    setError("");
  };

  const handleClear = () => {
    setPin("");
    setError("");
  };

  const handlePinSubmit = async (pinCode: string) => {
    setIsLoading(true);
    try {
      // PIN login will be implemented when PIN auth endpoint is available
      // For now, navigate to POS screen
      void pinCode;
      router.replace("/(pos)");
    } catch {
      setError("Invalid PIN. Please try again.");
      setPin("");
    } finally {
      setIsLoading(false);
    }
  };

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", ""];

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Staff Login</Text>
        <Text style={styles.subtitle}>Enter your 4-digit PIN</Text>

        {/* PIN dots */}
        <View style={styles.pinDots}>
          {[0, 1, 2, 3].map((i) => (
            <View
              key={i}
              style={[styles.dot, i < pin.length && styles.dotFilled]}
            />
          ))}
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {isLoading ? (
          <ActivityIndicator
            size="large"
            color={colors.primary}
            style={styles.loader}
          />
        ) : (
          <>
            {/* Number pad */}
            <View style={styles.pad}>
              {digits.map((digit, i) => {
                if (i === 9) {
                  return (
                    <TouchableOpacity
                      key="clear"
                      style={styles.padButton}
                      onPress={handleClear}
                    >
                      <Text style={styles.padAction}>CLR</Text>
                    </TouchableOpacity>
                  );
                }
                if (i === 11) {
                  return (
                    <TouchableOpacity
                      key="delete"
                      style={styles.padButton}
                      onPress={handleDelete}
                    >
                      <Text style={styles.padAction}>DEL</Text>
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    key={digit}
                    style={styles.padButton}
                    onPress={() => handleDigit(digit)}
                  >
                    <Text style={styles.padDigit}>{digit}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              style={styles.backLink}
              onPress={() => router.replace("/(auth)/login")}
            >
              <Text style={styles.backText}>Back to email login</Text>
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
    backgroundColor: colors.sidebar,
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 40,
    width: 380,
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: colors.text,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textSecondary,
    marginBottom: 28,
    marginTop: 4,
  },
  pinDots: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 24,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: "transparent",
  },
  dotFilled: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    marginBottom: 16,
  },
  loader: {
    marginVertical: 40,
  },
  pad: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: 264,
    gap: 12,
  },
  padButton: {
    width: 80,
    height: 64,
    borderRadius: 12,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  padDigit: {
    fontSize: 28,
    fontWeight: "600",
    color: colors.text,
  },
  padAction: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  backLink: {
    marginTop: 24,
  },
  backText: {
    color: colors.primary,
    fontSize: 15,
  },
});
