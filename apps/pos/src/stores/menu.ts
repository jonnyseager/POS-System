import { create } from "zustand";
import {
  getCategories,
  getMenuItems,
  getTaxRates,
  type LocalCategory,
  type LocalMenuItem,
  type LocalTaxRate,
} from "../db/queries";

interface MenuState {
  categories: LocalCategory[];
  menuItems: LocalMenuItem[];
  taxRates: LocalTaxRate[];
  selectedCategoryId: string | null;
  isLoading: boolean;

  loadFromDatabase: () => void;
  selectCategory: (id: string | null) => void;
  getFilteredItems: () => LocalMenuItem[];
  getDefaultTaxRate: () => LocalTaxRate | null;
  getTaxRateForItem: (taxRateId: string | null) => LocalTaxRate | null;
}

export const useMenuStore = create<MenuState>((set, get) => ({
  categories: [],
  menuItems: [],
  taxRates: [],
  selectedCategoryId: null,
  isLoading: false,

  loadFromDatabase: () => {
    set({ isLoading: true });
    const categories = getCategories();
    const menuItems = getMenuItems();
    const taxRates = getTaxRates();
    set({ categories, menuItems, taxRates, isLoading: false });
  },

  selectCategory: (id) => set({ selectedCategoryId: id }),

  getFilteredItems: () => {
    const state = get();
    if (!state.selectedCategoryId) return state.menuItems;
    return state.menuItems.filter(
      (i) => i.category_id === state.selectedCategoryId,
    );
  },

  getDefaultTaxRate: () => {
    return get().taxRates.find((r) => r.is_default) ?? null;
  },

  getTaxRateForItem: (taxRateId) => {
    if (!taxRateId) return get().getDefaultTaxRate();
    return get().taxRates.find((r) => r.id === taxRateId) ?? null;
  },
}));
