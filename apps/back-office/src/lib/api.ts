const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

let authToken: string | null = null;

export function setToken(token: string | null) {
  authToken = token;
  if (typeof window !== "undefined") {
    if (token) {
      localStorage.setItem("auth_token", token);
    } else {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
    }
  }
}

export function getToken(): string | null {
  if (authToken) return authToken;
  if (typeof window !== "undefined") {
    authToken = localStorage.getItem("auth_token");
  }
  return authToken;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers as Record<string, string>) },
  });

  const body = await res.json();

  if (!res.ok || body.success === false) {
    throw new ApiError(
      res.status,
      body.error?.code || "UNKNOWN",
      body.error?.message || "An error occurred",
    );
  }

  return body.data as T;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  token: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string };
}

export async function login(email: string, password: string) {
  return request<AuthResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(data: {
  businessName: string;
  email: string;
  password: string;
  fullName: string;
}) {
  return request<AuthResponse>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardData {
  period: string;
  date: string;
  totalOrders: number;
  totalRevenue: number;
  totalCost: number;
  grossProfit: number;
  marginPercent: number;
  totalTax: number;
  totalDiscount: number;
  averageOrderValue: number;
  topItems: Array<{
    name: string;
    quantitySold: number;
    revenue: number;
    cost: number;
    marginPercent: number;
  }>;
  paymentMethods: Array<{
    method: string;
    total: number;
    count: number;
  }>;
}

export async function getDashboard(locationId?: string) {
  const qs = locationId ? `?locationId=${locationId}` : "";
  return request<DashboardData>(`/api/v1/reports/dashboard${qs}`);
}

// ── Menu Items ───────────────────────────────────────────────────────────────

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  costPrice: number | null;
  costMethod: string;
  categoryId: string | null;
  taxRateId: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
}

export async function getMenuItems(categoryId?: string) {
  const qs = categoryId ? `?categoryId=${categoryId}` : "";
  return request<MenuItem[]>(`/api/v1/menu-items${qs}`);
}

export async function createMenuItem(data: {
  name: string;
  price: number;
  costPrice?: number;
  categoryId?: string;
  description?: string;
  isActive?: boolean;
}) {
  return request<MenuItem>("/api/v1/menu-items", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateMenuItem(
  id: string,
  data: Partial<{
    name: string;
    price: number;
    costPrice: number;
    categoryId: string;
    description: string;
    isActive: boolean;
    displayOrder: number;
  }>,
) {
  return request<MenuItem>(`/api/v1/menu-items/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteMenuItem(id: string) {
  return request<{ deleted: boolean }>(`/api/v1/menu-items/${id}`, {
    method: "DELETE",
  });
}

// ── Categories ───────────────────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  displayOrder: number;
  color: string | null;
  isActive: boolean;
  createdAt: string;
}

export async function getCategories() {
  return request<Category[]>("/api/v1/categories");
}

export async function createCategory(data: {
  name: string;
  color?: string;
  displayOrder?: number;
}) {
  return request<Category>("/api/v1/categories", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateCategory(
  id: string,
  data: Partial<{ name: string; color: string; displayOrder: number; isActive: boolean }>,
) {
  return request<Category>(`/api/v1/categories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteCategory(id: string) {
  return request<{ deleted: boolean }>(`/api/v1/categories/${id}`, {
    method: "DELETE",
  });
}

// ── Orders ───────────────────────────────────────────────────────────────────

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  costTotal: number;
  customerName: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface OrderDetail extends Order {
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    unitCost: number;
    subtotal: number;
    total: number;
    modifiers: Array<{ name: string; priceAdjustment: number }>;
  }>;
  payments: Array<{
    paymentMethod: string;
    amount: number;
    status: string;
    cardBrand?: string;
    cardLast4?: string;
  }>;
  totalPaid: number;
  balanceDue: number;
  marginPercent: number | null;
}

export async function getOrders(params?: {
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const search = new URLSearchParams();
  if (params?.status) search.set("status", params.status);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.offset) search.set("offset", String(params.offset));
  const qs = search.toString();
  return request<{ orders: Order[]; total: number }>(
    `/api/v1/orders${qs ? `?${qs}` : ""}`,
  );
}

export async function getOrder(id: string) {
  return request<OrderDetail>(`/api/v1/orders/${id}`);
}

// ── Reports ──────────────────────────────────────────────────────────────────

export interface SalesReport {
  from: string;
  to: string;
  totals: {
    totalOrders: number;
    totalRevenue: number;
    totalCost: number;
    grossProfit: number;
    marginPercent: number;
    totalTax: number;
    totalDiscount: number;
  };
  daily: Array<{
    date: string;
    totalOrders: number;
    totalRevenue: number;
    totalCost: number;
    grossProfit: number;
    marginPercent: number;
  }>;
}

export interface ItemsReport {
  from: string;
  to: string;
  items: Array<{
    menuItemId: string;
    name: string;
    quantitySold: number;
    revenue: number;
    cost: number;
    grossProfit: number;
    marginPercent: number;
  }>;
}

export interface VatReport {
  from: string;
  to: string;
  totalTaxableAmount: number;
  totalTaxAmount: number;
  breakdown: Array<{
    rateName: string;
    rateValue: number;
    taxableAmount: number;
    taxAmount: number;
    orderCount: number;
  }>;
}

export async function getSalesReport(from: string, to: string) {
  return request<SalesReport>(`/api/v1/reports/sales?from=${from}&to=${to}`);
}

export async function getItemsReport(from: string, to: string) {
  return request<ItemsReport>(`/api/v1/reports/items?from=${from}&to=${to}`);
}

export async function getVatReport(from: string, to: string) {
  return request<VatReport>(`/api/v1/reports/vat?from=${from}&to=${to}`);
}
