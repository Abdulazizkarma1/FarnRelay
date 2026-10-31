import { en } from "../i18n/en.js";
import React from "react";
import "./ErrorBoundary.css";
export default class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <main className="fatal-error">
          <h1>{en.legacy.errorboundary_001}</h1>
          <p>{en.legacy.errorboundary_002}</p>
          <button className="button primary" onClick={() => location.reload()}>
            {en.legacy.errorboundary_003}
          </button>
        </main>
      );
    return this.props.children;
  }
}
