import React, { useEffect, useRef, useState } from "react";
import { api, navigate } from "../api.js";
import {
  caseAction,
  signEvidence,
  runAnalysis,
  evidenceChecklist,
  GUIDANCE,
  nextQuestions,
  submitEvidenceDraft,
} from "../investigation.js";
import { saveDraft, removeDraft } from "../drafts.js";
import { prepareImage } from "../lib.js";
import { recordingToWav } from "../relay.js";
import { useLiveRefresh } from "../useLiveRefresh.js";
import { Badge, ErrorNotice, Loading } from "./UI.jsx";
import VoiceNote from "./VoiceNote.jsx";
import "./ReportForm.css";
import "./InvestigationPage.css";
const date = (value) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";
export default function InvestigationPage({ id, user }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [notice, setNotice] = useState(""),
    [tab, setTab] = useState("investigation");
  const [selected, setSelected] = useState(""),
    [boxes, setBoxes] = useState(true),
    [zoom, setZoom] = useState(false),
    [compare, setCompare] = useState(false);
  const [text, setText] = useState(""),
    [action, setAction] = useState("advice"),
    [due, setDue] = useState(""),
    [outcome, setOutcome] = useState("Cannot determine"),
    [answers, setAnswers] = useState({});
  const [audio, setAudio] = useState(null),
    [language, setLanguage] = useState("English"),
    [voiceBusy, setVoiceBusy] = useState(false),
    [officers, setOfficers] = useState([]),
    [officer, setOfficer] = useState(""),
    [officerQuery, setOfficerQuery] = useState("");
  const request = useRef(null),
    upload = useRef(null),
    file = useRef(null),
    alive = useRef(true),
    live = useLiveRefresh();
  const staff = user.role !== "farmer";
  async function refresh() {
    const snapshot = await caseAction(id);
    snapshot.evidence = await signEvidence(snapshot.evidence);
    if (alive.current) {
      setData(snapshot);
      setSelected(
        (s) => s || snapshot.evidence.find((e) => e.kind === "photo")?.id || "",
      );
    }
    return snapshot;
  }
  useEffect(() => {
    alive.current = true;
    refresh().catch((e) => setError(e.message));
    return () => {
      alive.current = false;
    };
  }, [id]);
  useEffect(() => {
    if (live)
      setNotice(
        "This case received an update. Refresh to load the latest evidence before saving.",
      );
  }, [live]);
  async function work(name, fn) {
    setBusy(name);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      if (alive.current) setBusy("");
    }
  }
  async function send(e) {
    e.preventDefault();
    await work("save", async () => {
      request.current ||= crypto.randomUUID();
      const body = staff
        ? {
            clientId: request.current,
            version: data.report.version,
            text,
            due: due || null,
            ...(action === "review" ? { outcome } : {}),
          }
        : { clientId: request.current, text, outcome };
      await caseAction(id, staff ? action : "followup", body);
      request.current = null;
      setText("");
      setDue("");
      await refresh();
      setNotice(
        staff
          ? "Your reviewed update was sent."
          : "Your field update was sent for review.",
      );
    });
  }
  async function answerQuestions(e) {
    e.preventDefault();
    await work("answers", async () => {
      await caseAction(id, "answers", {
        clientId: crypto.randomUUID(),
        answers,
      });
      setAnswers({});
      await refresh();
      setNotice("Your answers are saved.");
    });
  }
  async function analyse(kind) {
    await work(kind, async () => {
      let body;
      if (kind === "transcribe") {
        const current = await refresh();
        const a = current.evidence.filter((e) => e.kind === "audio").at(-1);
        if (!a?.url) throw Error("Recording is unavailable.");
        body = await recordingToWav(a.url);
      }
      await runAnalysis(id, kind, body);
      await refresh();
      setNotice("AI output saved. Review the evidence and limitations below.");
    });
  }
  async function attach(value, kind = "photo") {
    await work("upload", async () => {
      if (!value && !upload.current) return;
      let pending = upload.current;
      if (!pending) {
        const image = kind === "photo" ? await prepareImage(value) : null;
        pending = {
          id: crypto.randomUUID(),
          type: "attachment",
          reportId: id,
          clientId: data.report.clientId,
          crop: data.report.crop,
          community: data.report.community,
          attachment: {
            id: crypto.randomUUID(),
            kind,
            label:
              kind === "photo"
                ? "Follow-up photograph"
                : "Follow-up voice note",
            language: kind === "audio" ? language : null,
            dataUrl: image?.photoDataUrl || value,
            width: image?.photoWidth,
            height: image?.photoHeight,
          },
        };
        upload.current = pending;
      }
      await saveDraft(user.id, pending);
      try {
        await submitEvidenceDraft(user.id, pending);
        await removeDraft(pending.id);
        upload.current = null;
        setAudio(null);
        await refresh();
        setNotice(
          "Evidence added. Earlier AI results are now marked outdated.",
        );
      } catch (e) {
        upload.current = null;
        throw Error(
          "Attachment saved in Device drafts. Reopen it there to retry. " +
            e.message,
        );
      }
    });
  }
  if (!data)
    return error ? (
      <ErrorNotice error={error} />
    ) : (
      <Loading text="Opening investigation..." />
    );
  const r = data.report,
    photos = data.evidence.filter((e) => e.kind === "photo"),
    active = photos.find((e) => e.id === selected) || photos[0],
    recordings = data.evidence.filter((e) => e.kind === "audio");
  const currentRun = (kind) =>
    data.runs.find(
      (a) =>
        a.kind === kind &&
        a.state === "complete" &&
        a.evidence_version === r.evidenceVersion,
    );
  const briefRun = currentRun(staff ? "investigate" : "guide"),
    brief = briefRun?.result?.brief,
    old = data.runs.find((a) => a.result?.brief);
  const segment = currentRun("segment")?.result,
    transcript = currentRun("transcribe")?.result;
  const questions = (brief?.questions || nextQuestions(r, data.evidence))
    .filter((q) => !r.answers?.[q.key])
    .slice(0, 3);
  const checklist = evidenceChecklist(r, data.evidence),
    latestAdvice = [...data.events].reverse().find((e) => e.kind === "advice");
  const photoElement = (e) => (
    <div className={"evidence-image " + (zoom ? "zoomed" : "")}>
      <img src={e.url} alt={e.label} />
      {boxes &&
        segment?.evidenceId === e.id &&
        segment.boxes?.map((b, i) => (
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
            <span>Region {i + 1}</span>
          </div>
        ))}
    </div>
  );
  const cite = (id) =>
    id === "report" || id === "answers" ? (
      <button
        key={id}
        onClick={() =>
          document
            .getElementById("case-context")
            ?.scrollIntoView({ behavior: "smooth", block: "center" })
        }
      >
        {id}
      </button>
    ) : (
      <button
        key={id}
        onClick={() => {
          setSelected(id);
          document
            .getElementById("case-evidence")
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        }}
      >
        {data.evidence.find((e) => e.id === id)?.label || "Evidence"}
      </button>
    );
  return (
    <div className="case-workspace">
      <button className="text-button" onClick={() => navigate("reports")}>
        ← All crop cases
      </button>
      <header className="case-heading">
        <div>
          <p className="eyebrow">
            {staff ? "INVESTIGATION WORKSPACE" : "YOUR CROP CASE"} /{" "}
            {id.slice(0, 8).toUpperCase()}
          </p>
          <h1>
            {r.crop} <span>in {r.community}</span>
          </h1>
          <p>
            {r.owner?.name} · Reported {date(r.createdAt)} ·{" "}
            {r.assignedTo?.name || "Awaiting officer assignment"}
          </p>
        </div>
        <div>
          <Badge>{r.status}</Badge>
          <button
            className="button outline"
            disabled={!!busy}
            onClick={() => work("refresh", refresh)}
          >
            Refresh case
          </button>
        </div>
      </header>
      <ErrorNotice error={error} />
      {notice && (
        <div className="case-notice" role="status">
          {notice}
        </div>
      )}
      <div className="case-stage">
        <span className="complete">01 Report received</span>
        <span className={r.assignedTo ? "complete" : ""}>
          02 Officer assigned
        </span>
        <span className={latestAdvice ? "complete" : ""}>
          03 Advice reviewed
        </span>
        <span className={r.followupDue ? "complete" : ""}>
          04 Follow-up {r.followupDue || ""}
        </span>
      </div>
      <nav className="case-tabs" aria-label="Case views">
        {["investigation", "timeline", ...(staff ? ["review"] : [])].map(
          (t) => (
            <button
              key={t}
              aria-current={tab === t ? "page" : undefined}
              onClick={() => setTab(t)}
            >
              {t === "investigation"
                ? "Evidence & understanding"
                : t === "timeline"
                  ? "Conversation & timeline"
                  : "Review & next steps"}
            </button>
          ),
        )}
      </nav>
      {tab === "investigation" && (
        <>
          <div className="investigation-grid">
            <section className="evidence-column" id="case-evidence">
              <div className="case-panel evidence-viewer">
                <div className="panel-heading">
                  <h2>From the field</h2>
                  <span>{photos.length} photos</span>
                </div>
                {active?.url ? (
                  <>
                    <div className="evidence-toolbar">
                      <button
                        aria-pressed={zoom}
                        onClick={() => setZoom(!zoom)}
                      >
                        {zoom ? "Fit image" : "Zoom image"}
                      </button>
                      <button
                        aria-pressed={boxes}
                        onClick={() => setBoxes(!boxes)}
                      >
                        {boxes ? "Hide regions" : "Show regions"}
                      </button>
                      {photos.length > 1 && (
                        <button
                          aria-pressed={compare}
                          onClick={() => setCompare(!compare)}
                        >
                          {compare ? "Single view" : "Compare dates"}
                        </button>
                      )}
                    </div>
                    <div className={compare ? "photo-comparison" : ""}>
                      {compare
                        ? photos
                            .filter(
                              (e, i) => i === 0 || i === photos.length - 1,
                            )
                            .map((e) => (
                              <figure key={e.id}>
                                {photoElement(e)}
                                <figcaption>
                                  {e.label} · {date(e.created_at)}
                                </figcaption>
                              </figure>
                            ))
                        : photoElement(active)}
                    </div>
                    <div className="evidence-thumbnails">
                      {photos.map((e) => (
                        <button
                          key={e.id}
                          aria-pressed={active.id === e.id}
                          onClick={() => setSelected(e.id)}
                        >
                          <img src={e.url} alt={e.label} />
                          <span>{e.label}</span>
                        </button>
                      ))}
                    </div>
                    <p className="panel-footnote">
                      {active.label} · {Math.round(active.media.bytes / 1024)}{" "}
                      KB · {date(active.created_at)}. AI-selected regions are
                      not diagnoses.
                    </p>
                  </>
                ) : (
                  <div className="evidence-placeholder">
                    <span>◎</span>
                    <h3>
                      {active
                        ? "Photo link unavailable"
                        : "No photograph attached"}
                    </h3>
                    <p>
                      {active
                        ? "Refresh the case to renew access."
                        : "A written or voice report can still start a conversation."}
                    </p>
                  </div>
                )}
              </div>
              <section className="case-panel" id="case-context">
                <p className="eyebrow">FARMER REPORTED</p>
                <h2>What changed?</h2>
                <p>{r.description}</p>
                <dl className="case-facts">
                  <dt>First noticed</dt>
                  <dd>
                    {r.answers?.onsetKnown === "Unknown"
                      ? "Unknown (report date retained)"
                      : r.onset}
                  </dd>
                  <dt>Visible concern</dt>
                  <dd>{r.symptom}</dd>
                  {Object.entries(r.answers || {}).map(([k, v]) => (
                    <React.Fragment key={k}>
                      <dt>{k.replace(/([A-Z])/g, " $1")}</dt>
                      <dd>{v || "Not recorded"}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </section>
              {recordings.map((e) => (
                <section className="case-panel recording-panel" key={e.id}>
                  <div className="panel-heading">
                    <h2>Original voice note</h2>
                    <Badge>{e.language}</Badge>
                  </div>
                  <audio controls preload="none" src={e.url} />
                  <p className="panel-footnote">
                    {e.language === "English"
                      ? "Automatic transcription requires review."
                      : "Human listening required for this language."}
                  </p>
                  {transcript?.evidenceId === e.id && (
                    <div className="transcript-text">
                      <Badge tone="amber">Unreviewed transcript</Badge>
                      <p>{transcript.transcript}</p>
                    </div>
                  )}
                </section>
              ))}
            </section>
            <section className="understanding-column">
              <div className="case-panel ai-panel">
                <div className="panel-heading">
                  <div>
                    <p className="eyebrow">META AI / EVIDENCE ASSISTANCE</p>
                    <h2>
                      {staff
                        ? "A brief you can inspect."
                        : "What would help next?"}
                    </h2>
                  </div>
                  <span className="meta-mark">∞</span>
                </div>
                <p>
                  {staff
                    ? "Trace observations to their source. Review uncertainty before responding."
                    : "A few useful observations can help your officer understand the concern."}
                </p>
                {r.crop === "Maize" ? (
                  <div className="analysis-actions">
                    <button
                      className="button primary"
                      disabled={!!busy}
                      onClick={() => analyse(staff ? "investigate" : "guide")}
                    >
                      {busy === "investigate" || busy === "guide" ? (
                        <>
                          <span className="spinner" /> Preparing...
                        </>
                      ) : staff ? (
                        "Generate evidence brief"
                      ) : (
                        "Ask AI for useful questions"
                      )}
                    </button>
                    {staff && (
                      <>
                        <button
                          className="button outline"
                          disabled={!!busy || !photos.length}
                          onClick={() => analyse("segment")}
                        >
                          {busy === "segment"
                            ? "Locating..."
                            : "Locate plant regions"}
                        </button>
                        <button
                          className="button outline"
                          disabled={
                            !!busy || recordings.at(-1)?.language !== "English"
                          }
                          onClick={() => analyse("transcribe")}
                        >
                          {busy === "transcribe"
                            ? "Transcribing..."
                            : "Transcribe latest voice note"}
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="capture-note">
                    AI supports maize only. An officer can review this crop
                    manually.
                  </p>
                )}
                {brief ? (
                  <div className="linked-brief">
                    <div className="brief-meta">
                      <Badge tone="amber">AI draft</Badge>
                      <small>
                        {briefRun.result.model} ·{" "}
                        {(briefRun.result.elapsedMs / 1000).toFixed(1)}s
                      </small>
                    </div>
                    <h3>{brief.summary}</h3>
                    {staff && (
                      <>
                        {[
                          ["Farmer reported", brief.reported],
                          ["Visible in evidence", brief.visible],
                        ].map(([title, items]) => (
                          <section key={title}>
                            <h4>{title}</h4>
                            {items.length ? (
                              items.map((x, i) => (
                                <article className="linked-observation" key={i}>
                                  <p>{x.text}</p>
                                  <div className="evidence-citations">
                                    {x.evidenceIds.map(cite)}
                                  </div>
                                </article>
                              ))
                            ) : (
                              <p>No supported observations returned.</p>
                            )}
                          </section>
                        ))}
                        <h4>Possible explanations, not a diagnosis</h4>
                        <ul>
                          {brief.possibilities.map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                        <h4>Still unknown</h4>
                        <ul>
                          {brief.unknowns.map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                        <h4>Background reading</h4>
                        {GUIDANCE.filter((g) =>
                          brief.referenceIds.includes(g.id),
                        ).map((g) => (
                          <a
                            className="reference-link"
                            key={g.id}
                            href={g.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {g.publisher} · {g.title} ↗
                          </a>
                        ))}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="brief-empty">
                    <span>◎</span>
                    <p>
                      {old
                        ? "Earlier AI output is outdated because evidence changed. Generate a fresh brief."
                        : "No current AI result. Your original evidence remains available for human review."}
                    </p>
                  </div>
                )}
                {questions.length > 0 && (
                  <form className="guided-questions" onSubmit={answerQuestions}>
                    <p className="eyebrow">
                      {brief
                        ? "AI-SUGGESTED QUESTIONS"
                        : "STANDARD EVIDENCE CHECKLIST"}
                    </p>
                    {questions.map((q, i) => (
                      <div key={q.key}>
                        <b>0{i + 1}</b>
                        <label>
                          {q.question}
                          <small>{q.reason}</small>
                          {!staff && (
                            <input
                              maxLength={500}
                              value={answers[q.key] || ""}
                              onChange={(e) =>
                                setAnswers({
                                  ...answers,
                                  [q.key]: e.target.value,
                                })
                              }
                              placeholder="Your observation, unsure, or skip"
                            />
                          )}
                        </label>
                      </div>
                    ))}
                    {!staff && (
                      <button
                        className="button outline"
                        disabled={
                          !!busy ||
                          !Object.values(answers).some((v) => v.trim())
                        }
                      >
                        Save answers
                      </button>
                    )}
                  </form>
                )}
                <details className="run-history">
                  <summary>Analysis history ({data.runs.length})</summary>
                  {data.runs.map((a) => (
                    <div key={a.id}>
                      <strong>{a.kind}</strong>
                      <Badge>
                        {a.state === "processing" &&
                        Date.now() - Date.parse(a.created_at) > 120000
                          ? "Interrupted"
                          : a.state}
                      </Badge>
                      <small>
                        Evidence v{a.evidence_version} · {date(a.created_at)}
                      </small>
                      {a.error && <p>{a.error}</p>}
                    </div>
                  ))}
                </details>
              </div>
              <section className="case-panel">
                <p className="eyebrow">EVIDENCE CHECKLIST</p>
                <h2>
                  {checklist.filter((c) => c.done).length} of {checklist.length}{" "}
                  details included
                </h2>
                <ul className="capture-checklist">
                  {checklist.map((c) => (
                    <li key={c.label}>
                      <span>{c.done ? "✓" : "○"}</span>
                      {c.label}
                    </li>
                  ))}
                </ul>
                <p className="panel-footnote">
                  Completeness does not measure disease risk or diagnostic
                  certainty.
                </p>
              </section>
            </section>
          </div>
          {!staff && (
            <section className="case-panel farmer-next">
              <div>
                <p className="eyebrow">KEEP THE CASE MOVING</p>
                <h2>Add a new observation.</h2>
                <p>Additional evidence is shared with your assigned team.</p>
              </div>
              <button
                className="button outline"
                disabled={!!busy}
                onClick={() => file.current.click()}
              >
                + Follow-up photograph
              </button>
              <input
                className="sr-only"
                type="file"
                ref={file}
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => {
                  attach(e.target.files[0]);
                  e.target.value = "";
                }}
              />
              {upload.current && (
                <button
                  className="button outline"
                  disabled={!!busy}
                  onClick={() => attach(null)}
                >
                  Retry attachment
                </button>
              )}
              <div className="followup-voice">
                <VoiceNote
                  value={audio}
                  onChange={setAudio}
                  onBusyChange={setVoiceBusy}
                />
                {audio && (
                  <>
                    <label>
                      Language
                      <select
                        value={language}
                        onChange={(e) => setLanguage(e.target.value)}
                      >
                        {["English", "Twi", "Dagbani", "Hausa", "Other"].map(
                          (l) => (
                            <option key={l}>{l}</option>
                          ),
                        )}
                      </select>
                    </label>
                    <button
                      className="button primary"
                      disabled={!!busy || voiceBusy}
                      onClick={() => attach(audio, "audio")}
                    >
                      Send voice update
                    </button>
                  </>
                )}
              </div>
            </section>
          )}
        </>
      )}
      {tab === "timeline" && (
        <div className="timeline-layout">
          <section className="case-panel">
            <p className="eyebrow">CASE HISTORY</p>
            <h2>Every observation. Every next step.</h2>
            <ol className="event-timeline">
              <li>
                <span className="event-dot" />
                <div>
                  <strong>Report submitted</strong>
                  <small>{date(r.createdAt)}</small>
                  <p>{r.description}</p>
                </div>
              </li>
              {data.events.map((e) => (
                <li key={e.id}>
                  <span className="event-dot" />
                  <div>
                    <header>
                      <strong>
                        {e.body.statusChange
                          ? "Case status updated"
                          : {
                              advice: "Reviewed advice",
                              question: "More information requested",
                              evidence: "Evidence added",
                              answers: "Farmer answers",
                              followup: "Farmer follow-up",
                              transcript: "Reviewed transcript",
                              region: "Region review",
                              review: "Officer review",
                            }[e.kind] || e.kind}
                      </strong>
                      <Badge tone={e.kind === "advice" ? "green" : "neutral"}>
                        {e.actor_name}
                      </Badge>
                    </header>
                    <small>{date(e.created_at)}</small>
                    <p>{e.body.text}</p>
                    {e.body.answers && (
                      <dl className="case-facts">
                        {Object.entries(e.body.answers).map(([k, v]) => (
                          <React.Fragment key={k}>
                            <dt>{k}</dt>
                            <dd>{v}</dd>
                          </React.Fragment>
                        ))}
                      </dl>
                    )}
                    {e.body.due && <p>Follow-up due: {e.body.due}</p>}
                    {e.body.outcome && (
                      <p>Reported outcome: {e.body.outcome}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
          {!staff && (
            <section className="case-panel">
              <p className="eyebrow">FIELD FOLLOW-UP</p>
              <h2>What has changed?</h2>
              <form onSubmit={send}>
                <label>
                  Since your last update
                  <select
                    value={outcome}
                    onChange={(e) => {
                      setOutcome(e.target.value);
                      request.current = null;
                    }}
                  >
                    {[
                      "Improved",
                      "Unchanged",
                      "Worsened",
                      "Cannot determine",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Your update
                  <textarea
                    required
                    maxLength={2000}
                    rows={5}
                    value={text}
                    onChange={(e) => {
                      setText(e.target.value);
                      request.current = null;
                    }}
                  />
                </label>
                <button className="button primary" disabled={!!busy}>
                  Send field update
                </button>
              </form>
            </section>
          )}
        </div>
      )}
      {tab === "review" && staff && (
        <div className="review-layout">
          <section className="case-panel">
            <p className="eyebrow">HUMAN JUDGEMENT</p>
            <h2>Make the next step clear.</h2>
            <p>
              Review original evidence before sending. Your name and update
              become part of the case history.
            </p>
            <form onSubmit={send}>
              <label>
                Type of update
                <select
                  value={action}
                  onChange={(e) => {
                    setAction(e.target.value);
                    request.current = null;
                  }}
                >
                  <option value="advice">Send reviewed advice</option>
                  <option value="question">Request more information</option>
                  <option value="review">Record review / outcome</option>
                  <option value="transcript">
                    Correct transcript / human translation
                  </option>
                  <option value="region">
                    Accept or reject AI-selected region
                  </option>
                </select>
              </label>
              <label>
                {action === "transcript"
                  ? "Corrected text and source recording date"
                  : "Your reviewed response"}
                <textarea
                  rows={8}
                  maxLength={4000}
                  required
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    request.current = null;
                  }}
                  placeholder="Explain what the evidence supports, what remains uncertain, and the next step."
                />
              </label>
              {["advice", "review"].includes(action) && (
                <label>
                  Follow-up date (optional)
                  <input
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={due}
                    onChange={(e) => {
                      setDue(e.target.value);
                      request.current = null;
                    }}
                  />
                </label>
              )}
              {action === "review" && (
                <label>
                  Review outcome
                  <select
                    value={outcome}
                    onChange={(e) => {
                      setOutcome(e.target.value);
                      request.current = null;
                    }}
                  >
                    {[
                      "Improved",
                      "Unchanged",
                      "Worsened",
                      "Cannot determine",
                    ].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
              )}
              <button className="button primary" disabled={!!busy}>
                Send reviewed update ↗
              </button>
            </form>
          </section>
          <aside>
            <section className="case-panel">
              <h2>Case status</h2>
              <label>
                Status
                <select
                  value={r.status}
                  disabled={!!busy}
                  onChange={(e) =>
                    work("status", async () => {
                      await api("/reports/" + id, {
                        method: "PATCH",
                        body: {
                          version: r.version,
                          status: e.target.value,
                          priority: r.priority,
                        },
                      });
                      await refresh();
                    })
                  }
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
                Officer-set priority
                <select
                  value={r.priority}
                  disabled={!!busy}
                  onChange={(e) =>
                    work("priority", async () => {
                      await api("/reports/" + id, {
                        method: "PATCH",
                        body: {
                          version: r.version,
                          status: r.status,
                          priority: e.target.value,
                        },
                      });
                      await refresh();
                    })
                  }
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
              </label>
              <p className="panel-footnote">
                Priority is set by a person. It is not a predicted crop-loss
                score.
              </p>
            </section>
            {user.role === "admin" && (
              <section className="case-panel">
                <h2>Assign an officer</h2>
                <label>
                  Find a verified officer
                  <input
                    value={officerQuery}
                    onChange={(e) => setOfficerQuery(e.target.value)}
                    placeholder="Name or email"
                  />
                </label>
                <button
                  className="button outline"
                  disabled={!!busy}
                  onClick={() =>
                    work("search", async () =>
                      setOfficers(
                        (
                          await api(
                            "/admin/users?" +
                              new URLSearchParams({
                                role: "officer",
                                q: officerQuery,
                                limit: 50,
                              }),
                          )
                        ).items.filter((u) => u.active && u.verified),
                      ),
                    )
                  }
                >
                  Find officers
                </button>
                <label>
                  Assignment
                  <select
                    value={officer}
                    onChange={(e) => setOfficer(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {officers.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  className="button primary"
                  disabled={!!busy}
                  onClick={() =>
                    work("assign", async () => {
                      await api("/reports/" + id + "/assignment", {
                        method: "PATCH",
                        body: {
                          officerId: officer || null,
                          version: r.version,
                        },
                      });
                      await refresh();
                    })
                  }
                >
                  Save assignment
                </button>
              </section>
            )}
          </aside>
        </div>
      )}
      {latestAdvice && tab !== "timeline" && !staff && (
        <section className="case-panel reviewed-advice">
          <Badge tone="green">Reviewed by {latestAdvice.actor_name}</Badge>
          <h2>Your next steps</h2>
          <p>{latestAdvice.body.text}</p>
          {latestAdvice.body.due && (
            <strong>Follow up by {latestAdvice.body.due}</strong>
          )}
          <button className="button outline" onClick={() => setTab("timeline")}>
            Reply with an update
          </button>
        </section>
      )}
    </div>
  );
}
