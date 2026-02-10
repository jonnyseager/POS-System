import { describe, it, expect } from "vitest";
import { resolveColumnLWW, buildInitialColumnHlcs } from "./sync.service.js";

// ─── resolveColumnLWW ────────────────────────────────────────────────────────

describe("resolveColumnLWW", () => {
  it("incoming wins when all column HLCs are higher", () => {
    const result = resolveColumnLWW(
      { name: "Burger", price: 800 },
      { name: "100", price: "100" },
      { name: "Classic Burger", price: 900 },
      { name: "200", price: "200" },
    );

    expect(result.mergedData.name).toBe("Classic Burger");
    expect(result.mergedData.price).toBe(900);
    expect(result.mergedColumnHlcs.name).toBe("200");
    expect(result.mergedColumnHlcs.price).toBe("200");
    expect(result.hadConflict).toBe(false);
  });

  it("current wins when all column HLCs are higher", () => {
    const result = resolveColumnLWW(
      { name: "Burger", price: 800 },
      { name: "300", price: "300" },
      { name: "Classic Burger", price: 900 },
      { name: "100", price: "100" },
    );

    expect(result.mergedData.name).toBe("Burger");
    expect(result.mergedData.price).toBe(800);
    expect(result.mergedColumnHlcs.name).toBe("300");
    expect(result.mergedColumnHlcs.price).toBe("300");
    expect(result.hadConflict).toBe(true);
  });

  it("merges per column — different columns win from different sources", () => {
    // Device A changed name (HLC 200), Device B changed price (HLC 300)
    const result = resolveColumnLWW(
      { name: "Burger", price: 800, description: "A burger" },
      { name: "100", price: "300", description: "50" },
      { name: "Classic Burger", price: 900 },
      { name: "200", price: "100" },
    );

    expect(result.mergedData.name).toBe("Classic Burger"); // incoming wins (200 > 100)
    expect(result.mergedData.price).toBe(800);              // current wins (300 > 100)
    expect(result.mergedData.description).toBe("A burger"); // untouched
    expect(result.mergedColumnHlcs.name).toBe("200");
    expect(result.mergedColumnHlcs.price).toBe("300");
    expect(result.mergedColumnHlcs.description).toBe("50");
    expect(result.hadConflict).toBe(true);
  });

  it("incoming wins for columns not in current column HLCs", () => {
    const result = resolveColumnLWW(
      { name: "Burger" },
      {},
      { name: "Classic Burger", description: "Updated" },
      { name: "200", description: "200" },
    );

    expect(result.mergedData.name).toBe("Classic Burger");
    expect(result.mergedData.description).toBe("Updated");
    expect(result.mergedColumnHlcs.name).toBe("200");
    expect(result.mergedColumnHlcs.description).toBe("200");
    expect(result.hadConflict).toBe(false);
  });

  it("tie breaks in favour of current (server wins)", () => {
    const result = resolveColumnLWW(
      { name: "Burger" },
      { name: "100" },
      { name: "Classic Burger" },
      { name: "100" },
    );

    expect(result.mergedData.name).toBe("Burger");
    expect(result.mergedColumnHlcs.name).toBe("100");
    expect(result.hadConflict).toBe(true);
  });

  it("skips server-managed columns (id, tenantId, etc.)", () => {
    const result = resolveColumnLWW(
      { id: "original-id", tenantId: "original-tenant", name: "Burger" },
      { name: "100" },
      { id: "hacked-id", tenantId: "hacked-tenant", name: "Classic Burger" },
      { id: "999", tenantId: "999", name: "200" },
    );

    // Server-managed columns should NOT be merged
    expect(result.mergedData.id).toBe("original-id");
    expect(result.mergedData.tenantId).toBe("original-tenant");
    // Business column should be merged
    expect(result.mergedData.name).toBe("Classic Burger");
    expect(result.hadConflict).toBe(false);
  });

  it("handles empty incoming data gracefully", () => {
    const result = resolveColumnLWW(
      { name: "Burger", price: 800 },
      { name: "100", price: "100" },
      {},
      {},
    );

    expect(result.mergedData.name).toBe("Burger");
    expect(result.mergedData.price).toBe(800);
    expect(result.mergedColumnHlcs.name).toBe("100");
    expect(result.mergedColumnHlcs.price).toBe("100");
    expect(result.hadConflict).toBe(false);
  });

  it("handles large HLC values (BigInt comparison)", () => {
    const result = resolveColumnLWW(
      { name: "Burger" },
      { name: "9007199254740992" }, // > Number.MAX_SAFE_INTEGER
      { name: "Classic Burger" },
      { name: "9007199254740993" },
    );

    expect(result.mergedData.name).toBe("Classic Burger");
    expect(result.mergedColumnHlcs.name).toBe("9007199254740993");
    expect(result.hadConflict).toBe(false);
  });

  it("ignores columns in columnHlcs that have no data", () => {
    const result = resolveColumnLWW(
      { name: "Burger", price: 800 },
      { name: "100", price: "100" },
      { name: "Classic Burger" },        // no price in data
      { name: "200", price: "200" },     // price HLC exists but no data
    );

    expect(result.mergedData.name).toBe("Classic Burger");
    expect(result.mergedData.price).toBe(800); // unchanged (no data for price)
    expect(result.hadConflict).toBe(false);
  });

  it("preserves uncontested current columns not in incoming", () => {
    const result = resolveColumnLWW(
      { name: "Burger", price: 800, sku: "BRG-001" },
      { name: "100", price: "100", sku: "50" },
      { name: "Classic Burger" },
      { name: "200" },
    );

    expect(result.mergedData.name).toBe("Classic Burger");
    expect(result.mergedData.price).toBe(800);
    expect(result.mergedData.sku).toBe("BRG-001");
    expect(result.mergedColumnHlcs.price).toBe("100");
    expect(result.mergedColumnHlcs.sku).toBe("50");
    expect(result.hadConflict).toBe(false);
  });

  it("three-way merge: concurrent edits to three different columns", () => {
    // Current state: price changed at HLC 300, name at HLC 200
    // Incoming: description changed at HLC 250, price at HLC 100
    const result = resolveColumnLWW(
      { name: "Burger", price: 900, description: "Old" },
      { name: "200", price: "300", description: "100" },
      { price: 850, description: "New desc" },
      { price: "100", description: "250" },
    );

    expect(result.mergedData.name).toBe("Burger");          // untouched
    expect(result.mergedData.price).toBe(900);               // current wins (300 > 100)
    expect(result.mergedData.description).toBe("New desc");  // incoming wins (250 > 100)
    expect(result.hadConflict).toBe(true); // price conflict
  });

  it("soft delete via deletedAt column is subject to LWW", () => {
    const result = resolveColumnLWW(
      { name: "Burger", deletedAt: null },
      { name: "100", deletedAt: "50" },
      { deletedAt: "2025-01-01T00:00:00Z" },
      { deletedAt: "200" },
    );

    expect(result.mergedData.deletedAt).toBe("2025-01-01T00:00:00Z");
    expect(result.mergedColumnHlcs.deletedAt).toBe("200");
    expect(result.hadConflict).toBe(false);
  });
});

// ─── buildInitialColumnHlcs ──────────────────────────────────────────────────

describe("buildInitialColumnHlcs", () => {
  it("creates HLCs for all non-system columns", () => {
    const result = buildInitialColumnHlcs(
      { name: "Burger", price: 800, description: null },
      "12345",
    );

    expect(result).toEqual({
      name: "12345",
      price: "12345",
      description: "12345",
    });
  });

  it("excludes server-managed columns", () => {
    const result = buildInitialColumnHlcs(
      { id: "uuid", tenantId: "t1", name: "Burger", createdAt: "now", updatedAt: "now", hlcTimestamp: "0" },
      "100",
    );

    expect(result).toEqual({ name: "100" });
    expect(result.id).toBeUndefined();
    expect(result.tenantId).toBeUndefined();
    expect(result.createdAt).toBeUndefined();
    expect(result.updatedAt).toBeUndefined();
    expect(result.hlcTimestamp).toBeUndefined();
  });

  it("handles empty data", () => {
    expect(buildInitialColumnHlcs({}, "100")).toEqual({});
  });
});
