# Offline Sync Architecture

## The Problem

A mobile food vendor at a festival has no internet. They serve 200 customers over 6 hours. Two tablets are taking orders simultaneously. At the end of the day, they drive home and get WiFi. Both tablets need to sync their data to the cloud — and to each other — without losing a single transaction and without creating duplicates.

This is the hardest engineering problem in the system. We are building a distributed database with eventual consistency across untrusted, intermittently-connected nodes. Getting this wrong means lost revenue data, incorrect stock levels, or broken VAT reporting.

---

## Architecture Overview

```
┌──────────────────────┐         ┌──────────────────────┐
│   DEVICE A (Tablet)  │         │   DEVICE B (Tablet)  │
│                      │         │                      │
│  ┌────────────────┐  │         │  ┌────────────────┐  │
│  │   SQLite DB    │  │         │  │   SQLite DB    │  │
│  │                │  │         │  │                │  │
│  │  - orders      │  │         │  │  - orders      │  │
│  │  - menu_items  │  │         │  │  - menu_items  │  │
│  │  - stock_levels│  │         │  │  - stock_levels│  │
│  │  - change_log  │  │         │  │  - change_log  │  │
│  └───────┬────────┘  │         │  └───────┬────────┘  │
│          │           │         │          │           │
│  ┌───────┴────────┐  │         │  ┌───────┴────────┐  │
│  │  Sync Engine   │  │         │  │  Sync Engine   │  │
│  │                │  │         │  │                │  │
│  │  - HLC Clock   │  │         │  │  - HLC Clock   │  │
│  │  - Change      │  │         │  │  - Change      │  │
│  │    Tracker      │  │         │  │    Tracker      │  │
│  │  - Conflict    │  │         │  │  - Conflict    │  │
│  │    Resolver     │  │         │  │    Resolver     │  │
│  └───────┬────────┘  │         │  └───────┬────────┘  │
└──────────┼───────────┘         └──────────┼───────────┘
           │                                │
           │     ┌──────────────────┐       │
           └─────┤   Cloud Sync     ├───────┘
                 │   Service        │
                 │                  │
                 │  - Change merge  │
                 │  - Conflict log  │
                 │  - Fan-out       │
                 └────────┬─────────┘
                          │
                 ┌────────┴─────────┐
                 │   PostgreSQL     │
                 │   (Source of     │
                 │    Truth)        │
                 └──────────────────┘
```

---

## Core Concepts

### 1. Hybrid Logical Clock (HLC)

We cannot rely on wall clock time. Device clocks drift. Two devices at the same event might be minutes apart. NTP may not be available offline.

**Solution: Hybrid Logical Clock (HLC)**

An HLC combines:
- **Physical time**: milliseconds since epoch (from the device clock)
- **Logical counter**: incremented when physical time hasn't advanced

HLC structure (64-bit integer):
```
┌─────────────────────────────────────────────┬──────────┐
│  Physical time (48 bits, ms since epoch)     │ Counter  │
│  Good until year 10502                       │ (16 bits)│
└─────────────────────────────────────────────┴──────────┘
```

**Key properties:**
- Always increases (even if wall clock goes backward)
- Causally ordered: if event A caused event B, HLC(A) < HLC(B)
- Can be compared across devices for ordering
- On sync, devices update their HLC to `max(local_hlc, remote_hlc) + 1`

```typescript
class HybridLogicalClock {
  private physicalTime: number;
  private counter: number;
  private nodeId: string;

  now(): HLCTimestamp {
    const pt = Date.now();
    if (pt > this.physicalTime) {
      this.physicalTime = pt;
      this.counter = 0;
    } else {
      this.counter++;
    }
    return this.encode(this.physicalTime, this.counter);
  }

  receive(remoteHLC: HLCTimestamp): HLCTimestamp {
    const remotePT = this.decodePhysical(remoteHLC);
    const remoteCounter = this.decodeCounter(remoteHLC);
    const localPT = Date.now();

    if (localPT > this.physicalTime && localPT > remotePT) {
      this.physicalTime = localPT;
      this.counter = 0;
    } else if (remotePT > this.physicalTime) {
      this.physicalTime = remotePT;
      this.counter = remoteCounter + 1;
    } else {
      this.counter = Math.max(this.counter, remoteCounter) + 1;
    }
    return this.encode(this.physicalTime, this.counter);
  }

  private encode(pt: number, counter: number): bigint {
    return (BigInt(pt) << 16n) | BigInt(counter & 0xFFFF);
  }

  private decodePhysical(hlc: bigint): number {
    return Number(hlc >> 16n);
  }

  private decodeCounter(hlc: bigint): number {
    return Number(hlc & 0xFFFFn);
  }
}
```

### 2. Change Tracking

Every write to the local SQLite database is intercepted by the sync engine and recorded in a local `change_log` table:

```sql
-- Local SQLite change log (on device)
CREATE TABLE change_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    table_name      TEXT NOT NULL,
    record_id       TEXT NOT NULL,       -- UUID of the changed record
    operation       TEXT NOT NULL,       -- INSERT, UPDATE, DELETE
    changed_columns TEXT,               -- JSON array of changed column names
    old_values      TEXT,               -- JSON of previous values (for conflict detection)
    new_values      TEXT,               -- JSON of new values
    hlc_timestamp   INTEGER NOT NULL,   -- HLC at time of change
    device_id       TEXT NOT NULL,
    synced          INTEGER NOT NULL DEFAULT 0,  -- 0 = pending, 1 = synced
    created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_change_log_pending ON change_log(synced, hlc_timestamp);
```

### 3. Data Classification for Sync

Not all data syncs the same way. We classify tables into three categories:

| Category | Direction | Conflict Strategy | Examples |
|----------|-----------|-------------------|----------|
| **Reference Data** | Cloud → Device (read-only on device) | Cloud always wins | `tax_rates`, `tenant` settings |
| **Shared Mutable** | Bidirectional | Last-Writer-Wins (LWW) per column | `menu_items`, `categories`, `ingredients`, `stock_levels` |
| **Append-Only** | Device → Cloud (then fan-out) | No conflicts (unique UUIDs) | `orders`, `order_items`, `payments`, `stock_movements`, `waste_records` |

**This classification is critical.** Most sync complexity comes from shared mutable data. By making orders and payments append-only (they're created once and never edited across devices), we eliminate the hardest conflict scenarios for our most important data.

### 4. Conflict Resolution Strategy

#### Append-Only Data (Orders, Payments)
**No conflicts possible.** Each order has a globally unique UUID generated on the device. Two devices cannot create the same order. The sync service simply inserts new records.

Edge case: duplicate detection. If a sync push is interrupted and retried, the server uses `INSERT ... ON CONFLICT DO NOTHING` to prevent duplicates.

#### Shared Mutable Data (Menu Items, Stock Levels)
**Last-Writer-Wins per column (LWW-Register CRDT).**

Each column is treated as an independent register. The value with the highest HLC timestamp wins. This is more granular than row-level LWW:

**Example scenario:**
1. Device A changes the price of "Burger" from £8 to £9 (HLC: 100)
2. Device B changes the name of "Burger" to "Classic Burger" (HLC: 101)
3. Both sync to cloud

**Row-level LWW** would pick Device B's version entirely — losing the price change.
**Column-level LWW** merges: name = "Classic Burger" (HLC 101), price = £9 (HLC 100). Both changes preserved.

Implementation:

```typescript
interface ColumnChange {
  column: string;
  value: any;
  hlc: bigint;
}

function resolveConflict(
  localChanges: ColumnChange[],
  remoteChanges: ColumnChange[]
): Record<string, any> {
  const merged: Record<string, any> = {};
  const allColumns = new Set([
    ...localChanges.map(c => c.column),
    ...remoteChanges.map(c => c.column),
  ]);

  for (const col of allColumns) {
    const local = localChanges.find(c => c.column === col);
    const remote = remoteChanges.find(c => c.column === col);

    if (!local) { merged[col] = remote!.value; continue; }
    if (!remote) { merged[col] = local.value; continue; }

    // Highest HLC wins. Tie-break on device_id (deterministic).
    merged[col] = remote.hlc > local.hlc ? remote.value : local.value;
  }

  return merged;
}
```

#### Stock Levels (Special Case)
Stock levels require a **counter CRDT**, not LWW. Two devices selling simultaneously must both decrement stock:

- Device A sells 2 burgers → stock decremented by 2
- Device B sells 3 burgers → stock decremented by 3
- Cloud stock should reflect -5 total, not the "last write"

**Implementation:** Stock movements are append-only (each sale creates a `stock_movement` record). The `stock_levels.current_quantity` is periodically recalculated as `SUM(stock_movements.quantity)`. This means stock level is a materialized view of movements, not an independently mutable value.

#### Reference Data (Tax Rates)
**Cloud always wins.** Tax rates are set in the back office and pushed to devices. Devices cannot modify them. Simple overwrite on sync.

---

## Sync Protocol

### Push (Device → Cloud)

```
1. Device queries change_log WHERE synced = 0 ORDER BY hlc_timestamp
2. Device batches changes (max 500 per request)
3. Device sends POST /api/sync/push with:
   {
     device_id: "uuid",
     batch_id: "uuid",        // idempotency key
     changes: [
       {
         table: "orders",
         record_id: "uuid",
         operation: "INSERT",
         data: { ... },
         hlc: 12345678901234
       },
       ...
     ],
     device_hlc: 12345678901234  // current device HLC
   }
4. Server processes each change:
   - Append-only tables: INSERT ... ON CONFLICT DO NOTHING
   - LWW tables: Compare HLC per column, merge, update
   - Record any conflicts in sync_conflicts table
5. Server responds with:
   {
     batch_id: "uuid",
     accepted: 498,
     conflicts: 2,
     server_hlc: 12345678905678,
     conflict_details: [ ... ]
   }
6. Device marks changes as synced = 1
7. Device updates local HLC to max(local, server_hlc)
```

### Pull (Cloud → Device)

```
1. Device sends GET /api/sync/pull?since_hlc={last_pulled_hlc}&tables=orders,menu_items,...
2. Server queries for changes where hlc_timestamp > since_hlc AND tenant_id = device.tenant_id
3. Server responds with:
   {
     changes: [
       {
         table: "menu_items",
         record_id: "uuid",
         operation: "UPDATE",
         data: { ... },
         hlc: 12345678903456
       },
       ...
     ],
     server_hlc: 12345678905678,
     has_more: false
   }
4. Device applies changes to local SQLite:
   - Inserts new records
   - Updates existing records (LWW per column)
   - Marks soft-deleted records
5. Device updates last_pulled_hlc
```

### Full Sync Flow

```
Device comes online:
  1. PUSH all pending local changes
  2. PULL all remote changes since last pull
  3. Repeat until no more pending changes on either side
  4. Update last_sync_at on device record

Periodic sync (when online):
  - Every 30 seconds: push pending changes
  - Every 60 seconds: pull remote changes
  - Configurable per tenant
```

---

## Offline Guarantees

### What works offline:
- Creating and completing orders
- Processing cash payments
- Viewing menu and prices
- Recording waste
- Basic reporting (today's sales, shift totals)
- Order number generation (per-device prefix: "A001", "B001")

### What requires connectivity:
- Card payments (queued, or use Stripe Terminal's offline mode)
- Syncing with other devices
- Back office access
- Changing menu items or prices (changes queue until sync)
- Full reporting and analytics

### Data durability offline:
- SQLite WAL mode for crash resistance
- Change log is append-only — never loses data
- Application-level write-ahead: changes are logged before applied
- Periodic SQLite backup to device storage

---

## Edge Cases and Failure Modes

### 1. Device clock wildly wrong
**Mitigation:** HLC bounds check. If a device's physical time is >24 hours ahead of server time during sync, reject the push and alert the user to fix their device clock. The HLC still maintains causal ordering even with moderate drift.

### 2. Sync interrupted mid-push
**Mitigation:** Idempotent batches. Each push includes a `batch_id`. If the same batch is re-sent, the server detects it and returns success without reprocessing.

### 3. Menu item deleted on cloud while device has orders referencing it
**Mitigation:** Soft deletes only. Menu items are never hard-deleted. The device can still reference deleted items. Denormalised names on order items mean historical data is always readable.

### 4. Two devices sell the last item in stock
**Mitigation:** Stock levels are advisory, not enforced. Mobile food vendors don't hard-block sales based on stock — they know what they have. The system warns but doesn't prevent. Post-sync, stock may show negative, which surfaces a discrepancy report.

### 5. Device never syncs again (lost/stolen/broken)
**Mitigation:** Change log and SQLite are on the device. If the device is gone, that data is gone. This is why card payments are processed through Stripe (which has its own record). Cash transactions on a lost device are genuinely lost — but this is no worse than a paper notepad in a fire. We document this risk clearly to vendors.

### 6. Conflicting order numbers
**Mitigation:** Order numbers use a device prefix: Device A generates "A-001", "A-002". Device B generates "B-001", "B-002". On sync, the cloud assigns a canonical sequential order number for reporting, but the POS-generated number is preserved for reference.
