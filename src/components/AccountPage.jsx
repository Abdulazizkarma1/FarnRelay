import { en } from "../i18n/en.js";
import React, { useState } from "react";
import { api } from "../api.js";
import { PageTitle, Badge, ErrorNotice } from "./UI.jsx";
import Icon from "./Icon.jsx";
import "./AccountPage.css";
export default function AccountPage({ user, onUser, onLogout }) {
  const [name, setName] = useState(user.name),
    [community, setCommunity] = useState(user.community || ""),
    [current, setCurrent] = useState(""),
    [password, setPassword] = useState(""),
    [otp, setOtp] = useState(""),
    [enrollment, setEnrollment] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function run(task) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await task();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function profile(e) {
    e.preventDefault();
    await run(async () => {
      const d = await api("/auth/profile", {
        method: "PATCH",
        body: { name, community },
      });
      onUser(d.user);
      setMessage("Profile updated.");
    });
  }
  async function changePassword(e) {
    e.preventDefault();
    await run(async () => {
      const d = await api("/auth/password", {
        method: "POST",
        body: { currentPassword: current, password },
      });
      onUser(d.user);
      setCurrent("");
      setPassword("");
      setMessage("Password changed. Other sessions have been signed out.");
    });
  }
  async function setup(e) {
    e.preventDefault();
    await run(async () => {
      const d = await api("/auth/mfa/setup", {
        method: "POST",
        body: {},
      });
      setEnrollment(d.secret);
    });
  }
  async function confirm(e) {
    e.preventDefault();
    await run(async () => {
      const d = await api("/auth/mfa/confirm", {
        method: "POST",
        body: { otp },
      });
      onUser(d.user);
      setEnrollment("");
      setOtp("");
      setMessage(
        "Authenticator enabled. Keep your authenticator backup secure.",
      );
    });
  }
  return (
    <>
      <PageTitle
        eyebrow={en.legacy.accountpage_001}
        title={en.legacy.accountpage_002}
        description={en.legacy.accountpage_003}
      />
      <ErrorNotice error={error} />
      {message && (
        <p role="status" className="success-notice">
          {message}
        </p>
      )}
      <div className="account-grid">
        <section className="surface-card account-panel">
          <div className="account-panel-heading">
            <Icon name="user" />
            <h2>{en.legacy.accountpage_004}</h2>
            <Badge>{user.role}</Badge>
          </div>
          <form onSubmit={profile}>
            <label>
              {en.legacy.accountpage_005}
              <input
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              {en.legacy.accountpage_006}
              <input
                maxLength={100}
                value={community}
                onChange={(e) => setCommunity(e.target.value)}
              />
            </label>
            <label>
              {en.legacy.accountpage_007}
              <input value={user.email} disabled />
            </label>
            <div className="email-verification">
              <Badge tone={user.verified ? "green" : "amber"}>
                {user.verified
                  ? en.legacy.accountpage_008
                  : en.legacy.accountpage_009}
              </Badge>
              {!user.verified && (
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    run(async () =>
                      setMessage(
                        (await api("/auth/resend", { method: "POST" })).message,
                      ),
                    )
                  }
                >
                  {en.legacy.accountpage_010}
                </button>
              )}
            </div>
            <button className="button primary" disabled={busy}>
              {en.legacy.accountpage_011}
            </button>
          </form>
        </section>
        <section className="surface-card account-panel">
          <div className="account-panel-heading">
            <Icon name="shield" />
            <h2>{en.legacy.accountpage_012}</h2>
            <Badge tone={user.mfaEnabled ? "green" : "amber"}>
              {user.mfaEnabled
                ? en.legacy.accountpage_013
                : en.legacy.accountpage_014}
            </Badge>
          </div>
          <p>{en.legacy.accountpage_015}</p>
          {!user.mfaEnabled &&
            (enrollment ? (
              <form onSubmit={confirm}>
                <p>{en.legacy.accountpage_016}</p>
                <code className="mfa-secret">{enrollment}</code>
                <label>
                  {en.legacy.accountpage_017}
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                  />
                </label>
                <button className="button primary" disabled={busy}>
                  {en.legacy.accountpage_018}
                </button>
              </form>
            ) : (
              <form onSubmit={setup}>
                <button className="button outline" disabled={busy}>
                  {en.legacy.accountpage_019}
                </button>
              </form>
            ))}
          {user.mfaEnabled && (
            <div className="security-enabled">
              <Icon name="check" />
              <p>{en.legacy.accountpage_020}</p>
            </div>
          )}
        </section>
        <section className="surface-card account-panel">
          <div className="account-panel-heading">
            <Icon name="shield" />
            <h2>{en.legacy.accountpage_021}</h2>
          </div>
          <form onSubmit={changePassword}>
            <label>
              {en.legacy.accountpage_022}
              <input
                required
                type="password"
                autoComplete="current-password"
                maxLength={128}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </label>
            <label>
              {en.legacy.accountpage_023}
              <input
                required
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <small>{en.legacy.accountpage_024}</small>
            </label>
            <button className="button outline" disabled={busy}>
              {en.legacy.accountpage_025}
            </button>
          </form>
        </section>
        <section className="surface-card account-panel session-panel">
          <div className="account-panel-heading">
            <Icon name="logout" />
            <h2>{en.legacy.accountpage_026}</h2>
          </div>
          <p>{en.legacy.accountpage_027}</p>
          <button
            className="button danger"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api("/auth/logout-all", { method: "POST" });
                onLogout();
              })
            }
          >
            {en.legacy.accountpage_028}
          </button>
          <div className="account-storage-note">
            <Icon name="leaf" />
            <p>{en.legacy.accountpage_029}</p>
          </div>
        </section>
      </div>
    </>
  );
}
