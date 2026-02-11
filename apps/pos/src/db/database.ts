import * as SQLite from "expo-sqlite";

let db: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync("commerce_pos.db");
    db.execSync("PRAGMA journal_mode = WAL;");
    db.execSync("PRAGMA foreign_keys = ON;");
    createTables(db);
  }
  return db;
}

function createTables(db: SQLite.SQLiteDatabase): void {
  // ── Reference data (cloud → device) ──
  db.execSync(`
    CREATE TABLE IF NOT EXISTS tax_rates (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      rate TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      hlc_timestamp TEXT NOT NULL DEFAULT '0'
    );
  `);

  // ── Catalog (LWW sync) ──
  db.execSync(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      color TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT,
      hlc_timestamp TEXT NOT NULL DEFAULT '0'
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      category_id TEXT,
      name TEXT NOT NULL,
      description TEXT,
      sku TEXT,
      price INTEGER NOT NULL,
      cost_price INTEGER NOT NULL DEFAULT 0,
      cost_method TEXT NOT NULL DEFAULT 'manual',
      tax_rate_id TEXT,
      image_url TEXT,
      barcode TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      track_stock INTEGER NOT NULL DEFAULT 0,
      allow_modifiers INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      hlc_timestamp TEXT NOT NULL DEFAULT '0',
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS modifier_groups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      selection_type TEXT NOT NULL DEFAULT 'single',
      min_selections INTEGER NOT NULL DEFAULT 0,
      max_selections INTEGER NOT NULL DEFAULT 1,
      is_required INTEGER NOT NULL DEFAULT 0,
      deleted_at TEXT,
      hlc_timestamp TEXT NOT NULL DEFAULT '0'
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS modifiers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      modifier_group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price_adjustment INTEGER NOT NULL DEFAULT 0,
      cost_adjustment INTEGER NOT NULL DEFAULT 0,
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT,
      hlc_timestamp TEXT NOT NULL DEFAULT '0',
      FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id)
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS menu_item_modifier_groups (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      menu_item_id TEXT NOT NULL,
      modifier_group_id TEXT NOT NULL,
      display_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
      FOREIGN KEY (modifier_group_id) REFERENCES modifier_groups(id)
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS ingredients (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL,
      cost_per_unit INTEGER NOT NULL DEFAULT 0,
      cost_precision INTEGER NOT NULL DEFAULT 2,
      category TEXT,
      allergens TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT,
      hlc_timestamp TEXT NOT NULL DEFAULT '0'
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS recipe_ingredients (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      menu_item_id TEXT NOT NULL,
      ingredient_id TEXT NOT NULL,
      quantity TEXT NOT NULL,
      notes TEXT,
      deleted_at TEXT,
      hlc_timestamp TEXT NOT NULL DEFAULT '0',
      FOREIGN KEY (menu_item_id) REFERENCES menu_items(id),
      FOREIGN KEY (ingredient_id) REFERENCES ingredients(id)
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS locations (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      name TEXT NOT NULL,
      location_type TEXT NOT NULL DEFAULT 'mobile',
      address_line1 TEXT,
      address_line2 TEXT,
      city TEXT,
      postcode TEXT,
      country_code TEXT NOT NULL DEFAULT 'GB',
      latitude TEXT,
      longitude TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      deleted_at TEXT,
      hlc_timestamp TEXT NOT NULL DEFAULT '0'
    );
  `);

  // ── Shifts (LWW sync) ──
  db.execSync(`
    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      opened_by TEXT NOT NULL,
      closed_by TEXT,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      opening_cash INTEGER NOT NULL DEFAULT 0,
      closing_cash INTEGER,
      expected_cash INTEGER,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      hlc_timestamp TEXT NOT NULL DEFAULT '0',
      FOREIGN KEY (location_id) REFERENCES locations(id)
    );
  `);

  // ── Orders (append-only sync) ──
  db.execSync(`
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      location_id TEXT NOT NULL,
      device_id TEXT,
      shift_id TEXT,
      user_id TEXT,
      order_number INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      order_type TEXT NOT NULL DEFAULT 'sale',
      subtotal INTEGER NOT NULL DEFAULT 0,
      tax_total INTEGER NOT NULL DEFAULT 0,
      discount_total INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      cost_total INTEGER NOT NULL DEFAULT 0,
      discount_type TEXT,
      discount_value INTEGER,
      discount_reason TEXT,
      notes TEXT,
      customer_name TEXT,
      completed_at TEXT,
      voided_at TEXT,
      voided_by TEXT,
      void_reason TEXT,
      created_offline INTEGER NOT NULL DEFAULT 1,
      synced_at TEXT,
      hlc_timestamp TEXT NOT NULL DEFAULT '0',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      menu_item_id TEXT NOT NULL,
      name TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price INTEGER NOT NULL,
      unit_cost INTEGER NOT NULL DEFAULT 0,
      tax_rate TEXT NOT NULL DEFAULT '0',
      tax_amount INTEGER NOT NULL DEFAULT 0,
      subtotal INTEGER NOT NULL DEFAULT 0,
      total INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      hlc_timestamp TEXT NOT NULL DEFAULT '0',
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS order_item_modifiers (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      order_item_id TEXT NOT NULL,
      modifier_id TEXT,
      name TEXT NOT NULL,
      price_adjustment INTEGER NOT NULL DEFAULT 0,
      cost_adjustment INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (order_item_id) REFERENCES order_items(id)
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      payment_method TEXT NOT NULL,
      amount INTEGER NOT NULL,
      tip_amount INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      stripe_payment_intent_id TEXT,
      card_brand TEXT,
      card_last4 TEXT,
      cash_given INTEGER,
      change_given INTEGER,
      processed_at TEXT NOT NULL DEFAULT (datetime('now')),
      hlc_timestamp TEXT NOT NULL DEFAULT '0',
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS order_tax_breakdown (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      order_id TEXT NOT NULL,
      tax_rate_id TEXT,
      tax_rate_name TEXT NOT NULL,
      tax_rate_value TEXT NOT NULL,
      taxable_amount INTEGER NOT NULL DEFAULT 0,
      tax_amount INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );
  `);

  // ── Sync infrastructure ──
  db.execSync(`
    CREATE TABLE IF NOT EXISTS change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL,
      data TEXT NOT NULL,
      hlc TEXT NOT NULL,
      column_hlcs TEXT,
      synced INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.execSync(`
    CREATE INDEX IF NOT EXISTS idx_change_log_synced
    ON change_log(synced, id);
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS sync_state (
      table_name TEXT PRIMARY KEY,
      last_pulled_hlc TEXT NOT NULL DEFAULT '0',
      last_pushed_hlc TEXT NOT NULL DEFAULT '0',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS column_hlcs (
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      column_name TEXT NOT NULL,
      hlc TEXT NOT NULL,
      PRIMARY KEY (table_name, record_id, column_name)
    );
  `);

  db.execSync(`
    CREATE TABLE IF NOT EXISTS device_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // ── Local order sequence ──
  db.execSync(`
    CREATE TABLE IF NOT EXISTS order_sequence (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      next_number INTEGER NOT NULL DEFAULT 1
    );
  `);

  db.execSync(`
    INSERT OR IGNORE INTO order_sequence (id, next_number) VALUES (1, 1);
  `);
}

export function closeDatabase(): void {
  if (db) {
    db.closeSync();
    db = null;
  }
}
