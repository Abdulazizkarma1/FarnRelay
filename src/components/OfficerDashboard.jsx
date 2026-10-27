import React, { useEffect, useState } from "react";
import { api } from "../relay.js";
import { shortDate, matchingGroups } from "../lib.js";
import EvidenceLab from "./EvidenceLab.jsx";
import CaseThread from "./CaseThread.jsx";
import "./OfficerDashboard.css";
export default function OfficerDashboard() {
  const [authenticated, setAuthenticated] = useState(false),
    [checked, setChecked] = useState(false),
    [key, setKey] = useState(""),
    [reports, setReports] = useState([]),
    [selected, setSelected] = useState(null),
    [filter, setFilter] = useState("All reports"),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [configured, setConfigured] = useState(false),
    [tab, setTab] = useState("conversation");
  useEffect(() => {
    api("officer")
      .then((d) => {
        setAuthenticated(d.authenticated);
        if (d.authenticated) load();
      })
      .catch((e) => setError(e.message))
      .finally(() => setChecked(true));
    api("config")
      .then((d) => setConfigured(d.configured))
      .catch(() => {});
  }, []);
  async function load() {
    setBusy(true);
    setError("");
    try {
      setReports((await api("reports", { action: "list" })).reports);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("officer", { key });
      setKey("");
      setAuthenticated(true);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function open(r) {
    setBusy(true);
    setError("");
    try {
      setSelected((await api("reports", { action: "read", id: r.id })).report);
      setTab("conversation");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function event(data) {
    const { report } = await api("reports", { id: selected.id, ...data });
    setSelected((r) => ({ ...report, analysis: r?.analysis }));
    setReports((rs) =>
      rs.map((r) =>
        r.id === report.id ? { ...report, hasAudio: !!report.audioDataUrl } : r,
      ),
    );
    return report;
  }
  async function updateEvidence(report) {
    if (report.status !== selected.status)
      await event({
        action: "reply",
        text: "Review status updated to " + report.status + ".",
        status: report.status,
      });
    setSelected((r) => ({ ...r, analysis: report.analysis }));
  }
  async function logout() {
    try {
      await api("officer", { action: "logout" });
      setAuthenticated(false);
      setReports([]);
      setSelected(null);
    } catch (e) {
      setError(e.message);
    }
  }
  const visible = reports.filter(
    (r) =>
      (filter === "All reports" || r.status === filter) &&
      [r.crop, r.community, r.description]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const groups = matchingGroups(reports);
  if (!checked) return <p>Checking officer session...</p>;
  if (!authenticated)
    return (
      <section className="officer-login">
        <p className="eyebrow">EXTENSION TEAM / PROTECTED WORKSPACE</p>
        <h1>
          A clearer picture.
          <br />A considered response.
        </h1>
        <p>
          Review farmer reports, listen to original recordings and send
          practical feedback.
        </p>
        <form onSubmit={login}>
          <label>
            Officer access key
            <input
              type="password"
              required
              autoComplete="current-password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? "Signing in..." : "Open officer dashboard"}
          </button>
        </form>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <details>
          <summary>First-time setup for the site owner</summary>
          <p>
            Add <code>OFFICER_ACCESS_KEY</code> in Netlify with a random secret
            of at least 24 characters. Redeploy, then use that key here. Share
            it only with the pilot extension team. It is separate from the Meta
            API key.
          </p>
        </details>
        <small>
          Pilot access uses one team credential and an eight-hour secure
          session. Individual staff accounts are a future upgrade.
        </small>
      </section>
    );
  return (
    <div className="officer-dashboard">
      <div className="officer-toolbar">
        <span className="pill green">EXTENSION TEAM</span>
        <button className="text-button" onClick={logout}>
          Sign out
        </button>
      </div>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {selected ? (
        <>
          <button
            className="text-button"
            onClick={() => {
              setSelected(null);
              load();
            }}
          >
            ← Back to review queue
          </button>
          <div className="portal-heading">
            <div>
              <p className="eyebrow">SHARED CASE / {selected.id.slice(0, 8)}</p>
              <h1>
                {selected.crop} · {selected.community}
              </h1>
              <p>
                {selected.symptom} · reported {shortDate(selected.createdAt)}
              </p>
            </div>
            <button
              className="button outline"
              disabled={busy}
              onClick={() => open(selected)}
            >
              Refresh case
            </button>
          </div>
          <div className="portal-tabs">
            <button
              className={tab === "conversation" ? "active" : ""}
              onClick={() => setTab("conversation")}
            >
              Farmer evidence & feedback
            </button>
            <button
              className={tab === "ai" ? "active" : ""}
              onClick={() => setTab("ai")}
            >
              Meta Evidence Lab
            </button>
          </div>
          {tab === "conversation" ? (
            <>
              {selected.photoDataUrl && (
                <img
                  className="officer-case-photo"
                  src={selected.photoDataUrl}
                  alt="Farmer's crop evidence"
                />
              )}
              <CaseThread
                key={selected.id}
                report={selected}
                role="officer"
                onReply={(text, status) =>
                  event({ action: "reply", text, status })
                }
                onTranscript={(text) => event({ action: "transcript", text })}
              />
            </>
          ) : (
            <>
              <p className="data-note">
                AI drafts support your review. Send reviewed advice from the
                feedback tab. Analysis results remain in this session; shared
                feedback and saved transcripts persist.
              </p>
              <EvidenceLab
                key={selected.id}
                report={{
                  ...selected,
                  description:
                    selected.description ||
                    selected.events
                      ?.filter((e) => e.role === "transcript")
                      .at(-1)?.text ||
                    "Voice report attached. Listen to the recording before drawing conclusions.",
                }}
                onUpdate={updateEvidence}
                configured={configured}
                onSetup={() =>
                  setError("Configure MODEL_API_KEY in Netlify and redeploy.")
                }
              />
            </>
          )}
        </>
      ) : (
        <>
          <div className="portal-heading">
            <div>
              <p className="eyebrow">OFFICER DASHBOARD</p>
              <h1>Every report deserves a response.</h1>
              <p>
                A shared queue of actual farmer submissions. No synthetic
                records.
              </p>
            </div>
            <button className="button outline" disabled={busy} onClick={load}>
              {busy ? "Refreshing..." : "Refresh queue"}
            </button>
          </div>
          <section className="officer-metrics">
            <article>
              <b>{reports.filter((r) => r.status === "Needs review").length}</b>
              <span>Waiting for review</span>
            </article>
            <article>
              <b>
                {reports.filter((r) => r.status === "Follow-up needed").length}
              </b>
              <span>Need follow-up</span>
            </article>
            <article>
              <b>{reports.filter((r) => r.hasAudio).length}</b>
              <span>Voice reports</span>
            </article>
            <article>
              <b>{groups.length}</b>
              <span>Possible report groups</span>
            </article>
          </section>
          <div className="queue-filters">
            <label className="sr-only" htmlFor="queue-search">
              Search crop or community
            </label>
            <input
              id="queue-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search crop or community"
            />
            <label className="sr-only" htmlFor="queue-status">
              Filter review status
            </label>
            <select
              id="queue-status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {[
                "All reports",
                "Needs review",
                "In review",
                "Follow-up needed",
                "Closed",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <section className="officer-queue">
            {visible.map((r) => (
              <button key={r.id} onClick={() => open(r)} disabled={busy}>
                <span className="queue-crop">
                  {r.crop.slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <strong>
                    {r.crop} · {r.community}
                  </strong>
                  <small>
                    {r.symptom} · {shortDate(r.createdAt)}
                    {r.hasAudio ? " · Voice attached" : ""}
                  </small>
                </span>
                <span className="pill">{r.status}</span>
                <span>Review ↗</span>
              </button>
            ))}
            {!visible.length && (
              <div className="empty-state">
                <h3>
                  {busy ? "Loading reports..." : "No reports in this view."}
                </h3>
                <p>
                  Farmer submissions appear here after they are successfully
                  sent.
                </p>
              </div>
            )}
          </section>
          {groups.length > 0 && (
            <section className="group-review">
              <h2>Patterns worth a closer look</h2>
              <p>
                Same crop, community and symptom within seven days. These are
                not confirmed outbreaks.
              </p>
              {groups.map((g, i) => (
                <button
                  className="button outline"
                  key={i}
                  onClick={() => {
                    setQuery(g[0].community);
                    setFilter("All reports");
                  }}
                >
                  {g[0].community} · {g[0].crop} · {g.length} reports
                </button>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
