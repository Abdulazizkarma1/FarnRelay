import {
  randomBytes,
  createHash,
  scrypt as scryptCallback,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
  createHmac,
} from "node:crypto";
import { promisify } from "node:util";
import { Session, User, RateBucket, Audit } from "./models.js";
const scrypt = promisify(scryptCallback);
export const secret = () => randomBytes(32).toString("hex");
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export const safeEqual = (a, b) =>
  typeof a === "string" &&
  typeof b === "string" &&
  timingSafeEqual(Buffer.from(digest(a)), Buffer.from(digest(b)));
export async function passwordHash(password) {
  const salt = randomBytes(16).toString("hex");
  const key = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return `scrypt:${salt}:${key.toString("hex")}`;
}
export async function passwordMatches(password, encoded) {
  const [, salt, key] = (encoded || "").split(":");
  if (!salt || !key) return false;
  const actual = await scrypt(password, salt, 64, {
    N: 32768,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024,
  });
  return safeEqual(actual.toString("hex"), key);
}
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const publicUser = (u) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  active: u.active,
  verified: u.verified,
  community: u.community,
  mfaEnabled: u.mfaEnabled,
  createdAt: u.createdAt,
});
export const cookieName = (config) =>
  config.NODE_ENV === "production" ? "__Host-farmrelay" : "farmrelay_session";
export const cookieOptions = (config) => ({
  httpOnly: true,
  secure: config.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 8 * 3600000,
});
export async function openSession(req, res, user, config) {
  const token = secret(),
    csrf = secret();
  await Session.create({
    tokenHash: digest(token),
    user: user._id,
    csrf,
    authVersion: user.authVersion,
    expiresAt: new Date(Date.now() + 8 * 3600000),
    lastSeen: new Date(),
  });
  res.cookie(cookieName(config), token, cookieOptions(config));
  return { user: publicUser(user), csrf };
}
export function authenticate(config) {
  return async (req, res, next) => {
    const token = req.cookies[cookieName(config)];
    if (!/^[a-f0-9]{64}$/.test(token || ""))
      throw new HttpError(401, "Please sign in.", "AUTH_REQUIRED");
    const session = await Session.findOne({
      tokenHash: digest(token),
      expiresAt: { $gt: new Date() },
      lastSeen: { $gt: new Date(Date.now() - 30 * 60000) },
    });
    if (!session)
      throw new HttpError(
        401,
        "Your session expired. Please sign in again.",
        "AUTH_REQUIRED",
      );
    const user = await User.findById(session.user);
    if (!user?.active || session.authVersion !== user.authVersion)
      throw new HttpError(
        401,
        "Your session is no longer valid. Please sign in again.",
        "AUTH_REQUIRED",
      );
    req.user = user;
    req.session = session;
    if (Date.now() - session.lastSeen.getTime() > 60000)
      await Session.updateOne(
        { _id: session._id },
        { $set: { lastSeen: new Date() } },
      );
    next();
  };
}
export function csrf(req, res, next) {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    !safeEqual(req.get("X-CSRF-Token"), req.session.csrf)
  )
    throw new HttpError(
      403,
      "Refresh the page before trying again.",
      "CSRF_INVALID",
    );
  next();
}
export function role(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      throw new HttpError(403, "Your account does not have this permission.");
    next();
  };
}
export function verified(req, res, next) {
  if (!req.user.verified)
    throw new HttpError(
      403,
      "Verify your email before continuing.",
      "VERIFY_EMAIL",
    );
  next();
}
export function adminMfa(req, res, next) {
  if (!req.user.mfaEnabled)
    throw new HttpError(
      403,
      "Enable authenticator protection in Account settings before managing access.",
      "MFA_REQUIRED",
    );
  next();
}
export function originGuard(config) {
  return (req, res, next) => {
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") !== config.APP_ORIGIN
    )
      throw new HttpError(403, "This request origin is not allowed.");
    next();
  };
}
export function rateLimit(
  scope,
  limit,
  seconds = 60,
  key = (req) => req.user?.id || req.ip,
) {
  return async (req, res, next) => {
    const interval = Math.floor(Date.now() / (seconds * 1000));
    const id = digest(`${scope}:${key(req)}:${interval}`);
    let entry;
    try {
      entry = await RateBucket.findOneAndUpdate(
        { _id: id },
        {
          $inc: { count: 1 },
          $setOnInsert: {
            expiresAt: new Date((interval + 2) * seconds * 1000),
          },
        },
        { upsert: true, new: true },
      );
    } catch (e) {
      if (e.code !== 11000) throw e;
      entry = await RateBucket.findOneAndUpdate(
        { _id: id },
        { $inc: { count: 1 } },
        { new: true },
      );
    }
    if (entry.count > limit) {
      res.set("Retry-After", String(seconds));
      throw new HttpError(429, "Too many requests. Please try again shortly.");
    }
    next();
  };
}
export async function audit(user, action, target, details = {}) {
  await Audit.create({
    actor: user?._id,
    actorName: user?.name || "System",
    action,
    target: String(target),
    details,
  });
}
export function encrypt(value, key) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", Buffer.from(digest(key), "hex"), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return [
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    encrypted.toString("hex"),
  ].join(".");
}
export function decrypt(value, key) {
  const [iv, tag, data] = value.split(".");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(digest(key), "hex"),
    Buffer.from(iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "hex")),
    decipher.final(),
  ]).toString("utf8");
}
export function base32(bytes) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0,
    value = 0,
    result = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
export function totpAt(hex, counter) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", Buffer.from(hex, "hex")).update(b).digest();
  const offset = h[h.length - 1] & 15;
  return String((h.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
export function matchTotp(hex, code, now = Date.now()) {
  if (!/^\d{6}$/.test(code || "")) return null;
  const step = Math.floor(now / 30000);
  for (const n of [step - 1, step, step + 1])
    if (safeEqual(totpAt(hex, n), code)) return n;
  return null;
}
