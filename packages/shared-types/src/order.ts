import type {
  UUID,
  Pence,
  ISODateString,
  HLCTimestamp,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  DiscountType,
} from "./common.js";

export interface Order {
  id: UUID;
  tenantId: UUID;
  locationId: UUID;
  deviceId: UUID | null;
  shiftId: UUID | null;
  userId: UUID;
  orderNumber: string;
  status: OrderStatus;
  orderType: "sale" | "refund";
  subtotal: Pence;
  taxTotal: Pence;
  discountTotal: Pence;
  total: Pence;
  costTotal: Pence;
  discountType: DiscountType | null;
  discountValue: number | null;
  discountReason: string | null;
  notes: string | null;
  customerName: string | null;
  completedAt: ISODateString | null;
  voidedAt: ISODateString | null;
  voidedBy: UUID | null;
  voidReason: string | null;
  createdOffline: boolean;
  syncedAt: ISODateString | null;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  hlcTimestamp: HLCTimestamp;
}

export interface OrderItem {
  id: UUID;
  tenantId: UUID;
  orderId: UUID;
  menuItemId: UUID;
  name: string;
  quantity: number;
  unitPrice: Pence;
  unitCost: Pence;
  taxRate: number;
  taxAmount: Pence;
  subtotal: Pence;
  total: Pence;
  notes: string | null;
  modifiers: OrderItemModifier[];
}

export interface OrderItemModifier {
  id: UUID;
  orderItemId: UUID;
  modifierId: UUID;
  name: string;
  priceAdjustment: Pence;
  costAdjustment: Pence;
}

export interface Payment {
  id: UUID;
  tenantId: UUID;
  orderId: UUID;
  paymentMethod: PaymentMethod;
  amount: Pence;
  tipAmount: Pence;
  status: PaymentStatus;
  stripePaymentIntentId: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  cashGiven: Pence | null;
  changeGiven: Pence | null;
  processedAt: ISODateString | null;
  createdAt: ISODateString;
}

export interface OrderWithDetails extends Order {
  items: OrderItem[];
  payments: Payment[];
}

export interface CreateOrderInput {
  locationId: UUID;
  items: CreateOrderItemInput[];
  discountType?: DiscountType;
  discountValue?: number;
  discountReason?: string;
  notes?: string;
  customerName?: string;
}

export interface CreateOrderItemInput {
  menuItemId: UUID;
  quantity: number;
  notes?: string;
  modifierIds?: UUID[];
}

export interface ProcessPaymentInput {
  orderId: UUID;
  paymentMethod: PaymentMethod;
  amount: Pence;
  tipAmount?: Pence;
  cashGiven?: Pence;
}
