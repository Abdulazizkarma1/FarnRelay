import test from "node:test";
import assert from "node:assert/strict";
import { evidenceScore, matchingGroups } from "../src/lib.js";
import { parseBoxes } from "../netlify/functions/segment.mjs";
import { readObservation } from "../netlify/functions/lib/meta.mjs";
const now = Date.parse("2026-10-26T12:00:00Z");
const report = {
  crop: "Maize",
  community: "Navrongo",
  symptom: "Leaf damage",
  onset: "2026-10-25",
  description: "Small holes on several leaves across three rows.",
  createdAt: "2026-10-25T12:00:00Z",
  status: "Needs review",
  sample: false,
};
test("completeness is a field score and does not award photo points for missing evidence", () => {
  assert.equal(evidenceScore(report), 75);
  assert.equal(
    evidenceScore({ ...report, photoDataUrl: "data:image/jpeg;base64,AAAA" }),
    100,
  );
  assert.equal(evidenceScore({}), 0);
});
test("groups exclude old, closed and sample cross-contamination", () => {
  const list = [
    report,
    { ...report, community: " navrongo " },
    { ...report, sample: true },
    { ...report, createdAt: "2026-10-01T00:00:00Z" },
    { ...report, status: "Closed" },
    { ...report, createdAt: "2026-11-01T00:00:00Z" },
  ];
  assert.equal(matchingGroups(list, now).length, 1);
  assert.equal(matchingGroups(list, now)[0].length, 2);
});
test("SAM parser accepts documented geometry and rejects invalid bounds", () => {
  assert.deepEqual(
    parseBoxes("<0f>0<|box;x1=10;y1=20;x2=50;y2=70;w=100;h=100|>"),
    [{ x1: 10, y1: 20, x2: 50, y2: 70, w: 100, h: 100 }],
  );
  assert.equal(
    parseBoxes("<|box;x1=10;y1=20;x2=150;y2=70;w=100;h=100|>").length,
    0,
  );
  assert.deepEqual(parseBoxes(""), []);
});
test("server rejects unrelated URL values in photo field", async () => {
  await assert.rejects(
    () =>
      readObservation(
        new Request("https://example.com", {
          method: "POST",
          body: JSON.stringify({
            ...report,
            photoDataUrl: "https://example.com/internal",
          }),
        }),
      ),
    /Photo must/,
  );
});
test("reasoning adapter validates and returns an actual upstream response", async () => {
  const { default: analyse } = await import("../netlify/functions/analyse.mjs");
  const originalFetch = global.fetch;
  const originalKey = process.env.MODEL_API_KEY;
  process.env.MODEL_API_KEY = "test-key-not-a-real-secret";
  try {
    global.fetch = async (url, options) => {
      assert.equal(url, "https://api.meta.ai/v1/responses");
      const payload = JSON.parse(options.body);
      assert.equal(payload.model, "muse-spark-1.3");
      assert.equal(payload.input[0].content[0].type, "input_text");
      return Response.json({
        output_text: JSON.stringify({
          summary: "Observed leaf damage",
          observations: ["Reported small holes"],
          unknowns: ["Cause unconfirmed"],
          followupQuestions: ["How many plants?", "When did this begin?"],
        }),
      });
    };
    const response = await analyse(
      new Request("https://example.com", {
        method: "POST",
        body: JSON.stringify(report),
      }),
    );
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.brief.summary, "Observed leaf damage");
    assert.ok(data.elapsedMs >= 0);
  } finally {
    global.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.MODEL_API_KEY;
    else process.env.MODEL_API_KEY = originalKey;
  }
});
