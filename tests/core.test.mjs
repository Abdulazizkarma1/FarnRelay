import test from "node:test";
import assert from "node:assert/strict";
import { evidenceScore, matchingGroups } from "../src/lib.js";
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
