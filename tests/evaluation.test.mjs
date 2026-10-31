import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateRows } from "../src/evaluation.js";
test("evaluation reports answered accuracy alongside abstention coverage and observed denominators", () => {
  const s = evaluateRows([
    {
      caseId: "a",
      expected: "damage",
      predicted: "damage",
      reviewSeconds: 20,
      unsupportedClaim: false,
    },
    {
      caseId: "b",
      expected: "healthy",
      predicted: "unknown",
      abstained: true,
      reviewSeconds: 40,
    },
    {
      caseId: "c",
      expected: "damage",
      predicted: "healthy",
      recoveredUpload: false,
    },
    { caseId: "d", expected: "unknown", predicted: "unknown" },
  ]);
  assert.equal(s.accuracy, 0.5);
  assert.equal(s.coverage, 2 / 3);
  assert.equal(s.medianReviewSeconds, 30);
  assert.equal(s.claimReviewed, 1);
  assert.equal(s.recoveryTested, 1);
  assert.equal(s.medianBaselineSeconds, null);
});
test("evaluation does not turn missing or invalid observations into measured results", () => {
  const s = evaluateRows([
    {
      caseId: "unknown",
      expected: "unknown",
      predicted: "unknown",
      abstained: true,
    },
  ]);
  assert.equal(s.accuracy, null);
  assert.equal(s.coverage, null);
  for (const rows of [
    [],
    [null],
    [{ caseId: "a", expected: "", predicted: "x" }],
    [{ caseId: "a", expected: "x", predicted: "x", elapsedMs: -1 }],
    [{ caseId: "a", expected: "x", predicted: "x", abstained: "true" }],
    [
      { caseId: "a", expected: "x", predicted: "x" },
      { caseId: "a", expected: "x", predicted: "x" },
    ],
  ])
    assert.throws(() => evaluateRows(rows));
});
