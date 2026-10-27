import React, { useEffect, useState } from "react";
import { api, navigate, setCsrf } from "./api.js";
import AuthScreen from "./components/AuthScreen.jsx";
import AppShell from "./components/AppShell.jsx";
import Dashboard from "./components/Dashboard.jsx";
import ReportsPage, {
  NewReport,
  DraftsPage,
} from "./components/ReportsPage.jsx";
import ReportDetail from "./components/ReportDetail.jsx";
import AccountPage from "./components/AccountPage.jsx";
import AdminPage from "./components/AdminPage.jsx";
import NotificationsPage from "./components/NotificationsPage.jsx";
import { Loading, ErrorNotice, Empty } from "./components/UI.jsx";
import "./App.css";
function route() {
  const raw = location.hash.slice(1).replace(/^\//, "");
  const [path, query] = raw.split("?");
  return {
    path: path || "dashboard",
    params: new URLSearchParams(query || ""),
  };
}
export default function App() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [connectionError, setConnectionError] = useState(""),
    [current, setCurrent] = useState(route),
    [notice, setNotice] = useState("");
  function loggedOut() {
    setUser(null);
    setCsrf("");
    setNotice("");
    navigate("login");
  }
  async function boot() {
    setConnectionError("");
    setLoading(true);
    try {
      const data = await api("/auth/me");
      setUser(data.user);
    } catch (e) {
      if (e.status !== 401) setConnectionError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    boot();
    const update = () => {
      setCurrent(route());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", update);
    window.addEventListener("farmrelay:session-expired", loggedOut);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener("farmrelay:session-expired", loggedOut);
    };
  }, []);
  function authenticated(u) {
    setUser(u);
    setConnectionError("");
    navigate("dashboard");
  }
  const [page, id] = current.path.split("/");
  if (["verify", "reset"].includes(page))
    return (
      <AuthScreen
        key={current.path}
        mode={page}
        token={current.params.get("token")}
        onAuthenticated={authenticated}
        onVerified={() => {
          if (user)
            api("/auth/me")
              .then((d) => setUser(d.user))
              .catch(() => {});
        }}
      />
    );
  if (loading) return <Loading text="Opening FarmRelay..." />;
  if (!user)
    return (
      <>
        {connectionError && (
          <div className="connection-banner">
            <ErrorNotice error={connectionError} />
            <button className="text-button" onClick={boot}>
              Retry connection
            </button>
          </div>
        )}
        <AuthScreen
          key={page}
          mode={["register", "forgot"].includes(page) ? page : "login"}
          onAuthenticated={authenticated}
        />
      </>
    );
  let content;
  if (page === "account")
    content = <AccountPage user={user} onUser={setUser} onLogout={loggedOut} />;
  else if (page === "notifications") content = <NotificationsPage />;
  else if (["users", "audit"].includes(page) && user.role === "admin")
    content = <AdminPage key={page} user={user} mode={page} />;
  else if (page === "new" && user.role === "farmer")
    content = <NewReport user={user} onNotice={setNotice} />;
  else if (page === "drafts" && user.role === "farmer")
    content = <DraftsPage user={user} onNotice={setNotice} />;
  else if (page === "reports" && id)
    content = <ReportDetail key={id} id={id} user={user} />;
  else if (page === "reports")
    content = (
      <ReportsPage
        key={current.params.toString()}
        user={user}
        initialQuery={current.params.get("q") || ""}
      />
    );
  else if (["dashboard", "login", "register"].includes(page))
    content = <Dashboard user={user} />;
  else
    content = (
      <Empty
        title="This page is not available."
        description="Use the workspace navigation to continue."
      />
    );
  return (
    <AppShell key={user.id} user={user} page={page} onLogout={loggedOut}>
      {notice && (
        <div role="status" className="workspace-toast">
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
      {content}
    </AppShell>
  );
}
