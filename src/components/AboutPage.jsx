import React, { lazy, Suspense, useState } from "react";
import { en } from "../i18n/en.js";
import { Skeleton, Button } from "./Primitives.jsx";
import "./AboutPage.css";
const ReportForm = lazy(() => import("./ReportForm.jsx"));
export default function AboutPage() {
  const [tryFlow, setTryFlow] = useState(false),
    [done, setDone] = useState(false);
  const copy = en.landing;
  return (
    <main className="about-page" id="main-content" tabIndex={-1}>
      <header className="landing-header">
        <a className="about-brand" href="/about">
          <img src="/favicon.svg" width="36" height="36" alt="" />
          {en.brand}
        </a>
        <nav aria-label={en.ui.mainNavigation}>
          <a href="/login">{copy.login}</a>
          <a className="ds-button ds-secondary" href="/signup">
            {en.auth.createLink}
          </a>
        </nav>
      </header>
      {tryFlow ? (
        <section className="landing-walkthrough">
          <Button
            variant="ghost"
            onClick={() => {
              setTryFlow(false);
              setDone(false);
            }}
          >
            {copy.back}
          </Button>
          <p className="walkthrough-note">{copy.walkthroughNote}</p>
          {done ? (
            <div className="ds-card">
              <h1 tabIndex={-1}>{copy.done}</h1>
              <p>{copy.doneBody}</p>
              <a className="ds-button ds-primary" href="/signup">
                {en.auth.createLink}
              </a>
            </div>
          ) : (
            <Suspense fallback={<Skeleton />}>
              <ReportForm
                submitLabel={copy.walkthroughTitle}
                onSave={() => {
                  setDone(true);
                  window.scrollTo({ top: 0 });
                }}
                onCancel={() => setTryFlow(false)}
              />
            </Suspense>
          )}
        </section>
      ) : (
        <>
          <section className="landing-hero">
            <div>
              <p className="landing-kicker">{copy.eyebrow}</p>
              <h1 tabIndex={-1}>{copy.hero}</h1>
              <p className="landing-description">{copy.description}</p>
              <div className="landing-actions">
                <a className="ds-button ds-primary" href="/signup">
                  {copy.primary}
                  <span aria-hidden="true">{en.legacy.aboutpage_001}</span>
                </a>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setTryFlow(true);
                    window.scrollTo({ top: 0 });
                  }}
                >
                  {copy.secondary}
                  <span aria-hidden="true">{en.legacy.aboutpage_002}</span>
                </Button>
              </div>
              <ul className="landing-trust">
                {copy.trust.map((s) => (
                  <li key={s}>
                    <span aria-hidden="true">{en.legacy.aboutpage_003}</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
            <figure>
              <img
                src="/images/landscape.webp"
                srcSet="/images/landscape-small.webp 540w, /images/landscape.webp 1100w"
                sizes="(max-width:760px) 100vw, 48vw"
                width="1100"
                height="619"
                alt={copy.imageAlt}
                fetchPriority="high"
              />
              <figcaption>
                <span className="landing-photo-mark" aria-hidden="true">
                  {en.legacy.aboutpage_004}
                </span>
                <strong>{copy.caption}</strong>
              </figcaption>
            </figure>
          </section>
          <section className="landing-how" aria-labelledby="how-title">
            <p className="landing-kicker">{copy.eyebrow}</p>
            <h2 id="how-title">{copy.stepsTitle}</h2>
            <div className="landing-steps">
              {copy.steps.map(([title, body], i) => (
                <article key={title}>
                  <span className="landing-step-number" aria-hidden="true">
                    {en.legacy.aboutpage_005}
                    {i + 1}
                  </span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="landing-details">
            <article className="connection-card">
              <svg
                aria-hidden="true"
                viewBox="0 0 40 40"
                width="40"
                height="40"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M8 18c7-7 17-7 24 0M13 24c4-4 10-4 14 0M18 30l2-2 2 2M5 5l30 30" />
              </svg>
              <h2>{copy.connectionTitle}</h2>
              <p>{copy.connectionBody}</p>
            </article>
            <article className="ai-explainer">
              <span className="landing-ai-mark" aria-hidden="true">
                {en.legacy.aboutpage_006}
              </span>
              <h2>{copy.aiTitle}</h2>
              <p>{copy.aiBody}</p>
              <a href="/#evaluation">
                {copy.evaluation}
                {en.legacy.aboutpage_007}
              </a>
              <p className="landing-validation">{copy.validation}</p>
            </article>
          </section>
        </>
      )}
      <footer className="landing-footer">
        <div>
          <strong>{en.brand}</strong>
          <p>{copy.footer}</p>
        </div>
        <nav aria-label={en.ui.footerNavigation}>
          <a href="/terms">{copy.terms}</a>
          <a
            href="https://github.com/Abdulazizkarma1/FarnRelay"
            target="_blank"
            rel="noreferrer"
          >
            {copy.source}
            {en.legacy.aboutpage_008}
          </a>
          <a href="/#evaluation">{copy.evaluation}</a>
        </nav>
      </footer>
    </main>
  );
}
