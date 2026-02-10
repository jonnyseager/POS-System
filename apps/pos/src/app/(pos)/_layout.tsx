import { useEffect } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Slot, router, usePathname } from "expo-router";
import { useAuthStore } from "../../stores/auth";
import { useShiftStore } from "../../stores/shift";
import { useMenuStore } from "../../stores/menu";
import { useSyncStore } from "../../stores/sync";
import { SyncIndicator } from "../../components/sync-indicator";
import { colors } from "../../theme/colors";

const NAV_ITEMS = [
  { path: "/(pos)", label: "Order" },
  { path: "/(pos)/orders", label: "Orders" },
  { path: "/(pos)/shift", label: "Shift" },
  { path: "/(pos)/settings", label: "Settings" },
] as const;

export default function PosLayout() {
  const { user, isAuthenticated, isLoading, logout } = useAuthStore();
  const { currentShift, loadCurrentShift } = useShiftStore();
  const { loadFromDatabase } = useMenuStore();
  const { init, startSync } = useSyncStore();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/(auth)/login");
    }
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    loadFromDatabase();
    loadCurrentShift();
    const unsub = init();
    startSync();
    return unsub;
  }, [loadFromDatabase, loadCurrentShift, init, startSync]);

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.topLeft}>
          <Text style={styles.brandText}>Commerce OS</Text>
          {currentShift && (
            <View style={styles.shiftBadge}>
              <Text style={styles.shiftText}>Shift Open</Text>
            </View>
          )}
        </View>

        {/* Navigation */}
        <View style={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.path ||
              (item.path === "/(pos)" && pathname === "/");
            return (
              <TouchableOpacity
                key={item.path}
                style={[styles.navItem, isActive && styles.navItemActive]}
                onPress={() => router.push(item.path as "/(pos)")}
              >
                <Text
                  style={[
                    styles.navText,
                    isActive && styles.navTextActive,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.topRight}>
          <SyncIndicator />
          <Text style={styles.userName}>
            {user?.firstName ?? "Staff"}
          </Text>
          <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main content */}
      <View style={styles.content}>
        <Slot />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.sidebar,
    paddingHorizontal: 16,
    paddingVertical: 10,
    height: 56,
  },
  topLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brandText: {
    color: colors.textInverse,
    fontSize: 18,
    fontWeight: "700",
  },
  shiftBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  shiftText: {
    color: colors.textInverse,
    fontSize: 12,
    fontWeight: "600",
  },
  nav: {
    flexDirection: "row",
    gap: 4,
  },
  navItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  navItemActive: {
    backgroundColor: colors.sidebarActive,
  },
  navText: {
    color: colors.sidebarText,
    fontSize: 15,
    fontWeight: "500",
  },
  navTextActive: {
    color: colors.textInverse,
    fontWeight: "700",
  },
  topRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  userName: {
    color: colors.sidebarText,
    fontSize: 14,
  },
  logoutBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.sidebarText,
  },
  logoutText: {
    color: colors.sidebarText,
    fontSize: 13,
    fontWeight: "500",
  },
  content: {
    flex: 1,
  },
});
