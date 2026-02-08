import type {
  UUID,
  Pence,
  ISODateString,
  HLCTimestamp,
  CostMethod,
  ModifierSelectionType,
} from "./common.js";

export interface Category {
  id: UUID;
  tenantId: UUID;
  name: string;
  displayOrder: number;
  color: string | null;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  hlcTimestamp: HLCTimestamp;
}

export interface CreateCategoryInput {
  name: string;
  displayOrder?: number;
  color?: string;
}

export interface UpdateCategoryInput {
  name?: string;
  displayOrder?: number;
  color?: string;
  isActive?: boolean;
}

export interface MenuItem {
  id: UUID;
  tenantId: UUID;
  categoryId: UUID | null;
  name: string;
  description: string | null;
  sku: string | null;
  price: Pence;
  costPrice: Pence | null;
  costMethod: CostMethod;
  taxRateId: UUID | null;
  imageUrl: string | null;
  barcode: string | null;
  displayOrder: number;
  isActive: boolean;
  trackStock: boolean;
  allowModifiers: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  hlcTimestamp: HLCTimestamp;
}

export interface CreateMenuItemInput {
  categoryId?: UUID;
  name: string;
  description?: string;
  price: Pence;
  costPrice?: Pence;
  taxRateId?: UUID;
  displayOrder?: number;
  trackStock?: boolean;
}

export interface UpdateMenuItemInput {
  categoryId?: UUID | null;
  name?: string;
  description?: string | null;
  price?: Pence;
  costPrice?: Pence;
  taxRateId?: UUID | null;
  displayOrder?: number;
  isActive?: boolean;
  trackStock?: boolean;
}

export interface MenuItemWithDetails extends MenuItem {
  category: Category | null;
  modifierGroups: ModifierGroupWithModifiers[];
  recipeIngredients: RecipeIngredient[];
  calculatedCost: Pence | null;
  marginPercent: number | null;
}

export interface ModifierGroup {
  id: UUID;
  tenantId: UUID;
  name: string;
  selectionType: ModifierSelectionType;
  minSelections: number;
  maxSelections: number | null;
  isRequired: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface Modifier {
  id: UUID;
  tenantId: UUID;
  modifierGroupId: UUID;
  name: string;
  priceAdjustment: Pence;
  costAdjustment: Pence;
  displayOrder: number;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface ModifierGroupWithModifiers extends ModifierGroup {
  modifiers: Modifier[];
}

export interface Ingredient {
  id: UUID;
  tenantId: UUID;
  name: string;
  unit: string;
  costPerUnit: number;
  costPrecision: number;
  category: string | null;
  allergens: string[];
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface RecipeIngredient {
  id: UUID;
  menuItemId: UUID;
  ingredientId: UUID;
  ingredient: Ingredient;
  quantity: number;
  notes: string | null;
}

export interface TaxRate {
  id: UUID;
  tenantId: UUID;
  name: string;
  rate: number;
  isDefault: boolean;
  isActive: boolean;
}
