import { eq, and, isNull, sql, desc, count } from "drizzle-orm";
import { schema } from "@commerce-os/db";
import type { Database } from "@commerce-os/db";
import type { CreateOrderInput, ProcessPaymentInput } from "@commerce-os/validation";

/**
 * OrderService handles the full transaction lifecycle:
 *   Create order → Add items (with price/cost/tax snapshot) → Process payment → Complete
 *
 * Key invariants:
 *   - All prices denormalised at order time (immune to future price changes)
 *   - Tax calculated per item based on the item's tax rate
 *   - Cost calculated from recipe or manual cost_price
 *   - All money in pence (integers only, no floats)
 */
export class OrderService {
  constructor(private readonly db: Database) {}

  /**
   * Create a new order with line items.
   *
   * This is the critical path — it must:
   * 1. Look up each menu item's current price, cost, and tax rate
   * 2. Look up modifier prices
   * 3. Calculate per-item subtotal, tax, and cost
   * 4. Apply order-level discount
   * 5. Write order + order_items + order_item_modifiers + tax_breakdown
   *
   * All values are snapshotted at creation time.
   */
  async createOrder(
    input: CreateOrderInput,
    tenantId: string,
    userId: string,
    shiftId?: string,
    deviceId?: string,
  ) {
    // 1. Look up all menu items referenced in the order
    const menuItemIds = input.items.map((i) => i.menuItemId);
    const menuItemRows = await this.db
      .select()
      .from(schema.menuItems)
      .where(and(
        eq(schema.menuItems.tenantId, tenantId),
        isNull(schema.menuItems.deletedAt),
      ));
    const menuItemMap = new Map(menuItemRows.filter((m) => menuItemIds.includes(m.id)).map((m) => [m.id, m]));

    // Validate all items exist
    for (const item of input.items) {
      if (!menuItemMap.has(item.menuItemId)) {
        throw new OrderError(`Menu item ${item.menuItemId} not found`, "ITEM_NOT_FOUND");
      }
    }

    // 2. Look up all modifiers referenced
    const allModifierIds = input.items.flatMap((i) => i.modifierIds);
    let modifierMap = new Map<string, { id: string; name: string; priceAdjustment: number; costAdjustment: number }>();
    if (allModifierIds.length > 0) {
      const modifierRows = await this.db
        .select()
        .from(schema.modifiers)
        .where(and(
          eq(schema.modifiers.tenantId, tenantId),
          isNull(schema.modifiers.deletedAt),
        ));
      modifierMap = new Map(
        modifierRows
          .filter((m) => allModifierIds.includes(m.id))
          .map((m) => [m.id, m]),
      );
    }

    // 3. Look up tax rates for each item
    const taxRateIds = [...new Set(menuItemRows.filter((m) => m.taxRateId).map((m) => m.taxRateId!))];
    let taxRateMap = new Map<string, { id: string; name: string; rate: string }>();
    if (taxRateIds.length > 0) {
      const taxRateRows = await this.db
        .select()
        .from(schema.taxRates)
        .where(eq(schema.taxRates.tenantId, tenantId));
      taxRateMap = new Map(taxRateRows.map((t) => [t.id, t]));
    }

    // Also grab the default tax rate for items without one
    const [defaultTaxRate] = await this.db
      .select()
      .from(schema.taxRates)
      .where(and(eq(schema.taxRates.tenantId, tenantId), eq(schema.taxRates.isDefault, true)))
      .limit(1);

    // 4. Look up recipe costs for items that use recipe costing
    const recipeItems = menuItemRows.filter((m) => m.costMethod === "recipe");
    const recipeCostMap = new Map<string, number>();
    if (recipeItems.length > 0) {
      for (const item of recipeItems) {
        const recipe = await this.db
          .select({
            costPerUnit: schema.ingredients.costPerUnit,
            costPrecision: schema.ingredients.costPrecision,
            quantity: schema.recipeIngredients.quantity,
          })
          .from(schema.recipeIngredients)
          .innerJoin(schema.ingredients, eq(schema.recipeIngredients.ingredientId, schema.ingredients.id))
          .where(and(
            eq(schema.recipeIngredients.menuItemId, item.id),
            eq(schema.recipeIngredients.tenantId, tenantId),
          ));

        const totalCost = recipe.reduce((sum, ri) => {
          const qty = parseFloat(ri.quantity);
          return sum + qty * (ri.costPerUnit / Math.pow(10, ri.costPrecision));
        }, 0);
        recipeCostMap.set(item.id, Math.round(totalCost));
      }
    }

    // 5. Generate order number
    const orderNumber = await this.generateOrderNumber(tenantId, input.locationId, deviceId);

    // 6. Build line items with all calculations
    const lineItems: Array<{
      menuItemId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      unitCost: number;
      taxRate: string;
      taxAmount: number;
      subtotal: number;
      total: number;
      notes: string | null;
      modifiers: Array<{
        modifierId: string;
        name: string;
        priceAdjustment: number;
        costAdjustment: number;
      }>;
    }> = [];

    // Track tax breakdown per tax rate
    const taxBreakdown = new Map<string, {
      taxRateId: string;
      taxRateName: string;
      taxRateValue: string;
      taxableAmount: number;
      taxAmount: number;
    }>();

    let orderSubtotal = 0;
    let orderTaxTotal = 0;
    let orderCostTotal = 0;

    for (const inputItem of input.items) {
      const menuItem = menuItemMap.get(inputItem.menuItemId)!;

      // Base price + modifier adjustments
      let itemUnitPrice = menuItem.price;
      let itemUnitCost = recipeCostMap.get(menuItem.id) ?? menuItem.costPrice ?? 0;

      const itemModifiers: typeof lineItems[number]["modifiers"] = [];
      for (const modId of inputItem.modifierIds) {
        const mod = modifierMap.get(modId);
        if (!mod) {
          throw new OrderError(`Modifier ${modId} not found`, "MODIFIER_NOT_FOUND");
        }
        itemUnitPrice += mod.priceAdjustment;
        itemUnitCost += mod.costAdjustment;
        itemModifiers.push({
          modifierId: mod.id,
          name: mod.name,
          priceAdjustment: mod.priceAdjustment,
          costAdjustment: mod.costAdjustment,
        });
      }

      // Tax calculation
      const taxRateRecord = menuItem.taxRateId
        ? taxRateMap.get(menuItem.taxRateId)
        : defaultTaxRate;
      const taxRateValue = taxRateRecord ? taxRateRecord.rate : "0.0000";
      const taxRateDecimal = parseFloat(taxRateValue);

      const itemSubtotal = itemUnitPrice * inputItem.quantity;
      const itemTaxAmount = Math.round(itemSubtotal * taxRateDecimal);
      const itemTotal = itemSubtotal + itemTaxAmount;
      const itemCostTotal = itemUnitCost * inputItem.quantity;

      // Accumulate tax breakdown
      if (taxRateRecord) {
        const existing = taxBreakdown.get(taxRateRecord.id);
        if (existing) {
          existing.taxableAmount += itemSubtotal;
          existing.taxAmount += itemTaxAmount;
        } else {
          taxBreakdown.set(taxRateRecord.id, {
            taxRateId: taxRateRecord.id,
            taxRateName: taxRateRecord.name,
            taxRateValue: taxRateRecord.rate,
            taxableAmount: itemSubtotal,
            taxAmount: itemTaxAmount,
          });
        }
      }

      lineItems.push({
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity: inputItem.quantity,
        unitPrice: itemUnitPrice,
        unitCost: itemUnitCost,
        taxRate: taxRateValue,
        taxAmount: itemTaxAmount,
        subtotal: itemSubtotal,
        total: itemTotal,
        notes: inputItem.notes ?? null,
        modifiers: itemModifiers,
      });

      orderSubtotal += itemSubtotal;
      orderTaxTotal += itemTaxAmount;
      orderCostTotal += itemCostTotal;
    }

    // 7. Apply order-level discount
    let discountTotal = 0;
    if (input.discountType && input.discountValue) {
      if (input.discountType === "percentage") {
        // discountValue is in basis points (100 = 1%)
        discountTotal = Math.round(orderSubtotal * (input.discountValue / 10000));
      } else {
        // Fixed amount in pence
        discountTotal = Math.min(input.discountValue, orderSubtotal);
      }
    }

    const orderTotal = orderSubtotal + orderTaxTotal - discountTotal;

    // 8. Write everything to the database
    const [order] = await this.db
      .insert(schema.orders)
      .values({
        tenantId,
        locationId: input.locationId,
        deviceId: deviceId ?? null,
        shiftId: shiftId ?? null,
        userId,
        orderNumber,
        status: "open",
        orderType: "sale",
        subtotal: orderSubtotal,
        taxTotal: orderTaxTotal,
        discountTotal,
        total: orderTotal,
        costTotal: orderCostTotal,
        discountType: input.discountType ?? null,
        discountValue: input.discountValue ?? null,
        discountReason: input.discountReason ?? null,
        notes: input.notes ?? null,
        customerName: input.customerName ?? null,
      })
      .returning();

    if (!order) throw new Error("Failed to create order");

    // Insert line items
    const orderItemRows = await this.db
      .insert(schema.orderItems)
      .values(
        lineItems.map((li) => ({
          tenantId,
          orderId: order.id,
          menuItemId: li.menuItemId,
          name: li.name,
          quantity: li.quantity,
          unitPrice: li.unitPrice,
          unitCost: li.unitCost,
          taxRate: li.taxRate,
          taxAmount: li.taxAmount,
          subtotal: li.subtotal,
          total: li.total,
          notes: li.notes,
        })),
      )
      .returning();

    // Insert modifiers for each order item
    const modifierInserts = lineItems.flatMap((li, idx) => {
      const orderItem = orderItemRows[idx]!;
      return li.modifiers.map((mod) => ({
        tenantId,
        orderItemId: orderItem.id,
        modifierId: mod.modifierId,
        name: mod.name,
        priceAdjustment: mod.priceAdjustment,
        costAdjustment: mod.costAdjustment,
      }));
    });
    if (modifierInserts.length > 0) {
      await this.db.insert(schema.orderItemModifiers).values(modifierInserts);
    }

    // Insert tax breakdown
    const taxBreakdownRows = [...taxBreakdown.values()];
    if (taxBreakdownRows.length > 0) {
      await this.db.insert(schema.orderTaxBreakdown).values(
        taxBreakdownRows.map((tb) => ({
          tenantId,
          orderId: order.id,
          taxRateId: tb.taxRateId,
          taxRateName: tb.taxRateName,
          taxRateValue: tb.taxRateValue,
          taxableAmount: tb.taxableAmount,
          taxAmount: tb.taxAmount,
        })),
      );
    }

    return this.getOrderWithDetails(order.id, tenantId);
  }

  /** Get a single order with all line items, modifiers, and payments. */
  async getOrderWithDetails(orderId: string, tenantId: string) {
    const [order] = await this.db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)))
      .limit(1);

    if (!order) return null;

    const items = await this.db
      .select()
      .from(schema.orderItems)
      .where(eq(schema.orderItems.orderId, orderId));

    // Get modifiers for each item
    const itemIds = items.map((i) => i.id);
    const allModifiers = itemIds.length > 0
      ? await this.db
          .select()
          .from(schema.orderItemModifiers)
          .where(eq(schema.orderItemModifiers.tenantId, tenantId))
      : [];
    const modifiersByItem = new Map<string, typeof allModifiers>();
    for (const mod of allModifiers.filter((m) => itemIds.includes(m.orderItemId))) {
      const existing = modifiersByItem.get(mod.orderItemId) ?? [];
      existing.push(mod);
      modifiersByItem.set(mod.orderItemId, existing);
    }

    const payments = await this.db
      .select()
      .from(schema.payments)
      .where(eq(schema.payments.orderId, orderId));

    const taxBreakdown = await this.db
      .select()
      .from(schema.orderTaxBreakdown)
      .where(eq(schema.orderTaxBreakdown.orderId, orderId));

    const totalPaid = payments
      .filter((p) => p.status === "completed")
      .reduce((sum, p) => sum + p.amount, 0);

    return {
      ...order,
      items: items.map((item) => ({
        ...item,
        modifiers: modifiersByItem.get(item.id) ?? [],
      })),
      payments,
      taxBreakdown,
      totalPaid,
      balanceDue: order.total - totalPaid,
      marginPercent:
        order.costTotal > 0 && order.subtotal > 0
          ? Math.round(((order.subtotal - order.costTotal) / order.subtotal) * 10000) / 100
          : null,
    };
  }

  /** List orders for a tenant, with optional filters. */
  async listOrders(
    tenantId: string,
    filters: {
      locationId?: string;
      shiftId?: string;
      status?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const conditions = [eq(schema.orders.tenantId, tenantId)];
    if (filters.locationId) conditions.push(eq(schema.orders.locationId, filters.locationId));
    if (filters.shiftId) conditions.push(eq(schema.orders.shiftId, filters.shiftId));
    if (filters.status) conditions.push(eq(schema.orders.status, filters.status));

    const orders = await this.db
      .select()
      .from(schema.orders)
      .where(and(...conditions))
      .orderBy(desc(schema.orders.createdAt))
      .limit(filters.limit ?? 50)
      .offset(filters.offset ?? 0);

    // Get total count for pagination
    const [countResult] = await this.db
      .select({ total: count() })
      .from(schema.orders)
      .where(and(...conditions));

    return {
      orders,
      total: countResult?.total ?? 0,
    };
  }

  /** Process a payment against an order. */
  async processPayment(input: ProcessPaymentInput, tenantId: string) {
    // Verify order exists and is open
    const [order] = await this.db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.id, input.orderId), eq(schema.orders.tenantId, tenantId)))
      .limit(1);

    if (!order) throw new OrderError("Order not found", "ORDER_NOT_FOUND");
    if (order.status !== "open") throw new OrderError("Order is not open", "ORDER_NOT_OPEN");

    // Calculate change for cash payments
    let changeGiven: number | null = null;
    if (input.paymentMethod === "cash" && input.cashGiven) {
      changeGiven = input.cashGiven - input.amount;
      if (changeGiven < 0) {
        throw new OrderError("Cash given is less than payment amount", "INSUFFICIENT_CASH");
      }
    }

    // Insert payment record
    const [payment] = await this.db
      .insert(schema.payments)
      .values({
        tenantId,
        orderId: input.orderId,
        paymentMethod: input.paymentMethod,
        amount: input.amount,
        tipAmount: input.tipAmount,
        status: input.paymentMethod === "cash" ? "completed" : "pending",
        cashGiven: input.cashGiven ?? null,
        changeGiven,
        processedAt: input.paymentMethod === "cash" ? new Date() : null,
      })
      .returning();

    // Check if order is fully paid
    const existingPayments = await this.db
      .select()
      .from(schema.payments)
      .where(and(eq(schema.payments.orderId, input.orderId), eq(schema.payments.status, "completed")));

    const totalPaid = existingPayments.reduce((sum, p) => sum + p.amount, 0);

    // Auto-complete the order when fully paid
    if (totalPaid >= order.total) {
      await this.db
        .update(schema.orders)
        .set({
          status: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(schema.orders.id, order.id));
    }

    return {
      payment,
      totalPaid,
      balanceDue: order.total - totalPaid,
      orderCompleted: totalPaid >= order.total,
    };
  }

  /** Void an open order. */
  async voidOrder(orderId: string, tenantId: string, userId: string, reason: string) {
    const [order] = await this.db
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.id, orderId), eq(schema.orders.tenantId, tenantId)))
      .limit(1);

    if (!order) throw new OrderError("Order not found", "ORDER_NOT_FOUND");
    if (order.status === "voided") throw new OrderError("Order already voided", "ALREADY_VOIDED");
    if (order.status === "completed") {
      // Check if any card payments — those need Stripe refund, can't just void
      const cardPayments = await this.db
        .select()
        .from(schema.payments)
        .where(and(
          eq(schema.payments.orderId, orderId),
          eq(schema.payments.paymentMethod, "card"),
          eq(schema.payments.status, "completed"),
        ));
      if (cardPayments.length > 0) {
        throw new OrderError(
          "Cannot void an order with completed card payments. Use refund instead.",
          "HAS_CARD_PAYMENTS",
        );
      }
    }

    const [voided] = await this.db
      .update(schema.orders)
      .set({
        status: "voided",
        voidedAt: new Date(),
        voidedBy: userId,
        voidReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(schema.orders.id, orderId))
      .returning();

    return voided;
  }

  /** Generate a sequential order number per location per day. */
  private async generateOrderNumber(
    tenantId: string,
    locationId: string,
    _deviceId?: string,
  ): Promise<string> {
    const today = new Date();
    const datePrefix = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

    // Count today's orders for this location
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const [result] = await this.db
      .select({ total: count() })
      .from(schema.orders)
      .where(and(
        eq(schema.orders.tenantId, tenantId),
        eq(schema.orders.locationId, locationId),
        sql`${schema.orders.createdAt} >= ${startOfDay.toISOString()}`,
      ));

    const seq = (result?.total ?? 0) + 1;
    return `${datePrefix}-${String(seq).padStart(4, "0")}`;
  }
}

export class OrderError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "OrderError";
  }
}
