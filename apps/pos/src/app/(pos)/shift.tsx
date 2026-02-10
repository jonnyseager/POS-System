import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { useShiftStore } from "../../stores/shift";
import { useAuthStore } from "../../stores/auth";
import { formatPence, poundsToPence, penceToPounds } from "../../lib/format";
import { colors } from "../../theme/colors";

export default function ShiftScreen() {
  const { currentShift, summary, openShift, closeShift, isLoading } =
    useShiftStore();
  const { user, tenant } = useAuthStore();

  if (!currentShift) {
    return <OpenShiftForm onOpen={openShift} tenant={tenant} user={user} isLoading={isLoading} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Current Shift</Text>

      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.label}>Status</Text>
          <View style={styles.openBadge}>
            <Text style={styles.openBadgeText}>Open</Text>
          </View>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.label}>Opened By</Text>
          <Text style={styles.value}>{user?.firstName ?? "Staff"}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.label}>Opening Cash</Text>
          <Text style={styles.value}>
            {formatPence(currentShift.opening_cash)}
          </Text>
        </View>
      </View>

      {summary && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Shift Summary</Text>
          <View style={styles.statsGrid}>
            <StatBox label="Orders" value={String(summary.totalOrders)} />
            <StatBox
              label="Revenue"
              value={formatPence(summary.totalRevenue)}
            />
            <StatBox label="Cash" value={formatPence(summary.cashTotal)} />
            <StatBox label="Card" value={formatPence(summary.cardTotal)} />
          </View>
        </View>
      )}

      <CloseShiftForm onClose={closeShift} isLoading={isLoading} />
    </ScrollView>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function OpenShiftForm({
  onOpen,
  tenant,
  user,
  isLoading,
}: {
  onOpen: (params: {
    tenantId: string;
    locationId: string;
    userId: string;
    openingCash: number;
  }) => void;
  tenant: { id: string; name: string } | null;
  user: { id: string } | null;
  isLoading: boolean;
}) {
  const [cashFloat, setCashFloat] = useState("");

  const handleOpen = () => {
    if (!tenant || !user) return;
    onOpen({
      tenantId: tenant.id,
      locationId: "default",
      userId: user.id,
      openingCash: poundsToPence(cashFloat),
    });
  };

  return (
    <View style={styles.centerContainer}>
      <View style={styles.formCard}>
        <Text style={styles.formTitle}>Open Shift</Text>
        <Text style={styles.formSubtitle}>
          Start a new shift to begin taking orders
        </Text>

        <Text style={styles.inputLabel}>Cash Float</Text>
        <View style={styles.currencyInput}>
          <Text style={styles.currencySymbol}>£</Text>
          <TextInput
            style={styles.currencyField}
            placeholder="0.00"
            placeholderTextColor={colors.textMuted}
            value={cashFloat}
            onChangeText={setCashFloat}
            keyboardType="decimal-pad"
          />
        </View>

        <TouchableOpacity
          style={[styles.primaryBtn, isLoading && styles.btnDisabled]}
          onPress={handleOpen}
          disabled={isLoading}
        >
          <Text style={styles.primaryBtnText}>Open Shift</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function CloseShiftForm({
  onClose,
  isLoading,
}: {
  onClose: (closingCash: number, notes?: string) => void;
  isLoading: boolean;
}) {
  const [closingCash, setClosingCash] = useState("");
  const [notes, setNotes] = useState("");
  const [showForm, setShowForm] = useState(false);

  if (!showForm) {
    return (
      <TouchableOpacity
        style={styles.closeShiftBtn}
        onPress={() => setShowForm(true)}
      >
        <Text style={styles.closeShiftBtnText}>Close Shift</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Close Shift</Text>

      <Text style={styles.inputLabel}>Closing Cash Count</Text>
      <View style={styles.currencyInput}>
        <Text style={styles.currencySymbol}>£</Text>
        <TextInput
          style={styles.currencyField}
          placeholder="0.00"
          placeholderTextColor={colors.textMuted}
          value={closingCash}
          onChangeText={setClosingCash}
          keyboardType="decimal-pad"
        />
      </View>

      <Text style={styles.inputLabel}>Notes (optional)</Text>
      <TextInput
        style={styles.textArea}
        placeholder="Any notes about this shift..."
        placeholderTextColor={colors.textMuted}
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={3}
      />

      <View style={styles.formActions}>
        <TouchableOpacity
          style={styles.cancelBtn}
          onPress={() => setShowForm(false)}
        >
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dangerBtn, isLoading && styles.btnDisabled]}
          onPress={() =>
            onClose(poundsToPence(closingCash), notes || undefined)
          }
          disabled={isLoading}
        >
          <Text style={styles.dangerBtnText}>Confirm Close</Text>
        </TouchableOpacity>
      </View>
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
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 16 },
  cardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  label: { fontSize: 14, color: colors.textSecondary },
  value: { fontSize: 14, fontWeight: "600", color: colors.text },
  openBadge: { backgroundColor: colors.success, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  openBadgeText: { color: colors.textInverse, fontSize: 12, fontWeight: "600" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  statBox: {
    flex: 1,
    minWidth: 120,
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
  },
  statValue: { fontSize: 20, fontWeight: "700", color: colors.text },
  statLabel: { fontSize: 12, color: colors.textSecondary, marginTop: 4 },
  centerContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  formCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 32,
    width: 400,
    borderWidth: 1,
    borderColor: colors.border,
  },
  formTitle: { fontSize: 24, fontWeight: "700", color: colors.text, textAlign: "center" },
  formSubtitle: { fontSize: 15, color: colors.textSecondary, textAlign: "center", marginBottom: 24, marginTop: 4 },
  inputLabel: { fontSize: 14, fontWeight: "600", color: colors.text, marginBottom: 6, marginTop: 12 },
  currencyInput: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingHorizontal: 12 },
  currencySymbol: { fontSize: 18, color: colors.textSecondary, marginRight: 4 },
  currencyField: { flex: 1, fontSize: 18, paddingVertical: 12, color: colors.text },
  textArea: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: "top",
    minHeight: 80,
  },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 8, paddingVertical: 14, alignItems: "center", marginTop: 24 },
  primaryBtnText: { color: colors.textInverse, fontSize: 16, fontWeight: "700" },
  btnDisabled: { opacity: 0.6 },
  closeShiftBtn: {
    borderWidth: 2,
    borderColor: colors.danger,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  closeShiftBtnText: { color: colors.danger, fontSize: 16, fontWeight: "700" },
  formActions: { flexDirection: "row", gap: 12, marginTop: 20 },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  cancelBtnText: { color: colors.textSecondary, fontSize: 15, fontWeight: "600" },
  dangerBtn: { flex: 1, backgroundColor: colors.danger, borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  dangerBtnText: { color: colors.textInverse, fontSize: 15, fontWeight: "700" },
});
