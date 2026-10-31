import { en } from "../i18n/en.js";
import React, { useState } from "react";
import { evaluateRows } from "../evaluation.js";
import { PageTitle, ErrorNotice, Badge } from "./UI.jsx";
import "./EvaluationPage.css";
const SOURCES = [
  [
    en.legacy.evaluationpage_1001,
    en.legacy.evaluationpage_1002,
    "https://doi.org/10.7910/DVN/CXUMDS",
  ],
  [
    en.legacy.evaluationpage_1003,
    en.legacy.evaluationpage_1004,
    "https://github.com/spMohanty/PlantVillage-Dataset",
  ],
  [
    en.legacy.evaluationpage_1005,
    en.legacy.evaluationpage_1006,
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
        eyebrow={en.legacy.evaluationpage_001}
        title={en.legacy.evaluationpage_002}
        description={en.legacy.evaluationpage_003}
      />
      <div className="evaluation-banner">
        <Badge tone="amber">{en.legacy.evaluationpage_004}</Badge>
        <p>{en.legacy.evaluationpage_005}</p>
      </div>
      <div className="evaluation-columns">
        <section className="surface-card">
          <p className="eyebrow">{en.legacy.evaluationpage_006}</p>
          <h2>{en.legacy.evaluationpage_007}</h2>
          <p>{en.legacy.evaluationpage_008}</p>
          <label className="evaluation-upload">
            {en.legacy.evaluationpage_009}
            <input
              type="file"
              accept="application/json,.json"
              onChange={(e) => load(e.target.files[0])}
            />
          </label>
          <ErrorNotice error={error} />
          {result && (
            <>
              <Badge>{en.legacy.evaluationpage_010}</Badge>
              <div className="evaluation-metrics">
                {[
                  [en.legacy.evaluationpage_011, result.count],
                  [en.legacy.evaluationpage_012, percent(result.accuracy)],
                  [en.legacy.evaluationpage_013, percent(result.coverage)],
                  [
                    en.legacy.evaluationpage_014,
                    `${result.unsupported} / ${result.claimReviewed} reviewed`,
                  ],
                  [
                    en.legacy.evaluationpage_015,
                    `${result.recovered} / ${result.recoveryTested} tested`,
                  ],
                  [
                    en.legacy.evaluationpage_016,
                    result.medianReviewSeconds === null
                      ? en.legacy.evaluationpage_017
                      : result.medianReviewSeconds + "s",
                  ],
                  [
                    en.legacy.evaluationpage_018,
                    result.medianBaselineSeconds === null
                      ? en.legacy.evaluationpage_019
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
                {en.legacy.evaluationpage_020}
              </button>
            </>
          )}
        </section>
        <section className="surface-card">
          <p className="eyebrow">{en.legacy.evaluationpage_021}</p>
          <h2>{en.legacy.evaluationpage_022}</h2>
          {SOURCES.map(([name, note, url]) => (
            <article className="dataset-source" key={name}>
              <a href={url} target="_blank" rel="noreferrer">
                {name}
                {en.legacy.evaluationpage_023}
              </a>
              <p>{note}</p>
            </article>
          ))}
        </section>
      </div>
      <section className="surface-card evaluation-protocol">
        <h2>{en.legacy.evaluationpage_024}</h2>
        <ol>
          <li>{en.legacy.evaluationpage_025}</li>
          <li>{en.legacy.evaluationpage_026}</li>
          <li>{en.legacy.evaluationpage_027}</li>
          <li>{en.legacy.evaluationpage_028}</li>
          <li>{en.legacy.evaluationpage_029}</li>
          <li>{en.legacy.evaluationpage_030}</li>
        </ol>
        <a
          href="https://github.com/Abdulazizkarma1/FarnRelay"
          target="_blank"
          rel="noreferrer"
        >
          {en.legacy.evaluationpage_031}
        </a>
      </section>
    </div>
  );
}
