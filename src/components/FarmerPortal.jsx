import React, { useEffect, useState } from "react";
import { readReports, writeReport, shortDate } from "../lib.js";
import { api, receiptToken } from "../relay.js";
import ReportForm from "./ReportForm.jsx";
import CaseThread from "./CaseThread.jsx";
import "./FarmerPortal.css";
export default function FarmerPortal() {
  const [reports, setReports] = useState([]),
    [selected, setSelected] = useState(null),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [recovery, setRecovery] = useState("");
  useEffect(() => {
    readReports()
      .then((rs) => setReports(rs.filter((r) => !r.sample)))
      .catch(() =>
        setError(
          "Device storage is unavailable. Enable browser storage to keep your report codes.",
        ),
      );
  }, []);
  async function remember(r) {
    await writeReport(r);
    setReports((rs) => [r, ...rs.filter((x) => x.id !== r.id)]);
    setSelected(r);
    return r;
  }
  async function save(r) {
    await remember({ ...r, receiptToken: receiptToken(), delivery: "draft" });
    setCreating(false);
  }
  async function action(task) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    let draft = selected;
    if (!draft.receiptToken)
      draft = await remember({ ...draft, receiptToken: receiptToken() });
    const { report } = await api("reports", {
      actor: "farmer",
      action: "submit",
      report: draft,
    });
    await remember({
      ...report,
      receiptToken: draft.receiptToken,
      delivery: "sent",
    });
  }
  async function refresh() {
    const { report } = await api("reports", {
      actor: "farmer",
      action: "read",
      id: selected.id,
      token: selected.receiptToken,
    });
    await remember({
      ...report,
      receiptToken: selected.receiptToken,
      delivery: "sent",
    });
  }
  async function recover(e) {
    e.preventDefault();
    await action(async () => {
      const [id, token] = recovery.trim().split(".");
      const { report } = await api("reports", {
        actor: "farmer",
        action: "read",
        id,
        token,
      });
      await remember({ ...report, receiptToken: token, delivery: "sent" });
      setRecovery("");
    });
  }
  async function reply(text) {
    const { report } = await api("reports", {
      actor: "farmer",
      action: "reply",
      id: selected.id,
      token: selected.receiptToken,
      text,
    });
    await remember({
      ...report,
      receiptToken: selected.receiptToken,
      delivery: "sent",
    });
  }
  if (creating)
    return <ReportForm onSave={save} onCancel={() => setCreating(false)} />;
  return (
    <div className="farmer-portal">
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {selected ? (
        <>
          <button className="text-button" onClick={() => setSelected(null)}>
            ← My reports
          </button>
          <div className="portal-heading">
            <div>
              <p className="eyebrow">YOUR FIELD REPORT</p>
              <h1>
                {selected.crop} in {selected.community}
              </h1>
              <p>
                {shortDate(selected.createdAt)} · {selected.symptom}
              </p>
            </div>
            <span
              className={
                "pill " + (selected.delivery === "sent" ? "green" : "amber")
              }
            >
              {selected.delivery === "sent"
                ? "Received by platform"
                : "Saved on this device"}
            </span>
          </div>
          <div className="farmer-case-grid">
            <section className="farmer-evidence">
              {selected.photoDataUrl ? (
                <img
                  src={selected.photoDataUrl}
                  alt="Your submitted crop photograph"
                />
              ) : (
                <div className="no-photo">No photograph attached</div>
              )}
              <p>{selected.description || "Voice report attached"}</p>
              {selected.audioDataUrl && (
                <audio controls preload="none" src={selected.audioDataUrl} />
              )}
            </section>
            <section className="delivery-card">
              <p className="eyebrow">FROM YOUR FARM TO A HUMAN</p>
              <h2>
                {selected.delivery === "sent"
                  ? "Your report has arrived."
                  : "Ready when you are."}
              </h2>
              <ol className="delivery-steps">
                <li className="done">Saved on your device</li>
                <li className={selected.delivery === "sent" ? "done" : ""}>
                  Received by platform
                </li>
                <li
                  className={
                    selected.events?.some((e) => e.role === "officer")
                      ? "done"
                      : ""
                  }
                >
                  Officer feedback received
                </li>
              </ol>
              {selected.delivery !== "sent" ? (
                <>
                  <p>
                    Send your report, photograph and recording to the extension
                    team. Officers may use Meta AI to help review the evidence.
                    Avoid including private personal information.
                  </p>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => action(submit)}
                  >
                    {busy ? "Sending..." : "Send to extension team"}
                  </button>
                  <small>
                    No connection? Keep this draft and send when you reconnect.
                  </small>
                </>
              ) : (
                <>
                  <button
                    className="button outline"
                    disabled={busy}
                    onClick={() => action(refresh)}
                  >
                    {busy ? "Checking..." : "Check for feedback"}
                  </button>
                  <details>
                    <summary>Private recovery code</summary>
                    <p>
                      Keep this code safe. Anyone with it can open this report
                      and reply. Use it on another device under Recover a
                      report.
                    </p>
                    <code className="receipt-code">
                      {selected.id}.{selected.receiptToken}
                    </code>
                    <button
                      className="text-button"
                      onClick={() =>
                        action(() =>
                          navigator.clipboard.writeText(
                            selected.id + "." + selected.receiptToken,
                          ),
                        )
                      }
                    >
                      Copy code
                    </button>
                  </details>
                </>
              )}
            </section>
          </div>
          {selected.delivery === "sent" && (
            <CaseThread
              key={selected.id}
              report={selected}
              role="farmer"
              onReply={reply}
            />
          )}
        </>
      ) : (
        <>
          <section className="farmer-hero">
            <div>
              <span className="pill">FARMER SPACE</span>
              <h1>
                Something changed
                <br />
                on your farm?
              </h1>
              <p>Show it. Say it. Get a human to take a closer look.</p>
              <button
                className="button light"
                onClick={() => setCreating(true)}
              >
                + Report a crop concern
              </button>
              <small>
                Photo, voice or a few words. Start with what you have.
              </small>
            </div>
            <img src="/images/landscape.svg" alt="Green cultivated fields" />
          </section>
          <div className="farmer-summary">
            <span>
              <b>{reports.length}</b> My reports
            </span>
            <span>
              <b>{reports.filter((r) => r.delivery !== "sent").length}</b>{" "}
              Waiting to send
            </span>
            <span>
              <b>
                {
                  reports.filter((r) =>
                    r.events?.some((e) => e.role === "officer"),
                  ).length
                }
              </b>{" "}
              With officer feedback
            </span>
          </div>
          <div className="section-heading">
            <h2>My crop reports</h2>
            <span className="secondary">Only reports saved on this device</span>
          </div>
          <div className="farmer-report-grid">
            {reports.map((r) => (
              <button
                className="farmer-report-card"
                key={r.id}
                onClick={() => {
                  setSelected(r);
                  setError("");
                }}
              >
                <span
                  className={
                    "pill " + (r.delivery === "sent" ? "green" : "amber")
                  }
                >
                  {r.delivery === "sent" ? r.status : "Not sent yet"}
                </span>
                <h3>{r.crop}</h3>
                <p>
                  {r.community} · {shortDate(r.createdAt)}
                </p>
                <span>
                  {r.events?.some((e) => e.role === "officer")
                    ? "View feedback"
                    : "View report"}{" "}
                  ↗
                </span>
              </button>
            ))}
            {!reports.length && (
              <div className="empty-state">
                <h3>Your first report starts here.</h3>
                <p>
                  Record a concern and keep track of the response in one place.
                </p>
              </div>
            )}
          </div>
          <details className="recover-panel">
            <summary>Recover a report from another device</summary>
            <form onSubmit={recover}>
              <label>
                Private recovery code
                <input
                  required
                  value={recovery}
                  onChange={(e) => setRecovery(e.target.value)}
                  autoComplete="off"
                  placeholder="Paste your saved code"
                />
              </label>
              <button className="button outline" disabled={busy}>
                Open my report
              </button>
            </form>
          </details>
        </>
      )}
    </div>
  );
}
