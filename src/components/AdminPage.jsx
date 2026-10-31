import { en } from "../i18n/en.js";
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
        title={en.legacy.adminpage_001}
        description={en.legacy.adminpage_002}
        action={
          <button
            className="button primary"
            onClick={() => navigate("account")}
          >
            {en.legacy.adminpage_003}
          </button>
        }
      />
    );
  return (
    <>
      <PageTitle
        eyebrow={en.legacy.adminpage_004}
        title={
          mode === "audit" ? en.legacy.adminpage_005 : en.legacy.adminpage_006
        }
        description={
          mode === "audit" ? en.legacy.adminpage_007 : en.legacy.adminpage_008
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
              aria-label={en.legacy.adminpage_009}
              placeholder={en.legacy.adminpage_010}
              value={query}
              maxLength={100}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="text-button">{en.legacy.adminpage_011}</button>
          </form>
          <select
            aria-label={en.legacy.adminpage_012}
            value={role}
            onChange={(e) => {
              setRole(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{en.legacy.adminpage_013}</option>
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
                        {item.actorName}
                        {en.legacy.adminpage_014}
                        <DateText value={item.createdAt} />
                      </p>
                      <small>
                        {en.legacy.adminpage_015}
                        {item.target}
                      </small>
                      {Object.keys(item.details || {}).length > 0 && (
                        <details>
                          <summary>{en.legacy.adminpage_016}</summary>
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
                      {u.active
                        ? en.legacy.adminpage_017
                        : en.legacy.adminpage_018}
                    </Badge>
                    <span className="verification-label">
                      {u.verified
                        ? en.legacy.adminpage_019
                        : en.legacy.adminpage_020}
                    </span>
                    {u.role !== "admin" ? (
                      <button
                        className="button subtle"
                        onClick={() => setSelected(u)}
                      >
                        {en.legacy.adminpage_021}
                      </button>
                    ) : (
                      <span className="admin-protected">
                        <Icon name="shield" size={15} />
                        {en.legacy.adminpage_022}
                      </span>
                    )}
                  </div>
                ))}
          </div>
          <Pagination {...data} onChange={setPage} />
        </>
      ) : (
        <Empty
          title={en.legacy.adminpage_023}
          description={en.legacy.adminpage_024}
        />
      )}
      <dialog
        ref={dialog}
        className="access-dialog"
        onCancel={() => setSelected(null)}
      >
        <div className="access-dialog-header">
          <span className="eyebrow">{en.legacy.adminpage_025}</span>
          <button
            aria-label={en.legacy.adminpage_026}
            disabled={busy}
            onClick={() => setSelected(null)}
          >
            {en.legacy.adminpage_027}
          </button>
        </div>
        {selected && (
          <>
            <h2>{selected.name}</h2>
            <p>{selected.email}</p>
            {selected.requestedRole === "officer" &&
              selected.role === "farmer" && <p>{en.auth.officerRequested}</p>}
            <ErrorNotice error={error} />
            <form onSubmit={save}>
              <label>
                {en.legacy.adminpage_028}
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                >
                  <option value="farmer">{en.legacy.adminpage_029}</option>
                  <option value="officer" disabled={!selected.verified}>
                    {en.legacy.adminpage_030}
                  </option>
                </select>
              </label>
              <label>
                {en.legacy.adminpage_031}
                <select
                  value={active ? "active" : "suspended"}
                  onChange={(e) => setActive(e.target.value === "active")}
                >
                  <option value="active">{en.legacy.adminpage_032}</option>
                  <option value="suspended">{en.legacy.adminpage_033}</option>
                </select>
              </label>
              <p className="access-warning">{en.legacy.adminpage_034}</p>
              <div className="access-dialog-actions">
                <button
                  type="button"
                  className="button subtle"
                  disabled={busy}
                  onClick={() => setSelected(null)}
                >
                  {en.legacy.adminpage_035}
                </button>
                <button className="button primary" disabled={busy}>
                  {en.legacy.adminpage_036}
                </button>
              </div>
            </form>
            <button
              className="text-button revoke-link"
              disabled={busy}
              onClick={revoke}
            >
              {en.legacy.adminpage_037}
            </button>
          </>
        )}
      </dialog>
    </>
  );
}
