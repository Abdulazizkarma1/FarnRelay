import React, { useEffect, useRef, useState } from "react";
import { api, navigate } from "../api.js";
import { clearPending, getPending } from "../auth-state.js";
import { friendlyAuthError } from "../auth-errors.js";
import { en } from "../i18n/en.js";
import AuthScreen from "./AuthScreen.jsx";
import AuthLayout from "./AuthLayout.jsx";
import { Alert, Button } from "./Primitives.jsx";
import "./AuthCallback.css";
export default function AuthCallback({
  callback,
  token,
  onAuthenticated,
  onVerified,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(callback?.error ? en.errors.expired : ""),
    [done, setDone] = useState(false),
    [recovery, setRecovery] = useState(""),
    [verifiedUser, setVerifiedUser] = useState(null);
  const lock = useRef(false),
    alert = useRef();
  useEffect(() => {
    history.replaceState(null, "", "/auth/verified");
  }, []);
  useEffect(() => {
    if (error) alert.current?.focus();
  }, [error]);
  async function confirm() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api(token ? "/auth/verify" : "/auth/callback", {
        method: "POST",
        body: token
          ? { token }
          : { code: callback.code, action: callback.action },
      });
      if (result.recoveryToken) setRecovery(result.recoveryToken);
      else {
        clearPending();
        setVerifiedUser(result.user || null);
        setDone(true);
        onVerified?.();
      }
    } catch (e) {
      setError(friendlyAuthError(e));
    } finally {
      lock.current = false;
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
    <AuthLayout
      title={
        done
          ? en.auth.verifiedTitle
          : callback?.action === "recovery"
            ? en.auth.resetTitle
            : en.auth.callbackTitle
      }
      description={
        done ? en.auth.verifiedDescription : en.auth.callbackDescription
      }
    >
      {error && (
        <Alert ref={alert}>
          {error}
          <p>{en.auth.linkHelp}</p>
        </Alert>
      )}
      {done ? (
        <Button
          onClick={() =>
            verifiedUser ? onAuthenticated(verifiedUser) : navigate("login")
          }
        >
          {verifiedUser ? en.auth.continueDashboard : en.auth.login}
        </Button>
      ) : (
        !callback?.error &&
        (token || callback?.code) && (
          <Button loading={busy} onClick={confirm}>
            {busy ? en.auth.verifying : en.auth.callbackAction}
          </Button>
        )
      )}
      {!done && (
        <div className="callback-options">
          <Button
            variant="secondary"
            onClick={() => {
              if (getPending()) navigate("verify-email");
              else navigate("signup");
            }}
          >
            {en.auth.requestNew}
          </Button>
          <a href="/login">{en.auth.alreadyVerified}</a>
          <a href="/forgot-password">{en.auth.forgot}</a>
        </div>
      )}
    </AuthLayout>
  );
}
