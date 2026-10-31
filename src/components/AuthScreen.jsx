import LegalCopy from "./LegalContent.jsx";
import React, { useRef, useState, useEffect } from "react";
import { api, navigate } from "../api.js";
import { en } from "../i18n/en.js";
import {
  validateAuth,
  passwordGuidance,
  normalizeEmail,
} from "../../shared/auth-validation.js";
import { savePending, getPending, clientAttempt } from "../auth-state.js";
import { friendlyAuthError } from "../auth-errors.js";
import AuthLayout from "./AuthLayout.jsx";
import {
  Input,
  PasswordInput,
  Select,
  Checkbox,
  Button,
  Alert,
  Modal,
} from "./Primitives.jsx";
import "./AuthScreen.css";

export default function AuthScreen({
  mode = "login",
  token,
  onAuthenticated,
  onVerified,
  notice,
}) {
  const kind = mode === "signup" ? "register" : mode;
  const [form, setForm] = useState(() => ({
    name: "",
    email: getPending()?.email || "",
    password: "",
    role: getPending()?.role || "farmer",
    terms: false,
    otp: "",
  }));
  const [touched, setTouched] = useState({}),
    [errors, setErrors] = useState({}),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [slow, setSlow] = useState(false),
    [done, setDone] = useState(false),
    [mfa, setMfa] = useState(false),
    [unverified, setUnverified] = useState(false),
    [termsOpen, setTermsOpen] = useState(false);
  const lock = useRef(false),
    summary = useRef();
  useEffect(() => {
    if (!busy) {
      setSlow(false);
      return;
    }
    const id = setTimeout(() => setSlow(true), 7000);
    return () => clearTimeout(id);
  }, [busy]);
  useEffect(() => {
    if (error) {
      summary.current?.focus();
      summary.current?.scrollIntoView({ block: "center", behavior: "instant" });
    }
  }, [error]);
  function change(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
    if (touched[key])
      setErrors((old) => ({
        ...old,
        [key]: validateAuth(kind, { ...form, [key]: value })[key],
      }));
  }
  function blur(key) {
    setTouched((t) => ({ ...t, [key]: true }));
    setErrors((old) => ({ ...old, [key]: validateAuth(kind, form)[key] }));
  }
  const field = (key) => ({
    id: `auth-${key}`,
    value: form[key],
    onChange: (e) => change(key, e.target.value),
    onBlur: () => blur(key),
    error: errors[key] ? en.errors[errors[key]] : undefined,
  });
  async function submit(e) {
    e.preventDefault();
    if (lock.current) return;
    const invalid = validateAuth(kind, form);
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      requestAnimationFrame(() => {
        summary.current?.focus();
        summary.current?.scrollIntoView({ block: "center" });
      });
      return;
    }
    if (navigator.onLine === false) {
      setError(en.common.offline);
      return;
    }
    if (!clientAttempt(kind)) {
      setError(en.errors.rate);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    setUnverified(false);
    try {
      const result = await api("/auth/" + kind, {
        method: "POST",
        body: { ...form, email: normalizeEmail(form.email), token },
      });
      if (kind === "register") {
        savePending(form.email, { role: form.role });
        setForm((f) => ({ ...f, password: "" }));
        navigate("verify-email");
        return;
      }
      if (result.user) {
        setForm((f) => ({ ...f, password: "" }));
        if (!result.user.verified) {
          savePending(result.user.email, { sent: false });
          navigate("verify-email");
        }
        onAuthenticated?.(result.user);
        return;
      }
      setForm((f) => ({ ...f, password: "" }));
      setDone(true);
      if (kind === "verify") onVerified?.();
    } catch (e) {
      setError(friendlyAuthError(e));
      if (e.code === "MFA_REQUIRED") setMfa(true);
      if (e.code === "email_not_confirmed") {
        setUnverified(true);
        savePending(form.email, { sent: false });
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const titles = {
    register: en.auth.signupTitle,
    login: en.auth.loginTitle,
    forgot: en.auth.forgotTitle,
    reset: en.auth.resetTitle,
    verify: en.auth.callbackTitle,
  };
  const descriptions = {
    register: en.auth.signupDescription,
    login: en.auth.loginDescription,
    forgot: en.auth.forgotDescription,
    reset: en.auth.resetDescription,
    verify: en.auth.callbackDescription,
  };
  const guide = passwordGuidance(form.password, form.email),
    hasEmail = ["register", "login", "forgot"].includes(kind),
    hasPassword = ["register", "login", "reset"].includes(kind);
  if (done)
    return (
      <AuthLayout
        title={
          kind === "forgot"
            ? en.auth.resetSentTitle
            : kind === "reset"
              ? en.auth.resetDone
              : en.auth.verifiedTitle
        }
        description={
          kind === "forgot" ? en.auth.resetSent : en.auth.verifiedDescription
        }
      >
        <a className="ds-button ds-primary" href="/login">
          {en.auth.login}
        </a>
        {kind === "forgot" && <p className="ds-hint">{en.auth.verifyHint}</p>}
      </AuthLayout>
    );
  return (
    <AuthLayout
      title={titles[kind] || en.auth.loginTitle}
      description={descriptions[kind]}
    >
      {notice&&<Alert tone="info">{notice}</Alert>}
      <form onSubmit={submit} noValidate aria-busy={busy}>
        {(error || Object.values(errors).some(Boolean)) && (
          <Alert
            ref={summary}
            className="ds-alert ds-alert-error account-server-error"
          >
            <strong>{error || en.errors.summary}</strong>
            {Object.entries(errors).some(([, v]) => v) && (
              <ul className="account-error-list">
                {Object.entries(errors)
                  .filter(([, v]) => v)
                  .map(([key, value]) => (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() =>
                          document.getElementById(`auth-${key}`)?.focus()
                        }
                      >
                        {en.errors[value]}
                      </button>
                    </li>
                  ))}
              </ul>
            )}
            {unverified && (
              <Button
                variant="secondary"
                onClick={() => {
                  setForm((f) => ({ ...f, password: "" }));
                  navigate("verify-email");
                }}
              >
                {en.auth.resend}
              </Button>
            )}
          </Alert>
        )}
        {kind === "register" && (
          <Input
            {...field("name")}
            label={en.auth.name}
            autoComplete="name"
            maxLength={100}
            required
          />
        )}
        {hasEmail && (
          <Input
            {...field("email")}
            label={en.auth.email}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={254}
            required
            placeholder={en.auth.emailPlaceholder}
          />
        )}
        {hasPassword && (
          <PasswordInput
            {...field("password")}
            label={kind === "reset" ? en.auth.newPassword : en.auth.password}
            required
            maxLength={256}
            autoComplete={
              kind === "login" ? "current-password" : "new-password"
            }
            hint={kind === "login" ? undefined : en.auth.passwordHint}
          />
        )}
        {hasPassword && kind !== "login" && (
          <div className="password-guidance">
            <label htmlFor="password-meter">
              {en.auth.strength}
              {en.legacy.authscreen_001}
              {en.auth.levels[guide.level]}
            </label>
            <meter id="password-meter" min={0} max={3} value={guide.level} />
            <ul>
              <li>
                {guide.length >= 15 ? "✓ " : ""}
                {en.auth.passwordLength}
              </li>
              <li>
                {guide.valid ? "✓ " : ""}
                {en.auth.passwordUnique}
              </li>
            </ul>
            <p>{en.auth.strengthNote}</p>
          </div>
        )}
        {kind === "register" && (
          <>
            <Select
              {...field("role")}
              label={en.auth.role}
              hint={en.auth.roleHint}
            >
              <option value="farmer">{en.auth.farmer}</option>
              <option value="officer">{en.auth.officer}</option>
            </Select>
            <Checkbox
              required
              id="auth-terms"
              label={en.auth.terms}
              checked={form.terms}
              onChange={(e) => change("terms", e.target.checked)}
              onBlur={() => blur("terms")}
              error={errors.terms ? en.errors[errors.terms] : undefined}
            />
            <button
              className="account-terms-button"
              type="button"
              onClick={() => setTermsOpen(true)}
            >
              {en.auth.termsLink}
            </button>
          </>
        )}
        {mfa && (
          <Input
            id="auth-otp"
            label={en.auth.otp}
            hint={en.auth.otpHelp}
            value={form.otp}
            onChange={(e) => change("otp", e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
          />
        )}
        {kind === "login" && (
          <a className="account-help" href="/forgot-password">
            {en.auth.forgot}
          </a>
        )}
        {(kind === "reset" || kind === "verify") && !token ? (
          <Alert tone="info">
            {en.auth.noResetToken}
            <a href="/forgot-password">{en.auth.forgot}</a>
          </Alert>
        ) : (
          <Button type="submit" loading={busy}>
            {busy
              ? {
                  register: en.auth.creating,
                  login: en.auth.signingIn,
                  forgot: en.auth.sending,
                  reset: en.auth.savingPassword,
                  verify: en.auth.verifying,
                }[kind]
              : {
                  register: en.auth.signup,
                  login: en.auth.login,
                  forgot: en.auth.sendReset,
                  reset: en.auth.savePassword,
                  verify: en.auth.verifyAction,
                }[kind]}
          </Button>
        )}
        <p className="account-slow" role="status">
          {slow
            ? en.common.slow
            : busy
              ? {
                  register: en.auth.creating,
                  login: en.auth.signingIn,
                  forgot: en.auth.sending,
                  reset: en.auth.savingPassword,
                  verify: en.auth.verifying,
                }[kind]
              : ""}
        </p>
      </form>
      <p className="account-links">
        {kind === "login" ? (
          <>
            {en.auth.newHere} <a href="/signup">{en.auth.createLink}</a>
          </>
        ) : (
          <>
            {en.auth.already} <a href="/login">{en.auth.login}</a>
          </>
        )}
      </p>
      <Modal
        open={termsOpen}
        title={en.legal.title}
        onClose={() => setTermsOpen(false)}
      >
        <LegalCopy />
      </Modal>
    </AuthLayout>
  );
}
