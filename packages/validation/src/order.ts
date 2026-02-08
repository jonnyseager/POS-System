import { z } from "zod";
import { uuidSchema, penceSchema } from "./common.js";

export const createOrderItemSchema = z.object({
  menuItemId: uuidSchema,
  quantity: z.number().int().min(1).max(999),
  notes: z.string().max(500).optional(),
  modifierIds: z.array(uuidSchema).default([]),
});

export const createOrderSchema = z.object({
  locationId: uuidSchema,
  items: z.array(createOrderItemSchema).min(1, "Order must have at least one item"),
  discountType: z.enum(["percentage", "fixed"]).optional(),
  discountValue: z.number().min(0).optional(),
  discountReason: z.string().max(255).optional(),
  notes: z.string().max(500).optional(),
  customerName: z.string().max(255).optional(),
});

export const processPaymentSchema = z.object({
  orderId: uuidSchema,
  paymentMethod: z.enum(["card", "cash", "other"]),
  amount: penceSchema.min(1),
  tipAmount: penceSchema.default(0),
  cashGiven: penceSchema.optional(),
});

export const voidOrderSchema = z.object({
  reason: z.string().min(1).max(500),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ProcessPaymentInput = z.infer<typeof processPaymentSchema>;
export type VoidOrderInput = z.infer<typeof voidOrderSchema>;
