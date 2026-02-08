import type { UUID, ISODateString, SubscriptionTier, TenantRole } from "./common.js";

export interface Tenant {
  id: UUID;
  name: string;
  slug: string;
  businessType: string;
  countryCode: string;
  currencyCode: string;
  timezone: string;
  vatRegistered: boolean;
  vatNumber: string | null;
  stripeAccountId: string | null;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: string;
  trialEndsAt: ISODateString | null;
  settings: Record<string, unknown>;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface TenantUser {
  id: UUID;
  tenantId: UUID;
  userId: UUID;
  role: TenantRole;
  pinCode: string | null;
  hourlyRate: number | null;
  isActive: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface CreateTenantInput {
  name: string;
  businessType?: string;
  vatRegistered?: boolean;
  vatNumber?: string;
}
