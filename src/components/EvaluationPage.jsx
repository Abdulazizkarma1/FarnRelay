import React, { useState } from "react";
import { evaluateRows } from "../evaluation.js";
import { PageTitle, ErrorNotice, Badge } from "./UI.jsx";
import "./EvaluationPage.css";
const SOURCES = [
  [
    "KaraAgro AI Maize",
    "Ghana-relevant maize examples. Verify files, annotations and grouping before benchmarking.",
    "https://doi.org/10.7910/DVN/CXUMDS",
  ],
  [
    "PlantVillage",
    "Supplementary image checks. Controlled images do not establish field accuracy.",
    "https://github.com/spMohanty/PlantVillage-Dataset",
  ],
  [
    "PlantDoc",
    "Varied imagery for robustness checks. Review provenance and reuse conditions.",
    "https://github.com/pratikkayal/PlantDoc-Dataset",
  ],
];
export default function EvaluationPage() {
  const [rows, setRows] = useState(null),
    [result, setResult] = useState(null),
    [error, setError] = useState("");
  async function load(file) {
    setError("");
    try {
      if (!file || file.size > 1000000)
        throw Error("Choose a JSON file under 1 MB.");
      const parsed = JSON.parse(await file.text());
      const data = Array.isArray(parsed) ? parsed : parsed.rows;
      const summary = evaluateRows(data);
      setRows(data);
      setResult(summary);
    } catch (e) {
      setError(e.message);
    }
  }
  function download() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            scope: "User-imported evaluation; not independently verified",
            summary: result,
            rows,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "farmrelay-evaluation.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const percent = (v) =>
    v === null ? "Not evaluated" : `${(v * 100).toFixed(1)}%`;
  return (
    <div className="evaluation-page">
      <PageTitle
        eyebrow="MEASURE BEFORE YOU CLAIM"
        title="Evidence about the evidence."
        description="A transparent evaluation workspace. Imported results stay in this browser and are never sent to Meta."
      />
      <div className="evaluation-banner">
        <Badge tone="amber">Field validation pending</Badge>
        <p>
          No diagnostic accuracy, crop recovery or farmer adoption result is
          claimed by this release. Software tests verify workflow contracts and
          permissions.
        </p>
      </div>
      <div className="evaluation-columns">
        <section className="surface-card">
          <p className="eyebrow">REPRODUCIBLE BENCHMARK</p>
          <h2>Bring your reviewed results.</h2>
          <p>
            Import a JSON array with unique caseId, expected and predicted
            labels. Optional fields: abstained, unsupportedClaim, reviewSeconds,
            baselineSeconds, elapsedMs, uploadBytes, recoveredUpload.
          </p>
          <label className="evaluation-upload">
            Choose evaluation JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => load(e.target.files[0])}
            />
          </label>
          <ErrorNotice error={error} />
          {result && (
            <>
              <Badge>Imported data / unverified</Badge>
              <div className="evaluation-metrics">
                {[
                  ["Cases", result.count],
                  ["Answered accuracy", percent(result.accuracy)],
                  ["Coverage", percent(result.coverage)],
                  [
                    "Unsupported claims",
                    `${result.unsupported} / ${result.claimReviewed} reviewed`,
                  ],
                  [
                    "Recovered uploads",
                    `${result.recovered} / ${result.recoveryTested} tested`,
                  ],
                  [
                    "Median review time",
                    result.medianReviewSeconds === null
                      ? "Not evaluated"
                      : result.medianReviewSeconds + "s",
                  ],
                  [
                    "Median baseline time",
                    result.medianBaselineSeconds === null
                      ? "Not evaluated"
                      : result.medianBaselineSeconds + "s",
                  ],
                ].map(([k, v]) => (
                  <div key={k}>
                    <small>{k}</small>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
              <button className="button primary" onClick={download}>
                Export evaluation report
              </button>
            </>
          )}
        </section>
        <section className="surface-card">
          <p className="eyebrow">DATASET REGISTER</p>
          <h2>Sources and limitations</h2>
          {SOURCES.map(([name, note, url]) => (
            <article className="dataset-source" key={name}>
              <a href={url} target="_blank" rel="noreferrer">
                {name} ↗
              </a>
              <p>{note}</p>
            </article>
          ))}
        </section>
      </div>
      <section className="surface-card evaluation-protocol">
        <h2>Evaluation protocol</h2>
        <ol>
          <li>
            Separate development cases from final evaluation. Keep related
            photographs together.
          </li>
          <li>
            Compare the same reporting task with a basic photo-and-message
            baseline. Counterbalance reviewer order.
          </li>
          <li>
            Include unclear images and unsupported inputs. Report coverage
            alongside accuracy.
          </li>
          <li>
            Have a qualified reviewer assess unsupported claims and advice.
            Record disagreements.
          </li>
          <li>
            Record model and prompt versions, sample size, latency and upload
            conditions.
          </li>
          <li>
            Publish failures and limitations. Public datasets may have appeared
            in foundation-model training.
          </li>
        </ol>
        <a
          href="https://github.com/Abdulazizkarma1/FarnRelay"
          target="_blank"
          rel="noreferrer"
        >
          Source code and verification documentation ↗
        </a>
      </section>
    </div>
  );
}
