import * as SecureStore from "expo-secure-store";

const API_URL = "http://localhost:3001";

let cachedToken: string | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  cachedToken = await SecureStore.getItemAsync("accessToken");
  return cachedToken;
}

export async function setToken(token: string): Promise<void> {
  cachedToken = token;
  await SecureStore.setItemAsync("accessToken", token);
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  await SecureStore.deleteItemAsync("accessToken");
}

export async function getRefreshToken(): Promise<string | null> {
  return SecureStore.getItemAsync("refreshToken");
}

export async function setRefreshToken(token: string): Promise<void> {
  await SecureStore.setItemAsync("refreshToken", token);
}

export async function clearRefreshToken(): Promise<void> {
  await SecureStore.deleteItemAsync("refreshToken");
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

interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: { code: string; message: string };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<T> {
  const token = await getToken();
  const reqHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...headers,
  };
  if (token) {
    reqHeaders["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: reqHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });

  const json = (await res.json()) as ApiResponse<T>;

  if (!res.ok || !json.success) {
    throw new ApiError(
      res.status,
      json.error?.code ?? "UNKNOWN",
      json.error?.message ?? "Request failed",
    );
  }

  return json.data;
}

// Auth
export interface AuthResponse {
  user: { id: string; email: string; firstName: string; lastName: string };
  tenant: { id: string; name: string };
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
}

export interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export function login(email: string, password: string) {
  return request<AuthResponse>("POST", "/api/v1/auth/login", {
    email,
    password,
  });
}

export function register(data: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  businessName: string;
}) {
  return request<AuthResponse>("POST", "/api/v1/auth/register", data);
}

export function refreshAccessToken(refreshToken: string) {
  return request<RefreshResponse>("POST", "/api/v1/auth/refresh", {
    refreshToken,
  });
}

// Device registration
export interface DeviceRegistration {
  id: string;
  deviceName: string;
  deviceToken: string;
  tables: string[];
}

export function registerDevice(data: {
  deviceName: string;
  deviceType: string;
  platform: string;
  locationId?: string;
  appVersion?: string;
}) {
  return request<DeviceRegistration>(
    "POST",
    "/api/v1/sync/register-device",
    data,
  );
}

// Sync
export interface SyncPushResponse {
  batchId: string;
  accepted: number;
  conflicts: number;
  serverHlc: string;
  conflictDetails: Array<{
    table: string;
    recordId: string;
    error: string;
  }>;
}

export interface SyncPullChange {
  table: string;
  recordId: string;
  operation: string;
  data: Record<string, unknown>;
  hlc: string;
  columnHlcs?: Record<string, string>;
}

export interface SyncPullResponse {
  changes: SyncPullChange[];
  serverHlc: string;
  hasMore: boolean;
  count: number;
}

export function pushSync(
  deviceId: string,
  data: {
    batchId: string;
    deviceHlc: string;
    changes: Array<{
      table: string;
      recordId: string;
      operation: string;
      data: Record<string, unknown>;
      hlc: string;
      columnHlcs?: Record<string, string>;
    }>;
  },
) {
  return request<SyncPushResponse>("POST", "/api/v1/sync/push", data, {
    "X-Device-Id": deviceId,
  });
}

export function pullSync(
  deviceId: string,
  sinceHlc: string,
  tables?: string,
  limit?: number,
) {
  const params = new URLSearchParams({ sinceHlc });
  if (tables) params.set("tables", tables);
  if (limit) params.set("limit", String(limit));
  return request<SyncPullResponse>(
    "GET",
    `/api/v1/sync/pull?${params.toString()}`,
    undefined,
    { "X-Device-Id": deviceId },
  );
}

// Orders
export interface OrderResponse {
  id: string;
  orderNumber: number;
  status: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  total: number;
  costTotal: number;
  customerName: string | null;
  notes: string | null;
  createdAt: string;
  completedAt: string | null;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    taxAmount: number;
    total: number;
    notes: string | null;
    modifiers: Array<{ name: string; priceAdjustment: number }>;
  }>;
  payments: Array<{
    id: string;
    paymentMethod: string;
    amount: number;
    tipAmount: number;
    status: string;
    cardBrand: string | null;
    cardLast4: string | null;
    cashGiven: number | null;
    changeGiven: number | null;
  }>;
  totalPaid: number;
  balanceDue: number;
}

export function createOrder(
  data: {
    locationId: string;
    items: Array<{
      menuItemId: string;
      quantity: number;
      notes?: string;
      modifierIds?: string[];
    }>;
    discountType?: string;
    discountValue?: number;
    discountReason?: string;
    notes?: string;
    customerName?: string;
  },
  shiftId: string,
  deviceId: string,
) {
  return request<OrderResponse>("POST", "/api/v1/orders", data, {
    "X-Shift-Id": shiftId,
    "X-Device-Id": deviceId,
  });
}

export function getOrders(params?: {
  shiftId?: string;
  status?: string;
  limit?: number;
  offset?: number;
}) {
  const search = new URLSearchParams();
  if (params?.shiftId) search.set("shiftId", params.shiftId);
  if (params?.status) search.set("status", params.status);
  if (params?.limit) search.set("limit", String(params.limit));
  if (params?.offset) search.set("offset", String(params.offset));
  const qs = search.toString();
  return request<{ orders: OrderResponse[]; total: number }>(
    "GET",
    `/api/v1/orders${qs ? `?${qs}` : ""}`,
  );
}

export function getOrder(id: string) {
  return request<OrderResponse>("GET", `/api/v1/orders/${id}`);
}

export function processPayment(data: {
  orderId: string;
  paymentMethod: string;
  amount: number;
  tipAmount?: number;
  cashGiven?: number;
}) {
  return request<{
    payment: { id: string; status: string };
    totalPaid: number;
    balanceDue: number;
    orderCompleted: boolean;
  }>("POST", `/api/v1/orders/${data.orderId}/pay`, data);
}

export function voidOrder(id: string, reason: string) {
  return request<OrderResponse>("POST", `/api/v1/orders/${id}/void`, {
    reason,
  });
}

// Shifts
export interface ShiftResponse {
  id: string;
  locationId: string;
  openedBy: string;
  openedAt: string;
  closedAt: string | null;
  openingCash: number;
  closingCash: number | null;
  expectedCash: number | null;
  status: string;
  notes: string | null;
}

export function openShift(data: { locationId: string; openingCash?: number }) {
  return request<ShiftResponse>("POST", "/api/v1/shifts", data);
}

export function getShifts(params?: { locationId?: string; status?: string }) {
  const search = new URLSearchParams();
  if (params?.locationId) search.set("locationId", params.locationId);
  if (params?.status) search.set("status", params.status);
  const qs = search.toString();
  return request<ShiftResponse[]>(
    "GET",
    `/api/v1/shifts${qs ? `?${qs}` : ""}`,
  );
}

export function getShiftDetail(id: string) {
  return request<{
    shift: ShiftResponse;
    summary: {
      totalOrders: number;
      totalRevenue: number;
      totalCost: number;
      grossProfit: number;
      marginPercent: number;
      averageOrderValue: number;
      paymentBreakdown: Record<string, { count: number; total: number }>;
      voidedOrders: number;
    };
  }>("GET", `/api/v1/shifts/${id}`);
}

export function closeShift(
  id: string,
  data: { closingCash: number; notes?: string },
) {
  return request<{
    shift: ShiftResponse;
    expectedCash: number;
    cashVariance: number;
    cashVariancePercent: number;
  }>("POST", `/api/v1/shifts/${id}/close`, data);
}

// Card payments
export function createPaymentIntent(data: {
  orderId: string;
  amount: number;
  tipAmount?: number;
}) {
  return request<{
    paymentId: string;
    paymentIntentId: string;
    clientSecret: string;
    amount: number;
    applicationFee: number;
  }>("POST", "/api/v1/payments/card/create-intent", data);
}

export function getConnectionToken() {
  return request<{ secret: string }>(
    "POST",
    "/api/v1/payments/terminal/connection-token",
  );
}

// Dashboard / Reports
export function getDashboard(locationId?: string) {
  const qs = locationId ? `?locationId=${locationId}` : "";
  return request<{
    todayRevenue: number;
    todayOrders: number;
    averageOrderValue: number;
    todayCost: number;
    grossProfit: number;
    marginPercent: number;
    todayTax: number;
    topItems: Array<{
      name: string;
      quantity: number;
      revenue: number;
      marginPercent: number;
    }>;
    paymentMethods: Record<string, { count: number; total: number }>;
  }>("GET", `/api/v1/reports/dashboard${qs}`);
}

// Categories & Menu Items (for initial sync / online mode)
export function getCategories() {
  return request<
    Array<{
      id: string;
      name: string;
      displayOrder: number;
      color: string | null;
      isActive: boolean;
    }>
  >("GET", "/api/v1/categories");
}

export function getMenuItems(categoryId?: string) {
  const qs = categoryId ? `?categoryId=${categoryId}` : "";
  return request<
    Array<{
      id: string;
      categoryId: string | null;
      name: string;
      description: string | null;
      price: number;
      costPrice: number;
      taxRateId: string | null;
      displayOrder: number;
      isActive: boolean;
      allowModifiers: boolean;
    }>
  >("GET", `/api/v1/menu-items${qs}`);
}

export function getTaxRates() {
  return request<
    Array<{
      id: string;
      name: string;
      rate: string;
      isDefault: boolean;
      isActive: boolean;
    }>
  >("GET", "/api/v1/tax-rates");
}
