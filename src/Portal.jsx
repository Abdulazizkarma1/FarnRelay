import React, { useEffect, useState } from "react";
import FarmerPortal from "./components/FarmerPortal.jsx";
import OfficerDashboard from "./components/OfficerDashboard.jsx";
import App from "./App.jsx";
import "./App.css";
import "./Portal.css";
export default function Portal() {
  const initial = () =>
    ["farmer", "officer", "demo"].includes(location.hash.slice(1))
      ? location.hash.slice(1)
      : "home";
  const [role, setRole] = useState(initial),
    [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const route = () => setRole(initial());
    const connection = () => setOnline(navigator.onLine);
    window.addEventListener("hashchange", route);
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    return () => {
      window.removeEventListener("hashchange", route);
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
    };
  }, []);
  function navigate(next) {
    location.hash = next;
    setRole(next);
    window.scrollTo(0, 0);
  }
  if (role === "demo")
    return (
      <>
        <div className="demo-banner">
          <span>DEVICE-LOCAL DEMONSTRATION / not the shared officer queue</span>
          <button onClick={() => navigate("home")}>Exit demo</button>
        </div>
        <App />
      </>
    );
  return (
    <div className="portal-shell">
      <header className="portal-header">
        <button className="portal-brand" onClick={() => navigate("home")}>
          <span className="relay-logo">FR</span>FarmRelay
          <small>FIELD TO FOLLOW-UP</small>
        </button>
        <nav aria-label="Main navigation">
          <button
            className={role === "farmer" ? "active" : ""}
            onClick={() => navigate("farmer")}
          >
            For farmers
          </button>
          <button
            className={role === "officer" ? "active" : ""}
            onClick={() => navigate("officer")}
          >
            Extension team
          </button>
        </nav>
        <span className={"connection-state " + (!online ? "offline" : "")}>
          {online ? "Online" : "Offline"}
        </span>
      </header>
      <main className="portal-main">
        {role === "home" ? (
          <>
            <section className="welcome-hero">
              <img
                src="/images/landscape.svg"
                alt="Sunlit cultivated countryside"
              />
              <div className="welcome-shade" />
              <div className="welcome-copy">
                <p className="eyebrow">
                  CLOSER TO THE FIELD. CLOSER TO THE ANSWER.
                </p>
                <h1>
                  Good farming starts
                  <br />
                  with a conversation.
                </h1>
                <p>
                  A place for farmers to share what they see, and extension
                  teams to turn evidence into a thoughtful response.
                </p>
                <button
                  className="button light"
                  onClick={() => navigate("farmer")}
                >
                  Report a crop concern ↗
                </button>
              </div>
              <span className="welcome-caption">
                Observe / Listen / Respond
              </span>
            </section>
            <section className="role-cards">
              <button onClick={() => navigate("farmer")}>
                <span className="eyebrow">01 / I AM A FARMER</span>
                <h2>
                  Your farm.
                  <br />
                  Your voice.
                </h2>
                <p>
                  Take a photo, record a short note and keep track of feedback
                  from the extension team.
                </p>
                <strong>Enter farmer space ↗</strong>
              </button>
              <button onClick={() => navigate("officer")}>
                <span className="eyebrow">02 / I SUPPORT FARMERS</span>
                <h2>
                  Better evidence.
                  <br />
                  Better follow-up.
                </h2>
                <p>
                  Review the queue, listen to farmers, inspect Meta AI drafts
                  and send human-reviewed feedback.
                </p>
                <strong>Open officer dashboard ↗</strong>
              </button>
            </section>
            <section className="portal-method">
              <div>
                <b>01</b>
                <h3>Capture</h3>
                <p>
                  Photo, voice or text. Drafts stay on your device until you
                  send.
                </p>
              </div>
              <div>
                <b>02</b>
                <h3>Understand</h3>
                <p>
                  Officers use source evidence and AI assistance to review the
                  concern.
                </p>
              </div>
              <div>
                <b>03</b>
                <h3>Follow through</h3>
                <p>
                  A private report code keeps the conversation accessible across
                  devices.
                </p>
              </div>
            </section>
            <div className="demo-link">
              <span>Exploring the technology?</span>
              <button className="text-button" onClick={() => navigate("demo")}>
                Open the labelled sample workspace ↗
              </button>
            </div>
          </>
        ) : role === "farmer" ? (
          <FarmerPortal />
        ) : (
          <OfficerDashboard />
        )}
      </main>
      <footer className="portal-footer">
        <strong>FarmRelay</strong>
        <span>Human feedback. Traceable evidence. Meta AI assistance.</span>
        <small>Pilot v0.3 · No automatic disease diagnosis</small>
      </footer>
    </div>
  );
}
