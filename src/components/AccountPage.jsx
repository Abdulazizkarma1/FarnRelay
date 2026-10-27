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
    [mfaPassword, setMfaPassword] = useState(""),
    [otp, setOtp] = useState(""),
    [enrollment, setEnrollment] = useState(""),
    [codes, setCodes] = useState([]),
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
        body: { password: mfaPassword },
      });
      setEnrollment(d.secret);
      setMfaPassword("");
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
      setCodes(d.recoveryCodes);
      setMessage(
        "Authenticator enabled. Save your recovery codes now. They will not be shown again.",
      );
    });
  }
  return (
    <>
      <PageTitle
        eyebrow="ACCOUNT & SECURITY"
        title="Your account. Your control."
        description="Manage your profile, sign-in security and active sessions."
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
            <h2>Profile details</h2>
            <Badge>{user.role}</Badge>
          </div>
          <form onSubmit={profile}>
            <label>
              Full name
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
              Community
              <input
                maxLength={100}
                value={community}
                onChange={(e) => setCommunity(e.target.value)}
              />
            </label>
            <label>
              Email address
              <input value={user.email} disabled />
            </label>
            <div className="email-verification">
              <Badge tone={user.verified ? "green" : "amber"}>
                {user.verified ? "Verified" : "Not verified"}
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
                  Resend verification email
                </button>
              )}
            </div>
            <button className="button primary" disabled={busy}>
              Save profile
            </button>
          </form>
        </section>
        <section className="surface-card account-panel">
          <div className="account-panel-heading">
            <Icon name="shield" />
            <h2>Authenticator protection</h2>
            <Badge tone={user.mfaEnabled ? "green" : "amber"}>
              {user.mfaEnabled ? "Enabled" : "Not enabled"}
            </Badge>
          </div>
          <p>
            Add a six-digit sign-in code from an authenticator app. Required for
            administrator access management and assignments.
          </p>
          {codes.length > 0 && (
            <div className="recovery-codes">
              <h3>Save these recovery codes privately.</h3>
              <p>
                Each code works once if you lose your authenticator. Keep them
                somewhere safe outside this browser.
              </p>
              <div>
                {codes.map((c) => (
                  <code key={c}>{c}</code>
                ))}
              </div>
              <button className="button outline" onClick={() => setCodes([])}>
                I have saved my codes
              </button>
            </div>
          )}
          {!user.mfaEnabled &&
            (enrollment ? (
              <form onSubmit={confirm}>
                <p>
                  In your authenticator app, add a time-based account named
                  FarmRelay using this setup key:
                </p>
                <code className="mfa-secret">{enrollment}</code>
                <label>
                  Six-digit code
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
                  Enable authenticator
                </button>
              </form>
            ) : (
              <form onSubmit={setup}>
                <label>
                  Confirm your password
                  <input
                    type="password"
                    required
                    autoComplete="current-password"
                    maxLength={128}
                    value={mfaPassword}
                    onChange={(e) => setMfaPassword(e.target.value)}
                  />
                </label>
                <button className="button outline" disabled={busy}>
                  Set up authenticator
                </button>
              </form>
            ))}
          {user.mfaEnabled && !codes.length && (
            <div className="security-enabled">
              <Icon name="check" />
              <p>
                Your account requires an authenticator or an unused recovery
                code at sign-in.
              </p>
            </div>
          )}
        </section>
        <section className="surface-card account-panel">
          <div className="account-panel-heading">
            <Icon name="shield" />
            <h2>Change password</h2>
          </div>
          <form onSubmit={changePassword}>
            <label>
              Current password
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
              New password
              <input
                required
                type="password"
                minLength={12}
                maxLength={128}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <small>At least 12 characters. Use a unique passphrase.</small>
            </label>
            <button className="button outline" disabled={busy}>
              Update password
            </button>
          </form>
        </section>
        <section className="surface-card account-panel session-panel">
          <div className="account-panel-heading">
            <Icon name="logout" />
            <h2>Session control</h2>
          </div>
          <p>
            Sessions expire after 30 minutes of inactivity or eight hours.
            Signing out everywhere revokes all active sessions, including this
            one.
          </p>
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
            Sign out all devices
          </button>
          <div className="account-storage-note">
            <Icon name="leaf" />
            <p>
              Unsent drafts stay on this browser and are shown only when you
              sign into this account. Use Device drafts to remove them before
              sharing your device.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}
