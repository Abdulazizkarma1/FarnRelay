import test from "node:test";
import assert from "node:assert/strict";
import {
  investigationFormat,
  investigate,
} from "../netlify/functions/lib/investigation.js";
import { readMetaJson, createMeta } from "../netlify/functions/lib/meta.js";
const id = "11111111-1111-4111-8111-111111111111";
const brief = {
  summary: "A closer field observation is needed.",
  reported: [{ text: "Marks were reported.", evidenceIds: ["report"] }],
  visible: [{ text: "A leaf is visible.", evidenceIds: [id] }],
  possibilities: [],
  unknowns: ["Cause is unconfirmed."],
  questions: [
    {
      key: "wholePlant",
      question: "Can you add a whole-plant photo?",
      reason: "The current evidence is a close view.",
    },
  ],
  referenceIds: [],
};
test("investigation requests constrained output with real citation IDs and privacy settings", async () => {
  const snapshot = {
    report: { answers: {}, evidenceVersion: 2 },
    evidence: [
      {
        id,
        kind: "photo",
        label: "Close view",
        data: Buffer.from("image"),
        media: { mime: "image/webp" },
      },
    ],
  };
  const r = await investigate(
    snapshot,
    { MODEL_API_KEY: "synthetic" },
    async (_url, init) => {
      const body = JSON.parse(init.body),
        f = body.text.format;
      assert.equal(f.type, "json_schema");
      assert.equal(f.strict, true);
      assert.deepEqual(
        f.schema.properties.visible.items.properties.evidenceIds.items.enum,
        [id],
      );
      assert.deepEqual(
        f.schema.properties.reported.items.properties.evidenceIds.items.enum,
        ["report", "answers", id],
      );
      assert.equal(body.store, false);
      assert.equal(body.reasoning.effort, "low");
      assert.equal(body.max_output_tokens, 4000);
      return Response.json({
        status: "completed",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: JSON.stringify(brief) }],
          },
        ],
      });
    },
  );
  assert.equal(r.brief.summary, brief.summary);
  assert.equal(r.promptVersion, "investigation-v2-schema");
});
test("no-photo requests cannot generate visible observations in the response schema", () => {
  const f = investigationFormat([{ id, kind: "audio" }]);
  assert.equal(f.schema.properties.visible.maxItems, 0);
  assert.equal(
    f.schema.properties.reported.items.properties.evidenceIds.minItems,
    1,
  );
});
test("strict output objects require all fields and reject extra properties", () => {
  const root = investigationFormat([]).schema;
  const inspect = (s) => {
    if (s.type === "object") {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual(
        [...s.required].sort(),
        Object.keys(s.properties).sort(),
      );
      Object.values(s.properties).forEach(inspect);
    }
    if (s.items) inspect(s.items);
  };
  inspect(root);
});
test("provider errors are classified without exposing raw response details", async () => {
  for (const [upstream, status] of [
    [401, 503],
    [403, 503],
    [402, 429],
    [429, 429],
    [503, 502],
  ]) {
    await assert.rejects(
      () =>
        readMetaJson(
          Response.json(
            { error: { message: "secret-provider-debug" } },
            { status: upstream },
          ),
        ),
      (e) => {
        assert.equal(e.status, status);
        assert.match(e.message, new RegExp("HTTP " + upstream));
        assert.doesNotMatch(e.message, /secret-provider-debug/);
        return true;
      },
    );
  }
});
test("successful HTTP responses still reject failed, incomplete or unreadable model output", async () => {
  for (const state of ["failed", "incomplete"])
    await assert.rejects(
      () => readMetaJson(Response.json({ status: state })),
      /Meta/,
    );
  await assert.rejects(
    () => readMetaJson(new Response("not JSON")),
    /unreadable/,
  );
});
test("legacy evidence briefs also use strict output and the default Spark model", async () => {
  const expected = {
    summary: "Observation only.",
    observations: [],
    unknowns: [],
    followupQuestions: [],
  };
  const result = await createMeta(
    { MODEL_API_KEY: "synthetic" },
    async (_url, init) => {
      const b = JSON.parse(init.body);
      assert.equal(b.model, "muse-spark-1.3");
      assert.equal(b.text.format.strict, true);
      return Response.json({ output_text: JSON.stringify(expected) });
    },
  ).brief({ crop: "Maize" });
  assert.equal(result.brief.summary, expected.summary);
});
test("schema enforcement does not weaken validation of invented or non-photo citations", async () => {
  for (const evidenceIds of [["invented"], ["report"]])
    await assert.rejects(
      () =>
        investigate(
          {
            report: { answers: {}, evidenceVersion: 1 },
            evidence: [
              {
                id,
                kind: "photo",
                data: Buffer.from("x"),
                media: { mime: "image/webp" },
              },
            ],
          },
          { MODEL_API_KEY: "synthetic" },
          async () =>
            Response.json({
              output_text: JSON.stringify({
                ...brief,
                visible: [
                  { text: "Unsupported visual assertion", evidenceIds },
                ],
              }),
            }),
        ),
      /untraceable/,
    );
});
