import { View, Text, StyleSheet } from "react-native";
import { useSyncStore } from "../stores/sync";
import { colors } from "../theme/colors";

const STATUS_CONFIG: Record<
  string,
  { color: string; label: string }
> = {
  idle: { color: colors.success, label: "Synced" },
  pushing: { color: colors.warning, label: "Pushing" },
  pulling: { color: colors.warning, label: "Pulling" },
  error: { color: colors.danger, label: "Error" },
};

export function SyncIndicator() {
  const status = useSyncStore((s) => s.status);
  const isOnline = useSyncStore((s) => s.isOnline);
  const pendingChanges = useSyncStore((s) => s.pendingChanges);

  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.idle!;

  return (
    <View style={styles.container}>
      <View style={[styles.dot, { backgroundColor: isOnline ? config.color : colors.textMuted }]} />
      <Text style={styles.label}>
        {isOnline ? config.label : "Offline"}
      </Text>
      {pendingChanges > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{pendingChanges}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  label: {
    fontSize: 12,
    color: colors.sidebarText,
    fontWeight: "500",
  },
  badge: {
    backgroundColor: colors.warning,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 18,
    alignItems: "center",
  },
  badgeText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.textInverse,
  },
});
