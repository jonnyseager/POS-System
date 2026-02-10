import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { useSyncStore } from "../../stores/sync";
import { useAuthStore } from "../../stores/auth";
import { formatDateTime } from "../../lib/format";
import { colors } from "../../theme/colors";

export default function SettingsScreen() {
  const {
    status,
    isOnline,
    lastPushAt,
    lastPullAt,
    pendingChanges,
    error,
    manualSync,
    refreshPendingCount,
  } = useSyncStore();
  const { user, tenant, deviceId } = useAuthStore();

  const handleSync = async () => {
    refreshPendingCount();
    await manualSync();
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Settings</Text>

      {/* Device info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Device</Text>
        <InfoRow label="Device ID" value={deviceId ?? "Not registered"} />
        <InfoRow label="Platform" value="Android Tablet" />
        <InfoRow label="App Version" value="0.1.0" />
      </View>

      {/* Account info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <InfoRow label="User" value={user ? `${user.firstName} ${user.lastName}` : "—"} />
        <InfoRow label="Email" value={user?.email ?? "—"} />
        <InfoRow label="Business" value={tenant?.name ?? "—"} />
      </View>

      {/* Sync status */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Sync</Text>
        <InfoRow
          label="Status"
          value={status.charAt(0).toUpperCase() + status.slice(1)}
          valueColor={
            status === "error"
              ? colors.danger
              : status === "idle"
                ? colors.success
                : colors.warning
          }
        />
        <InfoRow
          label="Connection"
          value={isOnline ? "Online" : "Offline"}
          valueColor={isOnline ? colors.success : colors.textMuted}
        />
        <InfoRow
          label="Pending Changes"
          value={String(pendingChanges)}
          valueColor={pendingChanges > 0 ? colors.warning : colors.text}
        />
        <InfoRow
          label="Last Push"
          value={lastPushAt ? formatDateTime(lastPushAt) : "Never"}
        />
        <InfoRow
          label="Last Pull"
          value={lastPullAt ? formatDateTime(lastPullAt) : "Never"}
        />

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.syncBtn,
            status !== "idle" && styles.syncBtnDisabled,
          ]}
          onPress={handleSync}
          disabled={status !== "idle"}
        >
          {status !== "idle" ? (
            <ActivityIndicator color={colors.textInverse} size="small" />
          ) : (
            <Text style={styles.syncBtnText}>Sync Now</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

function InfoRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text
        style={[styles.infoValue, valueColor ? { color: valueColor } : null]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 24, maxWidth: 600 },
  title: { fontSize: 24, fontWeight: "700", color: colors.text, marginBottom: 20 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  infoLabel: { fontSize: 14, color: colors.textSecondary },
  infoValue: { fontSize: 14, fontWeight: "500", color: colors.text, maxWidth: "60%" },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  errorText: { color: colors.danger, fontSize: 13 },
  syncBtn: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 16,
  },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { color: colors.textInverse, fontSize: 15, fontWeight: "700" },
});
