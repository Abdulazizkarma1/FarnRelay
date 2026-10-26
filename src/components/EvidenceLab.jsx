import React, { useState, useEffect } from "react";
import { evidenceChecks, evidenceScore, requestAI, statuses } from "../lib.js";
import "./EvidenceLab.css";
export default function EvidenceLab({ report, onUpdate, configured, onSetup }) {
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState(report.analysis?.steps || []);
  const [result, setResult] = useState(report.analysis || null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("brief");
  const [boxesOn, setBoxesOn] = useState(true);
  useEffect(() => {
    setSteps(report.analysis?.steps || []);
    setResult(report.analysis || null);
    setError("");
  }, [report.id]);
  async function run() {
    setBusy(true);
    setError("");
    setResult(null);
    const trace = [
      {
        name: "Report checks",
        model: "Local validation",
        status: "done",
        detail: `${evidenceScore(report)}/100 report completeness`,
      },
      {
        name: "Plant localization",
        model: "SAM 3.1",
        status: report.photoDataUrl ? "waiting" : "skipped",
        detail: report.photoDataUrl
          ? "Waiting to send photo"
          : "No photo attached",
      },
      {
        name: "Evidence brief",
        model: "Muse Spark",
        status: "waiting",
        detail: "Waiting for request",
      },
    ];
    setSteps([...trace]);
    let segmentation = null,
      reasoning = null;
    if (report.photoDataUrl) {
      trace[1] = {
        ...trace[1],
        status: "running",
        detail: "Locating plant leaves in your photo",
      };
      setSteps([...trace]);
      try {
        segmentation = await requestAI("segment", report);
        trace[1] = {
          ...trace[1],
          status: "done",
          detail: `${segmentation.boxes.length} region(s) returned`,
          ms: segmentation.elapsedMs,
        };
      } catch (e) {
        trace[1] = { ...trace[1], status: "error", detail: e.message };
      }
      setSteps([...trace]);
    }
    trace[2] = {
      ...trace[2],
      status: "running",
      detail: "Organising observations and follow-up questions",
    };
    setSteps([...trace]);
    try {
      reasoning = await requestAI("analyse", report);
      trace[2] = {
        ...trace[2],
        status: "done",
        detail: "Draft ready for human review",
        ms: reasoning.elapsedMs,
      };
    } catch (e) {
      trace[2] = { ...trace[2], status: "error", detail: e.message };
    }
    const analysis = {
      steps: trace,
      segmentation,
      reasoning,
      createdAt: new Date().toISOString(),
    };
    setSteps([...trace]);
    setResult(analysis);
    try {
      await onUpdate({ ...report, analysis });
    } catch (e) {
      setError("Analysis returned, but could not be saved: " + e.message);
    } finally {
      setBusy(false);
    }
  }
  const score = evidenceScore(report);
  const boxes = result?.segmentation?.boxes || [];
  const brief = result?.reasoning?.brief;
  return (
    <div className="lab">
      <div className="lab-topline">
        <div>
          <span className="pill">
            {report.sample ? "Synthetic sample" : "Your observation"}
          </span>
          <span className="mono lab-id">{report.id.slice(0, 12)}</span>
        </div>
        <label>
          Review status
          <select
            aria-label="Review status"
            value={report.status}
            disabled={busy}
            onChange={async (e) => {
              try {
                await onUpdate({ ...report, status: e.target.value });
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="lab-grid">
        <section className="evidence-column">
          <div className="panel-title">
            <h3>Visual evidence</h3>
            <span className="mono">01 / INPUT</span>
          </div>
          <div className="evidence-image">
            {report.photoDataUrl ? (
              <>
                <img
                  src={report.photoDataUrl}
                  alt={`${report.crop} observation submitted by the user`}
                />
                {boxesOn &&
                  boxes.map((b, i) => (
                    <div
                      className="region-box"
                      key={i}
                      style={{
                        left: (100 * b.x1) / b.w + "%",
                        top: (100 * b.y1) / b.h + "%",
                        width: (100 * (b.x2 - b.x1)) / b.w + "%",
                        height: (100 * (b.y2 - b.y1)) / b.h + "%",
                      }}
                    >
                      <span>REGION {i + 1}</span>
                    </div>
                  ))}
                {busy && <div className="scan-line" />}
              </>
            ) : (
              <div className="no-evidence">
                <div className="frame-corners" />
                <span>NO PHOTO ATTACHED</span>
                <p>
                  This report uses text observations.
                  <br />
                  SAM runs only on an uploaded photo.
                </p>
              </div>
            )}
          </div>
          {report.photoDataUrl && (
            <div className="image-caption">
              <span>
                {report.photoWidth} × {report.photoHeight} px ·{" "}
                {Math.round(report.photoBytes / 1024)} KB
              </span>
              {boxes.length > 0 && (
                <button
                  className="text-button"
                  onClick={() => setBoxesOn(!boxesOn)}
                >
                  {boxesOn ? "Hide" : "Show"} regions
                </button>
              )}
            </div>
          )}
          {result?.segmentation && (
            <p className="model-note">
              SAM object boxes are shown. These locate plant regions, not
              disease. Pixel masks are not rendered in this version.
            </p>
          )}
          <div className="observation">
            <p className="eyebrow">FARMER OBSERVATION</p>
            <h3>
              {report.crop} in {report.community}
            </h3>
            <p>{report.description}</p>
            <div>
              <span>{report.symptom}</span>
              <span>First noticed: {report.onset || "Not recorded"}</span>
            </div>
          </div>
          <div className="score-panel">
            <div className="score-ring" style={{ "--score": score + "%" }}>
              <div>
                <b>{score}</b>
                <span>/100</span>
              </div>
            </div>
            <div>
              <h3>Report completeness</h3>
              <p>
                A transparent field checklist.
                <br />
                Not AI confidence or disease risk.
              </p>
            </div>
          </div>
          <details className="score-details">
            <summary>How this score is calculated</summary>
            {evidenceChecks(report).map((c) => (
              <div key={c.label}>
                <span>
                  {c.passed ? "✓" : "○"} {c.label}
                </span>
                <b>
                  {c.passed ? c.weight : 0}/{c.weight}
                </b>
              </div>
            ))}
          </details>
        </section>
        <section className="analysis-column">
          <div className="panel-title">
            <h3>AI workbench</h3>
            <span className="pill green">META MODEL API</span>
          </div>
          <div className="pipeline-intro">
            <h2>
              From observation
              <br />
              to actionable questions.
            </h2>
            <p>
              Inspect each model's contribution. Every output remains a draft
              for an extension officer.
            </p>
            <button
              className="button primary"
              onClick={configured === false ? onSetup : run}
              disabled={busy}
            >
              {busy ? (
                <>
                  <span className="spinner" /> Models working...
                </>
              ) : configured === false ? (
                "Configure Meta connection"
              ) : (
                "Run evidence analysis"
              )}{" "}
              {!busy && <span>↗</span>}
            </button>
            <small>
              Running analysis sends this report and its photo to Meta.
            </small>
          </div>
          <div className="pipeline">
            {(steps.length
              ? steps
              : [
                  {
                    name: "Report checks",
                    model: "Local validation",
                    status: "ready",
                    detail: "Check the evidence fields",
                  },
                  {
                    name: "Plant localization",
                    model: "SAM 3.1",
                    status: "ready",
                    detail: "Find leaf regions in the photo",
                  },
                  {
                    name: "Evidence brief",
                    model: "Muse Spark",
                    status: "ready",
                    detail: "Structure observations and useful questions",
                  },
                ]
            ).map((s, i) => (
              <div className={"pipeline-step " + s.status} key={s.name}>
                <div className="step-dot">
                  {s.status === "done" ? (
                    "✓"
                  ) : s.status === "error" ? (
                    "!"
                  ) : s.status === "running" ? (
                    <span className="spinner" />
                  ) : (
                    i + 1
                  )}
                </div>
                <div>
                  <strong>
                    {s.name}
                    <span>{s.model}</span>
                  </strong>
                  <p>{s.detail}</p>
                </div>
                <small className="mono">
                  {s.ms !== undefined
                    ? `${(s.ms / 1000).toFixed(1)}s`
                    : s.status}
                </small>
              </div>
            ))}
          </div>
          <div className="lab-tabs">
            <button
              className={tab === "brief" ? "selected" : ""}
              onClick={() => setTab("brief")}
            >
              Review brief
            </button>
            <button
              className={tab === "trace" ? "selected" : ""}
              onClick={() => setTab("trace")}
            >
              Technical trace
            </button>
          </div>
          {tab === "brief" ? (
            brief ? (
              <div className="brief-output">
                <span className="eyebrow">
                  AI DRAFT / HUMAN REVIEW REQUIRED
                </span>
                <h3>{brief.summary}</h3>
                <h4>Recorded observations</h4>
                <ul>
                  {brief.observations.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
                <h4>What is still unknown</h4>
                <ul>
                  {brief.unknowns.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
                <h4>Ask next</h4>
                {brief.followupQuestions.map((q, i) => (
                  <div className="question" key={i}>
                    <b>0{i + 1}</b>
                    <p>{q}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-output">
                <span className="output-symbol">⌁</span>
                <h3>Your evidence brief will appear here.</h3>
                <p>
                  Run analysis to see live model output. No generated results
                  are displayed before a successful response.
                </p>
              </div>
            )
          ) : (
            <div className="trace-output">
              <dl>
                <dt>Runtime</dt>
                <dd>Netlify Functions</dd>
                <dt>Reasoning model</dt>
                <dd>{result?.reasoning?.model || "Not called"}</dd>
                <dt>Vision model</dt>
                <dd>{result?.segmentation?.model || "Not called"}</dd>
                <dt>SAM object boxes</dt>
                <dd>{result?.segmentation ? boxes.length : "Not measured"}</dd>
                <dt>Mask tokens returned</dt>
                <dd>{result?.segmentation?.maskCount ?? "Not measured"}</dd>
                <dt>Analysis recorded</dt>
                <dd>
                  {result?.createdAt
                    ? new Date(result.createdAt).toLocaleString()
                    : "Not run"}
                </dd>
              </dl>
              <p>
                Timing is measured server-side around each API call.
                Completeness is calculated locally from six fields. Matching
                groups use community, crop, symptom and a seven-day window.
              </p>
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
