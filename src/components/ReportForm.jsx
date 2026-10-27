import React, { useState, useRef } from "react";
import {
  newReportId,
  crops,
  symptoms,
  prepareImage,
  evidenceScore,
  evidenceChecks,
} from "../lib.js";
import "./ReportForm.css";
import VoiceNote from "./VoiceNote.jsx";
export default function ReportForm({ onSave, onCancel }) {
  const [step, setStep] = useState(1);
  const [report, setReport] = useState({
    crop: "Maize",
    community: "",
    symptom: "Leaf damage",
    onset: new Date().toISOString().slice(0, 10),
    description: "",
    affected: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const input = useRef(null);
  const change = (key, value) => setReport((r) => ({ ...r, [key]: value }));
  async function photo(file) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      setReport((r) => ({ ...r }));
      const image = await prepareImage(file);
      setReport((r) => ({ ...r, ...image }));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function next(e) {
    e.preventDefault();
    setError("");
    if (step < 3) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      await onSave({
        ...report,
        id: newReportId(),
        createdAt: new Date().toISOString(),
        status: "Needs review",
        sample: false,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="capture-layout">
      <section className="capture-panel">
        <div className="step-track">
          {["Capture evidence", "Add context", "Review report"].map(
            (name, i) => (
              <div className={step >= i + 1 ? "reached" : ""} key={name}>
                <b>{i + 1}</b>
                <span>{name}</span>
              </div>
            ),
          )}
        </div>
        <form onSubmit={next}>
          {step === 1 && (
            <>
              <p className="eyebrow">01 / EVIDENCE</p>
              <h2>Start with a closer look.</h2>
              <p className="secondary">
                Your own photo helps an officer understand what you see.
                Text-only reports are welcome too.
              </p>
              <div
                className={
                  "upload-zone " + (report.photoDataUrl ? "has-photo" : "")
                }
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  photo(e.dataTransfer.files[0]);
                }}
              >
                {report.photoDataUrl ? (
                  <>
                    <img
                      src={report.photoDataUrl}
                      alt="Your uploaded crop observation"
                    />
                    <button
                      type="button"
                      className="photo-change"
                      onClick={() => input.current.click()}
                    >
                      Replace photo
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="upload-button"
                    onClick={() => input.current.click()}
                  >
                    <span className="upload-symbol">+</span>
                    <strong>Drop a crop photo here</strong>
                    <span>or tap to choose from your device</span>
                    <small>JPG, PNG or WebP · up to 12 MB</small>
                  </button>
                )}
              </div>
              <input
                ref={input}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => photo(e.target.files[0])}
                className="sr-only"
                aria-label="Crop photo"
              />
              {report.photoDataUrl && (
                <div className="compression-info">
                  <span>
                    {report.photoWidth} × {report.photoHeight} pixels
                  </span>
                  <span>
                    {Math.round(report.photoBytes / 1024)} KB prepared for
                    upload
                  </span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setReport((r) => ({
                        ...r,
                        photoDataUrl: null,
                        photoBytes: 0,
                      }))
                    }
                  >
                    Remove
                  </button>
                </div>
              )}
              <label>
                Which crop?
                <select
                  value={report.crop}
                  onChange={(e) => change("crop", e.target.value)}
                >
                  {crops.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          {step === 1 && (
            <>
              <VoiceNote
                value={report.audioDataUrl}
                onChange={(v) => change("audioDataUrl", v)}
                onBusyChange={setVoiceBusy}
              />
              {report.audioDataUrl && (
                <label className="voice-language">
                  Recording language
                  <select
                    value={report.audioLanguage || ""}
                    required
                    onChange={(e) => change("audioLanguage", e.target.value)}
                  >
                    <option value="">Choose language</option>
                    {["English", "Twi", "Dagbani", "Hausa", "Other"].map(
                      (l) => (
                        <option key={l}>{l}</option>
                      ),
                    )}
                  </select>
                  <small>
                    English can be transcribed with Meta. Other languages are
                    kept for human listening.
                  </small>
                </label>
              )}
            </>
          )}
          {step === 2 && (
            <>
              <p className="eyebrow">02 / CONTEXT</p>
              <h2>What changed in the field?</h2>
              <p className="secondary">
                Describe observations in your own words. You do not need to
                identify a disease.
              </p>
              <div className="form-grid">
                <label>
                  Community
                  <input
                    required
                    maxLength={80}
                    value={report.community}
                    placeholder="For example, Navrongo"
                    onChange={(e) => change("community", e.target.value)}
                  />
                </label>
                <label>
                  First noticed
                  <input
                    required
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={report.onset}
                    onChange={(e) => change("onset", e.target.value)}
                  />
                </label>
              </div>
              <label>Visible concern</label>
              <div className="choice-grid">
                {symptoms.map((s) => (
                  <button
                    type="button"
                    key={s}
                    aria-pressed={report.symptom === s}
                    className={report.symptom === s ? "selected" : ""}
                    onClick={() => change("symptom", s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <label>
                Describe what you see
                <textarea
                  required={!report.audioDataUrl}
                  minLength={10}
                  maxLength={2000}
                  rows={4}
                  value={report.description}
                  onChange={(e) => change("description", e.target.value)}
                  placeholder="Which parts look different? Is it a few plants or several rows?"
                />
                <small>{report.description.length}/2000 characters</small>
              </label>
              <label>
                How much of the crop is affected?{" "}
                <span className="optional">Optional</span>
                <input
                  value={report.affected}
                  maxLength={100}
                  onChange={(e) => change("affected", e.target.value)}
                  placeholder="For example, about ten plants"
                />
              </label>
            </>
          )}
          {step === 3 && (
            <>
              <p className="eyebrow">03 / READY FOR REVIEW</p>
              <h2>Your observation, organised.</h2>
              <div className="review-summary">
                <div>
                  <small>Crop and community</small>
                  <h3>
                    {report.crop} in {report.community}
                  </h3>
                  <span className="pill">{report.symptom}</span>
                </div>
                <strong className="review-score">
                  {evidenceScore(report)}
                  <small>/100 complete</small>
                </strong>
              </div>
              <p>{report.description}</p>
              <ul className="review-checklist">
                {evidenceChecks(report).map((c) => (
                  <li key={c.label}>
                    <span className={c.passed ? "check-yes" : "check-no"}>
                      {c.passed ? "✓" : "○"}
                    </span>
                    {c.label}
                    <small>{c.weight} pts</small>
                  </li>
                ))}
              </ul>
              {report.audioDataUrl && (
                <audio controls src={report.audioDataUrl} />
              )}
              <div className="privacy-note">
                Saved on this device first. Choose Send to extension team on the
                next screen to share your report, photo and recording.
              </div>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              type="button"
              className="button ghost"
              onClick={() => (step === 1 ? onCancel() : setStep(step - 1))}
            >
              {step === 1 ? "Cancel" : "Back"}
            </button>
            <button className="button primary" disabled={busy || voiceBusy}>
              {busy ? "Working..." : step === 3 ? "Save my report" : "Continue"}{" "}
              <span>↗</span>
            </button>
          </div>
        </form>
      </section>
      <aside className="capture-guide">
        <span className="section-number">FIELD NOTES / 01</span>
        <h3>
          Better evidence.
          <br />
          Better conversations.
        </h3>
        <div>
          <b>01</b>
          <p>
            Photograph the whole plant, then move closer to the area you
            noticed.
          </p>
        </div>
        <div>
          <b>02</b>
          <p>
            Use natural light. Keep the plant in focus and avoid heavy shadows.
          </p>
        </div>
        <div>
          <b>03</b>
          <p>
            Describe what changed and when. A photo alone cannot explain
            everything.
          </p>
        </div>
        <p className="guide-bottom">
          No connection? Once this page is loaded, your observation can still be
          saved on this device. AI requests need a connection.
        </p>
      </aside>
    </div>
  );
}
