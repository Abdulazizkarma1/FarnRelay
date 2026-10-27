import test from "node:test";
import assert from "node:assert/strict";
import { createReportsHandler } from "../netlify/functions/reports.mjs";
import { sessionCookie, isOfficer } from "../netlify/functions/lib/access.mjs";
import { encodeWav } from "../src/relay.js";
import { validateWav } from "../netlify/functions/transcribe.mjs";
const id = "12345678-1234-1234-1234-123456789012",
  token = "a".repeat(64);
const report = {
  id,
  receiptToken: token,
  crop: "Maize",
  community: "Test community",
  description: "Small holes observed in leaves",
};
function memoryStore() {
  const values = new Map();
  return {
    get: async (key) =>
      values.has(key) ? structuredClone(values.get(key)) : null,
    setJSON: async (key, value, options) => {
      if (!options?.onlyIfNew || !values.has(key))
        values.set(key, structuredClone(value));
    },
    list: async ({ prefix }) => ({
      blobs: [...values.keys()]
        .filter((k) => k.startsWith(prefix))
        .map((key) => ({ key })),
    }),
  };
}
function req(body, cookie = "") {
  return new Request("https://farmrelay.test/.netlify/functions/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify(body),
  });
}
test("private reports persist across independent clients, reject wrong tokens and restrict officer actions", async () => {
  process.env.OFFICER_ACCESS_KEY = "test-only-officer-secret-long-enough";
  const store = memoryStore(),
    handler = createReportsHandler(() => store),
    cookie = sessionCookie().split(";")[0];
  assert.equal(isOfficer(req({}, cookie)), true);
  assert.equal(isOfficer(req({}, cookie + "corrupt")), false);
  assert.equal((await handler(req({ action: "list" }))).status, 401);
  const submitted = await handler(req({ action: "submit", report }));
  assert.equal(submitted.status, 200);
  assert.equal((await submitted.json()).report.receiptHash, undefined);
  assert.equal(
    (await handler(req({ action: "read", id, token: "b".repeat(64) }))).status,
    404,
  );
  assert.equal((await handler(req({ action: "read", id, token }))).status, 200);
  assert.equal(
    (
      await handler(
        req({ action: "transcript", id, token, text: "pretend transcript" }),
      )
    ).status,
    401,
  );
  const answered = await handler(
    req(
      {
        action: "reply",
        id,
        text: "Please send a closer photo.",
        status: "Follow-up needed",
      },
      cookie,
    ),
  );
  assert.equal((await answered.json()).report.events[0].role, "officer");
  await new Promise((resolve) => setTimeout(resolve, 5));
  const reply = await handler(
    req(
      {
        action: "reply",
        actor: "farmer",
        id,
        token,
        text: "I will send a photo tomorrow.",
        status: "Closed",
      },
      cookie,
    ),
  );
  const data = (await reply.json()).report;
  assert.equal(data.events.at(-1).role, "farmer");
  assert.equal(data.status, "Follow-up needed");
  const repeated = await handler(
    req({
      action: "submit",
      report: { ...report, description: "Should not overwrite" },
    }),
  );
  assert.equal((await repeated.json()).report.description, report.description);
  assert.equal(
    (
      await handler(
        req(
          { action: "read", actor: "farmer", id, token: "b".repeat(64) },
          cookie,
        ),
      )
    ).status,
    404,
  );
  const queue = await handler(req({ action: "list" }, cookie));
  assert.equal((await queue.json()).reports.length, 1);
  delete process.env.OFFICER_ACCESS_KEY;
});
test("shared reporting fails closed before officer access is configured", async () => {
  delete process.env.OFFICER_ACCESS_KEY;
  assert.equal(
    (await createReportsHandler(memoryStore)(req({ action: "submit", report })))
      .status,
    503,
  );
});
test("audio conversion emits accepted mono WAV, rejects invalid format and oversize duration", async () => {
  const wav = encodeWav(new Float32Array(16000));
  const bytes = await wav.arrayBuffer();
  assert.equal(validateWav(bytes).length, 32044);
  assert.throws(() => validateWav(Buffer.from("not a WAV")), /WAV/);
  const long = await encodeWav(new Float32Array(480001)).arrayBuffer();
  assert.throws(() => validateWav(long), /30 seconds/);
});
test("voice adapter sends multipart WAV and handles a real-shaped transcript response", async () => {
  process.env.OFFICER_ACCESS_KEY = "test-only-officer-secret-long-enough";
  process.env.MODEL_API_KEY = "test-not-live";
  const cookie = sessionCookie().split(";")[0],
    original = global.fetch;
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, "https://api.meta.ai/v1/asr/transcribe");
      assert.equal(
        JSON.parse(options.body.get("request")).model,
        "muse-voice-transcribe-1.0",
      );
      assert.equal(options.body.get("audio").type, "audio/wav");
      return Response.json({
        transcript: "My maize leaves have holes.",
        audioDurationMs: 1000,
        turns: [],
        sessionId: "fixture",
      });
    };
    const { default: transcribe } =
      await import("../netlify/functions/transcribe.mjs");
    const response = await transcribe(
      new Request("https://farmrelay.test/.netlify/functions/transcribe", {
        method: "POST",
        headers: { cookie },
        body: encodeWav(new Float32Array(16000)),
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(
      (await response.json()).transcript,
      "My maize leaves have holes.",
    );
  } finally {
    global.fetch = original;
    delete process.env.OFFICER_ACCESS_KEY;
    delete process.env.MODEL_API_KEY;
  }
});
