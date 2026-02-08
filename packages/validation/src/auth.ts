import { z } from "zod";
import { emailSchema, passwordSchema, nameSchema, pinCodeSchema, uuidSchema } from "./common.js";

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  firstName: nameSchema,
  lastName: nameSchema,
  businessName: nameSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

export const pinLoginSchema = z.object({
  tenantId: uuidSchema,
  pinCode: pinCodeSchema,
  deviceId: uuidSchema,
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

export const deviceAuthSchema = z.object({
  deviceToken: z.string().min(1),
  tenantId: uuidSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PinLoginInput = z.infer<typeof pinLoginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type DeviceAuthInput = z.infer<typeof deviceAuthSchema>;
