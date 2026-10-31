import { readAuthCallback } from "./auth-links.js";
import AuthCallback from "./components/AuthCallback.jsx";
import { getSupabase } from "./supabase.js";
import React, { useEffect, useState, lazy, Suspense } from "react";
import { api, navigate, setCsrf, clearMedia } from "./api.js";
import AuthScreen from "./components/AuthScreen.jsx";
import AppShell from "./components/AppShell.jsx";
const AboutPage = lazy(() => import("./components/AboutPage.jsx"));
const EvaluationPage = lazy(() => import("./components/EvaluationPage.jsx"));
const Dashboard = lazy(() => import("./components/Dashboard.jsx"));
const ReportsPage = lazy(() => import("./components/ReportsPage.jsx"));
const NewReport = lazy(() =>
  import("./components/ReportsPage.jsx").then((m) => ({
    default: m.NewReport,
  })),
);
const DraftsPage = lazy(() =>
  import("./components/ReportsPage.jsx").then((m) => ({
    default: m.DraftsPage,
  })),
);
const ReportDetail = lazy(() => import("./components/InvestigationPage.jsx"));
const AccountPage = lazy(() => import("./components/AccountPage.jsx"));
const AdminPage = lazy(() => import("./components/AdminPage.jsx"));
const NotificationsPage = lazy(
  () => import("./components/NotificationsPage.jsx"),
);
import { Loading, ErrorNotice, Empty } from "./components/UI.jsx";
import "./App.css";
function route() {
  const callback = readAuthCallback(location.href);
  if (callback)
    return { path: "email-callback", params: new URLSearchParams(), callback };
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
      if (data.user.role === "admin" && !data.user.mfaEnabled)
        navigate("account");
    } catch (e) {
      if (e.status !== 401) setConnectionError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    boot();
    let subscription;
    try {
      subscription = getSupabase().auth.onAuthStateChange((event, session) => {
        if (event === "SIGNED_OUT") {
          clearMedia();
          loggedOut();
        }
        if (event === "SIGNED_IN")
          setUser((previous) => {
            if (previous && previous.id !== session?.user.id) {
              clearMedia();
              return null;
            }
            return previous;
          });
      }).data.subscription;
    } catch {}

    const update = () => {
      setCurrent(route());
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", update);
    window.addEventListener("farmrelay:session-expired", loggedOut);
    return () => {
      subscription?.unsubscribe();
      window.removeEventListener("hashchange", update);
      window.removeEventListener("farmrelay:session-expired", loggedOut);
    };
  }, []);
  function authenticated(u) {
    setUser(u);
    setConnectionError("");
    navigate(u.role === "admin" && !u.mfaEnabled ? "account" : "dashboard");
  }
  const [page, id] = current.path.split("/");
  if (current.callback)
    return (
      <AuthCallback
        callback={current.callback}
        onAuthenticated={authenticated}
      />
    );
  if (page === "about" || (!user && !loading && !location.hash))
    return (
      <Suspense fallback={<Loading />}>
        <AboutPage />
      </Suspense>
    );
  if (page === "evaluation" && !user)
    return (
      <main style={{ maxWidth: 1200, margin: "auto", padding: 28 }}>
        <a href="#about">← About FarmRelay</a>
        <Suspense fallback={<Loading />}>
          <EvaluationPage />
        </Suspense>
      </main>
    );
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
  if (page === "evaluation") content = <EvaluationPage />;
  else if (page === "account")
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
      <Suspense fallback={<Loading text="Opening workspace..." />}>
        {content}
      </Suspense>
    </AppShell>
  );
}
