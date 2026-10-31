import { en } from "../i18n/en.js";
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
          setError(en.legacy.voicenote_001);
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
          setError(en.legacy.voicenote_002);
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
        e.name === en.legacy.voicenote_003
          ? en.legacy.voicenote_004
          : e.message,
      );
      setWaiting(false);
      onBusyChange(false);
    }
  }
  return (
    <section className="voice-note">
      <div>
        <span className="eyebrow">{en.legacy.voicenote_005}</span>
        <h3>{en.legacy.voicenote_006}</h3>
        <p>{en.legacy.voicenote_007}</p>
      </div>
      {value && (
        <audio
          controls
          preload="none"
          src={value}
          aria-label={en.legacy.voicenote_008}
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
            ? en.legacy.voicenote_009(seconds)
            : waiting
              ? en.legacy.voicenote_010
              : value
                ? en.legacy.voicenote_011
                : en.legacy.voicenote_012}
        </button>
        {value && !recording && (
          <button
            type="button"
            className="button ghost"
            disabled={waiting}
            onClick={() => onChange(null)}
          >
            {en.legacy.voicenote_013}
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
      <small>{en.legacy.voicenote_014}</small>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
    </section>
  );
}
