import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  passwordHash,
  passwordMatches,
  encrypt,
  decrypt,
  totpAt,
  matchTotp,
  csrf,
  publicUser,
} from "../src/security.js";
import { reportScope, canRead, decodeMedia } from "../src/routes/reports.js";
import { validateWav, parseBoxes, createMeta } from "../src/services/meta.js";
import { encodeWav } from "../../src/relay.js";
const config = {
  NODE_ENV: "test",
  APP_ORIGIN: "http://localhost:5173",
  APP_SECRET: "test-only-32-character-secret-for-unit-tests",
  TRUST_PROXY_HOPS: 0,
  SERVE_WEB: "false",
};
test("password hashes use unique salts and reject incorrect passwords", async () => {
  const first = await passwordHash("test-only-long-password");
  const second = await passwordHash("test-only-long-password");
  assert.notEqual(first, second);
  assert.equal(await passwordMatches("test-only-long-password", first), true);
  assert.equal(await passwordMatches("wrong", first), false);
});
test("MFA encryption detects tampering and TOTP matches RFC 6238 six digit suffix", () => {
  const key = config.APP_SECRET,
    value = "3132333435363738393031323334353637383930",
    cipher = encrypt(value, key);
  assert.equal(decrypt(cipher, key), value);
  assert.throws(() => decrypt(cipher, key + "changed"));
  assert.equal(totpAt(value, 1), "287082");
  assert.equal(matchTotp(value, "287082", 59000), 1);
  assert.equal(matchTotp(value, "000000", 59000), null);
});
test("record scope follows account role and never accepts another farmer ownership", () => {
  assert.deepEqual(reportScope({ role: "farmer", _id: "A" }), { owner: "A" });
  assert.deepEqual(reportScope({ role: "officer", _id: "B" }), {
    assignedTo: "B",
  });
  assert.equal(canRead({ role: "farmer", _id: "A" }, { owner: "C" }), false);
  assert.equal(
    canRead({ role: "officer", _id: "B" }, { owner: "A", assignedTo: "B" }),
    true,
  );
  assert.equal(
    publicUser({ _id: "A", passwordHash: "hidden", mfaSecret: "hidden" })
      .passwordHash,
    undefined,
  );
});
test("CSRF rejects missing tokens and accepts matching session tokens", () => {
  assert.throws(() =>
    csrf(
      { method: "POST", get: () => "", session: { csrf: "valid" } },
      {},
      () => {},
    ),
  );
  let passed = false;
  csrf(
    { method: "PATCH", get: () => "valid", session: { csrf: "valid" } },
    {},
    () => {
      passed = true;
    },
  );
  assert.equal(passed, true);
});
test("API rejects cross-origin writes before database access and sends security headers", async () => {
  const app = createApp(config, {
    logging: false,
    mailer: async () => {},
    meta: {},
  });
  const res = await request(app)
    .post("/api/auth/login")
    .set("Origin", "https://other.example")
    .send({});
  assert.equal(res.status, 403);
  assert.equal(res.headers["x-content-type-options"], "nosniff");
  assert.equal(res.headers["cache-control"], "no-store");
  assert.match(
    res.headers["content-security-policy"],
    /frame-ancestors 'none'/,
  );
  const denied = await request(app).get("/api/reports");
  assert.equal(denied.status, 401);
});
test("attachment validation rejects arbitrary URLs and disguised file types", () => {
  assert.throws(() => decodeMedia("https://internal.example", "photo"));
  assert.throws(() => decodeMedia("data:image/jpeg;base64,PGh0bWw+", "photo"));
  assert.throws(() =>
    decodeMedia("data:image/svg+xml;base64,PHN2Zz4=", "photo"),
  );
});
test("audio conversion creates mono 16 kHz PCM and validator rejects unsupported data", async () => {
  const bytes = Buffer.from(
    await encodeWav(new Float32Array(16000)).arrayBuffer(),
  );
  validateWav(bytes);
  assert.equal(bytes.readUInt32LE(24), 16000);
  const invalid = Buffer.from(bytes);
  invalid.writeUInt32LE(48000, 24);
  assert.throws(() => validateWav(invalid));
  assert.throws(() => validateWav(Buffer.from("not audio")));
});
test("SAM parser rejects out-of-image boxes", () => {
  assert.deepEqual(parseBoxes("<|box;x1=10;y1=20;x2=50;y2=70;w=100;h=100|>"), [
    { x1: 10, y1: 20, x2: 50, y2: 70, w: 100, h: 100 },
  ]);
  assert.equal(
    parseBoxes("<|box;x1=10;y1=20;x2=150;y2=70;w=100;h=100|>").length,
    0,
  );
});
test("Meta reports missing configuration without manufacturing AI results", async () => {
  await assert.rejects(
    () => createMeta(config).brief({ crop: "Maize" }),
    /configured/i,
  );
});
