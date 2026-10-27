import React from "react";
import Icon from "./Icon.jsx";
import "./UI.css";
export function Badge({ children, tone }) {
  const cls =
    tone ||
    {
      "Needs review": "amber",
      "In review": "blue",
      "Follow-up needed": "orange",
      Closed: "green",
      farmer: "green",
      officer: "blue",
      admin: "purple",
    }[children] ||
    "neutral";
  return (
    <span className={"badge badge-" + cls}>
      <i />
      {children}
    </span>
  );
}
export function PageTitle({ eyebrow, title, description, children }) {
  return (
    <div className="page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {description && <p className="page-description">{description}</p>}
      </div>
      {children && <div className="page-title-actions">{children}</div>}
    </div>
  );
}
export function Empty({ title = "Nothing here yet", description, action }) {
  return (
    <div className="fr-empty">
      <span>
        <Icon name="leaf" size={28} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function ErrorNotice({ error }) {
  return error ? (
    <div role="alert" className="error-notice">
      <Icon name="shield" />
      <span>{typeof error === "string" ? error : error.message}</span>
    </div>
  ) : null;
}
export function Loading({ text = "Loading your workspace..." }) {
  return (
    <div className="loading-state" role="status">
      <span className="spinner" />
      {text}
    </div>
  );
}
export function Pagination({ page, pages, total, onChange }) {
  return (
    <div className="pagination">
      <span>
        {total} total · Page {page} of {pages}
      </span>
      <div>
        <button
          className="button subtle"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Previous
        </button>
        <button
          className="button subtle"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
export function StatCard({ label, value, detail, icon, tone = "green" }) {
  return (
    <article className="stat-card">
      <div>
        <span>{label}</span>
        <span className={"stat-icon " + tone}>
          <Icon name={icon} />
        </span>
      </div>
      <strong>{value ?? "0"}</strong>
      <p>{detail}</p>
    </article>
  );
}
export function DateText({ value }) {
  return (
    <>
      {value
        ? new Date(value).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "Not recorded"}
    </>
  );
}
