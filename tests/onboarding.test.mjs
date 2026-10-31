import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAuth,
  passwordIssue,
  passwordGuidance,
  TERMS_VERSION,
} from "../shared/auth-validation.js";
import {
  savePending,
  getPending,
  recordResend,
  resendState,
  clearPending,
  clientAttempt,
} from "../src/auth-state.js";
import { createAuthHandler } from "../netlify/functions/auth.js";
import { createAuthFetch } from "../src/auth-fetch.js";
const good = {
  name: "Test Farmer",
  email: "test@example.test",
  password: "A long field phrase 2026",
  role: "officer",
  terms: true,
};
test("validators accept long passphrases and reject incomplete forms without complexity rules", () => {
  assert.deepEqual(validateAuth("register", good), {});
  assert.equal(passwordIssue("abcdefghijklmno"), "");
  assert.ok(passwordIssue("short"));
  assert.ok(passwordIssue("123456789012345"));
  assert.equal(passwordGuidance(good.password).valid, true);
  assert.ok(validateAuth("register", { ...good, terms: false }).terms);
  assert.ok(validateAuth("register", { ...good, email: "bad" }).email);
  assert.ok(validateAuth("register", { ...good, role: "admin" }).role);
  assert.deepEqual(
    validateAuth("login", { email: good.email, password: "old-password" }),
    {},
  );
});
function storage() {
  const map = new Map();
  return {
    getItem: (k) => map.get(k),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}
test("pending email stores no password, survives refresh and tracks resend windows", () => {
  const s = storage();
  let p = savePending(" Test@Example.test ", { role: "officer" }, s);
  assert.equal(getPending(s).email, "test@example.test");
  assert.equal(resendState(p, p.until - 42000).remaining, 42);
  assert.ok(!("password" in p));
  for (let i = 0; i < 3; i++) p = recordResend(p, s);
  assert.equal(resendState(p).limited, true);
  assert.equal(resendState(p, p.window + 900001).limited, false);
  clearPending(s);
  assert.equal(getPending(s), null);
  assert.equal(
    getPending({
      getItem: () => {
        throw Error();
      },
    }),
    null,
  );
});
test("client throttle is bounded and resets after its window", () => {
  assert.equal(clientAttempt("test-limit", 1, 1000, 0), true);
  assert.equal(clientAttempt("test-limit", 1, 1000, 1), false);
  assert.equal(clientAttempt("test-limit", 1, 1000, 1001), true);
});
const env = {
  APP_ORIGIN: "https://farmrelay.test",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public",
  SUPABASE_SECRET_KEY: "private",
};
const request = (body) =>
  new Request("https://farmrelay.test/.netlify/functions/auth", {
    method: "POST",
    headers: { origin: env.APP_ORIGIN, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const payload = {
  operation: "signup",
  redirect: "https://farmrelay.test/?auth_action=signup",
  body: {
    email: good.email,
    password: good.password,
    code_challenge: "challenge",
    code_challenge_method: "s256",
    data: {
      name: good.name,
      requested_role: "officer",
      terms_version: TERMS_VERSION,
    },
  },
};
test("server validates before contacting Auth and uses trusted platform IP for durable quotas", async () => {
  let sent, limit;
  const handler = createAuthHandler({
    env,
    clientFactory: () => ({
      rpc: async (_n, args) => {
        limit = args;
        return {};
      },
    }),
    fetcher: async (url, init) => {
      sent = { url: String(url), body: JSON.parse(init.body) };
      return Response.json({ user: { id: "test" } });
    },
  });
  assert.equal(
    (
      await handler(
        request({ ...payload, body: { ...payload.body, password: "short" } }),
        { ip: "127.0.0.1" },
      )
    ).status,
    400,
  );
  assert.equal(sent, undefined);
  assert.equal(
    (await handler(request(payload), { ip: "127.0.0.1" })).status,
    200,
  );
  assert.match(limit.p_key, /^[0-9a-f]{64}$/);
  assert.equal(sent.body.code_challenge, "challenge");
  assert.equal(sent.body.data.requested_role, "officer");
  assert.ok(!("role" in sent.body.data));
  assert.equal(
    (
      await handler(request({ ...payload, redirect: "https://evil.test" }), {
        ip: "127.0.0.1",
      })
    ).status,
    400,
  );
});
test("missing platform context fails closed and duplicate email responses stay generic", async () => {
  const handler = createAuthHandler({
    env,
    clientFactory: () => ({ rpc: async () => ({}) }),
    fetcher: async () =>
      Response.json({ code: "user_already_exists" }, { status: 422 }),
  });
  assert.equal((await handler(request(payload))).status, 503);
  const r = await handler(request(payload), { ip: "127.0.0.1" });
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { user: null, session: null });
});
test("quota failure never calls the upstream auth provider", async () => {
  let calls = 0;
  const h = createAuthHandler({
    env,
    clientFactory: () => ({
      rpc: async () => ({ error: { message: "RATE_LIMIT" } }),
    }),
    fetcher: async () => {
      calls++;
    },
  });
  assert.equal((await h(request(payload), { ip: "127.0.0.1" })).status, 429);
  assert.equal(calls, 0);
});
test("SDK transport preserves PKCE and routes password grant through server validation", async () => {
  let sent;
  const authFetch = createAuthFetch(async (url, init) => {
    sent = { url, body: JSON.parse(init.body) };
    return Response.json({});
  });
  await authFetch(
    "https://project.supabase.co/auth/v1/signup?redirect_to=https%3A%2F%2Ffarmrelay.test%2F%3Fauth_action%3Dsignup",
    { method: "POST", body: JSON.stringify(payload.body) },
  );
  assert.equal(sent.url, "/.netlify/functions/auth");
  assert.equal(sent.body.body.code_challenge, "challenge");
  assert.equal(sent.body.operation, "signup");
});

test("request IDs work when randomUUID is unavailable on older browsers", async () => {
  const { requestId } = await import("../src/id.js");
  const id = requestId({
    getRandomValues: (b) => {
      b.fill(7);
      return b;
    },
  });
  assert.match(
    id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test("modern secret keys forward only the trusted platform IP to Auth", async () => {
  let headers;
  const handler = createAuthHandler({
    env: { ...env, SUPABASE_SECRET_KEY: "sb_secret_synthetic" },
    clientFactory: () => ({ rpc: async () => ({}) }),
    fetcher: async (_url, init) => {
      headers = init.headers;
      return Response.json({ user: null });
    },
  });
  await handler(request(payload), { ip: "192.0.2.1" });
  assert.equal(headers["Sb-Forwarded-For"], "192.0.2.1");
  assert.equal(headers.apikey, "sb_secret_synthetic");
});

test("malformed password values are rejected before provider validation", () => {
  assert.ok(
    validateAuth("register", {
      ...good,
      password: { toString: () => good.password },
    }).password,
  );
  assert.ok(
    validateAuth("login", { email: good.email, password: 123 }).password,
  );
});
test("core design text colours meet the WCAG AA small-text threshold", () => {
  const luminance = (hex) => {
    const channels = hex
      .match(/[a-f0-9]{2}/gi)
      .map((c) => parseInt(c, 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const [fg, bg] of [
    ["163d2b", "ffffff"],
    ["4f6257", "ffffff"],
    ["a52622", "fff3f0"],
    ["21476b", "edf4fb"],
    ["496454", "f7f8f3"],
  ]) {
    const a = luminance(fg),
      b = luminance(bg);
    assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5);
  }
});

test("report summary is never treated as a single report needing media attachment", async () => {
  const { isReportDetailPath } = await import("../src/route-utils.js");
  assert.equal(isReportDetailPath("/reports/summary"), false);
  assert.equal(
    isReportDetailPath("/reports/11111111-1111-4111-8111-111111111111"),
    true,
  );
});

// Exercise the real SDK parser: it ignores modern error codes without a version header.
test("gateway preserves unverified-login error codes for the Supabase SDK", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const handler = createAuthHandler({
    env,
    clientFactory: () => ({ rpc: async () => ({}) }),
    fetcher: async () =>
      Response.json(
        { code: "email_not_confirmed", msg: "Email not confirmed" },
        { status: 400 },
      ),
  });
  const client = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: createAuthFetch(async (_url, init) =>
        handler(request(JSON.parse(init.body)), { ip: "192.0.2.1" }),
      ),
    },
  });
  const { error } = await client.auth.signInWithPassword({
    email: good.email,
    password: good.password,
  });
  assert.equal(error.code, "email_not_confirmed");
});
