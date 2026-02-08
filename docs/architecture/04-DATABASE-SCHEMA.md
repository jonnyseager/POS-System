# Core Database Schema

## Design Principles

1. **Every table has `tenant_id`** — enforced via PostgreSQL Row-Level Security
2. **Soft deletes everywhere** — `deleted_at` timestamp, never hard delete (audit trail)
3. **UUIDs as primary keys** — required for offline ID generation without coordination
4. **Timestamps are UTC** — timezone conversion happens at the presentation layer
5. **Money stored as integers** — pence/cents, never floating point. £10.50 = 1050
6. **All prices are VAT-exclusive internally** — VAT calculated at order time based on current rates
7. **`hlc_timestamp` on sync-eligible tables** — Hybrid Logical Clock for CRDT ordering

---

## Entity Relationship Overview

```
Tenant
 ├── Location
 │    ├── Device
 │    └── Shift
 ├── User (Staff)
 │    └── Role
 ├── Category
 │    └── MenuItem
 │         ├── MenuItemModifierGroup
 │         │    └── Modifier
 │         ├── Recipe
 │         │    └── RecipeIngredient → Ingredient
 │         └── MenuItemTaxRate
 ├── Ingredient
 │    ├── IngredientSupplier → Supplier
 │    └── StockLevel (per Location)
 ├── Supplier
 ├── Order
 │    ├── OrderItem
 │    │    └── OrderItemModifier
 │    ├── Payment
 │    └── TaxBreakdown
 ├── StockMovement
 ├── WasteRecord
 └── TaxRate
```

---

## Core Tables

### Tenants & Authentication

```sql
-- A tenant is a business entity. Everything is scoped to a tenant.
CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT NOT NULL UNIQUE,          -- URL-safe identifier
    business_type   TEXT NOT NULL DEFAULT 'food_vendor',
    country_code    CHAR(2) NOT NULL DEFAULT 'GB',
    currency_code   CHAR(3) NOT NULL DEFAULT 'GBP',
    timezone        TEXT NOT NULL DEFAULT 'Europe/London',
    vat_registered  BOOLEAN NOT NULL DEFAULT FALSE,
    vat_number      TEXT,                          -- GB VAT number
    stripe_account_id TEXT,                        -- Stripe Connect account
    subscription_tier TEXT NOT NULL DEFAULT 'free', -- free, starter, pro, enterprise
    subscription_status TEXT NOT NULL DEFAULT 'trialing',
    trial_ends_at   TIMESTAMPTZ,
    settings        JSONB NOT NULL DEFAULT '{}',   -- flexible tenant settings
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ
);

-- Users belong to a tenant. A user can belong to multiple tenants (franchise model).
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL,
    password_hash   TEXT NOT NULL,
    first_name      TEXT NOT NULL,
    last_name       TEXT NOT NULL,
    phone           TEXT,
    email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE(email) WHERE deleted_at IS NULL
);

-- Junction: which users belong to which tenants, with which role
CREATE TABLE tenant_users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    user_id         UUID NOT NULL REFERENCES users(id),
    role            TEXT NOT NULL DEFAULT 'staff',  -- owner, manager, staff
    pin_code        TEXT,                           -- 4-digit PIN for POS quick login
    hourly_rate     INTEGER,                        -- pence, for future staff costing
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_id, user_id)
);
```

### Locations & Devices

```sql
-- A location is a physical place where sales happen.
-- For mobile vendors, this might be "Shoreditch Market" or "Reading Festival Pitch 4A"
CREATE TABLE locations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            TEXT NOT NULL,
    location_type   TEXT NOT NULL DEFAULT 'fixed',  -- fixed, mobile, event
    address_line1   TEXT,
    address_line2   TEXT,
    city            TEXT,
    postcode        TEXT,
    country_code    CHAR(2) DEFAULT 'GB',
    latitude        DECIMAL(10, 8),
    longitude       DECIMAL(11, 8),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    settings        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    hlc_timestamp   BIGINT NOT NULL DEFAULT 0       -- for sync ordering
);

-- A device is a physical POS terminal (tablet/phone).
CREATE TABLE devices (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    location_id     UUID REFERENCES locations(id),  -- nullable: device can be unassigned
    device_name     TEXT NOT NULL,
    device_type     TEXT NOT NULL DEFAULT 'tablet',  -- tablet, phone, kiosk
    platform        TEXT NOT NULL,                   -- ios, android
    app_version     TEXT,
    last_sync_at    TIMESTAMPTZ,
    last_seen_at    TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    device_token    TEXT NOT NULL UNIQUE,             -- for device authentication
    push_token      TEXT,                            -- for push notifications
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A shift represents a trading session at a location.
CREATE TABLE shifts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    location_id     UUID NOT NULL REFERENCES locations(id),
    opened_by       UUID NOT NULL REFERENCES users(id),
    closed_by       UUID REFERENCES users(id),
    opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at       TIMESTAMPTZ,
    opening_cash    INTEGER NOT NULL DEFAULT 0,      -- pence
    closing_cash    INTEGER,                         -- pence
    expected_cash   INTEGER,                         -- calculated from cash payments
    notes           TEXT,
    status          TEXT NOT NULL DEFAULT 'open',    -- open, closed
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hlc_timestamp   BIGINT NOT NULL DEFAULT 0
);
```

### Catalog (Menu, Recipes, Ingredients)

```sql
-- Categories for menu organisation
CREATE TABLE categories (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            TEXT NOT NULL,
    display_order   INTEGER NOT NULL DEFAULT 0,
    color           TEXT,                           -- hex color for POS display
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    hlc_timestamp   BIGINT NOT NULL DEFAULT 0
);

-- A menu item is something you sell.
CREATE TABLE menu_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    category_id     UUID REFERENCES categories(id),
    name            TEXT NOT NULL,
    description     TEXT,
    sku             TEXT,                           -- optional stock-keeping unit
    price           INTEGER NOT NULL,               -- pence, VAT-exclusive
    cost_price      INTEGER,                        -- pence, calculated from recipe or manual
    cost_method     TEXT NOT NULL DEFAULT 'manual', -- manual, recipe
    tax_rate_id     UUID REFERENCES tax_rates(id),
    image_url       TEXT,
    barcode         TEXT,
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    track_stock     BOOLEAN NOT NULL DEFAULT FALSE, -- whether to decrement stock on sale
    allow_modifiers BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    hlc_timestamp   BIGINT NOT NULL DEFAULT 0
);

-- Modifier groups (e.g., "Size", "Extra Toppings", "Sauce Choice")
CREATE TABLE modifier_groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            TEXT NOT NULL,                  -- "Size", "Extras"
    selection_type  TEXT NOT NULL DEFAULT 'single', -- single, multiple
    min_selections  INTEGER NOT NULL DEFAULT 0,
    max_selections  INTEGER,                        -- null = unlimited
    is_required     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    hlc_timestamp   BIGINT NOT NULL DEFAULT 0
);

-- Link menu items to modifier groups
CREATE TABLE menu_item_modifier_groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    menu_item_id    UUID NOT NULL REFERENCES menu_items(id),
    modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id),
    display_order   INTEGER NOT NULL DEFAULT 0,
    UNIQUE(menu_item_id, modifier_group_id)
);

-- Individual modifiers within a group
CREATE TABLE modifiers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    modifier_group_id UUID NOT NULL REFERENCES modifier_groups(id),
    name            TEXT NOT NULL,                  -- "Large", "Extra Cheese"
    price_adjustment INTEGER NOT NULL DEFAULT 0,    -- pence, added to base price
    cost_adjustment INTEGER NOT NULL DEFAULT 0,     -- pence, added to base cost
    display_order   INTEGER NOT NULL DEFAULT 0,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    hlc_timestamp   BIGINT NOT NULL DEFAULT 0
);

-- Ingredients are the raw materials used in recipes.
CREATE TABLE ingredients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            TEXT NOT NULL,
    unit            TEXT NOT NULL,                  -- g, kg, ml, l, unit, slice
    cost_per_unit   INTEGER NOT NULL,               -- pence per unit (e.g., pence per gram)
    -- To handle fractional costs: cost_per_unit is stored with 4 decimal places
    -- e.g., £2.50/kg = 250 pence/kg = 0.25 pence/g → stored as 25 (÷100 to get pence)
    cost_precision  INTEGER NOT NULL DEFAULT 2,     -- decimal places in cost_per_unit
    category        TEXT,                           -- protein, dairy, produce, dry-goods, etc.
    allergens       TEXT[] DEFAULT '{}',            -- array of allergen codes
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    hlc_timestamp   BIGINT NOT NULL DEFAULT 0
);

-- Recipes link menu items to ingredients with quantities.
-- This is how we calculate real-time COGS per item.
CREATE TABLE recipe_ingredients (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    menu_item_id    UUID NOT NULL REFERENCES menu_items(id),
    ingredient_id   UUID NOT NULL REFERENCES ingredients(id),
    quantity         DECIMAL(10, 4) NOT NULL,        -- quantity in ingredient's unit
    notes           TEXT,                            -- "diced", "melted", etc.
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hlc_timestamp   BIGINT NOT NULL DEFAULT 0,
    UNIQUE(menu_item_id, ingredient_id)
);
```

### Inventory & Stock

```sql
-- Stock levels per ingredient per location.
CREATE TABLE stock_levels (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    location_id     UUID NOT NULL REFERENCES locations(id),
    ingredient_id   UUID NOT NULL REFERENCES ingredients(id),
    current_quantity DECIMAL(10, 4) NOT NULL DEFAULT 0,
    min_quantity    DECIMAL(10, 4),                  -- reorder point
    max_quantity    DECIMAL(10, 4),                  -- max capacity
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hlc_timestamp   BIGINT NOT NULL DEFAULT 0,
    UNIQUE(location_id, ingredient_id)
);

-- Every stock change is recorded as a movement for audit trail.
CREATE TABLE stock_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    location_id     UUID NOT NULL REFERENCES locations(id),
    ingredient_id   UUID NOT NULL REFERENCES ingredients(id),
    movement_type   TEXT NOT NULL,                   -- received, sold, wasted, adjusted, transferred
    quantity         DECIMAL(10, 4) NOT NULL,         -- positive = in, negative = out
    unit_cost       INTEGER,                         -- pence, cost at time of movement
    reference_type  TEXT,                             -- order, waste_record, purchase_order, adjustment
    reference_id    UUID,                             -- ID of the related entity
    notes           TEXT,
    performed_by    UUID REFERENCES users(id),
    performed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hlc_timestamp   BIGINT NOT NULL DEFAULT 0
);

-- Waste tracking for margin analysis.
CREATE TABLE waste_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    location_id     UUID NOT NULL REFERENCES locations(id),
    ingredient_id   UUID NOT NULL REFERENCES ingredients(id),
    quantity         DECIMAL(10, 4) NOT NULL,
    reason          TEXT NOT NULL,                   -- expired, dropped, overcooked, quality, other
    cost            INTEGER NOT NULL,                -- pence, calculated at time of waste
    recorded_by     UUID NOT NULL REFERENCES users(id),
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hlc_timestamp   BIGINT NOT NULL DEFAULT 0
);

-- Suppliers
CREATE TABLE suppliers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            TEXT NOT NULL,
    contact_name    TEXT,
    email           TEXT,
    phone           TEXT,
    address         TEXT,
    notes           TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    hlc_timestamp   BIGINT NOT NULL DEFAULT 0
);

-- Which suppliers provide which ingredients, at what price.
CREATE TABLE ingredient_suppliers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    ingredient_id   UUID NOT NULL REFERENCES ingredients(id),
    supplier_id     UUID NOT NULL REFERENCES suppliers(id),
    supplier_sku    TEXT,
    unit_cost       INTEGER NOT NULL,                -- pence per unit
    min_order_qty   DECIMAL(10, 4),
    lead_time_days  INTEGER,
    is_preferred    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(ingredient_id, supplier_id)
);
```

### Orders & Payments

```sql
-- Tax rates (UK VAT)
CREATE TABLE tax_rates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    name            TEXT NOT NULL,                   -- "Standard VAT", "Reduced VAT", "Zero-rated"
    rate            DECIMAL(5, 4) NOT NULL,          -- 0.2000 for 20%, 0.0500 for 5%
    is_default      BOOLEAN NOT NULL DEFAULT FALSE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hlc_timestamp   BIGINT NOT NULL DEFAULT 0
);

-- Orders: the core transaction record.
CREATE TABLE orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    location_id     UUID NOT NULL REFERENCES locations(id),
    device_id       UUID REFERENCES devices(id),
    shift_id        UUID REFERENCES shifts(id),
    user_id         UUID NOT NULL REFERENCES users(id),  -- staff who created the order
    order_number    TEXT NOT NULL,                    -- human-readable, per-location sequence
    status          TEXT NOT NULL DEFAULT 'open',    -- open, completed, voided, refunded
    order_type      TEXT NOT NULL DEFAULT 'sale',    -- sale, refund

    -- Pricing (all in pence, all calculated at order time)
    subtotal        INTEGER NOT NULL DEFAULT 0,      -- sum of line items before tax
    tax_total       INTEGER NOT NULL DEFAULT 0,      -- sum of all tax
    discount_total  INTEGER NOT NULL DEFAULT 0,      -- sum of all discounts
    total           INTEGER NOT NULL DEFAULT 0,      -- subtotal + tax - discount
    cost_total      INTEGER NOT NULL DEFAULT 0,      -- sum of COGS for margin calc

    -- Discount details
    discount_type   TEXT,                            -- percentage, fixed
    discount_value  INTEGER,                         -- pence or basis points (100 = 1%)
    discount_reason TEXT,

    -- Metadata
    notes           TEXT,
    customer_name   TEXT,                            -- optional, for order tracking
    completed_at    TIMESTAMPTZ,
    voided_at       TIMESTAMPTZ,
    voided_by       UUID REFERENCES users(id),
    void_reason     TEXT,

    -- Sync
    created_offline BOOLEAN NOT NULL DEFAULT FALSE,
    synced_at       TIMESTAMPTZ,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hlc_timestamp   BIGINT NOT NULL DEFAULT 0
);

-- Line items within an order.
CREATE TABLE order_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    order_id        UUID NOT NULL REFERENCES orders(id),
    menu_item_id    UUID NOT NULL REFERENCES menu_items(id),
    name            TEXT NOT NULL,                   -- denormalised: name at time of sale
    quantity        INTEGER NOT NULL DEFAULT 1,
    unit_price      INTEGER NOT NULL,                -- pence, price at time of sale
    unit_cost       INTEGER NOT NULL DEFAULT 0,      -- pence, COGS at time of sale
    tax_rate        DECIMAL(5, 4) NOT NULL,          -- rate at time of sale
    tax_amount      INTEGER NOT NULL DEFAULT 0,      -- pence
    subtotal        INTEGER NOT NULL,                -- unit_price * quantity
    total           INTEGER NOT NULL,                -- subtotal + tax
    notes           TEXT,                            -- "no onions", special requests
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hlc_timestamp   BIGINT NOT NULL DEFAULT 0
);

-- Modifiers applied to order items.
CREATE TABLE order_item_modifiers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    order_item_id   UUID NOT NULL REFERENCES order_items(id),
    modifier_id     UUID NOT NULL REFERENCES modifiers(id),
    name            TEXT NOT NULL,                   -- denormalised
    price_adjustment INTEGER NOT NULL DEFAULT 0,     -- pence
    cost_adjustment INTEGER NOT NULL DEFAULT 0,      -- pence
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payments against an order (supports split payments).
CREATE TABLE payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    order_id        UUID NOT NULL REFERENCES orders(id),
    payment_method  TEXT NOT NULL,                   -- card, cash, other
    amount          INTEGER NOT NULL,                -- pence
    tip_amount      INTEGER NOT NULL DEFAULT 0,      -- pence
    status          TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed, refunded

    -- Card payment details (from Stripe)
    stripe_payment_intent_id TEXT,
    stripe_charge_id TEXT,
    card_brand      TEXT,                            -- visa, mastercard, amex
    card_last4      TEXT,

    -- Cash payment details
    cash_given      INTEGER,                         -- pence
    change_given    INTEGER,                         -- pence

    -- Refund tracking
    refund_of       UUID REFERENCES payments(id),    -- links refund to original payment
    refunded_amount INTEGER NOT NULL DEFAULT 0,

    processed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    hlc_timestamp   BIGINT NOT NULL DEFAULT 0
);

-- Tax breakdown per order (for VAT reporting).
CREATE TABLE order_tax_breakdown (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    order_id        UUID NOT NULL REFERENCES orders(id),
    tax_rate_id     UUID NOT NULL REFERENCES tax_rates(id),
    tax_rate_name   TEXT NOT NULL,                   -- denormalised
    tax_rate_value  DECIMAL(5, 4) NOT NULL,          -- denormalised
    taxable_amount  INTEGER NOT NULL,                -- pence
    tax_amount      INTEGER NOT NULL,                -- pence
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Sync Infrastructure

```sql
-- Tracks sync state per device.
CREATE TABLE device_sync_state (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id       UUID NOT NULL REFERENCES devices(id),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    table_name      TEXT NOT NULL,
    last_pulled_hlc BIGINT NOT NULL DEFAULT 0,       -- HLC timestamp of last pulled change
    last_pushed_hlc BIGINT NOT NULL DEFAULT 0,       -- HLC timestamp of last pushed change
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(device_id, table_name)
);

-- Conflict log for audit and debugging.
CREATE TABLE sync_conflicts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    device_id       UUID NOT NULL REFERENCES devices(id),
    table_name      TEXT NOT NULL,
    record_id       UUID NOT NULL,
    local_data      JSONB NOT NULL,
    remote_data     JSONB NOT NULL,
    resolution      TEXT NOT NULL,                   -- local_wins, remote_wins, merged, manual
    resolved_data   JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Event store for event sourcing (append-only).
CREATE TABLE events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id),
    aggregate_type  TEXT NOT NULL,                   -- order, menu_item, ingredient, etc.
    aggregate_id    UUID NOT NULL,
    event_type      TEXT NOT NULL,                   -- OrderCreated, PriceChanged, etc.
    event_data      JSONB NOT NULL,
    metadata        JSONB NOT NULL DEFAULT '{}',     -- user_id, device_id, ip, etc.
    version         INTEGER NOT NULL,                -- aggregate version for optimistic concurrency
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(aggregate_id, version)
);

CREATE INDEX idx_events_aggregate ON events(aggregate_type, aggregate_id, version);
CREATE INDEX idx_events_tenant_type ON events(tenant_id, event_type, created_at);
```

### Row-Level Security

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_levels ENABLE ROW LEVEL SECURITY;
-- ... (applied to ALL tenant-scoped tables)

-- Policy: users can only see rows belonging to their tenant
CREATE POLICY tenant_isolation ON locations
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

-- Same policy applied to every tenant-scoped table.
-- The app sets `app.current_tenant_id` on each database connection.
```

---

## Key Schema Design Decisions

### 1. Money as Integers
All monetary values are stored in pence (the smallest currency unit). `£10.50` is stored as `1050`. This eliminates floating-point rounding errors that plague financial systems. Division operations round explicitly using banker's rounding.

### 2. Denormalised Order Data
Order items store `name`, `unit_price`, `unit_cost`, and `tax_rate` at the time of sale — not as foreign key lookups. If a menu item's price changes tomorrow, yesterday's orders still show the correct historical price. This is non-negotiable for financial accuracy.

### 3. UUIDs for Offline ID Generation
Every primary key is a UUID generated on the device. This allows offline devices to create orders, payments, and stock movements without coordinating with the server for ID allocation. UUIDv7 is preferred where available (time-sortable).

### 4. Hybrid Logical Clock (HLC)
Tables that participate in offline sync carry an `hlc_timestamp` column. This is a 64-bit integer encoding both physical time and a logical counter, enabling causal ordering of events across devices without perfectly synchronised clocks. See the sync architecture document for details.

### 5. JSONB for Extensibility
`settings` columns use JSONB for tenant/location configuration that varies across businesses. This avoids schema changes for business-specific settings while keeping core relational fields in proper columns.

### 6. Ingredient Cost Precision
Ingredient costs often involve fractions of a penny (e.g., 0.25p per gram of flour). The `cost_precision` field on ingredients indicates how many decimal places the `cost_per_unit` value represents, allowing accurate sub-penny cost tracking without floating point.
