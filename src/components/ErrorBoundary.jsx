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
          <h1>Let’s reopen your workspace.</h1>
          <p>
            Something unexpected happened. Your submitted reports are stored on
            the server.
          </p>
          <button className="button primary" onClick={() => location.reload()}>
            Reload FarmRelay
          </button>
        </main>
      );
    return this.props.children;
  }
}
