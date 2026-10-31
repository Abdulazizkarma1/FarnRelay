import { authRedirect, exchangeEmailCode } from "./auth-links.js";
import { getSupabase } from "./supabase.js";
export class ApiError extends Error {
  constructor(message, status = 400, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function setCsrf() {} // Supabase requests use explicit bearer tokens, not cookies.
let enrollmentId, recoveryToken;
const media = new Map();
export const mediaUrl = (id, kind) => media.get(id + ":" + kind) || "";
export function clearMedia() {
  media.clear();
}
function check({ data, error }) {
  if (error) {
    const code =
      error.code === "session_not_found" ||
      error.name === "AuthSessionMissingError" ||
      error.message?.startsWith("AUTH_REQUIRED")
        ? "AUTH_REQUIRED"
        : error.message?.startsWith("MFA_OR_VERIFICATION")
          ? "MFA_REQUIRED"
          : error.code;
    throw new ApiError(
      error.message,
      code === "AUTH_REQUIRED" ? 401 : error.code === "42501" ? 403 : 400,
      code,
    );
  }
  return data;
}
async function rpc(path, method = "GET", body = {}, query = {}) {
  return check(
    await getSupabase().rpc("farmrelay_api", {
      p_path: path,
      p_method: method,
      p_body: body,
      p_query: query,
    }),
  );
}
async function factors() {
  const d = check(await getSupabase().auth.mfa.listFactors());
  return d.totp.filter((f) => f.status === "verified");
}
async function challenge(code) {
  const fs = await factors();
  if (!fs.length) return;
  if (!code)
    throw new ApiError(
      "Enter the six-digit code from your authenticator.",
      401,
      "MFA_REQUIRED",
    );
  check(
    await getSupabase().auth.mfa.challengeAndVerify({
      factorId: fs[0].id,
      code,
    }),
  );
}
async function me() {
  const db = getSupabase();
  const d = check(await db.auth.getUser());
  if (!d.user) throw new ApiError("Please sign in.", 401, "AUTH_REQUIRED");
  const aal = check(await db.auth.mfa.getAuthenticatorAssuranceLevel());
  if (aal.nextLevel === "aal2" && aal.currentLevel !== "aal2")
    throw new ApiError(
      "Complete your authenticator sign-in.",
      401,
      "MFA_REQUIRED",
    );
  return rpc("/auth/me");
}
async function auth(path, body = {}) {
  const db = getSupabase();
  switch (path) {
    case "/auth/me":
      return me();
    case "/auth/register": {
      check(
        await db.auth.signUp({
          email: body.email,
          password: body.password,
          options: {
            data: { name: body.name, community: body.community },
            emailRedirectTo: authRedirect(location.origin, "signup"),
          },
        }),
      );
      return {
        message: "Check your email to verify your account, then sign in.",
      };
    }
    case "/auth/login": {
      check(
        await db.auth.signInWithPassword({
          email: body.email,
          password: body.password,
        }),
      );
      await challenge(body.otp);
      return me();
    }
    case "/auth/forgot":
      check(
        await db.auth.resetPasswordForEmail(body.email, {
          redirectTo: authRedirect(location.origin, "recovery"),
        }),
      );
      return {
        message: "If an account exists, a reset link will arrive by email.",
      };
    case "/auth/callback": {
      if (!["signup", "recovery"].includes(body.action))
        throw new ApiError("Invalid email action.");
      await exchangeEmailCode(db.auth, body.code);
      if (body.action === "recovery") {
        recoveryToken = crypto.randomUUID();
        return { recoveryToken };
      }
      check(await db.auth.signOut({ scope: "local" }));
      return { message: "Email verified. You can now sign in." };
    }
    case "/auth/verify":
      check(await db.auth.verifyOtp({ token_hash: body.token, type: "email" }));
      return { message: "Email verified. You can now sign in." };
    case "/auth/reset": {
      if (recoveryToken !== body.token) {
        check(
          await db.auth.verifyOtp({ token_hash: body.token, type: "recovery" }),
        );
        recoveryToken = body.token;
      }
      await challenge(body.otp);
      check(await db.auth.updateUser({ password: body.password }));
      await rpc("/auth/logout-all", "POST");
      check(await db.auth.signOut({ scope: "global" }));
      recoveryToken = null;
      return { message: "Password changed. Sign in with your new password." };
    }
    case "/auth/logout":
      check(await db.auth.signOut({ scope: "local" }));
      clearMedia();
      return { message: "Signed out." };
    case "/auth/logout-all":
      await rpc(path, "POST");
      check(await db.auth.signOut({ scope: "global" }));
      clearMedia();
      return { message: "Signed out on all devices." };
    case "/auth/resend": {
      const { user } = check(await db.auth.getUser());
      check(
        await db.auth.resend({
          type: "signup",
          email: user.email,
          options: { emailRedirectTo: authRedirect(location.origin, "signup") },
        }),
      );
      return { message: "Verification email requested." };
    }
    case "/auth/profile":
      return rpc(path, "PATCH", body);
    case "/auth/password": {
      check(
        await db.auth.updateUser({
          password: body.password,
          current_password: body.currentPassword,
        }),
      );
      check(await db.auth.signOut({ scope: "others" }));
      return me();
    }
    case "/auth/mfa/setup": {
      const existing = check(await db.auth.mfa.listFactors());
      for (const f of existing.totp.filter((f) => f.status === "unverified"))
        check(await db.auth.mfa.unenroll({ factorId: f.id }));
      const d = check(
        await db.auth.mfa.enroll({
          factorType: "totp",
          friendlyName: "FarmRelay authenticator",
        }),
      );
      enrollmentId = d.id;
      return { secret: d.totp.secret };
    }
    case "/auth/mfa/confirm": {
      if (!enrollmentId) throw new ApiError("Start authenticator setup again.");
      check(
        await db.auth.mfa.challengeAndVerify({
          factorId: enrollmentId,
          code: body.otp,
        }),
      );
      enrollmentId = null;
      return me();
    }
    default:
      throw new ApiError("Account action is not supported.");
  }
}
export async function uploadAttachment(
  userId,
  clientId,
  value,
  kind,
  dimensions = {},
) {
  if (!value) return null;
  const match =
    /^data:([^;,]+)(?:;codecs=[a-zA-Z0-9.,-]+)?;base64,([A-Za-z0-9+/]+=*)$/.exec(
      value,
    );
  if (!match) throw new ApiError("Unsupported attachment.");
  const allowed =
    kind === "photo"
      ? ["image/jpeg", "image/png", "image/webp"]
      : ["audio/webm", "audio/ogg", "audio/mp4", "audio/wav"];
  if (!allowed.includes(match[1]))
    throw new ApiError("Unsupported attachment type.");
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  if (!bytes.length || bytes.length > (kind === "photo" ? 1500000 : 1100000))
    throw new ApiError("Attachment is too large.");
  const path = `${userId}/${clientId}/${crypto.randomUUID()}/${kind}`;
  check(
    await getSupabase()
      .storage.from("crop-evidence")
      .upload(path, bytes, { contentType: match[1], upsert: false }),
  );
  return { path, mime: match[1], bytes: bytes.length, ...dimensions };
}
async function submitReport(body) {
  const { user } = await me();
  const db = getSupabase();
  const old = check(
    await db
      .from("reports")
      .select("id")
      .eq("owner", user.id)
      .eq("client_id", body.clientId)
      .maybeSingle(),
  );
  if (old) return rpc("/reports/" + old.id);
  const uploaded = [];
  try {
    const photo = await uploadAttachment(
      user.id,
      body.clientId,
      body.photoDataUrl,
      "photo",
      { width: body.photoWidth, height: body.photoHeight },
    );
    if (photo) uploaded.push(photo.path);
    const audio = await uploadAttachment(
      user.id,
      body.clientId,
      body.audioDataUrl,
      "audio",
    );
    if (audio) uploaded.push(audio.path);
    const payload = Object.fromEntries(
      [
        "clientId",
        "crop",
        "community",
        "symptom",
        "onset",
        "description",
        "affected",
        "audioLanguage",
      ]
        .filter((k) => body[k] !== undefined)
        .map((k) => [k, body[k]]),
    );
    return await rpc("/reports", "POST", { ...payload, photo, audio });
  } catch (e) {
    // Storage policy refuses deletion once an attachment belongs to a committed report.
    if (uploaded.length)
      await db.storage
        .from("crop-evidence")
        .remove(uploaded)
        .catch(() => {});
    throw e;
  }
}
async function attachMedia(report) {
  for (const kind of ["photo", "audio"]) {
    media.delete(report._id + ":" + kind);
    if (report[kind]?.path) {
      const d = check(
        await getSupabase()
          .storage.from("crop-evidence")
          .createSignedUrl(report[kind].path, 300),
      );
      media.set(report._id + ":" + kind, d.signedUrl);
    }
  }
  return report;
}
async function ai(path, body) {
  const { session } = check(await getSupabase().auth.getSession());
  if (!session) throw new ApiError("Sign in again.", 401, "AUTH_REQUIRED");
  const [, id, , kind] = path.split("/").filter(Boolean);
  const res = await fetch("/.netlify/functions/meta", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + session.access_token,
      "Content-Type": body instanceof Blob ? body.type : "application/json",
      "X-Report-Id": id,
      "X-AI-Action": kind,
    },
    body: body instanceof Blob ? body : JSON.stringify({}),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(
      "Meta functions are unavailable. Use the deployed Netlify app.",
    );
  const d = await res.json();
  if (!res.ok) throw new ApiError(d.error || "AI request failed.", res.status);
  return d;
}
export async function api(path, { method = "GET", body, signal } = {}) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
  try {
    if (path.startsWith("/auth/")) return await auth(path, body);
    if (/\/ai\//.test(path)) return await ai(path, body);
    const url = new URL(path, location.origin);
    if (url.pathname === "/reports" && method === "POST")
      return await submitReport(body);
    const d = await rpc(
      url.pathname,
      method,
      body || {},
      Object.fromEntries(url.searchParams),
    );
    if (/^\/reports\/[^/]+$/.test(url.pathname) && method === "GET")
      await attachMedia(d.report);
    return d;
  } catch (e) {
    if (e.code === "AUTH_REQUIRED" && path !== "/auth/me")
      window.dispatchEvent(new Event("farmrelay:session-expired"));
    throw e;
  }
}
export const navigate = (path) => {
  location.hash = path;
  window.scrollTo({ top: 0, behavior: "instant" });
};
