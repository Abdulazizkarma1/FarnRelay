import { z } from "zod";
import { HttpError } from "./security.js";
export const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((s) => s.toLowerCase());
export const password = z
  .string()
  .min(12, "Use at least 12 characters.")
  .max(128);
export const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(15),
  q: z.string().trim().max(100).default(""),
  status: z
    .enum(["Needs review", "In review", "Follow-up needed", "Closed"])
    .optional(),
  role: z.enum(["farmer", "officer", "admin"]).optional(),
});
export const parse = (schema, data) => schema.parse(data);
export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function idParam(req, res, next) {
  if (!objectId.safeParse(req.params.id).success)
    throw new HttpError(404, "Not found.");
  next();
}
