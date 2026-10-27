import React, { useState } from "react";
import { transcribeAudio } from "../relay.js";
import "./CaseThread.css";
export default function CaseThread({ report, role, onReply, onTranscript }) {
  const [text, setText] = useState(""),
    [status, setStatus] = useState(report.status || "Needs review"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [transcript, setTranscript] = useState(null);
  async function send(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onReply(text, status);
      setText("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function transcribe() {
    setBusy(true);
    setError("");
    try {
      setTranscript(await transcribeAudio(report.audioDataUrl));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="case-thread">
      <div className="section-heading">
        <div>
          <p className="eyebrow">FIELD CONVERSATION</p>
          <h2>
            {role === "officer"
              ? "Listen. Review. Respond."
              : "Updates from your officer"}
          </h2>
        </div>
        <span className="pill green">{report.status}</span>
      </div>
      {report.audioDataUrl && (
        <div className="audio-evidence">
          <strong>Original farmer recording</strong>
          <p>Language: {report.audioLanguage || "Not specified"}</p>
          <audio controls preload="none" src={report.audioDataUrl} />
          {role === "officer" && (
            <>
              <button
                className="button outline"
                disabled={busy || report.audioLanguage !== "English"}
                onClick={transcribe}
              >
                {busy ? "Working..." : "Transcribe with Meta"}
              </button>
              <small>
                English transcription. Other languages need a listener who
                understands the recording.
              </small>
            </>
          )}
          {transcript && (
            <div className="transcript">
              <span className="pill">META TRANSCRIPT / UNREVIEWED</span>
              <p>{transcript.transcript || "No speech detected."}</p>
              <small>
                {transcript.model} · {(transcript.elapsedMs / 1000).toFixed(1)}s
              </small>
              <button
                className="text-button"
                disabled={busy || !transcript.transcript}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    await onTranscript(transcript.transcript.slice(0, 2000));
                    setTranscript(null);
                  } catch (e) {
                    setError(e.message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save unreviewed transcript to case
              </button>
            </div>
          )}
        </div>
      )}
      <div className="thread-timeline">
        <article>
          <span>Farmer · initial report</span>
          <p>
            {report.description ||
              "Voice report attached. Please listen to the recording."}
          </p>
        </article>
        {(report.events || []).map((e) => (
          <article key={e.id} className={e.role}>
            <span>
              {e.role === "transcript"
                ? "AI transcript / unreviewed"
                : e.role === "officer"
                  ? "Extension team"
                  : "Farmer"}{" "}
              · {new Date(e.createdAt).toLocaleString()}
            </span>
            <p>{e.text}</p>
            {e.status && <small>Status: {e.status}</small>}
          </article>
        ))}
        {!report.events?.length && (
          <p className="secondary">
            No replies yet. A submission does not guarantee an immediate
            response.
          </p>
        )}
      </div>
      <form onSubmit={send}>
        <label>
          {role === "officer"
            ? "Your reviewed feedback"
            : "Reply or add an update"}
          <textarea
            required
            maxLength={2000}
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              role === "officer"
                ? "Give clear next steps or ask for more evidence."
                : "Tell the officer what has changed..."
            }
          />
        </label>
        {role === "officer" && (
          <label>
            Review status
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {["Needs review", "In review", "Follow-up needed", "Closed"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </label>
        )}
        <button className="button primary" disabled={busy}>
          {busy
            ? "Working..."
            : role === "officer"
              ? "Send feedback to farmer"
              : "Send update"}
        </button>
      </form>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
