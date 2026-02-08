import { z } from "zod";
import { nameSchema, penceSchema, uuidSchema, hexColorSchema } from "./common.js";

export const createCategorySchema = z.object({
  name: nameSchema,
  displayOrder: z.number().int().min(0).default(0),
  color: hexColorSchema.optional(),
});

export const updateCategorySchema = z.object({
  name: nameSchema.optional(),
  displayOrder: z.number().int().min(0).optional(),
  color: hexColorSchema.nullable().optional(),
  isActive: z.boolean().optional(),
});

export const createMenuItemSchema = z.object({
  categoryId: uuidSchema.optional(),
  name: nameSchema,
  description: z.string().max(1000).optional(),
  price: penceSchema.min(1, "Price must be at least 1p"),
  costPrice: penceSchema.optional(),
  taxRateId: uuidSchema.optional(),
  displayOrder: z.number().int().min(0).default(0),
  trackStock: z.boolean().default(false),
});

export const updateMenuItemSchema = z.object({
  categoryId: uuidSchema.nullable().optional(),
  name: nameSchema.optional(),
  description: z.string().max(1000).nullable().optional(),
  price: penceSchema.min(1).optional(),
  costPrice: penceSchema.nullable().optional(),
  taxRateId: uuidSchema.nullable().optional(),
  displayOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  trackStock: z.boolean().optional(),
});

export const createIngredientSchema = z.object({
  name: nameSchema,
  unit: z.enum(["g", "kg", "ml", "l", "unit", "slice", "tsp", "tbsp"]),
  costPerUnit: z.number().int().min(0),
  costPrecision: z.number().int().min(0).max(6).default(2),
  category: z.string().max(100).optional(),
  allergens: z.array(z.string().max(50)).default([]),
});

export const updateIngredientSchema = z.object({
  name: nameSchema.optional(),
  unit: z.enum(["g", "kg", "ml", "l", "unit", "slice", "tsp", "tbsp"]).optional(),
  costPerUnit: z.number().int().min(0).optional(),
  costPrecision: z.number().int().min(0).max(6).optional(),
  category: z.string().max(100).nullable().optional(),
  allergens: z.array(z.string().max(50)).optional(),
  isActive: z.boolean().optional(),
});

export const recipeIngredientSchema = z.object({
  ingredientId: uuidSchema,
  quantity: z.number().positive("Quantity must be positive"),
  notes: z.string().max(255).optional(),
});

export const setRecipeSchema = z.object({
  ingredients: z.array(recipeIngredientSchema).min(1, "Recipe must have at least one ingredient"),
});

export const createModifierGroupSchema = z.object({
  name: nameSchema,
  selectionType: z.enum(["single", "multiple"]).default("single"),
  minSelections: z.number().int().min(0).default(0),
  maxSelections: z.number().int().min(1).nullable().default(null),
  isRequired: z.boolean().default(false),
});

export const createModifierSchema = z.object({
  name: nameSchema,
  priceAdjustment: z.number().int().default(0),
  costAdjustment: z.number().int().default(0),
  displayOrder: z.number().int().min(0).default(0),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateMenuItemInput = z.infer<typeof createMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof updateMenuItemSchema>;
export type CreateIngredientInput = z.infer<typeof createIngredientSchema>;
export type UpdateIngredientInput = z.infer<typeof updateIngredientSchema>;
export type SetRecipeInput = z.infer<typeof setRecipeSchema>;
