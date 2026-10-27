import React, { useEffect, useState } from "react";
import { api, navigate } from "../api.js";
import Icon from "./Icon.jsx";
import { Badge, ErrorNotice } from "./UI.jsx";
import "./AppShell.css";
export default function AppShell({ user, page, onLogout, children }) {
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
  }, [page]);
  const links = [
    ["dashboard", "grid", "Overview"],
    [
      "reports",
      "reports",
      user.role === "farmer" ? "My reports" : "Case workspace",
    ],
    ...(user.role === "farmer" ? [["drafts", "leaf", "Device drafts"]] : []),
    ["notifications", "bell", "Notifications"],
    ...(user.role === "admin"
      ? [
          ["users", "users", "People & access"],
          ["audit", "shield", "Activity log"],
        ]
      : []),
    ["account", "user", "Account & security"],
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
          aria-label="Close menu"
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
          FarmRelay
          <span className="brand-dot" />
        </button>
        <div className="workspace-label">
          <span>WORKSPACE</span>
          <Badge>{user.role}</Badge>
        </div>
        <nav aria-label="Workspace">
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
          <h3>Evidence, with context.</h3>
          <p>AI helps organise what we see. People decide what happens next.</p>
          <span>META AI ASSISTANCE</span>
        </div>
        <div className="sidebar-user">
          <div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{user.name}</strong>
            <span>
              {user.role === "farmer"
                ? "Farmer account"
                : user.role === "admin"
                  ? "Platform administrator"
                  : "Extension officer"}
            </span>
          </div>
          <button title="Sign out" aria-label="Sign out" onClick={logout}>
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="workspace-topbar">
          <button
            className="mobile-menu"
            aria-label="Open menu"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <Icon name="menu" />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span>
            <b>{links.find((l) => l[0] === page)?.[2] || "Crop report"}</b>
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
              aria-label="Search reports"
              placeholder="Search reports..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              maxLength={100}
            />
          </form>
          <span className={"network-pill " + (!online ? "offline" : "")}>
            <i />
            {online ? "Connected" : "Offline"}
          </span>
          <button
            className="topbar-bell"
            aria-label={`${unread} unread notifications`}
            onClick={() => navigate("notifications")}
          >
            <Icon name="bell" />
            {unread > 0 && <i />}
          </button>
          <button
            className="avatar top-avatar"
            aria-label="Open account"
            onClick={() => navigate("account")}
          >
            {user.name.slice(0, 1).toUpperCase()}
          </button>
        </header>
        <main className="workspace-content">
          <ErrorNotice error={error} />
          {!online && (
            <div className="connectivity-notice">
              You’re offline. You can save a report draft on this loaded page.
              Sending and AI tools need a connection.
            </div>
          )}
          {!user.verified && (
            <div className="verify-notice">
              <Icon name="shield" />
              <span>Verify your email to submit or review reports.</span>
              <button onClick={() => navigate("account")}>Open account</button>
            </div>
          )}
          {children}
        </main>
        <footer className="workspace-footer">
          <span>
            FarmRelay <i /> Built for better field conversations.
          </span>
          <span>Human judgement, supported by evidence.</span>
        </footer>
      </div>
    </div>
  );
}
