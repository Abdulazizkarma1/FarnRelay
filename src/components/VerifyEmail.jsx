import React, { useEffect, useRef, useState } from "react";
import { api, navigate } from "../api.js";
import { getSupabase } from "../supabase.js";
import {
  getPending,
  clearPending,
  recordResend,
  resendState,
} from "../auth-state.js";
import { friendlyAuthError } from "../auth-errors.js";
import { en } from "../i18n/en.js";
import AuthLayout from "./AuthLayout.jsx";
import { Button, Alert, Toast, Spinner } from "./Primitives.jsx";
import "./VerifyEmail.css";
export default function VerifyEmail({ onAuthenticated }) {
  const [pending, setPending] = useState(getPending),
    [now, setNow] = useState(Date.now()),
    [busy, setBusy] = useState(""),
    [feedback, setFeedback] = useState(""),
    [tone, setTone] = useState("info"),
    [toast, setToast] = useState("");
  const lock = useRef(false),
    checking = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    if (!pending) navigate("signup");
  }, [pending]);
  async function check(manual = false) {
    if (checking.current || navigator.onLine === false) return;
    checking.current = true;
    try {
      const { data } = await getSupabase().auth.getSession();
      if (!data.session) {
        if (manual) setFeedback(en.auth.notYet);
        return;
      }
      const result = await api("/auth/me");
      if (result.user?.verified && alive.current) {
        clearPending();
        onAuthenticated(result.user);
      } else if (manual) setFeedback(en.auth.notYet);
    } catch {
      if (manual && alive.current) setFeedback(en.auth.notYet);
    } finally {
      checking.current = false;
    }
  }
  useEffect(() => {
    alive.current = true;
    const tick = setInterval(() => setNow(Date.now()), 1000),
      poll = setInterval(() => {
        if (document.visibilityState === "visible") check();
      }, 15000);
    const focus = () => check();
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    let subscription;
    try {
      subscription = getSupabase().auth.onAuthStateChange(() => {
        setTimeout(() => check(), 0);
      }).data.subscription;
    } catch {}
    return () => {
      alive.current = false;
      clearInterval(tick);
      clearInterval(poll);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
      subscription?.unsubscribe();
    };
  }, []);
  if (!pending)
    return (
      <main className="verify-redirect">
        <Spinner />
      </main>
    );
  const state = resendState(pending, now);
  async function resend() {
    if (lock.current || state.remaining || state.limited) return;
    if (navigator.onLine === false) {
      setFeedback(en.common.offline);
      setTone("error");
      return;
    }
    lock.current = true;
    setBusy("resend");
    setFeedback("");
    const updated = recordResend(pending);
    setPending(updated);
    setNow(Date.now());
    try {
      await api("/auth/resend-public", {
        method: "POST",
        body: { email: pending.email },
      });
      setFeedback(en.auth.resendSuccess);
      setTone("success");
      setToast(en.auth.resendSuccess);
    } catch (e) {
      const message = friendlyAuthError(e);
      setFeedback(message);
      setToast(message);
      setTone("error");
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  return (
    <AuthLayout title={en.auth.verifyTitle}>
      <div className="verify-icon" aria-hidden="true">
        <svg
          viewBox="0 0 32 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <rect x="3" y="6" width="26" height="20" rx="4" />
          <path d="m4 8 12 10L28 8" />
        </svg>
      </div>
      <p>
        {en.auth.sent}{" "}
        <strong className="verify-email-address">{pending.email}</strong>
        {en.legacy.verifyemail_001}
      </p>
      <ol className="verify-steps">
        {en.auth.verifyInstructions.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <p className="ds-hint">{en.auth.verifyHint}</p>
      <div className="verify-feedback" aria-live="polite" aria-atomic="true">
        {feedback && <Alert tone={tone}>{feedback}</Alert>}
      </div>
      {state.limited && <Alert tone="info">{en.auth.resendLimit}</Alert>}
      <div className="verify-actions">
        <Button
          loading={busy === "resend"}
          disabled={!!state.remaining || state.limited}
          onClick={resend}
        >
          {busy === "resend"
            ? en.auth.resending
            : state.remaining
              ? en.auth.resendCountdown(state.remaining)
              : en.auth.resend}
        </Button>
        <Button
          variant="secondary"
          disabled={!!busy}
          onClick={() => check(true)}
        >
          {en.auth.checkVerification}
        </Button>
        <a href="/signup">{en.auth.wrongEmail}</a>
        <a href="/login">{en.common.back}</a>
      </div>
      <div className="verify-mailboxes">
        <a href="https://mail.google.com/" target="_blank" rel="noreferrer">
          {en.auth.gmail}
          {en.legacy.verifyemail_002}
        </a>
        <a
          href="https://outlook.live.com/mail/"
          target="_blank"
          rel="noreferrer"
        >
          {en.auth.outlook}
          {en.legacy.verifyemail_003}
        </a>
      </div>
      <Toast
        message={toast}
        tone={tone}
        announce={false}
        onDismiss={() => setToast("")}
      />
    </AuthLayout>
  );
}
