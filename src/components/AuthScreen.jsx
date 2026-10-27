import React, { useState } from "react";
import { api, navigate } from "../api.js";
import { ErrorNotice } from "./UI.jsx";
import Icon from "./Icon.jsx";
import "./AuthScreen.css";
export default function AuthScreen({
  mode = "login",
  token,
  onAuthenticated,
  onVerified,
}) {
  const [form, setForm] = useState({
      name: "",
      email: "",
      password: "",
      community: "",
      otp: "",
      recoveryCode: "",
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [mfa, setMfa] = useState(false),
    [recovery, setRecovery] = useState(false);
  const change = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const titles = {
    login: "Welcome back.",
    register: "A better connection\nto your farm.",
    forgot: "Let’s get you back in.",
    reset: "Choose a new password.",
    verify: "Verify your email.",
  };
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      let body;
      if (mode === "login")
        body = {
          email: form.email,
          password: form.password,
          ...(mfa
            ? recovery
              ? { recoveryCode: form.recoveryCode }
              : { otp: form.otp }
            : {}),
        };
      else if (mode === "register")
        body = {
          name: form.name,
          email: form.email,
          password: form.password,
          community: form.community,
        };
      else if (mode === "forgot") body = { email: form.email };
      else if (mode === "reset") body = { token, password: form.password };
      else body = { token };
      const result = await api("/auth/" + mode, { method: "POST", body });
      if (result.user) onAuthenticated(result.user);
      else {
        setMessage(result.message);
        if (mode === "verify") onVerified?.();
      }
    } catch (e) {
      setError(e.message);
      if (e.code === "MFA_REQUIRED") setMfa(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-page">
      <section className="auth-story">
        <img src="/images/landscape.svg" alt="Green fields in morning light" />
        <div className="auth-overlay" />
        <a href="#login" className="auth-brand">
          <span>
            <Icon name="leaf" size={25} />
          </span>
          FarmRelay
        </a>
        <div className="auth-story-copy">
          <span className="auth-kicker">CLOSER TO THE FIELD</span>
          <h1>
            Every farm
            <br />
            has a story.
            <br />
            <em>Let’s listen.</em>
          </h1>
          <p>
            One place for field observations, trusted extension support and
            thoughtful follow-up.
          </p>
          <div className="auth-story-tags">
            <span>Photo & voice reports</span>
            <span>Human-led guidance</span>
          </div>
        </div>
        <small className="auth-credit">Illustrative farmland photography</small>
      </section>
      <section className="auth-panel">
        <div className="auth-top">
          <span>FARMER & EXTENSION WORKSPACE</span>
          <Icon name="leaf" />
        </div>
        <div className="auth-form-wrap">
          <p className="eyebrow">
            {mode === "register"
              ? "START WITH YOUR FIELD"
              : mode === "login"
                ? "YOUR WORKSPACE AWAITS"
                : "ACCOUNT SECURITY"}
          </p>
          <h2>{titles[mode] || titles.login}</h2>
          <p className="auth-description">
            {mode === "register"
              ? "Create a farmer account. Officer access is granted by an administrator."
              : mode === "login"
                ? "Sign in to pick up where you left off."
                : mode === "verify"
                  ? "Confirm this email address to start sending reports."
                  : "Use your registered email and keep your account secure."}
          </p>
          <ErrorNotice error={error} />
          {message && (
            <div className="success-notice" role="status">
              {message}
            </div>
          )}
          <form onSubmit={submit}>
            {mode === "register" && (
              <>
                <label>
                  Full name
                  <input
                    required
                    autoComplete="name"
                    maxLength={100}
                    value={form.name}
                    onChange={(e) => change("name", e.target.value)}
                  />
                </label>
                <label>
                  Community
                  <input
                    maxLength={100}
                    value={form.community}
                    onChange={(e) => change("community", e.target.value)}
                    placeholder="For example, Navrongo"
                  />
                </label>
              </>
            )}
            {["login", "register", "forgot"].includes(mode) && (
              <label>
                Email address
                <input
                  type="email"
                  required
                  autoComplete="email"
                  maxLength={254}
                  value={form.email}
                  onChange={(e) => change("email", e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
            )}
            {["login", "register", "reset"].includes(mode) && (
              <label>
                Password
                <input
                  type="password"
                  required
                  minLength={mode === "login" ? 1 : 12}
                  maxLength={128}
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  value={form.password}
                  onChange={(e) => change("password", e.target.value)}
                />
                {mode !== "login" && (
                  <small>
                    Use at least 12 characters. A long, unique phrase works
                    well.
                  </small>
                )}
              </label>
            )}
            {mfa && (
              <>
                <label>
                  {recovery ? "Recovery code" : "Authenticator code"}
                  <input
                    required
                    inputMode={recovery ? "text" : "numeric"}
                    autoComplete="one-time-code"
                    value={recovery ? form.recoveryCode : form.otp}
                    maxLength={recovery ? 32 : 6}
                    onChange={(e) =>
                      change(recovery ? "recoveryCode" : "otp", e.target.value)
                    }
                  />
                </label>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => setRecovery(!recovery)}
                >
                  {recovery
                    ? "Use authenticator instead"
                    : "Use a recovery code"}
                </button>
              </>
            )}
            {mode === "login" && (
              <div className="auth-forgot">
                <a href="#forgot">Forgot password?</a>
              </div>
            )}
            <button
              className="button primary auth-submit"
              disabled={
                busy || ((mode === "reset" || mode === "verify") && !token)
              }
            >
              {busy
                ? "Please wait..."
                : {
                    login: "Sign in",
                    register: "Create account",
                    forgot: "Send reset link",
                    reset: "Save new password",
                    verify: "Verify email",
                  }[mode]}
              <Icon name="arrow" size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {mode === "login" ? (
              <>
                New to FarmRelay?{" "}
                <a href="#register">Create a farmer account</a>
              </>
            ) : (
              <a href="#login">Back to sign in</a>
            )}
          </p>
        </div>
        <div className="auth-bottom">
          <Icon name="shield" size={16} />
          <span>Private accounts. Human-reviewed feedback.</span>
        </div>
      </section>
    </div>
  );
}
