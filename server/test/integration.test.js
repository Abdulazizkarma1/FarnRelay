import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../src/app.js";
import {
  ensureIndexes,
  User,
  Session,
  Report,
  Audit,
  Notification,
  RateBucket,
} from "../src/models.js";
import { passwordHash, encrypt, totpAt } from "../src/security.js";
import { encodeWav } from "../../src/relay.js";
import { createMeta, validateWav } from "../src/services/meta.js";
const origin = "http://localhost:5173",
  password = "a-long-test-only-passphrase";
const config = {
  NODE_ENV: "test",
  APP_ORIGIN: origin,
  APP_SECRET: "test-only-secret-that-is-at-least-32-characters",
  MONGODB_URI: "",
  TRUST_PROXY_HOPS: 0,
  SERVE_WEB: "false",
  META_MODEL: "muse-spark-1.3",
  MODEL_API_KEY: "test-not-live",
  SMTP_URL: "test",
  MAIL_FROM: "test@example.com",
};
let mongo,
  app,
  users = {},
  clients = {},
  mail = [];
const mockedMeta = {
  brief: async () => ({
    model: "muse-spark-1.3",
    elapsedMs: 1,
    brief: {
      summary: "TEST FIXTURE",
      observations: [],
      unknowns: [],
      followupQuestions: [],
    },
    createdAt: new Date(),
  }),
  segment: async () => ({
    model: "sam-3.1",
    elapsedMs: 1,
    boxes: [],
    maskCount: 0,
  }),
  transcribe: async (bytes) => {
    validateWav(bytes);
    return {
      model: "muse-voice-transcribe-1.0",
      transcript: "Fixture transcript.",
      elapsedMs: 1,
    };
  },
};
const base = (client, method, path) =>
  client[method]("/api" + path).set("Origin", origin);
function write(client, method, path, body) {
  return base(client.agent, method, path)
    .set("X-CSRF-Token", client.csrf)
    .send(body);
}
async function signin(email, extra = {}) {
  const agent = request.agent(app);
  const res = await base(agent, "post", "/auth/login").send({
    email,
    password,
    ...extra,
  });
  assert.equal(res.status, 200, res.text);
  return { agent, csrf: res.body.csrf, user: res.body.user };
}
before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await ensureIndexes();
  app = createApp(config, {
    logging: false,
    mailer: async (msg) => mail.push(msg),
    meta: mockedMeta,
  });
  for (const [key, role] of [
    ["farmerA", "farmer"],
    ["farmerB", "farmer"],
    ["officerA", "officer"],
    ["officerB", "officer"],
    ["admin", "admin"],
  ]) {
    users[key] = await User.create({
      name: key,
      email: key.toLowerCase() + "@example.com",
      passwordHash: await passwordHash(password),
      role,
      verified: true,
    });
    clients[key] = await signin(users[key].email);
  }
});
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
let reportId;
test("ownership, assignment and private media are enforced across accounts", async () => {
  const payload = {
    clientId: "b22574a9-255d-49bb-9da2-5b6474c76819",
    crop: "Maize",
    community: "QA community",
    symptom: "Leaf damage",
    onset: "2026-01-01",
    description: "Several leaves show holes.",
    photoDataUrl: "data:image/jpeg;base64,/9j/AA==",
  };
  const created = await write(clients.farmerA, "post", "/reports", payload);
  assert.equal(created.status, 201, created.text);
  reportId = created.body.report._id;
  assert.equal(created.body.report.photo.data, undefined);
  const again = await write(clients.farmerA, "post", "/reports", payload);
  assert.equal(again.status, 200);
  assert.equal(again.body.report._id, reportId);
  assert.equal(await Report.countDocuments(), 1);
  assert.equal(
    (await base(clients.farmerB.agent, "get", "/reports/" + reportId)).status,
    404,
  );
  assert.equal(
    (await base(clients.officerA.agent, "get", "/reports/" + reportId)).status,
    404,
  );
  assert.equal(
    (
      await base(
        clients.farmerB.agent,
        "get",
        `/reports/${reportId}/media/photo`,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await base(
        clients.farmerA.agent,
        "get",
        `/reports/${reportId}/media/photo`,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await write(clients.farmerA, "patch", `/reports/${reportId}/assignment`, {
        officerId: users.officerA.id,
        version: 0,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await write(clients.admin, "patch", `/reports/${reportId}/assignment`, {
        officerId: users.officerA.id,
        version: 0,
      })
    ).status,
    403,
  );
  await User.updateOne(
    { _id: users.admin._id },
    { $set: { mfaEnabled: true } },
  );
  const assigned = await write(
    clients.admin,
    "patch",
    `/reports/${reportId}/assignment`,
    { officerId: users.officerA.id, version: 0 },
  );
  assert.equal(assigned.status, 200, assigned.text);
  assert.equal(
    (await base(clients.officerA.agent, "get", "/reports/" + reportId)).status,
    200,
  );
  assert.equal(
    (await base(clients.officerB.agent, "get", "/reports/" + reportId)).status,
    404,
  );
  const list = await base(clients.farmerB.agent, "get", "/reports");
  assert.equal(list.body.total, 0);
  assert.equal(
    (await write(clients.farmerA, "post", `/reports/${reportId}/ai/brief`))
      .status,
    403,
  );
  const ai = await write(
    clients.officerA,
    "post",
    `/reports/${reportId}/ai/brief`,
  );
  assert.equal(ai.status, 200, ai.text);
  assert.equal(
    (await Report.findById(reportId)).ai.brief.brief.summary,
    "TEST FIXTURE",
  );
});
test("messages persist once and stale case updates cannot overwrite another reviewer", async () => {
  const body = {
    clientId: "e79aeb79-56a6-4345-a17a-68b39a21dc78",
    text: "Please photograph the underside of the leaf.",
  };
  assert.equal(
    (
      await write(
        clients.officerA,
        "post",
        `/reports/${reportId}/messages`,
        body,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await write(
        clients.officerA,
        "post",
        `/reports/${reportId}/messages`,
        body,
      )
    ).status,
    200,
  );
  const messages = await base(
    clients.farmerA.agent,
    "get",
    `/reports/${reportId}/messages`,
  );
  assert.equal(messages.body.total, 1);
  assert.equal(messages.body.items[0].role, "officer");
  assert.equal(
    (
      await write(clients.farmerB, "post", `/reports/${reportId}/messages`, {
        ...body,
        clientId: "2b1274a9-255d-49bb-9da2-5b6474c76819",
      })
    ).status,
    404,
  );
  const updated = await write(
    clients.officerA,
    "patch",
    "/reports/" + reportId,
    { version: 1, status: "In review", priority: "normal" },
  );
  assert.equal(updated.status, 200);
  assert.equal(
    (
      await write(clients.officerA, "patch", "/reports/" + reportId, {
        version: 1,
        status: "Closed",
        priority: "normal",
      })
    ).status,
    409,
  );
  assert.ok(
    (await Notification.countDocuments({ user: users.farmerA._id })) >= 1,
  );
});
test("CSRF, input allowlists, origin restrictions and session revocation block escalation", async () => {
  const noCsrf = await base(
    clients.farmerA.agent,
    "patch",
    "/auth/profile",
  ).send({ name: "Updated", community: "" });
  assert.equal(noCsrf.status, 403);
  const badOrigin = await clients.farmerA.agent
    .patch("/api/auth/profile")
    .set("Origin", "https://evil.example")
    .set("X-CSRF-Token", clients.farmerA.csrf)
    .send({ name: "Updated", community: "" });
  assert.equal(badOrigin.status, 403);
  assert.equal(
    (
      await write(clients.farmerA, "patch", "/auth/profile", {
        name: "Updated",
        community: "",
        role: "admin",
      })
    ).status,
    400,
  );
  assert.equal(
    (await base(clients.farmerA.agent, "get", "/admin/users")).status,
    403,
  );
  const changed = await write(
    clients.admin,
    "patch",
    "/admin/users/" + users.officerB.id,
    { role: "officer", active: false },
  );
  assert.equal(changed.status, 200, changed.text);
  assert.equal(
    (await base(clients.officerB.agent, "get", "/auth/me")).status,
    401,
  );
  assert.ok(
    await Audit.exists({
      action: "account.access_changed",
      target: users.officerB.id,
    }),
  );
  assert.equal(
    (
      await write(clients.admin, "patch", "/admin/users/" + users.admin.id, {
        role: "farmer",
        active: false,
      })
    ).status,
    403,
  );
});
test("registration cannot choose staff roles, verification and reset tokens are single-use", async () => {
  const agent = request.agent(app),
    email = "new@example.com";
  assert.equal(
    (
      await base(agent, "post", "/auth/register").send({
        name: "New Farmer",
        email,
        password,
        role: "admin",
      })
    ).status,
    400,
  );
  const created = await base(agent, "post", "/auth/register").send({
    name: "New Farmer",
    email,
    password,
  });
  assert.equal(created.status, 201, created.text);
  let client = await signin(email);
  assert.equal((await base(client.agent, "get", "/reports")).status, 403);
  const verifyToken = mail
    .find((m) => m.to === email)
    .text.match(/token=([a-f0-9]+)/)[1];
  assert.equal(
    (await base(agent, "post", "/auth/verify").send({ token: verifyToken }))
      .status,
    200,
  );
  assert.equal(
    (await base(agent, "post", "/auth/verify").send({ token: verifyToken }))
      .status,
    400,
  );
  assert.equal((await base(client.agent, "get", "/reports")).status, 200);
  await base(agent, "post", "/auth/forgot").send({ email });
  const resetToken = mail.at(-1).text.match(/token=([a-f0-9]+)/)[1];
  assert.equal(
    (
      await base(agent, "post", "/auth/reset").send({
        token: resetToken,
        password: "different-long-test-passphrase",
      })
    ).status,
    200,
  );
  assert.equal((await base(client.agent, "get", "/auth/me")).status, 401);
  assert.equal(
    (
      await base(agent, "post", "/auth/reset").send({
        token: resetToken,
        password: "another-long-test-passphrase",
      })
    ).status,
    400,
  );
});
test("authenticator challenges and one-time recovery codes are enforced", async () => {
  const setup = await write(clients.farmerB, "post", "/auth/mfa/setup", {
    password,
  });
  assert.equal(setup.status, 200);
  const user = await User.findById(users.farmerB.id).select("+mfaPending");
  const { decrypt } = await import("../src/security.js");
  const hex = decrypt(user.mfaPending, config.APP_SECRET),
    counter = Math.floor(Date.now() / 30000);
  const confirmation = await write(
    clients.farmerB,
    "post",
    "/auth/mfa/confirm",
    { otp: totpAt(hex, counter) },
  );
  assert.equal(confirmation.status, 200, confirmation.text);
  assert.equal(confirmation.body.recoveryCodes.length, 8);
  const agent = request.agent(app);
  let res = await base(agent, "post", "/auth/login").send({
    email: users.farmerB.email,
    password,
  });
  assert.equal(res.body.code, "MFA_REQUIRED");
  const code = confirmation.body.recoveryCodes[0];
  res = await base(agent, "post", "/auth/login").send({
    email: users.farmerB.email,
    password,
    recoveryCode: code,
  });
  assert.equal(res.status, 200);
  res = await base(agent, "post", "/auth/login").send({
    email: users.farmerB.email,
    password,
    recoveryCode: code,
  });
  assert.equal(res.status, 401);
});
test("audio adapter validates WAV and uses the documented Meta multipart schema", async () => {
  const bytes = Buffer.from(
    await encodeWav(new Float32Array(16000)).arrayBuffer(),
  );
  assert.equal(validateWav(bytes).length, 32044);
  assert.throws(() => validateWav(Buffer.from("invalid")));
  const meta = createMeta(config, async (url, options) => {
    assert.equal(url, "https://api.meta.ai/v1/asr/transcribe");
    assert.equal(
      JSON.parse(options.body.get("request")).model,
      "muse-voice-transcribe-1.0",
    );
    return Response.json({
      transcript: "Fixture only.",
      audioDurationMs: 1000,
    });
  });
  assert.equal((await meta.transcribe(bytes)).transcript, "Fixture only.");
});
test("MongoDB rate limits count atomically across requests", async () => {
  const agent = request.agent(app);
  await RateBucket.deleteMany({});
  let response;
  for (let i = 0; i < 13; i++)
    response = await base(agent, "post", "/auth/login").send({
      email: "absent@example.com",
      password: "incorrect",
    });
  assert.equal(response.status, 429);
  assert.ok(response.headers["retry-after"]);
});
