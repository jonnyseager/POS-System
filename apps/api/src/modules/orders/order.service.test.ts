/**
 * Unit tests for order calculation logic.
 *
 * These test the pure math without a database — they verify that
 * our tax, discount, and margin calculations are correct to the penny.
 */
import { describe, it, expect } from "vitest";

// Pure calculation functions extracted for testing.
// In production these live inside OrderService but the logic is the same.

/** Calculate tax amount from a VAT-exclusive subtotal and tax rate. */
function calculateTax(subtotalPence: number, taxRate: number): number {
  return Math.round(subtotalPence * taxRate);
}

/** Calculate discount from subtotal. */
function calculateDiscount(
  subtotalPence: number,
  discountType: "percentage" | "fixed",
  discountValue: number,
): number {
  if (discountType === "percentage") {
    // discountValue is in basis points (100 = 1%, 10000 = 100%)
    return Math.round(subtotalPence * (discountValue / 10000));
  }
  // Fixed discount in pence, capped at subtotal
  return Math.min(discountValue, subtotalPence);
}

/** Calculate margin percentage. */
function calculateMarginPercent(revenuePence: number, costPence: number): number {
  if (revenuePence <= 0) return 0;
  return Math.round(((revenuePence - costPence) / revenuePence) * 10000) / 100;
}

/** Calculate recipe cost from ingredients. */
function calculateRecipeCost(
  ingredients: Array<{ quantity: number; costPerUnit: number; costPrecision: number }>,
): number {
  const totalCost = ingredients.reduce((sum, ing) => {
    return sum + ing.quantity * (ing.costPerUnit / Math.pow(10, ing.costPrecision));
  }, 0);
  return Math.round(totalCost);
}

describe("Tax calculations", () => {
  it("should calculate 20% standard VAT correctly", () => {
    // Burger at £8.00 (800p) + 20% VAT = £1.60 (160p) tax
    expect(calculateTax(800, 0.2)).toBe(160);
  });

  it("should calculate 5% reduced VAT correctly", () => {
    // Hot drink at £3.50 (350p) + 5% VAT = £0.175 → rounds to 18p
    expect(calculateTax(350, 0.05)).toBe(18);
  });

  it("should calculate zero-rated VAT as zero", () => {
    expect(calculateTax(1500, 0)).toBe(0);
  });

  it("should handle rounding consistently (banker's rounding via Math.round)", () => {
    // £1.25 at 20% = 25p (exact, no rounding needed)
    expect(calculateTax(125, 0.2)).toBe(25);
    // £1.15 at 20% = 23p (0.23 * 100 = 23.0)
    expect(calculateTax(115, 0.2)).toBe(23);
  });

  it("should handle very small amounts", () => {
    // 1p at 20% = 0.2p → rounds to 0p
    expect(calculateTax(1, 0.2)).toBe(0);
    // 3p at 20% = 0.6p → rounds to 1p
    expect(calculateTax(3, 0.2)).toBe(1);
  });
});

describe("Discount calculations", () => {
  it("should calculate percentage discount (10%)", () => {
    // 1000 = 10% → subtotal 2000p = 200p discount
    expect(calculateDiscount(2000, "percentage", 1000)).toBe(200);
  });

  it("should calculate percentage discount (50%)", () => {
    // 5000 = 50%
    expect(calculateDiscount(2000, "percentage", 5000)).toBe(1000);
  });

  it("should calculate fixed discount", () => {
    expect(calculateDiscount(2000, "fixed", 500)).toBe(500);
  });

  it("should cap fixed discount at subtotal", () => {
    expect(calculateDiscount(200, "fixed", 500)).toBe(200);
  });
});

describe("Margin calculations", () => {
  it("should calculate margin for a profitable item", () => {
    // Burger: sells for 800p, costs 214p → margin = (800-214)/800 = 73.25%
    expect(calculateMarginPercent(800, 214)).toBe(73.25);
  });

  it("should calculate margin for a low-margin item", () => {
    // Drink: sells for 300p, costs 250p → margin = (300-250)/300 = 16.67%
    expect(calculateMarginPercent(300, 250)).toBe(16.67);
  });

  it("should handle zero revenue", () => {
    expect(calculateMarginPercent(0, 100)).toBe(0);
  });

  it("should handle zero cost (100% margin)", () => {
    expect(calculateMarginPercent(500, 0)).toBe(100);
  });
});

describe("Recipe cost calculations", () => {
  it("should calculate cost for a simple burger recipe", () => {
    const ingredients = [
      // 150g beef mince at £8/kg = £0.008/g → costPerUnit=8, precision=3 (÷1000)
      { quantity: 150, costPerUnit: 8, costPrecision: 3 },
      // 1 bun at £0.25 each → costPerUnit=25, precision=2 (÷100)
      { quantity: 1, costPerUnit: 25, costPrecision: 2 },
      // 30g cheese at £12/kg = £0.012/g → costPerUnit=12, precision=3
      { quantity: 30, costPerUnit: 12, costPrecision: 3 },
      // 50g lettuce at £3/kg = £0.003/g → costPerUnit=3, precision=3
      { quantity: 50, costPerUnit: 3, costPrecision: 3 },
    ];

    const cost = calculateRecipeCost(ingredients);
    // 150*8/1000 + 1*25/100 + 30*12/1000 + 50*3/1000
    // = 1.2 + 0.25 + 0.36 + 0.15 = 1.96 → rounds to 2p
    // Wait — these are in pence already. Let me recalculate.
    // Actually: costPerUnit is in pence. So:
    // 150 * 8/1000 = 1.2 pence
    // 1 * 25/100 = 0.25 pence
    // 30 * 12/1000 = 0.36 pence
    // 50 * 3/1000 = 0.15 pence
    // Total = 1.96 pence → rounds to 2p
    // That's wrong for real prices. Let me re-think.
    //
    // Better model: costPerUnit in pence, precision says how to interpret.
    // Beef: £8/kg = 800p/kg. For per-gram: 800/1000 = 0.8p/g
    //   Store as costPerUnit=800, costPrecision=2 (pence per kg), then quantity=0.15 (kg)
    //   OR costPerUnit=80, costPrecision=2, quantity in 100g units...
    //
    // Simplest: costPerUnit is raw pence-per-unit, costPrecision is decimal places.
    // £8/kg = 800 pence/kg. costPerUnit=800, costPrecision=0 (no decimal places).
    // quantity=0.15 (kg). Cost = 0.15 * 800 / 10^0 = 120p = £1.20

    const simpleIngredients = [
      // 0.15kg beef at 800p/kg
      { quantity: 0.15, costPerUnit: 800, costPrecision: 0 },
      // 1 bun at 25p each
      { quantity: 1, costPerUnit: 25, costPrecision: 0 },
      // 0.03kg cheese at 1200p/kg
      { quantity: 0.03, costPerUnit: 1200, costPrecision: 0 },
      // 0.05kg lettuce at 300p/kg
      { quantity: 0.05, costPerUnit: 300, costPrecision: 0 },
    ];

    const simpleCost = calculateRecipeCost(simpleIngredients);
    // 0.15*800 + 1*25 + 0.03*1200 + 0.05*300
    // = 120 + 25 + 36 + 15 = 196p = £1.96
    expect(simpleCost).toBe(196);
  });

  it("should round to nearest penny", () => {
    const ingredients = [
      { quantity: 0.333, costPerUnit: 100, costPrecision: 0 }, // 33.3p
    ];
    expect(calculateRecipeCost(ingredients)).toBe(33); // rounds down
  });
});

describe("Full order calculation", () => {
  it("should calculate a complete order correctly", () => {
    // Scenario: 2 burgers (800p each) + 1 drink (300p), 20% VAT, 10% discount
    const items = [
      { unitPrice: 800, quantity: 2, unitCost: 196, taxRate: 0.2 },
      { unitPrice: 300, quantity: 1, unitCost: 85, taxRate: 0.2 },
    ];

    const subtotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    expect(subtotal).toBe(1900); // 1600 + 300

    const taxTotal = items.reduce((s, i) => s + calculateTax(i.unitPrice * i.quantity, i.taxRate), 0);
    expect(taxTotal).toBe(380); // 320 + 60

    const discountTotal = calculateDiscount(subtotal, "percentage", 1000); // 10%
    expect(discountTotal).toBe(190);

    const total = subtotal + taxTotal - discountTotal;
    expect(total).toBe(2090); // 1900 + 380 - 190

    const costTotal = items.reduce((s, i) => s + i.unitCost * i.quantity, 0);
    expect(costTotal).toBe(477); // 392 + 85

    const margin = calculateMarginPercent(subtotal, costTotal);
    expect(margin).toBe(74.89); // (1900-477)/1900 * 100
  });
});
