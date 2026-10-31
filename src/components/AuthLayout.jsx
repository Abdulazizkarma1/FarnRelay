import React, { useEffect, useRef } from "react";
import { en } from "../i18n/en.js";
import "./AuthLayout.css";
export default function AuthLayout({ title, description, children }) {
  const heading = useRef();
  useEffect(() => {
    heading.current?.focus();
  }, [title]);
  return (
    <main className="account-page" id="main-content" tabIndex={-1}>
      <a className="account-brand" href="/about">
        <img src="/favicon.svg" alt="" width="36" height="36" />
        {en.brand}
      </a>
      <div className="account-layout">
        <aside className="account-context" aria-hidden="true">
          <span>{en.legacy.authlayout_001}</span>
          <h2>{en.landing.hero}</h2>
          <p>{en.landing.description}</p>
          <img
            src="/images/landscape.webp"
            alt=""
            width="600"
            height="400"
            loading="lazy"
          />
        </aside>
        <section className="account-card">
          <p className="account-eyebrow">{en.auth.eyebrow}</p>
          <h1 tabIndex={-1} ref={heading}>
            {title}
          </h1>
          {description && <p className="account-description">{description}</p>}
          {children}
          <p className="account-privacy">{en.auth.private}</p>
        </section>
      </div>
    </main>
  );
}
