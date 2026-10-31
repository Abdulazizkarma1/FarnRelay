import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import AuthScreen from "./AuthScreen.jsx";
import "./AuthCallback.css";
export default function AuthCallback({ callback, onAuthenticated }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(callback.error),
    [done, setDone] = useState(false),
    [recovery, setRecovery] = useState("");
  useEffect(() => {
    history.replaceState(null, "", location.pathname + "#email-callback");
  }, []);
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      const r = await api("/auth/callback", {
        method: "POST",
        body: { code: callback.code, action: callback.action },
      });
      if (r.recoveryToken) setRecovery(r.recoveryToken);
      else setDone(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (recovery)
    return (
      <AuthScreen
        mode="reset"
        token={recovery}
        onAuthenticated={onAuthenticated}
      />
    );
  return (
    <main className="auth-callback">
      <a href="#about">FarmRelay</a>
      <p className="eyebrow">YOUR ACCOUNT</p>
      <h1>
        {done
          ? "Email verified."
          : callback.action === "recovery"
            ? "Reset your password."
            : "Confirm your email."}
      </h1>
      <p>
        {done
          ? "You can now sign in to your FarmRelay account."
          : "Continue to securely complete the email link. Use the same browser where you requested it."}
      </p>
      {error && (
        <p role="alert" className="error-notice">
          {error}
        </p>
      )}
      {!done && !callback.error && (
        <button className="button primary" disabled={busy} onClick={confirm}>
          {busy ? "Checking link..." : "Continue securely"}
        </button>
      )}
      <a className="button outline" href="#login">
        Go to sign in
      </a>
      <a href="#forgot">Request a new password reset</a>
    </main>
  );
}
