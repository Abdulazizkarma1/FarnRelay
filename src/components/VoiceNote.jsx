import React, { useEffect, useRef, useState } from "react";
import "./VoiceNote.css";
export default function VoiceNote({
  value,
  onChange,
  onBusyChange = () => {},
}) {
  const [recording, setRecording] = useState(false),
    [seconds, setSeconds] = useState(0),
    [error, setError] = useState(""),
    [waiting, setWaiting] = useState(false);
  const recorder = useRef(null),
    stream = useRef(null),
    timer = useRef(null),
    mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      clearInterval(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    },
    [],
  );
  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    clearInterval(timer.current);
    setRecording(false);
  }
  async function start() {
    setError("");
    setWaiting(true);
    onBusyChange(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw Error(
          "Recording is unavailable in this browser. Please use a recent browser or type your report.",
        );
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (x) => MediaRecorder.isTypeSupported(x),
      );
      const rec = new MediaRecorder(
        media,
        mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : {},
      );
      recorder.current = rec;
      const chunks = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        clearInterval(timer.current);
        media.getTracks().forEach((t) => t.stop());
        if (!mounted.current) return;
        setRecording(false);
        setWaiting(true);
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        if (blob.size > 1000000 || !blob.size) {
          setError("Recording was empty or too large. Please try again.");
          setWaiting(false);
          onBusyChange(false);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          if (mounted.current) {
            onChange(reader.result);
            setWaiting(false);
            onBusyChange(false);
          }
        };
        reader.onerror = () => {
          setError("Could not save recording.");
          setWaiting(false);
          onBusyChange(false);
        };
        reader.readAsDataURL(blob);
      };
      rec.start();
      setWaiting(false);
      setRecording(true);
      setSeconds(0);
      const began = Date.now();
      timer.current = setInterval(() => {
        const n = Math.floor((Date.now() - began) / 1000);
        setSeconds(n);
        if (n >= 29) stop();
      }, 250);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError(
        e.name === "NotAllowedError"
          ? "Microphone permission was denied. Enable it or type your report."
          : e.message,
      );
      setWaiting(false);
      onBusyChange(false);
    }
  }
  return (
    <section className="voice-note">
      <div>
        <span className="eyebrow">YOUR VOICE / UP TO 30 SECONDS</span>
        <h3>Tell us what changed.</h3>
        <p>Describe the crop, what you noticed and when it started.</p>
      </div>
      {value && (
        <audio
          controls
          preload="none"
          src={value}
          aria-label="Your recorded field note"
        />
      )}
      <div className="voice-actions">
        <button
          type="button"
          className={"button " + (recording ? "record-active" : "outline")}
          disabled={waiting}
          onClick={recording ? stop : start}
        >
          {recording
            ? `Stop recording · ${seconds}s`
            : waiting
              ? "Preparing..."
              : value
                ? "Record again"
                : "Record voice note"}
        </button>
        {value && !recording && (
          <button
            type="button"
            className="button ghost"
            disabled={waiting}
            onClick={() => onChange(null)}
          >
            Remove recording
          </button>
        )}
      </div>
      {recording && (
        <div className="voice-wave" aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <i
              key={i}
              style={{
                animationDelay: `${i * 0.07}s`,
                height: `${12 + ((i * 7) % 24)}px`,
              }}
            />
          ))}
        </div>
      )}
      <small>
        Saved on this device first. It is shared only when you send the report.
      </small>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
