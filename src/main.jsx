import { en } from "./i18n/en.js";
import { registerOfflineShell } from "./offline.js";
import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "./main.css";
createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <a
      className="skip-link"
      href="#main-content"
      onClick={(event) => {
        event.preventDefault();
        const main = document.getElementById("main-content");
        main?.focus();
        main?.scrollIntoView({ block: "start" });
      }}
    >
      {en.common.skip}
    </a>
    <React.Suspense
      fallback={
        <main className="initial-loading" role="status">
          {en.legacy.main_001}
        </main>
      }
    >
      <App />
    </React.Suspense>
  </ErrorBoundary>,
);

registerOfflineShell();
