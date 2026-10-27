import { createHash, createHmac, timingSafeEqual } from "node:crypto";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export function equal(a, b) {
  return (
    typeof a === "string" &&
    typeof b === "string" &&
    timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b)))
  );
}
export function officerConfigured() {
  return (process.env.OFFICER_ACCESS_KEY || "").length >= 24;
}
export function sessionCookie(clear = false) {
  const expiry = String(Date.now() + 8 * 3600000);
  const signature = createHmac("sha256", process.env.OFFICER_ACCESS_KEY)
    .update(expiry)
    .digest("hex");
  return `farmrelay_officer=${clear ? "" : expiry + "." + signature}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : 28800}`;
}
export function isOfficer(request) {
  if (!officerConfigured()) return false;
  const token =
    request.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)farmrelay_officer=([^;]+)/)?.[1] || "";
  const [expiry, signature] = token.split(".");
  if (
    !/^\d+$/.test(expiry || "") ||
    Number(expiry) < Date.now() ||
    Number(expiry) > Date.now() + 28800000
  )
    return false;
  return equal(
    signature,
    createHmac("sha256", process.env.OFFICER_ACCESS_KEY)
      .update(expiry)
      .digest("hex"),
  );
}
export function originAllowed(request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
export const json = (data, status = 200, headers = {}) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "no-store", ...headers },
  });
