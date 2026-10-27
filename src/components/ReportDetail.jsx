import React, { useEffect, useRef, useState } from "react";
import { api, mediaUrl, navigate } from "../api.js";
import { recordingToWav } from "../relay.js";
import { evidenceScore, evidenceChecks, newReportId } from "../lib.js";
import Icon from "./Icon.jsx";
import {
  PageTitle,
  Badge,
  ErrorNotice,
  Loading,
  Empty,
  DateText,
  Pagination,
} from "./UI.jsx";
import "./ReportDetail.css";
export default function ReportDetail({ id, user }) {
  const [report, setReport] = useState(null),
    [tab, setTab] = useState("evidence"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [messages, setMessages] = useState(null),
    [page, setPage] = useState(1),
    [text, setText] = useState(""),
    [status, setStatus] = useState(""),
    [priority, setPriority] = useState("normal"),
    [officers, setOfficers] = useState([]),
    [officer, setOfficer] = useState(""),
    [staffSearch, setStaffSearch] = useState(""),
    [aiBusy, setAiBusy] = useState(""),
    [aiError, setAiError] = useState(""),
    [showBoxes, setShowBoxes] = useState(true);
  const messageId = useRef(null),
    staff = user.role !== "farmer";
  async function refresh() {
    const d = await api("/reports/" + id);
    setReport(d.report);
    setStatus(d.report.status);
    setPriority(d.report.priority);
    setOfficer(d.report.assignedTo?._id || "");
  }
  async function getMessages(p = page) {
    setMessages(await api(`/reports/${id}/messages?page=${p}&limit=20`));
  }
  useEffect(() => {
    let active = true;
    api("/reports/" + id)
      .then((d) => {
        if (active) {
          setReport(d.report);
          setStatus(d.report.status);
          setPriority(d.report.priority);
          setOfficer(d.report.assignedTo?._id || "");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (tab === "conversation") getMessages().catch((e) => setError(e.message));
  }, [tab, page, id]);
  async function run(task) {
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
  async function send(e) {
    e.preventDefault();
    await run(async () => {
      if (!messageId.current) messageId.current = newReportId();
      await api(`/reports/${id}/messages`, {
        method: "POST",
        body: { text, clientId: messageId.current },
      });
      messageId.current = null;
      setText("");
      setPage(1);
      await getMessages(1);
    });
  }
  async function review(e) {
    e.preventDefault();
    await run(async () => {
      await api("/reports/" + id, {
        method: "PATCH",
        body: { version: report.version, status, priority },
      });
      await refresh();
    });
  }
  async function assign(e) {
    e.preventDefault();
    await run(async () => {
      await api(`/reports/${id}/assignment`, {
        method: "PATCH",
        body: { officerId: officer || null, version: report.version },
      });
      await refresh();
    });
  }
  async function searchOfficers() {
    await run(async () =>
      setOfficers(
        (
          await api(
            "/admin/users?" +
              new URLSearchParams({
                role: "officer",
                limit: 50,
                q: staffSearch,
              }),
          )
        ).items.filter((u) => u.active && u.verified),
      ),
    );
  }
  async function ai(kind) {
    setAiBusy(kind);
    setAiError("");
    try {
      let body;
      if (kind === "transcribe")
        body = await recordingToWav(mediaUrl(id, "audio"));
      const { result } = await api(`/reports/${id}/ai/${kind}`, {
        method: "POST",
        body,
      });
      setReport((r) => ({
        ...r,
        ai: {
          ...r.ai,
          [{
            brief: "brief",
            segment: "segmentation",
            transcribe: "transcript",
          }[kind]]: result,
        },
      }));
    } catch (e) {
      setAiError(e.message);
    } finally {
      setAiBusy("");
    }
  }
  if (!report)
    return error ? (
      <ErrorNotice error={error} />
    ) : (
      <Loading text="Opening crop report..." />
    );
  const source = {
    ...report,
    photoDataUrl: report.photo?.bytes ? "attached" : null,
  };
  const score = evidenceScore(source);
  const brief = report.ai?.brief,
    segment = report.ai?.segmentation,
    transcript = report.ai?.transcript;
  return (
    <>
      <button
        className="text-button back-link"
        onClick={() => navigate("reports")}
      >
        ← Back to reports
      </button>
      <PageTitle
        eyebrow={`FIELD REPORT / ${id.slice(-8).toUpperCase()}`}
        title={`${report.crop} in ${report.community}`}
        description={`Reported by ${report.owner?.name || "Farmer"} · ${new Date(report.createdAt).toLocaleDateString("en-GB")}`}
      >
        <Badge>{report.status}</Badge>
        <button
          className="button outline"
          disabled={busy}
          onClick={() => run(refresh)}
        >
          Refresh
        </button>
      </PageTitle>
      <ErrorNotice error={error} />
      <nav className="case-tabs" aria-label="Report sections">
        {[
          ["evidence", "camera", "Field evidence"],
          ["conversation", "users", "Conversation"],
          ...(staff ? [["ai", "spark", "Meta AI workbench"]] : []),
        ].map(([value, icon, label]) => (
          <button
            key={value}
            className={tab === value ? "active" : ""}
            aria-current={tab === value ? "page" : undefined}
            onClick={() => setTab(value)}
          >
            <Icon name={icon} size={16} />
            {label}
          </button>
        ))}
      </nav>
      {tab === "evidence" && (
        <div className="case-evidence-grid">
          <section>
            <div className="surface-card source-photo">
              <div className="card-heading">
                <h2>Original field evidence</h2>
                <span className="eyebrow">FARMER SUBMISSION</span>
              </div>
              {report.photo?.bytes ? (
                <img
                  src={mediaUrl(id, "photo")}
                  alt={`${report.crop} crop observation submitted by the farmer`}
                />
              ) : (
                <Empty
                  title="No photograph attached"
                  description="This report contains a written observation or a voice note."
                />
              )}
              <div className="source-description">
                <Badge>{report.symptom}</Badge>
                <h3>What the farmer noticed</h3>
                <p>
                  {report.description ||
                    "A voice recording was submitted. Listen below for the original observation."}
                </p>
                <dl>
                  <dt>First noticed</dt>
                  <dd>
                    <DateText value={report.onset} />
                  </dd>
                  <dt>Affected area</dt>
                  <dd>{report.affected || "Not recorded"}</dd>
                  <dt>Assigned officer</dt>
                  <dd>{report.assignedTo?.name || "Awaiting assignment"}</dd>
                </dl>
              </div>
            </div>
            {report.audio?.bytes > 0 && (
              <section className="surface-card voice-evidence">
                <div>
                  <span className="audio-icon">
                    <Icon name="mic" />
                  </span>
                  <div>
                    <h3>The farmer’s own words</h3>
                    <p>
                      {report.audioLanguage} ·{" "}
                      {Math.round(report.audio.bytes / 1024)} KB
                    </p>
                  </div>
                  <Badge tone="neutral">Original audio</Badge>
                </div>
                <audio controls preload="none" src={mediaUrl(id, "audio")} />
                <p>
                  Listen before drawing conclusions.{" "}
                  {report.audioLanguage !== "English"
                    ? "This language requires a human listener."
                    : "Officers can request a transcript in the AI workbench."}
                </p>
              </section>
            )}
          </section>
          <aside>
            <section className="surface-card completeness-card">
              <p className="eyebrow">REPORT COMPLETENESS</p>
              <div>
                <strong>
                  {score}
                  <small>/100</small>
                </strong>
                <Icon name="reports" size={28} />
              </div>
              <p>
                A transparent checklist, not disease risk or model confidence.
              </p>
              <div className="completeness-bar">
                <i style={{ width: score + "%" }} />
              </div>
              <details>
                <summary>View checklist</summary>
                {evidenceChecks(source).map((c) => (
                  <p key={c.label}>
                    <span>
                      {c.passed ? "✓" : "○"} {c.label}
                    </span>
                    <b>
                      {c.passed ? c.weight : 0}/{c.weight}
                    </b>
                  </p>
                ))}
              </details>
            </section>
            {staff && (
              <section className="surface-card review-controls">
                <p className="eyebrow">HUMAN REVIEW</p>
                <h3>Keep the case moving.</h3>
                <form onSubmit={review}>
                  <label>
                    Status
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      {[
                        "Needs review",
                        "In review",
                        "Follow-up needed",
                        "Closed",
                      ].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Review priority
                    <select
                      value={priority}
                      onChange={(e) => setPriority(e.target.value)}
                    >
                      <option value="normal">Normal</option>
                      <option value="high">High</option>
                    </select>
                  </label>
                  <button className="button primary" disabled={busy}>
                    Save review status
                  </button>
                </form>
                <small>
                  Priority is set by a reviewer. It is not an AI risk score.
                </small>
              </section>
            )}
            {user.role === "admin" && (
              <section className="surface-card assignment-controls">
                <p className="eyebrow">CASE OWNERSHIP</p>
                <h3>Assign an extension officer.</h3>
                {!user.mfaEnabled ? (
                  <p>Enable your authenticator in Account settings first.</p>
                ) : (
                  <>
                    <label>
                      Find an officer
                      <input
                        value={staffSearch}
                        onChange={(e) => setStaffSearch(e.target.value)}
                        placeholder="Name or email"
                        maxLength={100}
                      />
                    </label>
                    <button
                      className="button subtle"
                      disabled={busy}
                      onClick={searchOfficers}
                    >
                      Search officers
                    </button>
                    <form onSubmit={assign}>
                      <label>
                        Officer
                        <select
                          value={officer}
                          onChange={(e) => setOfficer(e.target.value)}
                        >
                          <option value="">Unassigned</option>
                          {report.assignedTo &&
                            !officers.some(
                              (u) => u.id === report.assignedTo._id,
                            ) && (
                              <option value={report.assignedTo._id}>
                                {report.assignedTo.name}
                              </option>
                            )}
                          {officers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button className="button outline" disabled={busy}>
                        Save assignment
                      </button>
                    </form>
                  </>
                )}
              </section>
            )}
            <div className="case-guidance">
              <Icon name="shield" size={20} />
              <p>
                Evidence helps start a conversation. An observation alone is not
                a confirmed diagnosis.
              </p>
            </div>
          </aside>
        </div>
      )}
      {tab === "conversation" && (
        <div className="conversation-layout">
          <section className="surface-card conversation-card">
            <div className="card-heading">
              <div>
                <p className="eyebrow">FIELD CONVERSATION</p>
                <h2>Keep the next step clear.</h2>
              </div>
              <button
                className="text-button"
                disabled={busy}
                onClick={() => run(() => getMessages())}
              >
                Refresh
              </button>
            </div>
            {!messages ? (
              <Loading />
            ) : messages.items.length ? (
              <>
                <div className="conversation-messages">
                  {messages.items.map((m) => (
                    <article
                      key={m._id}
                      className={
                        m.role === "farmer"
                          ? "farmer-message"
                          : "officer-message"
                      }
                    >
                      <div>
                        <span className="avatar">
                          {m.authorName.slice(0, 1)}
                        </span>
                        <strong>{m.authorName}</strong>
                        <Badge>{m.role}</Badge>
                        <small>{new Date(m.createdAt).toLocaleString()}</small>
                      </div>
                      <p>{m.text}</p>
                    </article>
                  ))}
                </div>
                {messages.pages > 1 && (
                  <Pagination {...messages} onChange={setPage} />
                )}
              </>
            ) : (
              <Empty
                title="The conversation starts here."
                description={
                  staff
                    ? "Ask a clear follow-up question or share your reviewed guidance."
                    : "Your extension team’s replies will appear here. You can add an update at any time."
                }
              />
            )}
            <form className="message-composer" onSubmit={send}>
              <label htmlFor="case-reply">
                {staff ? "Your reviewed feedback" : "Add a field update"}
              </label>
              <textarea
                id="case-reply"
                required
                maxLength={2000}
                rows={4}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  messageId.current = null;
                }}
                placeholder={
                  staff
                    ? "Give practical next steps or ask for more evidence..."
                    : "Tell the team what has changed..."
                }
              />
              <div>
                <small>
                  {text.length}/2000 · Visible to the farmer and authorised
                  staff
                </small>
                <button
                  className="button primary"
                  disabled={busy || !text.trim()}
                >
                  {busy ? "Sending..." : "Send message"}
                  <Icon name="arrow" size={16} />
                </button>
              </div>
            </form>
          </section>
          <aside className="conversation-guide">
            <Icon name="users" size={30} />
            <h3>
              A person stays
              <br />
              in the loop.
            </h3>
            <p>
              Messages here are written by the farmer or an authorised team
              member. AI drafts are kept in the workbench until reviewed.
            </p>
            <p>
              Replies are shown in the app. There is no guaranteed response
              time.
            </p>
          </aside>
        </div>
      )}
      {tab === "ai" && staff && (
        <>
          <div className="ai-workbench-intro">
            <span className="ai-workbench-mark">∞</span>
            <div>
              <p className="eyebrow">META MODEL API / SERVER-SIDE</p>
              <h2>Inspect the evidence. Keep your judgement.</h2>
              <p>
                Each action sends relevant report content to Meta. Results are
                saved to this case as unreviewed AI output.
              </p>
            </div>
          </div>
          <ErrorNotice error={aiError} />
          <div className="ai-tool-grid">
            <article className="surface-card ai-tool">
              <div>
                <span className="tool-number">01</span>
                <Badge tone="green">Muse Spark</Badge>
              </div>
              <Icon name="spark" size={27} />
              <h3>Structure the observation</h3>
              <p>
                Turn the report, photo and any saved transcript into a brief
                with useful follow-up questions.
              </p>
              <button
                className="button primary"
                disabled={!!aiBusy}
                onClick={() => ai("brief")}
              >
                {aiBusy === "brief" ? (
                  <>
                    <span className="spinner" />
                    Preparing brief...
                  </>
                ) : (
                  "Generate evidence brief"
                )}
              </button>
              {brief && (
                <small>Saved · {(brief.elapsedMs / 1000).toFixed(1)}s</small>
              )}
            </article>
            <article className="surface-card ai-tool">
              <div>
                <span className="tool-number">02</span>
                <Badge tone="blue">SAM 3.1</Badge>
              </div>
              <Icon name="camera" size={27} />
              <h3>Locate plant regions</h3>
              <p>
                Inspect returned object boxes on the original image. Regions are
                not disease diagnoses.
              </p>
              <button
                className="button outline"
                disabled={!!aiBusy || !report.photo?.bytes}
                onClick={() => ai("segment")}
              >
                {aiBusy === "segment" ? (
                  <>
                    <span className="spinner" />
                    Locating regions...
                  </>
                ) : (
                  "Locate plant regions"
                )}
              </button>
              {segment && (
                <small>
                  {segment.boxes.length} regions ·{" "}
                  {(segment.elapsedMs / 1000).toFixed(1)}s
                </small>
              )}
              {!report.photo?.bytes && <small>No photograph attached.</small>}
            </article>
            <article className="surface-card ai-tool">
              <div>
                <span className="tool-number">03</span>
                <Badge tone="purple">Muse Voice</Badge>
              </div>
              <Icon name="mic" size={27} />
              <h3>Listen, then transcribe</h3>
              <p>
                Convert an English recording into an unreviewed transcript.
                Other languages need human listening.
              </p>
              <button
                className="button outline"
                disabled={
                  !!aiBusy ||
                  !report.audio?.bytes ||
                  report.audioLanguage !== "English"
                }
                onClick={() => ai("transcribe")}
              >
                {aiBusy === "transcribe" ? (
                  <>
                    <span className="spinner" />
                    Transcribing...
                  </>
                ) : (
                  "Transcribe recording"
                )}
              </button>
              {transcript && (
                <small>
                  Saved · {(transcript.elapsedMs / 1000).toFixed(1)}s
                </small>
              )}
            </article>
          </div>
          {brief && (
            <section className="surface-card ai-brief">
              <div className="card-heading">
                <div>
                  <p className="eyebrow">AI DRAFT / HUMAN REVIEW REQUIRED</p>
                  <h2>Evidence brief</h2>
                </div>
                <span className="model-tag">
                  {brief.model} · <DateText value={brief.createdAt} />
                </span>
              </div>
              <h3>{brief.brief.summary}</h3>
              <div className="brief-sections">
                <div>
                  <h4>Recorded observations</h4>
                  <ul>
                    {brief.brief.observations.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4>What is still unknown</h4>
                  <ul>
                    {brief.brief.unknowns.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="followup-questions">
                <h4>Useful questions to ask next</h4>
                {brief.brief.followupQuestions.map((s, i) => (
                  <p key={i}>
                    <b>{String(i + 1).padStart(2, "0")}</b>
                    {s}
                  </p>
                ))}
              </div>
            </section>
          )}
          {segment && report.photo?.bytes && (
            <section className="surface-card segmentation-result">
              <div className="card-heading">
                <h2>Plant region inspection</h2>
                <button
                  className="text-button"
                  onClick={() => setShowBoxes(!showBoxes)}
                >
                  {showBoxes ? "Hide" : "Show"} boxes
                </button>
              </div>
              <div className="segmented-photo">
                <img
                  src={mediaUrl(id, "photo")}
                  alt="Crop photo with SAM object regions"
                />
                {showBoxes &&
                  segment.boxes.map((b, i) => (
                    <div
                      className="sam-box"
                      key={i}
                      style={{
                        left: (100 * b.x1) / b.w + "%",
                        top: (100 * b.y1) / b.h + "%",
                        width: (100 * (b.x2 - b.x1)) / b.w + "%",
                        height: (100 * (b.y2 - b.y1)) / b.h + "%",
                      }}
                    >
                      <span>{i + 1}</span>
                    </div>
                  ))}
              </div>
              <p>
                {segment.boxes.length} object boxes · {segment.maskCount} mask
                tokens. Raster masks are not rendered. Zero matches is a valid
                result.
              </p>
            </section>
          )}
          {transcript && (
            <section className="surface-card transcript-result">
              <div className="card-heading">
                <h2>Voice transcript</h2>
                <Badge tone="amber">Unreviewed</Badge>
              </div>
              <p>{transcript.transcript || "No speech detected."}</p>
              <small>
                {transcript.model} · Compare this text with the original
                recording before using it.
              </small>
            </section>
          )}
          {!brief && !segment && !transcript && (
            <Empty
              title="Your AI evidence will appear here."
              description="Choose a tool above. No model results are shown until a successful API response."
            />
          )}
        </>
      )}
    </>
  );
}
