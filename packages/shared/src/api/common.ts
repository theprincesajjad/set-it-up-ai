import { z } from "zod";

/** Error envelope returned by every non-2xx API response. */
export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

export const phoneSchema = z.string().min(7).max(20);
export const uuidSchema = z.uuid();
export const centsSchema = z.number().int().min(0).max(100_000_000);
export const paginationQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
