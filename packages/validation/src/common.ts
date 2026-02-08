import { z } from "zod";

/** Positive integer representing pence (no floating point money) */
export const penceSchema = z.number().int().min(0);

/** UUID v4 or v7 string */
export const uuidSchema = z.string().uuid();

/** Pagination query parameters */
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** UK postcode (basic validation) */
export const ukPostcodeSchema = z
  .string()
  .regex(
    /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i,
    "Invalid UK postcode format"
  );

/** UK VAT number */
export const vatNumberSchema = z
  .string()
  .regex(/^GB\d{9}$|^\d{9}$/, "Invalid UK VAT number format");

/** Non-empty trimmed string */
export const nameSchema = z.string().trim().min(1).max(255);

/** Email address */
export const emailSchema = z.string().email().max(255).toLowerCase();

/** Password: minimum 8 chars, at least one letter and one number */
export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[a-zA-Z]/, "Password must contain at least one letter")
  .regex(/\d/, "Password must contain at least one number");

/** 4-digit PIN code for POS quick login */
export const pinCodeSchema = z.string().regex(/^\d{4}$/, "PIN must be 4 digits");

/** Hex colour code */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex colour");

export type Pagination = z.infer<typeof paginationSchema>;
