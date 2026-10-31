import { test } from "node:test";
import assert from "node:assert/strict";
import {
  authRedirect,
  readAuthCallback,
  exchangeEmailCode,
} from "../src/auth-links.js";
test("production signup and recovery callbacks use the active HTTPS origin", () => {
  assert.equal(
    authRedirect("https://farmrelay.netlify.app", "signup"),
    "https://farmrelay.netlify.app/?auth_action=signup",
  );
  assert.equal(
    authRedirect("https://farmrelay.netlify.app", "recovery"),
    "https://farmrelay.netlify.app/?auth_action=recovery",
  );
  assert.throws(() => authRedirect("http://example.com", "signup"));
  assert.throws(() => authRedirect("https://example.com", "other"));
});
test("PKCE query callbacks are recognised before hash routing without accepting implicit tokens", () => {
  assert.equal(
    readAuthCallback("https://example.com/?code=sample&auth_action=recovery")
      .action,
    "recovery",
  );
  assert.equal(
    readAuthCallback("https://example.com/?code=sample").action,
    "signup",
  );
  assert.ok(readAuthCallback("https://example.com/?error=expired").error);
  assert.ok(
    readAuthCallback("https://example.com/?code=sample&auth_action=other")
      .error,
  );
  assert.equal(
    readAuthCallback("https://example.com/#access_token=untrusted"),
    null,
  );
});
test("only a successful provider code exchange establishes the callback session", async () => {
  let called = "";
  const auth = {
    exchangeCodeForSession: async (code) => {
      called = code;
      return { data: { session: { user: { id: "test" } } } };
    },
  };
  await exchangeEmailCode(auth, "code");
  assert.equal(called, "code");
  await assert.rejects(
    () =>
      exchangeEmailCode(
        {
          exchangeCodeForSession: async () => ({
            error: { message: "expired" },
          }),
        },
        "code",
      ),
    /same browser/,
  );
  await assert.rejects(() => exchangeEmailCode(auth, ""), /Invalid/);
});

test("managed HTTP preview redirects are allowed only under an explicit development flag", () => {
  assert.throws(() => authRedirect("http://terminal.local:4173", "signup"));
  assert.equal(
    authRedirect("http://terminal.local:4173", "signup", true),
    "http://terminal.local:4173/?auth_action=signup",
  );
});
