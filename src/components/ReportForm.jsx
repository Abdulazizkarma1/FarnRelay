import { en } from "../i18n/en.js";
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
        label: en.legacy.reportform_1001,
        dataUrl: r.audioDataUrl,
        language: r.audioLanguage || "English",
      });
  }
  return r;
}
const STEPS = [
  en.legacy.reportform_1002,
  en.legacy.reportform_1003,
  en.legacy.reportform_1004,
  en.legacy.reportform_1005,
];
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
                label: en.legacy.reportform_1006,
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
        <nav className="capture-steps" aria-label={en.legacy.reportform_001}>
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
              {en.legacy.reportform_002}
              {String(step + 1).padStart(2, "0")}
            </p>
            <span role="status">{saveState}</span>
          </div>
          {step === 0 && (
            <>
              <h2>{en.legacy.reportform_003}</h2>
              <p className="secondary">{en.legacy.reportform_004}</p>
              <div className="form-grid">
                <label>
                  {en.legacy.reportform_005}
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
                  {en.legacy.reportform_006}
                  <input
                    required
                    minLength={2}
                    maxLength={100}
                    value={report.community}
                    onChange={(e) => change("community", e.target.value)}
                    placeholder={en.legacy.reportform_007}
                  />
                </label>
              </div>
              {report.crop !== "Maize" && (
                <p className="capture-note">{en.legacy.reportform_008}</p>
              )}
              <label>
                {en.legacy.reportform_009}
                <select
                  value={report.answers.growthStage || ""}
                  onChange={(e) => answer("growthStage", e.target.value)}
                >
                  <option value="">{en.legacy.reportform_010}</option>
                  {[
                    en.legacy.reportform_011,
                    en.legacy.reportform_012,
                    en.legacy.reportform_013,
                    en.legacy.reportform_014,
                    en.legacy.reportform_015,
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>{en.legacy.reportform_016}</legend>
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
              <h2>{en.legacy.reportform_017}</h2>
              <p className="secondary">{en.legacy.reportform_018}</p>
              <div className="capture-photo-tools">
                <label>
                  {en.legacy.reportform_019}
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
                  {en.legacy.reportform_020}
                </button>
                <input
                  ref={file}
                  className="sr-only"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  aria-label={en.legacy.reportform_021}
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
                        <span>
                          {Math.round(e.bytes / 1024)}
                          {en.legacy.reportform_022}
                        </span>
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
                        {en.legacy.reportform_023}
                        {e.label.toLowerCase()}
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
                  {en.legacy.reportform_024}
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
                  <small>{en.legacy.reportform_025}</small>
                </label>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <h2>{en.legacy.reportform_026}</h2>
              <div className="form-grid">
                <label>
                  {en.legacy.reportform_027}
                  <input
                    type="date"
                    required
                    max={new Date().toISOString().slice(0, 10)}
                    value={report.onset}
                    onChange={(e) => change("onset", e.target.value)}
                  />
                </label>
                <label>
                  {en.legacy.reportform_028}
                  <select
                    value={report.answers.onsetKnown || "Known"}
                    onChange={(e) => answer("onsetKnown", e.target.value)}
                  >
                    <option>{en.legacy.reportform_029}</option>
                    <option>{en.legacy.reportform_030}</option>
                    <option>{en.legacy.reportform_031}</option>
                  </select>
                </label>
              </div>
              <label>
                {en.legacy.reportform_032}
                <select
                  value={report.answers.extent || ""}
                  onChange={(e) => answer("extent", e.target.value)}
                >
                  <option value="">{en.legacy.reportform_033}</option>
                  {[
                    en.legacy.reportform_034,
                    en.legacy.reportform_035,
                    en.legacy.reportform_036,
                    en.legacy.reportform_037,
                  ].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                {en.legacy.reportform_038}
                <textarea
                  required={!audio}
                  maxLength={2000}
                  rows={4}
                  value={report.description}
                  placeholder={en.legacy.reportform_039}
                  onChange={(e) => change("description", e.target.value)}
                />
              </label>
              <div className="capture-prompts">
                <p className="eyebrow">{en.legacy.reportform_040}</p>
                {questions.map((q) => (
                  <label key={q.key}>
                    {q.question}
                    <small>
                      {q.reason}
                      {en.legacy.reportform_041}
                    </small>
                    <input
                      maxLength={500}
                      value={report.answers[q.key] || ""}
                      onChange={(e) => answer(q.key, e.target.value)}
                      placeholder={en.legacy.reportform_042}
                    />
                  </label>
                ))}
              </div>
            </>
          )}
          {step === 3 && (
            <>
              <h2>{en.legacy.reportform_043}</h2>
              <p className="secondary">{en.legacy.reportform_044}</p>
              <div className="capture-summary">
                <div>
                  <small>{en.legacy.reportform_045}</small>
                  <strong>{report.crop}</strong>
                </div>
                <div>
                  <small>{en.legacy.reportform_046}</small>
                  <strong>{report.community}</strong>
                </div>
                <div>
                  <small>{en.legacy.reportform_047}</small>
                  <strong>
                    {report.evidence.length}
                    {en.legacy.reportform_048}{" "}
                    {Math.round(attachmentBytes(report.evidence) / 1024)}
                    {en.legacy.reportform_049}
                  </strong>
                </div>
              </div>
              <p>{report.description || en.legacy.reportform_050}</p>
              <ul className="capture-checklist">
                {checklist.map((c) => (
                  <li key={c.label}>
                    <span>{c.done ? "✓" : "○"}</span>
                    {c.label}
                    <small>
                      {c.done
                        ? en.legacy.reportform_051
                        : en.legacy.reportform_052}
                    </small>
                  </li>
                ))}
              </ul>
              <p className="capture-note">{en.legacy.reportform_053}</p>
              {progress && (
                <div role="status" className="upload-progress">
                  <strong>
                    {progress.state === "submitted"
                      ? en.legacy.reportform_054
                      : en.legacy.reportform_055(progress.label || "case")}
                  </strong>
                  <progress
                    value={progress.completed}
                    max={progress.total || 1}
                  />
                  <small>
                    {progress.completed}
                    {en.legacy.reportform_056}
                    {progress.total}
                    {en.legacy.reportform_057}
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
              {onDraft ? en.legacy.reportform_058 : en.legacy.reportform_059}
            </button>
            <div>
              {step > 0 && (
                <button
                  type="button"
                  className="button ghost"
                  disabled={busy || voiceBusy}
                  onClick={() => setStep(step - 1)}
                >
                  {en.legacy.reportform_060}
                </button>
              )}
              <button className="button primary" disabled={busy || voiceBusy}>
                {busy
                  ? en.legacy.reportform_061
                  : step === 3
                    ? submitLabel
                    : en.legacy.reportform_062}{" "}
                <span aria-hidden="true">{en.legacy.reportform_063}</span>
              </button>
            </div>
          </footer>
        </form>
      </section>
      <aside className="capture-aside">
        <div className="capture-aside-photo">
          <img src="/images/landscape.webp" alt={en.legacy.reportform_064} />
          <span>{en.legacy.reportform_065}</span>
        </div>
        <p className="eyebrow">{en.legacy.reportform_066}</p>
        <h3>
          {en.legacy.reportform_067}
          <br />
          {en.legacy.reportform_068}
        </h3>
        <ol>
          <li>
            <b>{en.legacy.reportform_069}</b>
            <p>{en.legacy.reportform_070}</p>
          </li>
          <li>
            <b>{en.legacy.reportform_071}</b>
            <p>{en.legacy.reportform_072}</p>
          </li>
          <li>
            <b>{en.legacy.reportform_073}</b>
            <p>{en.legacy.reportform_074}</p>
          </li>
        </ol>
        <div className="capture-note">{en.legacy.reportform_075}</div>
      </aside>
    </div>
  );
}
