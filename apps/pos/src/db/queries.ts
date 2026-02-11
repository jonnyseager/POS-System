import { v4 as uuidv4 } from "uuid";
import { getDatabase } from "./database";
import { hlcToString, now as hlcNow } from "../lib/hlc";

// ── Types ──

export interface LocalCategory {
  id: string;
  tenant_id: string;
  name: string;
  display_order: number;
  color: string | null;
  is_active: number;
  hlc_timestamp: string;
}

export interface LocalMenuItem {
  id: string;
  tenant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  cost_price: number;
  tax_rate_id: string | null;
  display_order: number;
  is_active: number;
  allow_modifiers: number;
  hlc_timestamp: string;
}

export interface LocalTaxRate {
  id: string;
  tenant_id: string;
  name: string;
  rate: string;
  is_default: number;
  is_active: number;
}

export interface LocalOrder {
  id: string;
  tenant_id: string;
  location_id: string;
  device_id: string | null;
  shift_id: string | null;
  user_id: string | null;
  order_number: number;
  status: string;
  subtotal: number;
  tax_total: number;
  discount_total: number;
  total: number;
  cost_total: number;
  discount_type: string | null;
  discount_value: number | null;
  customer_name: string | null;
  notes: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface LocalOrderItem {
  id: string;
  order_id: string;
  menu_item_id: string;
  name: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  tax_rate: string;
  tax_amount: number;
  subtotal: number;
  total: number;
  notes: string | null;
}

export interface LocalPayment {
  id: string;
  order_id: string;
  payment_method: string;
  amount: number;
  tip_amount: number;
  status: string;
  cash_given: number | null;
  change_given: number | null;
  processed_at: string;
}

export interface LocalShift {
  id: string;
  tenant_id: string;
  location_id: string;
  opened_by: string;
  opened_at: string;
  closed_at: string | null;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  status: string;
  notes: string | null;
}

// ── Category queries ──

export function getCategories(): LocalCategory[] {
  const db = getDatabase();
  return db.getAllSync<LocalCategory>(
    "SELECT * FROM categories WHERE is_active = 1 AND deleted_at IS NULL ORDER BY display_order, name",
  );
}

// ── Menu item queries ──

export function getMenuItems(): LocalMenuItem[] {
  const db = getDatabase();
  return db.getAllSync<LocalMenuItem>(
    "SELECT * FROM menu_items WHERE is_active = 1 AND deleted_at IS NULL ORDER BY display_order, name",
  );
}

export function getMenuItemsByCategory(
  categoryId: string,
): LocalMenuItem[] {
  const db = getDatabase();
  return db.getAllSync<LocalMenuItem>(
    "SELECT * FROM menu_items WHERE category_id = ? AND is_active = 1 AND deleted_at IS NULL ORDER BY display_order, name",
    [categoryId],
  );
}

export function getMenuItem(id: string): LocalMenuItem | null {
  const db = getDatabase();
  return db.getFirstSync<LocalMenuItem>(
    "SELECT * FROM menu_items WHERE id = ?",
    [id],
  );
}

// ── Tax rate queries ──

export function getTaxRates(): LocalTaxRate[] {
  const db = getDatabase();
  return db.getAllSync<LocalTaxRate>(
    "SELECT * FROM tax_rates WHERE is_active = 1 ORDER BY name",
  );
}

export function getDefaultTaxRate(): LocalTaxRate | null {
  const db = getDatabase();
  return db.getFirstSync<LocalTaxRate>(
    "SELECT * FROM tax_rates WHERE is_default = 1 AND is_active = 1 LIMIT 1",
  );
}

// ── Order queries ──

export function getNextOrderNumber(): number {
  const db = getDatabase();
  const row = db.getFirstSync<{ next_number: number }>(
    "SELECT next_number FROM order_sequence WHERE id = 1",
  );
  const num = row?.next_number ?? 1;
  db.runSync("UPDATE order_sequence SET next_number = ? WHERE id = 1", [
    num + 1,
  ]);
  return num;
}

export interface CreateOrderParams {
  tenantId: string;
  locationId: string;
  deviceId: string;
  shiftId: string;
  userId: string;
  items: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    taxRate: string;
    notes?: string;
  }>;
  discountType?: string;
  discountValue?: number;
  discountReason?: string;
  notes?: string;
  customerName?: string;
}

export function createLocalOrder(params: CreateOrderParams): LocalOrder {
  const db = getDatabase();
  const orderId = uuidv4();
  const orderNumber = getNextOrderNumber();
  const hlc = hlcToString(hlcNow());
  const now = new Date().toISOString();

  // Calculate totals
  let subtotal = 0;
  let taxTotal = 0;
  let costTotal = 0;

  const itemRows: Array<{
    id: string;
    menuItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    taxRate: string;
    taxAmount: number;
    itemSubtotal: number;
    itemTotal: number;
    notes: string | null;
  }> = [];

  for (const item of params.items) {
    const itemSubtotal = item.unitPrice * item.quantity;
    const rate = parseFloat(item.taxRate);
    const taxAmount = Math.round(itemSubtotal * rate);
    const itemTotal = itemSubtotal + taxAmount;

    subtotal += itemSubtotal;
    taxTotal += taxAmount;
    costTotal += item.unitCost * item.quantity;

    itemRows.push({
      id: uuidv4(),
      menuItemId: item.menuItemId,
      name: item.name,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      unitCost: item.unitCost,
      taxRate: item.taxRate,
      taxAmount,
      itemSubtotal,
      itemTotal,
      notes: item.notes ?? null,
    });
  }

  // Apply discount
  let discountTotal = 0;
  if (params.discountType && params.discountValue) {
    if (params.discountType === "percentage") {
      discountTotal = Math.round(subtotal * (params.discountValue / 10000));
    } else {
      discountTotal = params.discountValue;
    }
  }

  const total = subtotal + taxTotal - discountTotal;

  // Insert order
  db.runSync(
    `INSERT INTO orders (
      id, tenant_id, location_id, device_id, shift_id, user_id,
      order_number, status, order_type, subtotal, tax_total, discount_total,
      total, cost_total, discount_type, discount_value, discount_reason,
      notes, customer_name, created_offline, hlc_timestamp, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 'sale', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    [
      orderId,
      params.tenantId,
      params.locationId,
      params.deviceId,
      params.shiftId,
      params.userId,
      orderNumber,
      subtotal,
      taxTotal,
      discountTotal,
      total,
      costTotal,
      params.discountType ?? null,
      params.discountValue ?? null,
      params.discountReason ?? null,
      params.notes ?? null,
      params.customerName ?? null,
      hlc,
      now,
    ],
  );

  // Insert items
  for (const item of itemRows) {
    db.runSync(
      `INSERT INTO order_items (
        id, tenant_id, order_id, menu_item_id, name, quantity,
        unit_price, unit_cost, tax_rate, tax_amount, subtotal, total, notes, hlc_timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.id,
        params.tenantId,
        orderId,
        item.menuItemId,
        item.name,
        item.quantity,
        item.unitPrice,
        item.unitCost,
        item.taxRate,
        item.taxAmount,
        item.itemSubtotal,
        item.itemTotal,
        item.notes,
        hlc,
      ],
    );
  }

  // Log change for sync
  logChange("orders", orderId, "INSERT", { orderNumber, status: "open" }, hlc);

  return {
    id: orderId,
    tenant_id: params.tenantId,
    location_id: params.locationId,
    device_id: params.deviceId,
    shift_id: params.shiftId,
    user_id: params.userId,
    order_number: orderNumber,
    status: "open",
    subtotal,
    tax_total: taxTotal,
    discount_total: discountTotal,
    total,
    cost_total: costTotal,
    discount_type: params.discountType ?? null,
    discount_value: params.discountValue ?? null,
    customer_name: params.customerName ?? null,
    notes: params.notes ?? null,
    completed_at: null,
    created_at: now,
  };
}

export function getLocalOrders(
  shiftId?: string,
  limit = 50,
): LocalOrder[] {
  const db = getDatabase();
  if (shiftId) {
    return db.getAllSync<LocalOrder>(
      "SELECT * FROM orders WHERE shift_id = ? ORDER BY created_at DESC LIMIT ?",
      [shiftId, limit],
    );
  }
  return db.getAllSync<LocalOrder>(
    "SELECT * FROM orders ORDER BY created_at DESC LIMIT ?",
    [limit],
  );
}

export function getLocalOrder(id: string): LocalOrder | null {
  const db = getDatabase();
  return db.getFirstSync<LocalOrder>(
    "SELECT * FROM orders WHERE id = ?",
    [id],
  );
}

export function getOrderItems(orderId: string): LocalOrderItem[] {
  const db = getDatabase();
  return db.getAllSync<LocalOrderItem>(
    "SELECT * FROM order_items WHERE order_id = ? ORDER BY rowid",
    [orderId],
  );
}

export function completeOrder(orderId: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const hlc = hlcToString(hlcNow());
  db.runSync(
    "UPDATE orders SET status = 'completed', completed_at = ?, hlc_timestamp = ? WHERE id = ?",
    [now, hlc, orderId],
  );
}

export function voidLocalOrder(orderId: string, reason: string, userId: string): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const hlc = hlcToString(hlcNow());
  db.runSync(
    "UPDATE orders SET status = 'voided', voided_at = ?, voided_by = ?, void_reason = ?, hlc_timestamp = ? WHERE id = ?",
    [now, userId, reason, hlc, orderId],
  );
}

// ── Payment queries ──

export function insertPayment(params: {
  tenantId: string;
  orderId: string;
  paymentMethod: string;
  amount: number;
  tipAmount?: number;
  cashGiven?: number;
  changeGiven?: number;
}): LocalPayment {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();
  const hlc = hlcToString(hlcNow());

  db.runSync(
    `INSERT INTO payments (
      id, tenant_id, order_id, payment_method, amount, tip_amount,
      status, cash_given, change_given, processed_at, hlc_timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)`,
    [
      id,
      params.tenantId,
      params.orderId,
      params.paymentMethod,
      params.amount,
      params.tipAmount ?? 0,
      params.cashGiven ?? null,
      params.changeGiven ?? null,
      now,
      hlc,
    ],
  );

  logChange("payments", id, "INSERT", { orderId: params.orderId }, hlc);

  return {
    id,
    order_id: params.orderId,
    payment_method: params.paymentMethod,
    amount: params.amount,
    tip_amount: params.tipAmount ?? 0,
    status: "completed",
    cash_given: params.cashGiven ?? null,
    change_given: params.changeGiven ?? null,
    processed_at: now,
  };
}

export function getOrderPayments(orderId: string): LocalPayment[] {
  const db = getDatabase();
  return db.getAllSync<LocalPayment>(
    "SELECT * FROM payments WHERE order_id = ? ORDER BY processed_at",
    [orderId],
  );
}

export function getOrderTotalPaid(orderId: string): number {
  const db = getDatabase();
  const row = db.getFirstSync<{ total_paid: number }>(
    "SELECT COALESCE(SUM(amount), 0) as total_paid FROM payments WHERE order_id = ? AND status = 'completed'",
    [orderId],
  );
  return row?.total_paid ?? 0;
}

// ── Shift queries ──

export function getOpenShift(): LocalShift | null {
  const db = getDatabase();
  return db.getFirstSync<LocalShift>(
    "SELECT * FROM shifts WHERE status = 'open' ORDER BY opened_at DESC LIMIT 1",
  );
}

export function insertShift(params: {
  tenantId: string;
  locationId: string;
  userId: string;
  openingCash: number;
}): LocalShift {
  const db = getDatabase();
  const id = uuidv4();
  const now = new Date().toISOString();
  const hlc = hlcToString(hlcNow());

  db.runSync(
    `INSERT INTO shifts (
      id, tenant_id, location_id, opened_by, opened_at,
      opening_cash, status, hlc_timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
    [id, params.tenantId, params.locationId, params.userId, now, params.openingCash, hlc],
  );

  logChange("shifts", id, "INSERT", { status: "open" }, hlc);

  return {
    id,
    tenant_id: params.tenantId,
    location_id: params.locationId,
    opened_by: params.userId,
    opened_at: now,
    closed_at: null,
    opening_cash: params.openingCash,
    closing_cash: null,
    expected_cash: null,
    status: "open",
    notes: null,
  };
}

export function closeLocalShift(
  shiftId: string,
  closingCash: number,
  notes?: string,
): void {
  const db = getDatabase();
  const now = new Date().toISOString();
  const hlc = hlcToString(hlcNow());

  // Calculate expected cash
  const cashRow = db.getFirstSync<{ cash_total: number }>(
    `SELECT COALESCE(SUM(p.amount), 0) as cash_total
     FROM payments p
     JOIN orders o ON p.order_id = o.id
     WHERE o.shift_id = ? AND p.payment_method = 'cash' AND p.status = 'completed'`,
    [shiftId],
  );
  const cashTotal = cashRow?.cash_total ?? 0;

  const shiftRow = db.getFirstSync<{ opening_cash: number }>(
    "SELECT opening_cash FROM shifts WHERE id = ?",
    [shiftId],
  );
  const openingCash = shiftRow?.opening_cash ?? 0;

  const expectedCash = openingCash + cashTotal;

  db.runSync(
    `UPDATE shifts SET
      status = 'closed', closed_at = ?, closing_cash = ?,
      expected_cash = ?, notes = ?, hlc_timestamp = ?
    WHERE id = ?`,
    [now, closingCash, expectedCash, notes ?? null, hlc, shiftId],
  );

  logChange("shifts", shiftId, "UPDATE", { status: "closed" }, hlc);
}

export function getShiftSummary(shiftId: string): {
  totalOrders: number;
  totalRevenue: number;
  cashTotal: number;
  cardTotal: number;
} {
  const db = getDatabase();

  const orderRow = db.getFirstSync<{ count: number; revenue: number }>(
    "SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as revenue FROM orders WHERE shift_id = ? AND status != 'voided'",
    [shiftId],
  );

  const cashRow = db.getFirstSync<{ total: number }>(
    `SELECT COALESCE(SUM(p.amount), 0) as total
     FROM payments p JOIN orders o ON p.order_id = o.id
     WHERE o.shift_id = ? AND p.payment_method = 'cash' AND p.status = 'completed'`,
    [shiftId],
  );

  const cardRow = db.getFirstSync<{ total: number }>(
    `SELECT COALESCE(SUM(p.amount), 0) as total
     FROM payments p JOIN orders o ON p.order_id = o.id
     WHERE o.shift_id = ? AND p.payment_method = 'card' AND p.status = 'completed'`,
    [shiftId],
  );

  return {
    totalOrders: orderRow?.count ?? 0,
    totalRevenue: orderRow?.revenue ?? 0,
    cashTotal: cashRow?.total ?? 0,
    cardTotal: cardRow?.total ?? 0,
  };
}

// ── Change log for sync ──

function logChange(
  tableName: string,
  recordId: string,
  operation: string,
  data: Record<string, unknown>,
  hlc: string,
): void {
  const db = getDatabase();
  db.runSync(
    "INSERT INTO change_log (table_name, record_id, operation, data, hlc) VALUES (?, ?, ?, ?, ?)",
    [tableName, recordId, operation, JSON.stringify(data), hlc],
  );
}

export function getPendingChanges(
  limit = 500,
): Array<{
  id: number;
  table_name: string;
  record_id: string;
  operation: string;
  data: string;
  hlc: string;
  column_hlcs: string | null;
}> {
  const db = getDatabase();
  return db.getAllSync(
    "SELECT * FROM change_log WHERE synced = 0 ORDER BY id LIMIT ?",
    [limit],
  );
}

export function markChangesSynced(ids: number[]): void {
  if (ids.length === 0) return;
  const db = getDatabase();
  const placeholders = ids.map(() => "?").join(",");
  db.runSync(
    `UPDATE change_log SET synced = 1 WHERE id IN (${placeholders})`,
    ids,
  );
}

export function getPendingChangeCount(): number {
  const db = getDatabase();
  const row = db.getFirstSync<{ count: number }>(
    "SELECT COUNT(*) as count FROM change_log WHERE synced = 0",
  );
  return row?.count ?? 0;
}

// ── Sync state ──

export function getSyncWatermark(tableName: string): string {
  const db = getDatabase();
  const row = db.getFirstSync<{ last_pulled_hlc: string }>(
    "SELECT last_pulled_hlc FROM sync_state WHERE table_name = ?",
    [tableName],
  );
  return row?.last_pulled_hlc ?? "0";
}

export function getGlobalSyncWatermark(): string {
  const db = getDatabase();
  const row = db.getFirstSync<{ min_hlc: string | null }>(
    "SELECT MIN(last_pulled_hlc) as min_hlc FROM sync_state",
  );
  return row?.min_hlc ?? "0";
}

export function updateSyncWatermark(
  tableName: string,
  hlc: string,
): void {
  const db = getDatabase();
  db.runSync(
    `INSERT INTO sync_state (table_name, last_pulled_hlc, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(table_name) DO UPDATE SET last_pulled_hlc = ?, updated_at = datetime('now')`,
    [tableName, hlc, hlc],
  );
}

// ── Bulk upsert for pull sync ──

export function upsertFromSync(
  tableName: string,
  recordId: string,
  data: Record<string, unknown>,
  hlc: string,
): void {
  const db = getDatabase();

  // Check if record exists
  const existing = db.getFirstSync<{ hlc_timestamp: string }>(
    `SELECT hlc_timestamp FROM "${tableName}" WHERE id = ?`,
    [recordId],
  );

  if (!existing) {
    // Insert new record
    const cols = Object.keys(data);
    const placeholders = cols.map(() => "?").join(", ");
    const colNames = cols.map((c) => `"${c}"`).join(", ");
    db.runSync(
      `INSERT OR IGNORE INTO "${tableName}" (${colNames}) VALUES (${placeholders})`,
      cols.map((c) => data[c] as string | number | null),
    );
  } else {
    // LWW: only update if incoming HLC is newer
    const currentHlc = existing.hlc_timestamp ?? "0";
    if (BigInt(hlc) > BigInt(currentHlc)) {
      const setClauses = Object.keys(data)
        .filter((k) => k !== "id")
        .map((k) => `"${k}" = ?`);
      const values = Object.keys(data)
        .filter((k) => k !== "id")
        .map((k) => data[k] as string | number | null);
      if (setClauses.length > 0) {
        db.runSync(
          `UPDATE "${tableName}" SET ${setClauses.join(", ")} WHERE id = ?`,
          [...values, recordId],
        );
      }
    }
  }
}

// ── Device config ──

export function getDeviceConfig(key: string): string | null {
  const db = getDatabase();
  const row = db.getFirstSync<{ value: string }>(
    "SELECT value FROM device_config WHERE key = ?",
    [key],
  );
  return row?.value ?? null;
}

export function setDeviceConfig(key: string, value: string): void {
  const db = getDatabase();
  db.runSync(
    "INSERT OR REPLACE INTO device_config (key, value) VALUES (?, ?)",
    [key, value],
  );
}
