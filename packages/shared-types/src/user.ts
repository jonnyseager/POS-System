import type { UUID, ISODateString, TenantRole } from "./common.js";

export interface User {
  id: UUID;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  emailVerified: boolean;
  createdAt: ISODateString;
  updatedAt: ISODateString;
}

export interface RegisterInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  businessName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface PinLoginInput {
  tenantId: UUID;
  pinCode: string;
  deviceId: UUID;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthenticatedUser {
  user: User;
  tenantId: UUID;
  role: TenantRole;
}

export interface DeviceAuthInput {
  deviceToken: string;
  tenantId: UUID;
}
