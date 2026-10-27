import { z } from "zod";
export function loadConfig(env = process.env) {
  const parsed = z
    .object({
      NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
      PORT: z.coerce.number().int().min(1).default(4000),
      MONGODB_URI: z.string().min(1),
      APP_ORIGIN: z.string().url(),
      APP_SECRET: z.string().min(32),
      MODEL_API_KEY: z.string().optional(),
      META_MODEL: z.string().default("muse-spark-1.3"),
      SMTP_URL: z.string().optional(),
      MAIL_FROM: z.string().optional(),
      TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(3).default(1),
      SERVE_WEB: z.string().default("true"),
    })
    .parse(env);
  if (
    parsed.NODE_ENV === "production" &&
    (!parsed.APP_ORIGIN.startsWith("https://") ||
      !parsed.SMTP_URL ||
      !parsed.MAIL_FROM)
  )
    throw Error(
      "Production requires HTTPS APP_ORIGIN, SMTP_URL and MAIL_FROM.",
    );
  if (new URL(parsed.APP_ORIGIN).origin !== parsed.APP_ORIGIN)
    throw Error(
      "APP_ORIGIN must be an origin without a path or trailing slash.",
    );
  return parsed;
}
