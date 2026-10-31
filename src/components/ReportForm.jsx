import React, { useEffect, useRef, useState } from "react";
import { prepareImage, newReportId, crops, symptoms } from "../lib.js";
import {
  attachmentBytes,
  evidenceChecklist,
  PHOTO_LABELS,
  nextQuestions,
} from "../investigation.js";
import VoiceNote from "./VoiceNote.jsx";
import "./ReportForm.css";
function resumeDraft(draft = {}) {
  const r = { ...draft, answers: draft.answers || {} };
  if (!r.evidence) {
    r.evidence = [];
    if (r.photoDataUrl)
      r.evidence.push({
        id: newReportId(),
        kind: "photo",
        label: "Additional evidence",
        dataUrl: r.photoDataUrl,
        width: r.photoWidth,
        height: r.photoHeight,
        bytes: r.photoBytes || 0,
      });
    if (r.audioDataUrl)
      r.evidence.push({
        id: newReportId(),
        kind: "audio",
        label: "Voice note",
        dataUrl: r.audioDataUrl,
        language: r.audioLanguage || "English",
      });
  }
  return r;
}
const STEPS = ["The crop", "Your evidence", "Field context", "Review & send"];
export default function ReportForm({
  onSave,
  onCancel,
  onDraft,
  initialReport,
  submitLabel = "Submit case",
  progress,
}) {
  const [report, setReport] = useState(() => ({
    id: newReportId(),
    crop: "Maize",
    community: "",
    symptom: "Leaf damage",
    onset: new Date().toISOString().slice(0, 10),
    description: "",
    answers: {},
    evidence: [],
    ...resumeDraft(initialReport),
  }));
  const [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [voiceBusy, setVoiceBusy] = useState(false),
    [error, setError] = useState(""),
    [saveState, setSaveState] = useState(""),
    [label, setLabel] = useState("Whole plant");
  const draftTimer = useRef(),
    file = useRef(),
    latest = useRef(report),
    saving = useRef(Promise.resolve());
  latest.current = report;
  useEffect(() => {
    const timer = (draftTimer.current = setTimeout(() => {
      if (!onDraft) return;
      setSaveState("Saving on this device...");
      saving.current = saving.current
        .catch(() => {})
        .then(() => onDraft(report));
      saving.current
        .then(() => setSaveState("Saved on this device"))
        .catch(() =>
          setSaveState("Device storage unavailable. Keep this page open."),
        );
    }, 600));
    return () => clearTimeout(timer);
  }, [report, onDraft]);
  function change(key, value) {
    setReport((r) => ({ ...r, [key]: value }));
  }
  function answer(key, value) {
    setReport((r) => ({ ...r, answers: { ...r.answers, [key]: value } }));
  }
  async function photo(f) {
    if (!f) return;
    setBusy(true);
    setError("");
    try {
      if (report.evidence.length >= 4)
        throw Error(
          "Keep this report to four attachments. More can be added after submission.",
        );
      const image = await prepareImage(f);
      setReport((r) => ({
        ...r,
        evidence: [
          ...r.evidence,
          {
            id: newReportId(),
            kind: "photo",
            label,
            dataUrl: image.photoDataUrl,
            bytes: image.photoBytes,
            width: image.photoWidth,
            height: image.photoHeight,
            quality: image.quality,
          },
        ],
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }
  const audio = report.evidence.find((e) => e.kind === "audio");
  function voice(value) {
    setReport((r) => ({
      ...r,
      evidence: [
        ...r.evidence.filter((e) => e.kind !== "audio"),
        ...(value
          ? [
              {
                id: newReportId(),
                kind: "audio",
                label: "Voice note",
                dataUrl: value,
                bytes: Math.floor((value.split(",")[1].length * 3) / 4),
                language: audio?.language || "English",
              },
            ]
          : []),
      ],
    }));
  }
  async function next(e) {
    e.preventDefault();
    setError("");
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    clearTimeout(draftTimer.current);
    try {
      await saving.current.catch(() => {});
      await onSave(report);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const checklist = evidenceChecklist(report, report.evidence);
  // Keep optional questions mounted while the farmer types an answer.
  const questions = nextQuestions(
    { ...report, answers: { ...report.answers, insects: "" } },
    report.evidence,
  ).filter((q) => q.key !== "extent");
  async function leave() {
    setBusy(true);
    setError("");
    clearTimeout(draftTimer.current);
    try {
      await saving.current.catch(() => {});
      if (onDraft) await onDraft(latest.current);
      onCancel();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="capture-layout investigation-capture">
      <section className="capture-panel">
        <nav className="capture-steps" aria-label="Report progress">
          {STEPS.map((s, i) => (
            <button
              type="button"
              key={s}
              disabled={i > step || busy}
              aria-current={i === step ? "step" : undefined}
              onClick={() => setStep(i)}
            >
              <b>{i < step ? "✓" : i + 1}</b>
              <span>{s}</span>
            </button>
          ))}
        </nav>
        <form onSubmit={next}>
          <div className="capture-heading">
            <p className="eyebrow">
              FIELD REPORT / {String(step + 1).padStart(2, "0")}
            </p>
            <span role="status">{saveState}</span>
          </div>
          {step === 0 && (
            <>
              <h2>What changed in your crop?</h2>
              <p className="secondary">
                Start with what you know. You do not need to know the cause.
              </p>
              <div className="form-grid">
                <label>
                  Crop
                  <select
                    value={report.crop}
                    onChange={(e) => change("crop", e.target.value)}
                  >
                    {crops.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Community
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    value={report.community}
                    onChange={(e) => change("community", e.target.value)}
                    placeholder="Your community"
                  />
                </label>
              </div>
              {report.crop !== "Maize" && (
                <p className="capture-note">
                  AI investigation supports maize in this release. This crop
                  will be sent for human review.
                </p>
              )}
              <label>
                Growth stage
                <select
                  value={report.answers.growthStage || ""}
                  onChange={(e) => answer("growthStage", e.target.value)}
                >
                  <option value="">Choose if known</option>
                  {[
                    "Seedling",
                    "Vegetative",
                    "Flowering",
                    "Maturing",
                    "I do not know",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>Visible concern</legend>
                <div className="choice-grid">
                  {symptoms.map((s) => (
                    <button
                      className={report.symptom === s ? "selected" : ""}
                      type="button"
                      aria-pressed={report.symptom === s}
                      key={s}
                      onClick={() => change("symptom", s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          )}
          {step === 1 && (
            <>
              <h2>A wider view. A closer look.</h2>
              <p className="secondary">
                Add a whole-plant photo and a close view if possible. Text-only
                reports are also welcome.
              </p>
              <div className="capture-photo-tools">
                <label>
                  Photo label
                  <select
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                  >
                    {PHOTO_LABELS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  className="button primary"
                  disabled={busy || report.evidence.length >= 4}
                  onClick={() => file.current.click()}
                >
                  + Add photograph
                </button>
                <input
                  ref={file}
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label="Crop photograph"
                  onChange={(e) => photo(e.target.files[0])}
                />
              </div>
              <div className="capture-photos">
                {report.evidence
                  .filter((e) => e.kind === "photo")
                  .map((e) => (
                    <figure key={e.id}>
                      <img src={e.dataUrl} alt={e.label} />
                      <figcaption>
                        <strong>{e.label}</strong>
                        <span>{Math.round(e.bytes / 1024)} KB</span>
                      </figcaption>
                      {e.quality?.warning && <small>{e.quality.warning}</small>}
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          change(
                            "evidence",
                            report.evidence.filter((x) => x.id !== e.id),
                          )
                        }
                      >
                        Remove {e.label.toLowerCase()}
                      </button>
                    </figure>
                  ))}
              </div>
              {(audio || report.evidence.length < 4) && (
                <VoiceNote
                  value={audio?.dataUrl}
                  onChange={voice}
                  onBusyChange={setVoiceBusy}
                />
              )}{" "}
              {audio && (
                <label>
                  Recording language
                  <select
                    value={audio.language}
                    onChange={(e) =>
                      change(
                        "evidence",
                        report.evidence.map((x) =>
                          x.id === audio.id
                            ? { ...x, language: e.target.value }
                            : x,
                        ),
                      )
                    }
                  >
                    {["English", "Twi", "Dagbani", "Hausa", "Other"].map(
                      (s) => (
                        <option key={s}>{s}</option>
                      ),
                    )}
                  </select>
                  <small>
                    English transcription is available to officers. Other
                    recordings are kept for human listening.
                  </small>
                </label>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <h2>Give the evidence some context.</h2>
              <div className="form-grid">
                <label>
                  When did you notice it?
                  <input
                    type="date"
                    required
                    max={new Date().toISOString().slice(0, 10)}
                    value={report.onset}
                    onChange={(e) => change("onset", e.target.value)}
                  />
                </label>
                <label>
                  How certain is the date?
                  <select
                    value={report.answers.onsetKnown || "Known"}
                    onChange={(e) => answer("onsetKnown", e.target.value)}
                  >
                    <option>Known</option>
                    <option>Approximate</option>
                    <option>Unknown</option>
                  </select>
                </label>
              </div>
              <label>
                How many plants are affected?
                <select
                  value={report.answers.extent || ""}
                  onChange={(e) => answer("extent", e.target.value)}
                >
                  <option value="">Choose if known</option>
                  {[
                    "One plant",
                    "Several plants",
                    "Much of the field",
                    "Unsure",
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                What have you noticed?
                <textarea
                  required={!audio}
                  maxLength={2000}
                  rows={4}
                  value={report.description}
                  placeholder="Describe the change in your own words."
                  onChange={(e) => change("description", e.target.value)}
                />
              </label>
              <div className="capture-prompts">
                <p className="eyebrow">USEFUL DETAILS / OFFLINE CHECKLIST</p>
                {questions.map((q) => (
                  <label key={q.key}>
                    {q.question}
                    <small>{q.reason} You can skip this.</small>
                    <input
                      maxLength={500}
                      value={report.answers[q.key] || ""}
                      onChange={(e) => answer(q.key, e.target.value)}
                      placeholder="Your observation or unsure"
                    />
                  </label>
                ))}
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <h2>Ready for a closer look.</h2>
              <p className="secondary">
                Your case goes to authorised extension staff. AI can help
                collect missing evidence after submission.
              </p>
              <div className="capture-summary">
                <div>
                  <small>CROP</small>
                  <strong>{report.crop}</strong>
                </div>
                <div>
                  <small>COMMUNITY</small>
                  <strong>{report.community}</strong>
                </div>
                <div>
                  <small>ATTACHMENTS</small>
                  <strong>
                    {report.evidence.length} ·{" "}
                    {Math.round(attachmentBytes(report.evidence) / 1024)} KB
                  </strong>
                </div>
              </div>
              <p>
                {report.description || "Voice recording provided for review."}
              </p>
              <ul className="capture-checklist">
                {checklist.map((c) => (
                  <li key={c.label}>
                    <span>{c.done ? "✓" : "○"}</span>
                    {c.label}
                    <small>{c.done ? "Included" : "Not recorded"}</small>
                  </li>
                ))}
              </ul>
              <p className="capture-note">
                Submitting shares your evidence with authorised staff and may
                send relevant content to Meta for assistance. A device draft
                remains until all attachments are confirmed. This service does
                not guarantee a response time.
              </p>
              {progress && (
                <div role="status" className="upload-progress">
                  <strong>
                    {progress.state === "submitted"
                      ? "Submitted"
                      : `Uploading ${progress.label || "case"}...`}
                  </strong>
                  <progress
                    value={progress.completed}
                    max={progress.total || 1}
                  />
                  <small>
                    {progress.completed} / {progress.total} attachments
                  </small>
                </div>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="error-notice">
              {error}
            </p>
          )}
          <footer className="capture-actions">
            <button
              type="button"
              className="button outline"
              disabled={busy || voiceBusy}
              onClick={leave}
            >
              {onDraft ? "Save & leave" : "Leave walkthrough"}
            </button>
            <div>
              {step > 0 && (
                <button
                  type="button"
                  className="button ghost"
                  disabled={busy || voiceBusy}
                  onClick={() => setStep(step - 1)}
                >
                  Back
                </button>
              )}
              <button className="button primary" disabled={busy || voiceBusy}>
                {busy ? "Working..." : step === 3 ? submitLabel : "Continue"}{" "}
                <span aria-hidden="true">↗</span>
              </button>
            </div>
          </footer>
        </form>
      </section>
      <aside className="capture-aside">
        <div className="capture-aside-photo">
          <img src="/images/landscape.webp" alt="Cultivated fields" />
          <span>FROM FIELD TO FOLLOW-UP</span>
        </div>
        <p className="eyebrow">A CLEARER CONVERSATION</p>
        <h3>
          You bring the observation.
          <br />
          We help organise it.
        </h3>
        <ol>
          <li>
            <b>Show the change</b>
            <p>Photograph the whole plant and the affected area.</p>
          </li>
          <li>
            <b>Share your context</b>
            <p>A short description or voice note helps.</p>
          </li>
          <li>
            <b>Keep in touch</b>
            <p>Your officer can ask questions and follow up.</p>
          </li>
        </ol>
        <div className="capture-note">
          Drafts stay on this browser. Cloud AI and submission need a
          connection.
        </div>
      </aside>
    </div>
  );
}
