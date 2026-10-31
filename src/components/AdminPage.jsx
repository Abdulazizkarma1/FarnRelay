import {en} from "../i18n/en.js";
import React, { useEffect, useRef, useState } from "react";
import { api, navigate } from "../api.js";
import {
  PageTitle,
  Badge,
  ErrorNotice,
  Loading,
  Empty,
  Pagination,
  DateText,
} from "./UI.jsx";
import Icon from "./Icon.jsx";
import "./AdminPage.css";
export default function AdminPage({ user, mode }) {
  const [data, setData] = useState(null),
    [page, setPage] = useState(1),
    [q, setQ] = useState(""),
    [query, setQuery] = useState(""),
    [role, setRole] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(null),
    [editRole, setEditRole] = useState("farmer"),
    [active, setActive] = useState(true);
  const dialog = useRef(null);
  async function load() {
    setBusy(true);
    setError("");
    try {
      setData(
        await api(
          "/admin/" +
            (mode === "audit" ? "audit" : "users") +
            "?" +
            new URLSearchParams({ page, q, ...(role ? { role } : {}) }),
        ),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (user.mfaEnabled) load();
  }, [mode, page, q, role, user.mfaEnabled]);
  useEffect(() => {
    if (selected) {
      setEditRole(selected.role);
      setActive(selected.active);
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [selected]);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/admin/users/" + selected.id, {
        method: "PATCH",
        body: { role: editRole, active },
      });
      setSelected(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function revoke() {
    setBusy(true);
    setError("");
    try {
      await api("/admin/users/" + selected.id + "/revoke", { method: "POST" });
      setSelected(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (!user.mfaEnabled)
    return (
      <Empty
        title="Protect your admin account first."
        description="Enable your authenticator to manage permissions and view the audit log."
        action={
          <button
            className="button primary"
            onClick={() => navigate("account")}
          >
            Open security settings
          </button>
        }
      />
    );
  return (
    <>
      <PageTitle
        eyebrow="ADMINISTRATION"
        title={
          mode === "audit"
            ? "A clear record of action."
            : "The people behind FarmRelay."
        }
        description={
          mode === "audit"
            ? "Review access changes, case activity and model requests."
            : "Manage farmer and officer access. Role changes revoke existing sessions."
        }
      />
      <ErrorNotice error={!selected && error} />
      {mode !== "audit" && (
        <div className="report-controls">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setQ(query);
              setPage(1);
            }}
          >
            <Icon name="search" size={17} />
            <input
              aria-label="Search users"
              placeholder="Search name or email..."
              value={query}
              maxLength={100}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="text-button">Search</button>
          </form>
          <select
            aria-label="Filter account role"
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All roles</option>
            {["farmer", "officer", "admin"].map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
      )}
      {busy && !selected ? (
        <Loading />
      ) : data?.items.length ? (
        <>
          <div className="admin-register">
            {mode === "audit"
              ? data.items.map((item) => (
                  <article className="audit-row" key={item._id}>
                    <span className="audit-icon">
                      <Icon
                        name={
                          item.action.startsWith("ai.") ? "spark" : "shield"
                        }
                      />
                    </span>
                    <div>
                      <strong>
                        {item.action
                          .replaceAll(".", " / ")
                          .replaceAll("_", " ")}
                      </strong>
                      <p>
                        {item.actorName} · <DateText value={item.createdAt} />
                      </p>
                      <small>Target: {item.target}</small>
                      {Object.keys(item.details || {}).length > 0 && (
                        <details>
                          <summary>Details</summary>
                          <pre>{JSON.stringify(item.details, null, 2)}</pre>
                        </details>
                      )}
                    </div>
                  </article>
                ))
              : data.items.map((u) => (
                  <div className="user-row" key={u.id}>
                    <span className="avatar">
                      {u.name.slice(0, 2).toUpperCase()}
                    </span>
                    <div>
                      <strong>{u.name}</strong>
                      <p>{u.email}</p>
                    </div>
                    <Badge>{u.role}</Badge>
                    <Badge tone={u.active ? "green" : "neutral"}>
                      {u.active ? "Active" : "Suspended"}
                    </Badge>
                    <span className="verification-label">
                      {u.verified ? "Email verified" : "Unverified email"}
                    </span>
                    {u.role !== "admin" ? (
                      <button
                        className="button subtle"
                        onClick={() => setSelected(u)}
                      >
                        Manage
                      </button>
                    ) : (
                      <span className="admin-protected">
                        <Icon name="shield" size={15} />
                        Protected
                      </span>
                    )}
                  </div>
                ))}
          </div>
          <Pagination {...data} onChange={setPage} />
        </>
      ) : (
        <Empty
          title="No records found."
          description="Try a different search or filter."
        />
      )}
      <dialog
        ref={dialog}
        className="access-dialog"
        onCancel={() => setSelected(null)}
      >
        <div className="access-dialog-header">
          <span className="eyebrow">ACCOUNT PERMISSIONS</span>
          <button
            aria-label="Close access editor"
            disabled={busy}
            onClick={() => setSelected(null)}
          >
            ×
          </button>
        </div>
        {selected && (
          <>
            <h2>{selected.name}</h2>
            <p>{selected.email}</p>{selected.requestedRole==="officer"&&selected.role==="farmer"&&<p>{en.auth.officerRequested}</p>}
            <ErrorNotice error={error} />
            <form onSubmit={save}>
              <label>
                Account role
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                >
                  <option value="farmer">Farmer: own reports only</option>
                  <option value="officer" disabled={!selected.verified}>
                    Officer: assigned reports only
                  </option>
                </select>
              </label>
              <label>
                Account status
                <select
                  value={active ? "active" : "suspended"}
                  onChange={(e) => setActive(e.target.value === "active")}
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </label>
              <p className="access-warning">
                Saving revokes this person’s current sessions. Changes are
                recorded in the audit log. Existing reports are retained.
              </p>
              <div className="access-dialog-actions">
                <button
                  type="button"
                  className="button subtle"
                  disabled={busy}
                  onClick={() => setSelected(null)}
                >
                  Cancel
                </button>
                <button className="button primary" disabled={busy}>
                  Save access changes
                </button>
              </div>
            </form>
            <button
              className="text-button revoke-link"
              disabled={busy}
              onClick={revoke}
            >
              Revoke sessions without changing role
            </button>
          </>
        )}
      </dialog>
    </>
  );
}
