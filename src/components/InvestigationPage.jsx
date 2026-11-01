import { en } from "../i18n/en.js";
import { requestId } from "../id.js";
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
    if (live) setNotice(en.legacy.investigationpage_001);
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
      request.current ||= requestId();
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
          ? en.legacy.investigationpage_002
          : en.legacy.investigationpage_003,
      );
    });
  }
  async function answerQuestions(e) {
    e.preventDefault();
    await work("answers", async () => {
      await caseAction(id, "answers", {
        clientId: requestId(),
        answers,
      });
      setAnswers({});
      await refresh();
      setNotice(en.legacy.investigationpage_004);
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
      setNotice(en.legacy.investigationpage_005);
    });
  }
  async function attach(value, kind = "photo") {
    await work("upload", async () => {
      if (!value && !upload.current) return;
      let pending = upload.current;
      if (!pending) {
        const image = kind === "photo" ? await prepareImage(value) : null;
        pending = {
          id: requestId(),
          type: "attachment",
          reportId: id,
          clientId: data.report.clientId,
          crop: data.report.crop,
          community: data.report.community,
          attachment: {
            id: requestId(),
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
        setNotice(en.legacy.investigationpage_006);
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
      <Loading text={en.legacy.investigationpage_007} />
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
            <span>
              {en.legacy.investigationpage_008}
              {i + 1}
            </span>
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
        {data.evidence.find((e) => e.id === id)?.label ||
          en.legacy.investigationpage_009}
      </button>
    );
  return (
    <div className="case-workspace">
      <button className="text-button" onClick={() => navigate("reports")}>
        {en.legacy.investigationpage_010}
      </button>
      <header className="case-heading">
        <div>
          <p className="eyebrow">
            {staff
              ? en.legacy.investigationpage_011
              : en.legacy.investigationpage_012}
            {en.legacy.investigationpage_013} {id.slice(0, 8).toUpperCase()}
          </p>
          <h1>
            {r.crop}{" "}
            <span>
              {en.legacy.investigationpage_014}
              {r.community}
            </span>
          </h1>
          <p>
            {r.owner?.name}
            {en.legacy.investigationpage_015}
            {date(r.createdAt)}
            {en.legacy.investigationpage_016}{" "}
            {r.assignedTo?.name || en.legacy.investigationpage_017}
          </p>
        </div>
        <div>
          <Badge>{r.status}</Badge>
          <button
            className="button outline"
            disabled={!!busy}
            onClick={() => work("refresh", refresh)}
          >
            {en.legacy.investigationpage_018}
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
        <span className="complete">{en.legacy.investigationpage_019}</span>
        <span className={r.assignedTo ? "complete" : ""}>
          {en.legacy.investigationpage_020}
        </span>
        <span className={latestAdvice ? "complete" : ""}>
          {en.legacy.investigationpage_021}
        </span>
        <span className={r.followupDue ? "complete" : ""}>
          {en.legacy.investigationpage_022}
          {r.followupDue || ""}
        </span>
      </div>
      <nav className="case-tabs" aria-label={en.legacy.investigationpage_023}>
        {["investigation", "timeline", ...(staff ? ["review"] : [])].map(
          (t) => (
            <button
              key={t}
              aria-current={tab === t ? "page" : undefined}
              onClick={() => setTab(t)}
            >
              {t === "investigation"
                ? en.legacy.investigationpage_024
                : t === "timeline"
                  ? en.legacy.investigationpage_025
                  : en.legacy.investigationpage_026}
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
                  <h2>{en.legacy.investigationpage_027}</h2>
                  <span>
                    {photos.length}
                    {en.legacy.investigationpage_028}
                  </span>
                </div>
                {active?.url ? (
                  <>
                    <div className="evidence-toolbar">
                      <button
                        aria-pressed={zoom}
                        onClick={() => setZoom(!zoom)}
                      >
                        {zoom
                          ? en.legacy.investigationpage_029
                          : en.legacy.investigationpage_030}
                      </button>
                      <button
                        aria-pressed={boxes}
                        onClick={() => setBoxes(!boxes)}
                      >
                        {boxes
                          ? en.legacy.investigationpage_031
                          : en.legacy.investigationpage_032}
                      </button>
                      {photos.length > 1 && (
                        <button
                          aria-pressed={compare}
                          onClick={() => setCompare(!compare)}
                        >
                          {compare
                            ? en.legacy.investigationpage_033
                            : en.legacy.investigationpage_034}
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
                                  {e.label}
                                  {en.legacy.investigationpage_035}
                                  {date(e.created_at)}
                                </figcaption>
                              </figure>
                            ))
                        : photoElement(active)}
                    </div>
                    {segment?.evidenceId === active.id && (
                      <p className="capture-note" role="status">
                        {segment.boxes?.length
                          ? en.ai.regionsFound(segment.boxes.length)
                          : en.ai.regionsEmpty}
                      </p>
                    )}
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
                      {active.label}
                      {en.legacy.investigationpage_036}
                      {Math.round(active.media.bytes / 1024)}{" "}
                      {en.legacy.investigationpage_037}
                      {date(active.created_at)}
                      {en.legacy.investigationpage_038}
                    </p>
                  </>
                ) : (
                  <div className="evidence-placeholder">
                    <span>{en.legacy.investigationpage_039}</span>
                    <h3>
                      {active
                        ? en.legacy.investigationpage_040
                        : en.legacy.investigationpage_041}
                    </h3>
                    <p>
                      {active
                        ? en.legacy.investigationpage_042
                        : en.legacy.investigationpage_043}
                    </p>
                  </div>
                )}
              </div>
              <section className="case-panel" id="case-context">
                <p className="eyebrow">{en.legacy.investigationpage_044}</p>
                <h2>{en.legacy.investigationpage_045}</h2>
                <p>{r.description}</p>
                <dl className="case-facts">
                  <dt>{en.legacy.investigationpage_046}</dt>
                  <dd>
                    {r.answers?.onsetKnown === en.legacy.investigationpage_047
                      ? en.legacy.investigationpage_048
                      : r.onset}
                  </dd>
                  <dt>{en.legacy.investigationpage_049}</dt>
                  <dd>{r.symptom}</dd>
                  {Object.entries(r.answers || {}).map(([k, v]) => (
                    <React.Fragment key={k}>
                      <dt>{k.replace(/([A-Z])/g, " $1")}</dt>
                      <dd>{v || en.legacy.investigationpage_050}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </section>
              {recordings.map((e) => (
                <section className="case-panel recording-panel" key={e.id}>
                  <div className="panel-heading">
                    <h2>{en.legacy.investigationpage_051}</h2>
                    <Badge>{e.language}</Badge>
                  </div>
                  <audio controls preload="none" src={e.url} />
                  <p className="panel-footnote">
                    {e.language === "English"
                      ? en.legacy.investigationpage_052
                      : en.legacy.investigationpage_053}
                  </p>
                  {transcript?.evidenceId === e.id && (
                    <div className="transcript-text">
                      <Badge tone="amber">
                        {en.legacy.investigationpage_054}
                      </Badge>
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
                    <p className="eyebrow">{en.legacy.investigationpage_055}</p>
                    <h2>
                      {staff
                        ? en.legacy.investigationpage_056
                        : en.legacy.investigationpage_057}
                    </h2>
                  </div>
                  <span className="meta-mark">
                    {en.legacy.investigationpage_058}
                  </span>
                </div>
                <p>
                  {staff
                    ? en.legacy.investigationpage_059
                    : en.legacy.investigationpage_060}
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
                          <span className="spinner" />
                          {en.legacy.investigationpage_061}
                        </>
                      ) : staff ? (
                        en.legacy.investigationpage_062
                      ) : (
                        en.legacy.investigationpage_063
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
                            ? en.legacy.investigationpage_064
                            : en.legacy.investigationpage_065}
                        </button>
                        <button
                          className="button outline"
                          disabled={
                            !!busy || recordings.at(-1)?.language !== "English"
                          }
                          onClick={() => analyse("transcribe")}
                        >
                          {busy === "transcribe"
                            ? en.legacy.investigationpage_066
                            : en.legacy.investigationpage_067}
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="capture-note">
                    {en.legacy.investigationpage_068}
                  </p>
                )}
                {brief ? (
                  <div className="linked-brief">
                    <div className="brief-meta">
                      <Badge tone="amber">
                        {en.legacy.investigationpage_069}
                      </Badge>
                      <small>
                        {briefRun.result.model}
                        {en.legacy.investigationpage_070}{" "}
                        {(briefRun.result.elapsedMs / 1000).toFixed(1)}
                        {en.legacy.investigationpage_071}
                      </small>
                    </div>
                    <h3>{brief.summary}</h3>
                    {staff && (
                      <>
                        {[
                          [en.legacy.investigationpage_072, brief.reported],
                          [en.legacy.investigationpage_073, brief.visible],
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
                              <p>{en.legacy.investigationpage_074}</p>
                            )}
                          </section>
                        ))}
                        <h4>{en.legacy.investigationpage_075}</h4>
                        <ul>
                          {brief.possibilities.map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                        <h4>{en.legacy.investigationpage_076}</h4>
                        <ul>
                          {brief.unknowns.map((x, i) => (
                            <li key={i}>{x}</li>
                          ))}
                        </ul>
                        <h4>{en.legacy.investigationpage_077}</h4>
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
                            {g.publisher}
                            {en.legacy.investigationpage_078}
                            {g.title}
                            {en.legacy.investigationpage_079}
                          </a>
                        ))}
                      </>
                    )}
                  </div>
                ) : (
                  <div className="brief-empty">
                    <span>{en.legacy.investigationpage_080}</span>
                    <p>
                      {old
                        ? en.legacy.investigationpage_081
                        : en.legacy.investigationpage_082}
                    </p>
                  </div>
                )}
                {questions.length > 0 && (
                  <form className="guided-questions" onSubmit={answerQuestions}>
                    <p className="eyebrow">
                      {brief
                        ? en.legacy.investigationpage_083
                        : en.legacy.investigationpage_084}
                    </p>
                    {questions.map((q, i) => (
                      <div key={q.key}>
                        <b>
                          {en.legacy.investigationpage_085}
                          {i + 1}
                        </b>
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
                              placeholder={en.legacy.investigationpage_086}
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
                        {en.legacy.investigationpage_087}
                      </button>
                    )}
                  </form>
                )}
                <details className="run-history">
                  <summary>
                    {en.legacy.investigationpage_088}
                    {data.runs.length}
                    {en.legacy.investigationpage_089}
                  </summary>
                  {data.runs.map((a) => (
                    <div key={a.id}>
                      <strong>{a.kind}</strong>
                      <Badge>
                        {a.state === "processing" &&
                        Date.now() - Date.parse(a.created_at) > 120000
                          ? en.legacy.investigationpage_090
                          : a.state}
                      </Badge>
                      <small>
                        {en.legacy.investigationpage_091}
                        {a.evidence_version}
                        {en.legacy.investigationpage_092}
                        {date(a.created_at)}
                      </small>
                      {a.error && <p>{a.error}</p>}
                    </div>
                  ))}
                </details>
              </div>
              <section className="case-panel">
                <p className="eyebrow">{en.legacy.investigationpage_093}</p>
                <h2>
                  {checklist.filter((c) => c.done).length}
                  {en.legacy.investigationpage_094}
                  {checklist.length} {en.legacy.investigationpage_095}
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
                  {en.legacy.investigationpage_096}
                </p>
              </section>
            </section>
          </div>
          {!staff && (
            <section className="case-panel farmer-next">
              <div>
                <p className="eyebrow">{en.legacy.investigationpage_097}</p>
                <h2>{en.legacy.investigationpage_098}</h2>
                <p>{en.legacy.investigationpage_099}</p>
              </div>
              <button
                className="button outline"
                disabled={!!busy}
                onClick={() => file.current.click()}
              >
                {en.legacy.investigationpage_100}
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
                  {en.legacy.investigationpage_101}
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
                      {en.legacy.investigationpage_102}
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
                      {en.legacy.investigationpage_103}
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
            <p className="eyebrow">{en.legacy.investigationpage_104}</p>
            <h2>{en.legacy.investigationpage_105}</h2>
            <ol className="event-timeline">
              <li>
                <span className="event-dot" />
                <div>
                  <strong>{en.legacy.investigationpage_106}</strong>
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
                          ? en.legacy.investigationpage_107
                          : {
                              advice: en.legacy.investigationpage_108,
                              question: en.legacy.investigationpage_109,
                              evidence: en.legacy.investigationpage_110,
                              answers: en.legacy.investigationpage_111,
                              followup: en.legacy.investigationpage_112,
                              transcript: en.legacy.investigationpage_113,
                              region: en.legacy.investigationpage_114,
                              review: en.legacy.investigationpage_115,
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
                    {e.body.due && (
                      <p>
                        {en.legacy.investigationpage_116}
                        {e.body.due}
                      </p>
                    )}
                    {e.body.outcome && (
                      <p>
                        {en.legacy.investigationpage_117}
                        {e.body.outcome}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </section>
          {!staff && (
            <section className="case-panel">
              <p className="eyebrow">{en.legacy.investigationpage_118}</p>
              <h2>{en.legacy.investigationpage_119}</h2>
              <form onSubmit={send}>
                <label>
                  {en.legacy.investigationpage_120}
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
                  {en.legacy.investigationpage_121}
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
                  {en.legacy.investigationpage_122}
                </button>
              </form>
            </section>
          )}
        </div>
      )}
      {tab === "review" && staff && (
        <div className="review-layout">
          <section className="case-panel">
            <p className="eyebrow">{en.legacy.investigationpage_123}</p>
            <h2>{en.legacy.investigationpage_124}</h2>
            <p>{en.legacy.investigationpage_125}</p>
            <form onSubmit={send}>
              <label>
                {en.legacy.investigationpage_126}
                <select
                  value={action}
                  onChange={(e) => {
                    setAction(e.target.value);
                    request.current = null;
                  }}
                >
                  <option value="advice">
                    {en.legacy.investigationpage_127}
                  </option>
                  <option value="question">
                    {en.legacy.investigationpage_128}
                  </option>
                  <option value="review">
                    {en.legacy.investigationpage_129}
                  </option>
                  <option value="transcript">
                    {en.legacy.investigationpage_130}
                  </option>
                  <option value="region">
                    {en.legacy.investigationpage_131}
                  </option>
                </select>
              </label>
              <label>
                {action === "transcript"
                  ? en.legacy.investigationpage_132
                  : en.legacy.investigationpage_133}
                <textarea
                  rows={8}
                  maxLength={4000}
                  required
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    request.current = null;
                  }}
                  placeholder={en.legacy.investigationpage_134}
                />
              </label>
              {["advice", "review"].includes(action) && (
                <label>
                  {en.legacy.investigationpage_135}
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
                  {en.legacy.investigationpage_136}
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
                {en.legacy.investigationpage_137}
              </button>
            </form>
          </section>
          <aside>
            <section className="case-panel">
              <h2>{en.legacy.investigationpage_138}</h2>
              <label>
                {en.legacy.investigationpage_139}
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
                {en.legacy.investigationpage_140}
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
                  <option value="normal">
                    {en.legacy.investigationpage_141}
                  </option>
                  <option value="high">
                    {en.legacy.investigationpage_142}
                  </option>
                </select>
              </label>
              <p className="panel-footnote">
                {en.legacy.investigationpage_143}
              </p>
            </section>
            {user.role === "admin" && (
              <section className="case-panel">
                <h2>{en.legacy.investigationpage_144}</h2>
                <label>
                  {en.legacy.investigationpage_145}
                  <input
                    value={officerQuery}
                    onChange={(e) => setOfficerQuery(e.target.value)}
                    placeholder={en.legacy.investigationpage_146}
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
                  {en.legacy.investigationpage_147}
                </button>
                <label>
                  {en.legacy.investigationpage_148}
                  <select
                    value={officer}
                    onChange={(e) => setOfficer(e.target.value)}
                  >
                    <option value="">{en.legacy.investigationpage_149}</option>
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
                  {en.legacy.investigationpage_150}
                </button>
              </section>
            )}
          </aside>
        </div>
      )}
      {latestAdvice && tab !== "timeline" && !staff && (
        <section className="case-panel reviewed-advice">
          <Badge tone="green">
            {en.legacy.investigationpage_151}
            {latestAdvice.actor_name}
          </Badge>
          <h2>{en.legacy.investigationpage_152}</h2>
          <p>{latestAdvice.body.text}</p>
          {latestAdvice.body.due && (
            <strong>
              {en.legacy.investigationpage_153}
              {latestAdvice.body.due}
            </strong>
          )}
          <button className="button outline" onClick={() => setTab("timeline")}>
            {en.legacy.investigationpage_154}
          </button>
        </section>
      )}
    </div>
  );
}
