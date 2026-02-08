import type {
  UUID,
  Pence,
  ISODateString,
  HLCTimestamp,
  StockMovementType,
  WasteReason,
} from "./common.js";

export interface StockLevel {
  id: UUID;
  tenantId: UUID;
  locationId: UUID;
  ingredientId: UUID;
  currentQuantity: number;
  minQuantity: number | null;
  maxQuantity: number | null;
  updatedAt: ISODateString;
  hlcTimestamp: HLCTimestamp;
}

export interface StockMovement {
  id: UUID;
  tenantId: UUID;
  locationId: UUID;
  ingredientId: UUID;
  movementType: StockMovementType;
  quantity: number;
  unitCost: Pence | null;
  referenceType: string | null;
  referenceId: UUID | null;
  notes: string | null;
  performedBy: UUID | null;
  performedAt: ISODateString;
  hlcTimestamp: HLCTimestamp;
}

export interface WasteRecord {
  id: UUID;
  tenantId: UUID;
  locationId: UUID;
  ingredientId: UUID;
  quantity: number;
  reason: WasteReason;
  cost: Pence;
  recordedBy: UUID;
  recordedAt: ISODateString;
  notes: string | null;
  hlcTimestamp: HLCTimestamp;
}

export interface Supplier {
  id: UUID;
  tenantId: UUID;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  isActive: boolean;
}

export interface Location {
  id: UUID;
  tenantId: UUID;
  name: string;
  locationType: "fixed" | "mobile" | "event";
  addressLine1: string | null;
  city: string | null;
  postcode: string | null;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
  hlcTimestamp: HLCTimestamp;
}

export interface Shift {
  id: UUID;
  tenantId: UUID;
  locationId: UUID;
  openedBy: UUID;
  closedBy: UUID | null;
  openedAt: ISODateString;
  closedAt: ISODateString | null;
  openingCash: Pence;
  closingCash: Pence | null;
  expectedCash: Pence | null;
  status: "open" | "closed";
  notes: string | null;
}
