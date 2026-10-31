import { useLiveRefresh } from "../useLiveRefresh.js";
import React, { useEffect, useState } from "react";
import { api, navigate } from "../api.js";
import Icon from "./Icon.jsx";
import {
  PageTitle,
  StatCard,
  Badge,
  Empty,
  ErrorNotice,
  Loading,
  DateText,
} from "./UI.jsx";
import "./Dashboard.css";
export default function Dashboard({ user }) {
  const liveVersion = useLiveRefresh();
  const [data, setData] = useState(null),
    [admin, setAdmin] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (!user.verified) {
          setData({ counts: {}, total: 0, recent: [] });
          return;
        }
        const summary = await api("/reports/summary");
        if (active) setData(summary);
        if (user.role === "admin" && user.mfaEnabled) {
          const overview = await api("/admin/overview");
          if (active) setAdmin(overview);
        }
      } catch (e) {
        if (active) setError(e.message);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [user, liveVersion]);
  if (!data && !error) return <Loading />;
  const counts = data?.counts || {},
    farmer = user.role === "farmer",
    name = user.name.split(" ")[0];
  return (
    <>
      <PageTitle
        eyebrow={
          farmer
            ? "YOUR FARM, CONNECTED"
            : user.role === "admin"
              ? "PLATFORM OVERVIEW"
              : "FIELD INTELLIGENCE"
        }
        title={`Welcome back, ${name}.`}
        description={
          farmer
            ? "Your observations, conversations and next steps, all in one place."
            : "A clearer view of what needs attention in the field."
        }
      >
        {farmer ? (
          <button className="button primary" onClick={() => navigate("new")}>
            <Icon name="plus" size={17} />
            New crop report
          </button>
        ) : (
          <button
            className="button outline"
            onClick={() => navigate("reports")}
          >
            Open case workspace
            <Icon name="arrow" size={16} />
          </button>
        )}
      </PageTitle>
      <ErrorNotice error={error} />
      {user.role === "admin" && !user.mfaEnabled && (
        <div className="setup-card">
          <Icon name="shield" size={26} />
          <div>
            <strong>Protect your administrator account</strong>
            <p>
              Enable your authenticator before changing access or assigning
              reports.
            </p>
          </div>
          <button
            className="button outline"
            onClick={() => navigate("account")}
          >
            Set up protection
          </button>
        </div>
      )}
      <section className="dashboard-hero">
        <img
          src="/images/landscape.svg"
          alt="Cultivated fields in warm morning light"
        />
        <div className="dashboard-hero-shade" />
        <div className="dashboard-hero-copy">
          <span>
            <i />
            FROM FIELD TO FOLLOW-UP
          </span>
          <h2>
            {farmer ? (
              <>
                A small observation.
                <br />
                <em>A better conversation.</em>
              </>
            ) : (
              <>
                Closer to the field.
                <br />
                <em>Clearer on what comes next.</em>
              </>
            )}
          </h2>
          <p>
            {farmer
              ? "Show what changed. Share your voice. Keep a human in the loop."
              : "Bring field evidence, farmer voices and careful judgement together."}
          </p>
          <button
            className="button light"
            onClick={() => navigate(farmer ? "new" : "reports")}
          >
            {farmer ? "Record an observation" : "Review crop reports"}
            <Icon name="arrow" size={16} />
          </button>
        </div>
        <div className="hero-index">
          <span>01 / OBSERVE</span>
          <span>02 / UNDERSTAND</span>
          <span>03 / RESPOND</span>
        </div>
      </section>
      <section className="dashboard-stats">
        <StatCard
          label="Recorded reports"
          value={data?.total}
          detail={
            farmer
              ? "Submitted from your account"
              : user.role === "officer"
                ? "Assigned to your account"
                : "Across the platform"
          }
          icon="reports"
        />
        <StatCard
          label="Awaiting review"
          value={counts["Needs review"]}
          detail="Ready for a closer look"
          icon="clock"
          tone="amber"
        />
        <StatCard
          label="Follow-up needed"
          value={counts["Follow-up needed"]}
          detail="Keep the conversation moving"
          icon="bell"
          tone="blue"
        />
        <StatCard
          label="Closed reports"
          value={counts.Closed}
          detail="Review marked as complete"
          icon="check"
        />
      </section>
      <div className="dashboard-columns">
        <section className="surface-card recent-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">THE LATEST IN YOUR WORKSPACE</p>
              <h2>Recent crop reports</h2>
            </div>
            <button className="text-button" onClick={() => navigate("reports")}>
              View all ↗
            </button>
          </div>
          {data?.recent?.length ? (
            <div className="recent-rows">
              {data.recent.map((r) => (
                <button
                  key={r._id}
                  onClick={() => navigate("reports/" + r._id)}
                >
                  <span className="crop-avatar">
                    <Icon name="leaf" />
                  </span>
                  <span>
                    <strong>{r.crop}</strong>
                    <small>
                      {r.community} · <DateText value={r.createdAt} />
                    </small>
                  </span>
                  <Badge>{r.status}</Badge>
                  <Icon name="arrow" size={16} />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title={
                farmer
                  ? "Your first report starts here."
                  : "No reports in your workspace yet."
              }
              description={
                farmer
                  ? "Notice a change in your crops? A few details can start a useful conversation."
                  : "Assigned reports will appear here. Administrators manage case assignment."
              }
              action={
                farmer && (
                  <button
                    className="button outline"
                    onClick={() => navigate("new")}
                  >
                    Create a report
                  </button>
                )
              }
            />
          )}
        </section>
        <aside className="field-guide-card">
          <div className="field-guide-image">
            <img src="/images/tomatoes.svg" alt="Illustrative fresh tomatoes" />
            <span>FIELD NOTES / 01</span>
          </div>
          <div>
            <p className="eyebrow">BETTER EVIDENCE, BETTER FOLLOW-UP</p>
            <h3>
              Start with what
              <br />
              you can see.
            </h3>
            <p>
              Capture the affected area, note when it changed and say how much
              of the crop is involved.
            </p>
            <span className="guide-tip">
              <Icon name="mic" size={17} />A short voice note can add useful
              context.
            </span>
          </div>
        </aside>
      </div>
      <section className="dashboard-bottom">
        <div className="surface-card distribution">
          <div className="card-heading">
            <h2>Review progress</h2>
            <span className="eyebrow">CURRENT REPORT STATUS</span>
          </div>
          {["Needs review", "In review", "Follow-up needed", "Closed"].map(
            (s, i) => (
              <div className="distribution-row" key={s}>
                <span>{s}</span>
                <div>
                  <i
                    style={{
                      width: `${data?.total ? (100 * (counts[s] || 0)) / data.total : 0}%`,
                      background: ["#d7ae62", "#8aa4c0", "#bf926a", "#8ca971"][
                        i
                      ],
                    }}
                  />
                </div>
                <b>{counts[s] || 0}</b>
              </div>
            ),
          )}
        </div>
        {admin ? (
          <div className="surface-card platform-pulse">
            <p className="eyebrow">ADMIN SNAPSHOT</p>
            <h2>People behind the response.</h2>
            <div>
              <span>
                <b>{admin.users}</b>Registered accounts
              </span>
              <span>
                <b>{admin.officers}</b>Active officers
              </span>
              <span>
                <b>{admin.unassigned}</b>Unassigned reports
              </span>
            </div>
            <button className="text-button" onClick={() => navigate("users")}>
              Manage people & access ↗
            </button>
          </div>
        ) : (
          <div className="surface-card intelligence-note">
            <span className="ai-symbol">∞</span>
            <p className="eyebrow">META AI + HUMAN JUDGEMENT</p>
            <h2>
              More context.
              <br />
              Thoughtful decisions.
            </h2>
            <p>
              Model output supports review. It does not replace a field visit,
              an officer’s judgement or a confirmed diagnosis.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
