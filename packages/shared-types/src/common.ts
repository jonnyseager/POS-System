/** All monetary values are stored as integers in pence (GBP smallest unit) */
export type Pence = number;

/** UUID string type for entity IDs */
export type UUID = string;

/** HLC timestamp as 64-bit integer (stored as bigint) */
export type HLCTimestamp = bigint;

/** ISO 8601 date string */
export type ISODateString = string;

/** Standard API response envelope */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/** Common entity fields present on all synced records */
export interface SyncableEntity {
  id: UUID;
  tenantId: UUID;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  deletedAt: ISODateString | null;
  hlcTimestamp: HLCTimestamp;
}

/** User roles within a tenant */
export type TenantRole = "owner" | "manager" | "staff";

/** Subscription tiers */
export type SubscriptionTier = "free" | "starter" | "pro" | "enterprise";

/** Order statuses */
export type OrderStatus = "open" | "completed" | "voided" | "refunded";

/** Payment methods */
export type PaymentMethod = "card" | "cash" | "other";

/** Payment statuses */
export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

/** Stock movement types */
export type StockMovementType =
  | "received"
  | "sold"
  | "wasted"
  | "adjusted"
  | "transferred";

/** Location types */
export type LocationType = "fixed" | "mobile" | "event";

/** Waste reasons */
export type WasteReason =
  | "expired"
  | "dropped"
  | "overcooked"
  | "quality"
  | "other";

/** Modifier selection types */
export type ModifierSelectionType = "single" | "multiple";

/** Cost calculation method */
export type CostMethod = "manual" | "recipe";

/** Discount types */
export type DiscountType = "percentage" | "fixed";
