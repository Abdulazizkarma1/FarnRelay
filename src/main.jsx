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
    <React.Suspense fallback={<main className="initial-loading" role="status">Loading FarmRelay...</main>}><App /></React.Suspense>
  </ErrorBoundary>,
);

registerOfflineShell();
