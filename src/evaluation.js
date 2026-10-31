export function evaluateRows(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > 1000)
    throw Error("Provide between 1 and 1,000 evaluation rows.");
  const ids = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object")
      throw Error("Each row must be an object.");
    if (
      typeof row.caseId !== "string" ||
      !row.caseId.trim() ||
      ids.has(row.caseId)
    )
      throw Error("Each row needs a unique caseId.");
    ids.add(row.caseId);
    if (
      typeof row.expected !== "string" ||
      typeof row.predicted !== "string" ||
      !row.expected.trim() ||
      !row.predicted.trim()
    )
      throw Error("Each row needs expected and predicted labels.");
    for (const key of [
      "reviewSeconds",
      "baselineSeconds",
      "elapsedMs",
      "uploadBytes",
    ])
      if (
        row[key] !== undefined &&
        (!Number.isFinite(row[key]) || row[key] < 0)
      )
        throw Error(`${key} must be a non-negative number.`);
    for (const key of ["unsupportedClaim", "abstained", "recoveredUpload"])
      if (row[key] !== undefined && typeof row[key] !== "boolean")
        throw Error(`${key} must be true or false.`);
  }
  const labelled = rows.filter((r) => r.expected !== "unknown"),
    answered = labelled.filter((r) => !r.abstained),
    correct = answered.filter((r) => r.expected === r.predicted).length;
  const median = (key) => {
    const v = rows
      .map((r) => r[key])
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };
  const claims = rows.filter((r) => typeof r.unsupportedClaim === "boolean");
  const uploads = rows.filter((r) => typeof r.recoveredUpload === "boolean");
  return {
    count: rows.length,
    labelled: labelled.length,
    answered: answered.length,
    correct,
    accuracy: answered.length ? correct / answered.length : null,
    coverage: labelled.length ? answered.length / labelled.length : null,
    unsupported: claims.filter((r) => r.unsupportedClaim).length,
    claimReviewed: claims.length,
    recovered: uploads.filter((r) => r.recoveredUpload).length,
    recoveryTested: uploads.length,
    medianReviewSeconds: median("reviewSeconds"),
    medianBaselineSeconds: median("baselineSeconds"),
    medianElapsedMs: median("elapsedMs"),
    medianUploadBytes: median("uploadBytes"),
  };
}
