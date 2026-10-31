import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  validateAuth,
  normalizeEmail,
  TERMS_VERSION,
} from "../../shared/auth-validation.js";
const reply = (body, status = 200, extra = {}) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store", ...extra },
  });
export function createAuthHandler({
  env = process.env,
  fetcher = fetch,
  clientFactory = createClient,
} = {}) {
  return async (request, context = {}) => {
    if (request.method !== "POST")
      return reply({ code: "method_not_allowed" }, 405);
    if (!env.APP_ORIGIN || request.headers.get("origin") !== env.APP_ORIGIN)
      return reply({ code: "origin_not_allowed" }, 403);
    if (
      !env.SUPABASE_URL ||
      !env.SUPABASE_PUBLISHABLE_KEY ||
      !env.SUPABASE_SECRET_KEY ||
      !context.ip
    )
      return reply({ code: "service_unavailable" }, 503);
    try {
      const reader = request.body?.getReader();
      if (!reader) return reply({ code: "validation_failed" }, 400);
      const chunks = [];
      let size = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 12000) {
          await reader.cancel();
          return reply({ code: "validation_failed" }, 413);
        }
        chunks.push(Buffer.from(value));
      }
      const input = JSON.parse(Buffer.concat(chunks).toString());
      const { operation, redirect, body } = input;
      if (
        !["signup", "login", "resend", "recover"].includes(operation) ||
        !body ||
        typeof body !== "object"
      )
        return reply({ code: "validation_failed" }, 400);
      const data = {
        email: normalizeEmail(body.email),
        password: body.password,
        name: body.data?.name,
        role: body.data?.requested_role,
        terms: body.data?.terms_version === TERMS_VERSION,
      };
      const errors = validateAuth(
        { signup: "register", recover: "forgot" }[operation] || operation,
        data,
      );
      if (Object.keys(errors).length)
        return reply({ code: "validation_failed", fields: errors }, 400);
      const origin = new URL(env.APP_ORIGIN).origin;
      let redirectUrl;
      if (operation !== "login") {
        redirectUrl = new URL(redirect || origin);
        if (
          redirectUrl.origin !== origin ||
          redirectUrl.pathname !== "/" ||
          !["signup", "recovery"].includes(
            redirectUrl.searchParams.get("auth_action"),
          ) ||
          redirectUrl.searchParams.get("auth_action") !==
            (operation === "recover" ? "recovery" : "signup")
        )
          return reply({ code: "validation_failed" }, 400);
      }
      const key = createHmac("sha256", env.SUPABASE_SECRET_KEY)
        .update(context.ip)
        .digest("hex");
      const service = clientFactory(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: limit } = await service.rpc("farmrelay_auth_limit", {
        p_key: key,
        p_action: operation,
      });
      if (limit)
        return reply(
          {
            code: limit.message?.includes("RATE_LIMIT")
              ? "over_request_rate_limit"
              : "service_unavailable",
          },
          limit.message?.includes("RATE_LIMIT") ? 429 : 503,
          { "Retry-After": "60" },
        );
      const payload = { email: data.email };
      for (const k of [
        "code_challenge",
        "code_challenge_method",
        "gotrue_meta_security",
      ])
        if (body[k] !== undefined) payload[k] = body[k];
      if (["signup", "login"].includes(operation))
        payload.password = body.password;
      if (operation === "signup")
        payload.data = {
          name: data.name.trim(),
          requested_role: data.role,
          terms_version: TERMS_VERSION,
          terms_accepted_at: new Date().toISOString(),
        };
      if (operation === "resend") payload.type = "signup";
      const path =
        operation === "login"
          ? "token?grant_type=password"
          : operation === "recover"
            ? "recover"
            : operation;
      const target = new URL("/auth/v1/" + path, env.SUPABASE_URL);
      if (redirectUrl) target.searchParams.set("redirect_to", redirectUrl.href);
      const providerHeaders = {
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      };
      if (env.SUPABASE_SECRET_KEY.startsWith("sb_secret_")) {
        providerHeaders.apikey = env.SUPABASE_SECRET_KEY;
        providerHeaders["Sb-Forwarded-For"] = context.ip;
      }
      const result = await fetcher(target, {
        method: "POST",
        headers: providerHeaders,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      });
      const output = await result.json();
      // Signup and resend do not disclose whether an account already exists.
      if (
        ["signup", "resend", "recover"].includes(operation) &&
        [
          "user_already_exists",
          "email_exists",
          "user_not_found",
          "email_not_found",
        ].includes(output.code || output.error_code)
      )
        return reply({ user: null, session: null });
      return reply(output, result.status);
    } catch (error) {
      return reply(
        {
          code:
            error instanceof SyntaxError
              ? "validation_failed"
              : "service_unavailable",
        },
        error instanceof SyntaxError ? 400 : 503,
      );
    }
  };
}
export default createAuthHandler();
