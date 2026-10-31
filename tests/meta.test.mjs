import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../netlify/functions/meta.js";
import {
  validateWav,
  parseBoxes,
  createMeta,
} from "../netlify/functions/lib/meta.js";
import { encodeWav } from "../src/relay.js";
const id = "00000000-0000-4000-8000-000000000001";
const env = {
  APP_ORIGIN: "https://app.example",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "public-test",
  SUPABASE_SECRET_KEY: "private-test",
  MODEL_API_KEY: "meta-test",
  META_MODEL: "muse-spark-1.3",
};
function req(overrides = {}) {
  return new Request("https://app.example/.netlify/functions/meta", {
    method: "POST",
    headers: {
      Origin: env.APP_ORIGIN,
      Authorization: "Bearer test-token",
      "X-Report-Id": id,
      "X-AI-Action": "brief",
      ...overrides,
    },
  });
}
test("AI function rejects cross-origin, missing credentials and unsupported actions", async () => {
  const h = createHandler({ env });
  assert.equal(
    (await h(req({ Origin: "https://attacker.example" }))).status,
    403,
  );
  assert.equal((await h(req({ Authorization: "" }))).status, 401);
  assert.equal((await h(req({ "X-AI-Action": "write-user" }))).status, 400);
  assert.equal(
    (await createHandler({ env: { APP_ORIGIN: env.APP_ORIGIN } })(req()))
      .status,
    503,
  );
});
test("AI function uses caller authorization before making any paid request", async () => {
  let called = false;
  const h = createHandler({
    env,
    clientFactory: () => ({
      rpc: async () => ({ error: { message: "Access denied" } }),
    }),
    fetcher: async () => {
      called = true;
      throw Error("unreachable");
    },
  });
  const res = await h(req());
  assert.equal(res.status, 403);
  assert.equal(called, false);
  assert.doesNotMatch(await res.text(), /private-test|meta-test/);
});
test("AI output is saved with server-only credentials and the original access version", async () => {
  let saved;
  const h = createHandler({
    env,
    clientFactory: (url, key, opts) => {
      if (key === "public-test") {
        assert.equal(opts.global.headers.Authorization, "Bearer test-token");
        return {
          rpc: async () => ({
            data: {
              report: { crop: "Maize" },
              actor: id,
              sessionId: id,
              accessVersion: 3,
            },
          }),
        };
      }
      assert.equal(key, "private-test");
      return {
        rpc: async (name, args) => {
          saved = { name, args };
          return { error: null };
        },
      };
    },
    fetcher: async (url, opts) => {
      assert.equal(url, "https://api.meta.ai/v1/responses");
      assert.equal(opts.headers.Authorization, "Bearer meta-test");
      return Response.json({
        output_text: JSON.stringify({
          summary: "Test observation",
          observations: [],
          unknowns: ["Cause unknown"],
          followupQuestions: [],
        }),
      });
    },
  });
  const res = await h(req());
  assert.equal(res.status, 200);
  assert.equal(saved.name, "farmrelay_save_ai");
  assert.equal(saved.args.p_access_version, 3);
  assert.equal((await res.json()).result.brief.summary, "Test observation");
});
test("failed result persistence is reported instead of pretending the report was updated", async () => {
  let i = 0;
  const h = createHandler({
    env,
    clientFactory: () => ({
      rpc: async () =>
        ++i === 1
          ? {
              data: {
                report: { crop: "Maize" },
                actor: id,
                sessionId: id,
                accessVersion: 0,
              },
            }
          : { error: { message: "Revoked" } },
    }),
    fetcher: async () =>
      Response.json({
        output_text: JSON.stringify({
          summary: "Test",
          observations: [],
          unknowns: [],
          followupQuestions: [],
        }),
      }),
  });
  assert.equal((await h(req())).status, 409);
});
test("WAV conversion and SAM geometry validation reject malformed evidence", async () => {
  validateWav(
    Buffer.from(await encodeWav(new Float32Array(16000)).arrayBuffer()),
  );
  assert.throws(() => validateWav(Buffer.from("wrong")));
  assert.equal(
    parseBoxes("<|box;x1=0;y1=0;x2=200;y2=100;w=100;h=100|>").length,
    0,
  );
  assert.equal(
    parseBoxes("<|box;x1=0;y1=0;x2=20;y2=20;w=100;h=100|>").length,
    1,
  );
  await assert.rejects(() => createMeta({}).brief({}), /configured/);
});
