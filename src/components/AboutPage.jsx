import React, { useState } from "react";
import ReportForm from "./ReportForm.jsx";
import "./AboutPage.css";
export default function AboutPage() {
  const [tryFlow, setTryFlow] = useState(false),
    [done, setDone] = useState(false);
  return (
    <main className="about-page">
      <header>
        <a className="about-brand" href="#about">
          <img src="/favicon.svg" alt="" />
          FarmRelay
        </a>
        <nav>
          <a href="#evaluation">Evaluation</a>
          <a
            href="https://github.com/Abdulazizkarma1/FarnRelay"
            target="_blank"
            rel="noreferrer"
          >
            GitHub ↗
          </a>
          <a className="button primary" href="#login">
            Open workspace
          </a>
        </nav>
      </header>
      {tryFlow ? (
        <>
          <div className="walkthrough-note">
            <strong>Interface walkthrough</strong>
            <p>
              No account, upload, AI call or submission happens here. Use a
              non-sensitive sample photo. Inputs are held in memory and
              disappear when this page is closed.
            </p>
            <button className="text-button" onClick={() => setTryFlow(false)}>
              ← Back to FarmRelay
            </button>
          </div>
          {done ? (
            <div className="walkthrough-done">
              <h1>You have completed the capture flow.</h1>
              <p>
                This walkthrough did not submit a report. Sign in to use the
                connected workspace.
              </p>
              <a className="button primary" href="#register">
                Create a farmer account
              </a>
            </div>
          ) : (
            <ReportForm
              onSave={async () => setDone(true)}
              onCancel={() => setTryFlow(false)}
              submitLabel="Finish walkthrough"
            />
          )}
        </>
      ) : (
        <>
          <section className="about-hero">
            <div>
              <span className="about-label">FROM FIELD TO FOLLOW-UP</span>
              <h1>
                A clearer picture.
                <br />
                <em>A better next step.</em>
              </h1>
              <p>
                Bring photos, field observations and your own voice together.
                FarmRelay helps an extension officer understand what changed and
                respond with care.
              </p>
              <div className="about-actions">
                <a className="button primary" href="#register">
                  Report a crop concern ↗
                </a>
                <button
                  className="button outline"
                  onClick={() => {
                    setDone(false);
                    setTryFlow(true);
                  }}
                >
                  Explore the reporting flow
                </button>
              </div>
              <small>
                Maize-focused AI assistance · Human-reviewed advice ·
                Browser-based
              </small>
            </div>
            <figure>
              <img
                src="/images/landscape.svg"
                alt="Cultivated agricultural landscape"
              />
              <figcaption>
                <span>01 / OBSERVE</span>
                <strong>Start with what you can see.</strong>
              </figcaption>
            </figure>
          </section>
          <section className="about-principles">
            {[
              [
                "01",
                "Evidence with context",
                "A whole-plant photo, a closer view and a short explanation help tell the story.",
              ],
              [
                "02",
                "AI you can inspect",
                "Guided questions and evidence-linked briefs keep uncertainty visible.",
              ],
              [
                "03",
                "People stay connected",
                "Officers review, ask questions and follow up. Farmers see the next step.",
              ],
            ].map(([n, t, p]) => (
              <article key={n}>
                <span>{n}</span>
                <h2>{t}</h2>
                <p>{p}</p>
              </article>
            ))}
          </section>
          <section className="about-connectivity">
            <p className="eyebrow">DESIGNED FOR INTERRUPTED CONNECTIONS</p>
            <h2>Your observation should survive a dropped signal.</h2>
            <p>
              Save a draft on your device. Keep completed attachment uploads
              when retrying. Cloud analysis and new responses require a
              connection.
            </p>
            <a href="#evaluation">See how we evaluate the workflow ↗</a>
          </section>
        </>
      )}
      <footer>
        <strong>FarmRelay</strong>
        <span>Evidence supports judgement. It does not replace it.</span>
        <a
          href="https://github.com/Abdulazizkarma1/FarnRelay/blob/farmrelay-investigation/docs/DEPLOYMENT.md"
          target="_blank"
          rel="noreferrer"
        >
          Deployment guide ↗
        </a>
      </footer>
    </main>
  );
}
