import { en } from "../i18n/en.js";
import { subscribeToWorkspace } from "../supabase.js";
import { useLiveRefresh } from "../useLiveRefresh.js";
import React, { useEffect, useState } from "react";
import { api, navigate } from "../api.js";
import Icon from "./Icon.jsx";
import { Badge, ErrorNotice } from "./UI.jsx";
import "./AppShell.css";
export default function AppShell({ user, page, onLogout, children }) {
  const liveVersion = useLiveRefresh();
  useEffect(() => {
    let timer;
    let stop;
    try {
      stop = subscribeToWorkspace(() => {
        clearTimeout(timer);
        timer = setTimeout(
          () => window.dispatchEvent(new Event("farmrelay:data-changed")),
          250,
        );
      });
    } catch {
      setError(en.ui.realtimeFallback);
    }
    return () => {
      clearTimeout(timer);
      stop?.();
    };
  }, [user.id]);
  const [open, setOpen] = useState(false),
    [online, setOnline] = useState(navigator.onLine),
    [unread, setUnread] = useState(0),
    [search, setSearch] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  useEffect(() => {
    let active = true;
    api("/notifications")
      .then((d) => {
        if (active) setUnread(d.unread);
      })
      .catch(() => {});
    setOpen(false);
    return () => {
      active = false;
    };
  }, [page, liveVersion]);
  const links = [
    ["dashboard", "grid", en.legacy.appshell_1001],
    [
      "reports",
      "reports",
      user.role === "farmer" ? "My reports" : "Case workspace",
    ],
    ...(user.role === "farmer"
      ? [["drafts", "leaf", en.legacy.appshell_1002]]
      : []),
    ["notifications", "bell", en.legacy.appshell_1003],
    ...(user.role === "admin"
      ? [
          ["users", "users", en.legacy.appshell_1004],
          ["audit", "shield", en.legacy.appshell_1005],
        ]
      : []),
    ["evaluation", "spark", en.legacy.appshell_1006],
    ["account", "user", en.legacy.appshell_1007],
  ];
  async function logout() {
    setError("");
    try {
      await api("/auth/logout", { method: "POST" });
      onLogout();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div className="workspace-shell">
      {open && (
        <button
          className="sidebar-scrim"
          aria-label={en.legacy.appshell_001}
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={"workspace-sidebar " + (open ? "is-open" : "")}>
        <button
          className="workspace-brand"
          onClick={() => navigate("dashboard")}
        >
          <span>
            <Icon name="leaf" size={24} />
          </span>
          {en.legacy.appshell_002}
          <span className="brand-dot" />
        </button>
        <div className="workspace-label">
          <span>{en.legacy.appshell_003}</span>
          <Badge>{user.role}</Badge>
        </div>
        <nav aria-label={en.legacy.appshell_004}>
          {links.map(([id, icon, label]) => (
            <button
              className={page === id ? "active" : ""}
              key={id}
              onClick={() => navigate(id)}
            >
              <Icon name={icon} size={19} />
              <span>{label}</span>
              {id === "notifications" && unread > 0 && <small>{unread}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="sidebar-note-icon">
            <Icon name="spark" />
          </span>
          <h3>{en.legacy.appshell_005}</h3>
          <p>{en.legacy.appshell_006}</p>
          <span>{en.legacy.appshell_007}</span>
        </div>
        <div className="sidebar-user">
          <div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{user.name}</strong>
            <span>
              {user.role === "farmer"
                ? en.legacy.appshell_008
                : user.role === "admin"
                  ? en.legacy.appshell_009
                  : en.legacy.appshell_010}
            </span>
          </div>
          <button
            title={en.legacy.appshell_011}
            aria-label={en.legacy.appshell_012}
            onClick={logout}
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-topbar">
          <button
            className="mobile-menu"
            aria-label={en.legacy.appshell_013}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <Icon name="menu" />
          </button>
          <div className="breadcrumb">
            {en.legacy.appshell_014}
            <span>{en.legacy.appshell_015}</span>
            <b>
              {links.find((l) => l[0] === page)?.[2] || en.legacy.appshell_016}
            </b>
          </div>
          <form
            className="global-search"
            onSubmit={(e) => {
              e.preventDefault();
              navigate("reports?q=" + encodeURIComponent(search));
            }}
          >
            <Icon name="search" size={16} />
            <input
              aria-label={en.legacy.appshell_017}
              placeholder={en.legacy.appshell_018}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={100}
            />
          </form>
          <span className={"network-pill " + (!online ? "offline" : "")}>
            <i />
            {online ? en.legacy.appshell_019 : en.legacy.appshell_020}
          </span>
          <button
            className="topbar-bell"
            aria-label={en.legacy.appshell_021(unread)}
            onClick={() => navigate("notifications")}
          >
            <Icon name="bell" />
            {unread > 0 && <i />}
          </button>
          <button
            className="avatar top-avatar"
            aria-label={en.legacy.appshell_022}
            onClick={() => navigate("account")}
          >
            {user.name.slice(0, 1).toUpperCase()}
          </button>
        </header>
        <main id="main-content" tabIndex={-1} className="workspace-content">
          <ErrorNotice error={error} />
          {!online && (
            <div className="connectivity-notice">{en.legacy.appshell_023}</div>
          )}
          {!user.verified && (
            <div className="verify-notice">
              <Icon name="shield" />
              <span>{en.legacy.appshell_024}</span>
              <button onClick={() => navigate("account")}>
                {en.legacy.appshell_025}
              </button>
            </div>
          )}
          {children}
        </main>
        <footer className="workspace-footer">
          <span>
            {en.legacy.appshell_026}
            <i />
            {en.legacy.appshell_027}
          </span>
          <span>{en.legacy.appshell_028}</span>
        </footer>
      </div>
    </div>
  );
}
