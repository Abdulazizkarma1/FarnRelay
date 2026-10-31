import React, { forwardRef, useEffect, useId, useRef, useState } from "react";
import { en } from "../i18n/en.js";
import "./Primitives.css";
export function Spinner() {
  return <span className="ds-spinner" aria-hidden="true" />;
}
export function Button({
  children,
  variant = "primary",
  loading = false,
  disabled,
  type = "button",
  className = "",
  ...props
}) {
  return (
    <button
      {...props}
      type={type}
      className={`ds-button ds-${variant} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
export const Input = forwardRef(function Input(
  { id, label, hint, error, ...props },
  ref,
) {
  const generated = useId(),
    field = id || generated;
  return (
    <div className="ds-field">
      <label htmlFor={field}>{label}</label>
      <input
        {...props}
        ref={ref}
        id={field}
        aria-invalid={!!error}
        aria-describedby={
          [hint && `${field}-hint`, error && `${field}-error`]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      {hint && (
        <p className="ds-hint" id={`${field}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="ds-error" id={`${field}-error`}>
          {error}
        </p>
      )}
    </div>
  );
});
export function Select({ id, label, hint, error, children, ...props }) {
  const generated = useId(),
    field = id || generated;
  return (
    <div className="ds-field">
      <label htmlFor={field}>{label}</label>
      <select
        {...props}
        id={field}
        aria-invalid={!!error}
        aria-describedby={
          [hint && `${field}-hint`, error && `${field}-error`]
            .filter(Boolean)
            .join(" ") || undefined
        }
      >
        {children}
      </select>
      {hint && (
        <p className="ds-hint" id={`${field}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="ds-error" id={`${field}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
export function PasswordInput({
  id = "password",
  label = en.auth.password,
  hint,
  error,
  ...props
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="ds-field">
      <label htmlFor={id}>{label}</label>
      <div className="ds-password">
        <input
          {...props}
          id={id}
          type={show ? "text" : "password"}
          aria-invalid={!!error}
          aria-describedby={
            [hint && `${id}-hint`, error && `${id}-error`]
              .filter(Boolean)
              .join(" ") || undefined
          }
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? en.auth.hidePassword : en.auth.showPassword}
          aria-pressed={show}
          aria-controls={id}
        >
          {show ? en.auth.hide : en.auth.show}
        </button>
      </div>
      {hint && (
        <p className="ds-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="ds-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
export function Checkbox({ id, label, error, ...props }) {
  return (
    <div className="ds-check">
      <label htmlFor={id}>
        <input
          {...props}
          id={id}
          type="checkbox"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span>{label}</span>
      </label>
      {error && (
        <p className="ds-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}
export const Alert = forwardRef(function Alert(
  { children, tone = "error", className = "", ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      role={tone === "error" ? "alert" : "status"}
      tabIndex={-1}
      className={`ds-alert ds-alert-${tone} ${className}`}
    >
      {children}
    </div>
  );
});
export function Toast({
  message,
  tone = "success",
  onDismiss,
  announce = true,
}) {
  return (
    <div
      className="ds-toast-slot"
      aria-live={announce ? "polite" : "off"}
      aria-atomic="true"
    >
      {message && (
        <div className={`ds-toast ds-alert-${tone}`}>
          <span>{message}</span>
          <Button
            variant="ghost"
            onClick={onDismiss}
            aria-label={en.ui.dismiss}
          >
            {en.legacy.primitives_001}
          </Button>
        </div>
      )}
    </div>
  );
}
export function Card({ children, className = "", ...props }) {
  return (
    <section {...props} className={`ds-card ${className}`}>
      {children}
    </section>
  );
}
export function Modal({ open, title, onClose, children }) {
  const ref = useRef(),
    titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="ds-modal"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <Button variant="ghost" onClick={onClose} aria-label={en.ui.close}>
          {en.legacy.primitives_002}
        </Button>
      </header>
      {children}
    </dialog>
  );
}
export function Skeleton({ label = en.ui.loading }) {
  return (
    <div className="ds-skeleton" role="status" aria-label={label}>
      <span />
      <span />
      <span />
    </div>
  );
}
export function EmptyState({
  title = en.ui.emptyTitle,
  description = en.ui.emptyBody,
  action,
}) {
  return (
    <Card className="ds-empty">
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </Card>
  );
}
