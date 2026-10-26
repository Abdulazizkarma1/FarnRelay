import React, { useEffect, useState } from "react";
import ReportForm from "./components/ReportForm.jsx";
import EvidenceLab from "./components/EvidenceLab.jsx";
import {
  photos,
  readReports,
  writeReport,
  evidenceScore,
  matchingGroups,
  shortDate,
  statuses,
} from "./lib.js";
import "./App.css";
function Mark() {
  return (
    <svg
      className="brand-mark"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M7 26V9l9-5 9 5v17M7 14l9-5 9 5M7 20l9-5 9 5M16 15v13"
        stroke="currentColor"
        strokeWidth="2.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function NavIcon({ type }) {
  const paths = {
    overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    reports: "M5 3h14v18H5z M8 8h8 M8 12h8 M8 16h5",
    lab: "M8 3h8 M10 3v7L4 20h16l-6-10V3 M8 15h8",
    signals: "M3 12h4l3-7 4 14 3-7h4",
    integrations: "M8 3v5M16 3v5M6 8h12v3a6 6 0 0 1-12 0zM12 17v5",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[type]} />
    </svg>
  );
}
export default function App() {
  const [reports, setReports] = useState([]);
  const [view, setView] = useState("overview");
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [configured, setConfigured] = useState(null);
  const [filter, setFilter] = useState("All reports");
  const [query, setQuery] = useState("");
  useEffect(() => {
    readReports()
      .then((r) => {
        setReports(r);
        setLoaded(true);
      })
      .catch(() => {
        setMessage(
          "Browser storage is unavailable. Enable site storage before saving a report.",
        );
        setLoaded(true);
      });
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    fetch("/.netlify/functions/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setConfigured(d.configured);
      })
      .catch(() => {});
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  const selected = reports.find((r) => r.id === selectedId);
  const groups = matchingGroups(reports);
  const average = reports.length
    ? Math.round(
        reports.reduce((sum, r) => sum + evidenceScore(r), 0) / reports.length,
      )
    : 0;
  function navigate(page) {
    setView(page);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function inspect(r) {
    setSelectedId(r.id);
    navigate("lab");
  }
  async function save(report) {
    await writeReport(report);
    setReports((current) => [
      report,
      ...current.filter((r) => r.id !== report.id),
    ]);
    setSelectedId(report.id);
    navigate("lab");
  }
  async function update(report) {
    await writeReport(report);
    setReports((current) =>
      current.map((r) => (r.id === report.id ? report : r)),
    );
  }
  const visible = reports.filter(
    (r) =>
      (filter === "All reports" ||
        (filter === "My reports" ? !r.sample : r.status === filter)) &&
      [r.crop, r.community, r.description]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const titles = {
    overview: ["FIELD INTELLIGENCE", "A clearer view. A better response."],
    reports: ["OBSERVATION REGISTER", "Every field has a story."],
    signals: ["PATTERN REVIEW", "Connect the observations."],
    lab: ["META AI WORKBENCH", "Look closer. Understand more."],
    new: ["NEW OBSERVATION", "Bring the field into focus."],
    integrations: ["WORKSPACE SETTINGS", "Connected intelligence."],
  };
  function table(items) {
    return (
      <div className="report-table">
        <div className="table-head">
          <span>Crop observation</span>
          <span>Community</span>
          <span>Evidence</span>
          <span>Review status</span>
          <span />
        </div>
        {items.map((r) => (
          <button className="report-row" key={r.id} onClick={() => inspect(r)}>
            <span className="report-main">
              {r.photoDataUrl ? (
                <img
                  className="report-thumb"
                  src={r.photoDataUrl}
                  alt="Uploaded crop"
                />
              ) : (
                <span className="report-initial">
                  {r.crop.slice(0, 2).toUpperCase()}
                </span>
              )}
              <span>
                <strong>
                  {r.crop} <span className="row-symptom">/ {r.symptom}</span>
                </strong>
                <small>
                  {shortDate(r.createdAt)} ·{" "}
                  {r.sample ? "Synthetic sample" : "Your report"}
                </small>
              </span>
            </span>
            <span className="community-cell">{r.community}</span>
            <span className="evidence-cell">
              <b>
                {evidenceScore(r)}
                <small>/100</small>
              </b>
              <span className="mini-progress">
                <i style={{ width: evidenceScore(r) + "%" }} />
              </span>
            </span>
            <span>
              <span
                className={
                  "status-pill " +
                  (r.status === "In review"
                    ? "in-review"
                    : r.status === "Closed"
                      ? "closed"
                      : "")
                }
              >
                {r.status}
              </span>
            </span>
            <span className="row-arrow">↗</span>
          </button>
        ))}
        {!items.length && (
          <div className="empty-state">
            <h3>No reports here yet.</h3>
            <p>Try a different filter or add your first observation.</p>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <Mark />
          <span>
            FarmRelay<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="workspace-label">
          <span className="workspace-avatar">FR</span>
          <div>
            Field workspace<small>Ghana · Local prototype</small>
          </div>
          <span>⌄</span>
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav aria-label="Main navigation">
          {[
            ["overview", "Overview"],
            ["reports", "Crop reports"],
            ["lab", "Evidence Lab"],
            ["signals", "Possible clusters"],
          ].map(([id, label]) => (
            <button
              key={id}
              onClick={() => navigate(id)}
              className={view === id ? "active" : ""}
            >
              <NavIcon type={id} />
              {label}
              {id === "lab" && <span className="ai-label">AI</span>}
              {id === "reports" && (
                <span className="nav-count">{reports.length}</span>
              )}
            </button>
          ))}
        </nav>
        <p className="nav-label tools-label">TOOLS</p>
        <nav>
          <button
            className={view === "integrations" ? "active" : ""}
            onClick={() => navigate("integrations")}
          >
            <NavIcon type="integrations" />
            Integrations
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="meta-mini">
            <span className="meta-symbol">∞</span>
            <div>
              Built with Meta AI<small>Muse Spark + SAM 3.1</small>
            </div>
          </div>
          <div className="device-note">
            <span className="live-dot" />
            <div>
              Local browser storage
              <small>Your reports stay on this device.</small>
            </div>
          </div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>
              {view === "new"
                ? "New report"
                : view === "lab"
                  ? "Evidence Lab"
                  : view.charAt(0).toUpperCase() + view.slice(1)}
            </strong>
          </div>
          <div className="topbar-right">
            <span className={"connection " + (!online ? "offline" : "")}>
              <i />
              {online ? "Online" : "Offline"}
            </span>
            <span className="avatar">FR</span>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">{titles[view][0]}</p>
              <h1>{titles[view][1]}</h1>
              <p className="page-subtitle">
                {view === "overview"
                  ? "Turn field observations into evidence that people can act on."
                  : view === "lab"
                    ? "Real inputs. Visible model steps. Human judgement."
                    : view === "reports"
                      ? "Capture, organise and follow up on crop concerns."
                      : view === "signals"
                        ? "Review similar reports together before drawing conclusions."
                        : view === "new"
                          ? "A few useful details can start a better conversation."
                          : "Manage the services that power your evidence workflow."}
              </p>
            </div>
            {view !== "new" && (
              <button
                className="button primary"
                onClick={() => navigate("new")}
              >
                <span>+</span> New observation
              </button>
            )}
          </div>
          {message && (
            <div className="notice" role="alert">
              {message}
              <button
                aria-label="Dismiss notification"
                onClick={() => setMessage("")}
              >
                ×
              </button>
            </div>
          )}
          {view === "overview" && (
            <>
              <section className="hero">
                <img
                  src={photos.landscape}
                  alt="Cultivated green landscape in soft sunlight"
                />
                <div className="hero-shade" />
                <div className="hero-content">
                  <span className="hero-kicker">
                    <i /> FROM FIELD TO FOLLOW-UP
                  </span>
                  <h2>
                    Small observations.
                    <br />
                    <em>A bigger picture.</em>
                  </h2>
                  <p>
                    Capture what changed. Bring the evidence together.
                    <br className="desktop-break" /> Help the right people take
                    a closer look.
                  </p>
                  <button
                    className="button light"
                    onClick={() => navigate("new")}
                  >
                    Record an observation <span>↗</span>
                  </button>
                </div>
                <div className="hero-corner">
                  <span>01 / OBSERVE</span>
                  <span>02 / UNDERSTAND</span>
                  <span>03 / REVIEW</span>
                </div>
                <small className="photo-credit">
                  Illustrative landscape · Unsplash
                </small>
              </section>
              <section className="metrics">
                <article>
                  <span>Recorded observations</span>
                  <div>
                    <b>{reports.length.toString().padStart(2, "0")}</b>
                    <small>on this device</small>
                  </div>
                  <p>
                    <i className="metric-dot" />
                    {reports.filter((r) => !r.sample).length} personal ·{" "}
                    {reports.filter((r) => r.sample).length} synthetic
                  </p>
                </article>
                <article>
                  <span>Awaiting a closer look</span>
                  <div>
                    <b>
                      {reports
                        .filter((r) => r.status === "Needs review")
                        .length.toString()
                        .padStart(2, "0")}
                    </b>
                    <small>needs review</small>
                  </div>
                  <p>
                    <i className="metric-dot amber" />
                    Prioritise a human review
                  </p>
                </article>
                <article>
                  <span>Average report completeness</span>
                  <div>
                    <b>
                      {average}
                      <sup>%</sup>
                    </b>
                    <small>six-field checklist</small>
                  </div>
                  <div className="metric-progress">
                    <i style={{ width: average + "%" }} />
                  </div>
                </article>
                <article>
                  <span>Possible report groups</span>
                  <div>
                    <b>{groups.length.toString().padStart(2, "0")}</b>
                    <small>in the last 7 days</small>
                  </div>
                  <p>
                    <i className="metric-dot" />
                    Patterns to inspect, not outbreaks
                  </p>
                </article>
              </section>
              <div className="dashboard-grid">
                <section className="recent-section">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">THE LATEST FROM YOUR WORKSPACE</p>
                      <h2>Recent observations</h2>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => navigate("reports")}
                    >
                      View all ↗
                    </button>
                  </div>
                  {loaded ? (
                    table(reports.slice(0, 4))
                  ) : (
                    <div className="loading-panel">Loading observations...</div>
                  )}
                </section>
                <aside className="intelligence-card">
                  <div className="intelligence-photo">
                    <img
                      src={photos.tomatoes}
                      alt="Fresh tomatoes used as an illustrative crop photograph"
                    />
                    <span>EXPLORE / EVIDENCE LAB</span>
                  </div>
                  <div className="intelligence-body">
                    <span className="meta-symbol">∞</span>
                    <h3>
                      See what the
                      <br />
                      models actually see.
                    </h3>
                    <p>
                      Upload your photo. Inspect plant regions with SAM. Read
                      the questions Muse Spark thinks are missing.
                    </p>
                    <button
                      className="button outline"
                      onClick={() => navigate("lab")}
                    >
                      Open Evidence Lab <span>↗</span>
                    </button>
                    <small>Illustrative crop photo, not report evidence.</small>
                  </div>
                </aside>
              </div>
              <section className="method-strip">
                <div>
                  <span>01</span>
                  <p>
                    <strong>Capture evidence</strong>Photo and field context
                  </p>
                </div>
                <div>
                  <span>02</span>
                  <p>
                    <strong>Inspect the signal</strong>Model output you can
                    examine
                  </p>
                </div>
                <div>
                  <span>03</span>
                  <p>
                    <strong>Keep people in charge</strong>Review, question and
                    follow up
                  </p>
                </div>
              </section>
            </>
          )}
          {view === "reports" && (
            <>
              <div className="filters">
                <div className="filter-tabs">
                  {[
                    "All reports",
                    "My reports",
                    "Needs review",
                    "In review",
                  ].map((f) => (
                    <button
                      className={filter === f ? "selected" : ""}
                      key={f}
                      onClick={() => setFilter(f)}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <input
                  aria-label="Search reports"
                  placeholder="Search crop or community..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              {table(visible)}
              <p className="data-note">
                Synthetic records demonstrate the workflow. Your own
                observations are labelled separately and saved in this browser.
              </p>
            </>
          )}
          {view === "new" && (
            <ReportForm onSave={save} onCancel={() => navigate("overview")} />
          )}
          {view === "lab" &&
            (selected ? (
              <>
                <div className="lab-selector">
                  <button
                    className="text-button"
                    onClick={() => setSelectedId(null)}
                  >
                    ← Choose another report
                  </button>
                </div>
                <EvidenceLab
                  key={selected.id}
                  report={selected}
                  onUpdate={update}
                  configured={configured}
                  onSetup={() => navigate("integrations")}
                />
              </>
            ) : (
              <>
                <div className="lab-welcome">
                  <div>
                    <span className="pill green">MUSE SPARK + SAM 3.1</span>
                    <h2>
                      Follow the evidence.
                      <br />
                      Inspect the reasoning.
                    </h2>
                    <p>
                      Choose an observation below, or start with a fresh crop
                      photo. The lab shows live model responses, request timing
                      and the source report.
                    </p>
                    <button
                      className="button primary"
                      onClick={() => navigate("new")}
                    >
                      Add your own photo <span>↗</span>
                    </button>
                  </div>
                  <div className="lab-diagram">
                    <div>
                      <b>01</b>
                      <span>
                        YOUR EVIDENCE<small>Photo + field context</small>
                      </span>
                    </div>
                    <div>
                      <b>02</b>
                      <span>
                        SAM 3.1<small>Plant region localization</small>
                      </span>
                    </div>
                    <div>
                      <b>03</b>
                      <span>
                        MUSE SPARK<small>Brief + follow-up questions</small>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="section-heading">
                  <h2>Select an observation</h2>
                  <span className="secondary">
                    Sample reports have no attached crop photo.
                  </span>
                </div>
                {table(reports)}
              </>
            ))}
          {view === "signals" && (
            <>
              <div className="signal-explainer">
                <span className="pill green">EXPLAINABLE GROUPING</span>
                <h2>A shared symptom is a reason to look closer.</h2>
                <p>
                  Reports are grouped only when crop, community and symptom
                  match within the last seven days. Closed reports are excluded.
                  Synthetic and personal records never mix.
                </p>
                <div className="rule-tags">
                  <span>Same crop</span>
                  <span>Same community</span>
                  <span>Same symptom</span>
                  <span>Within 7 days</span>
                  <span>2+ reports</span>
                </div>
              </div>
              <div className="signal-grid">
                {groups.map((g, i) => (
                  <article className="signal-card" key={i}>
                    <div className="section-heading">
                      <span className="pill amber">POSSIBLE GROUP</span>
                      <span className="mono">0{i + 1}</span>
                    </div>
                    <h2>{g[0].community}</h2>
                    <p>
                      {g[0].crop} · {g[0].symptom}
                    </p>
                    <div className="signal-number">
                      <b>{g.length}</b>
                      <span>
                        matching observations
                        <br />
                        awaiting interpretation
                      </span>
                    </div>
                    {g.map((r) => (
                      <button
                        className="signal-report"
                        key={r.id}
                        onClick={() => inspect(r)}
                      >
                        <span>
                          {shortDate(r.createdAt)} · {r.status}
                        </span>
                        <span>Inspect ↗</span>
                      </button>
                    ))}
                    <small>
                      {g[0].sample ? "Synthetic demonstration. " : ""}No
                      location coordinates or spread prediction are used.
                    </small>
                  </article>
                ))}
                {groups.length === 0 && (
                  <div className="empty-state">
                    <h3>No matching groups yet.</h3>
                    <p>
                      Groups appear when at least two eligible reports share the
                      same crop, community and symptom.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
          {view === "integrations" && (
            <div className="settings-grid">
              <section className="settings-panel">
                <div className="section-heading">
                  <span className="meta-symbol">∞</span>
                  <span className={"pill " + (configured ? "green" : "amber")}>
                    {configured
                      ? "Key configured"
                      : configured === false
                        ? "Setup required"
                        : "Connection not checked"}
                  </span>
                </div>
                <h2>Meta Model API</h2>
                <p>
                  Model calls run through Netlify Functions. Your secret key is
                  never included in browser code.
                </p>
                <div className="integration-row">
                  <div>
                    <strong>Muse Spark</strong>
                    <small>
                      Structured observations and useful follow-up questions
                    </small>
                  </div>
                  <span className="pill green">Implemented</span>
                </div>
                <div className="integration-row">
                  <div>
                    <strong>SAM 3.1</strong>
                    <small>Plant localization from your uploaded image</small>
                  </div>
                  <span className="pill green">Implemented</span>
                </div>
                <div className="integration-row">
                  <div>
                    <strong>Voice transcription</strong>
                    <small>
                      Language support and recording flow still to be built
                    </small>
                  </div>
                  <span className="pill">Planned</span>
                </div>
                <h3>Connect on Netlify</h3>
                <ol>
                  <li>
                    Add <code>MODEL_API_KEY</code> to your Netlify environment
                    variables.
                  </li>
                  <li>
                    Optionally set <code>META_MODEL</code>. Default:{" "}
                    <code>muse-spark-1.3</code>.
                  </li>
                  <li>
                    Redeploy, upload a crop photo and open the Evidence Lab.
                  </li>
                </ol>
                <p className="data-note">
                  A configured key does not guarantee model access or available
                  credits. Errors appear in the lab. Add authentication and rate
                  limits before offering public AI access.
                </p>
              </section>
              <section className="settings-panel">
                <p className="eyebrow">WHAT THIS BUILD DOES</p>
                <h2>Honest by design.</h2>
                <ul className="capability-list">
                  <li>
                    <b>Report storage</b>
                    <span>
                      IndexedDB on this browser. Not a shared officer database.
                    </span>
                  </li>
                  <li>
                    <b>Photo preparation</b>
                    <span>
                      JPG, PNG and WebP resized to a maximum of 1200 pixels.
                      Converted to JPEG before upload.
                    </span>
                  </li>
                  <li>
                    <b>Evidence score</b>
                    <span>
                      Six weighted fields. A completeness measure, not
                      diagnostic certainty.
                    </span>
                  </li>
                  <li>
                    <b>Model output</b>
                    <span>
                      Only successful API responses are displayed as AI results.
                    </span>
                  </li>
                  <li>
                    <b>Offline behaviour</b>
                    <span>
                      An already loaded page can save reports. Offline page
                      reopening and server sync are not implemented.
                    </span>
                  </li>
                  <li>
                    <b>Sample records</b>
                    <span>
                      Clearly labelled synthetic observations. Stock photography
                      is illustrative only.
                    </span>
                  </li>
                </ul>
              </section>
            </div>
          )}
          <footer className="footer">
            <span>
              <Mark /> FarmRelay <span className="footer-divider">/</span> Built
              for better field conversations.
            </span>
            <span>Human-reviewed by design · v0.2</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
