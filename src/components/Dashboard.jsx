import { en } from "../i18n/en.js";
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
            ? en.legacy.dashboard_001
            : user.role === "admin"
              ? en.legacy.dashboard_002
              : en.legacy.dashboard_003
        }
        title={en.legacy.dashboard_004(name)}
        description={farmer ? en.legacy.dashboard_005 : en.legacy.dashboard_006}
      >
        {farmer ? (
          <button className="button primary" onClick={() => navigate("new")}>
            <Icon name="plus" size={17} />
            {en.legacy.dashboard_007}
          </button>
        ) : (
          <button
            className="button outline"
            onClick={() => navigate("reports")}
          >
            {en.legacy.dashboard_008}
            <Icon name="arrow" size={16} />
          </button>
        )}
      </PageTitle>
      <ErrorNotice error={error} />
      {user.role === "admin" && !user.mfaEnabled && (
        <div className="setup-card">
          <Icon name="shield" size={26} />
          <div>
            <strong>{en.legacy.dashboard_009}</strong>
            <p>{en.legacy.dashboard_010}</p>
          </div>
          <button
            className="button outline"
            onClick={() => navigate("account")}
          >
            {en.legacy.dashboard_011}
          </button>
        </div>
      )}
      <section className="dashboard-hero">
        <img src="/images/landscape.webp" alt={en.legacy.dashboard_012} />
        <div className="dashboard-hero-shade" />
        <div className="dashboard-hero-copy">
          <span>
            <i />
            {en.legacy.dashboard_013}
          </span>
          <h2>
            {farmer ? (
              <>
                {en.legacy.dashboard_014}
                <br />
                <em>{en.legacy.dashboard_015}</em>
              </>
            ) : (
              <>
                {en.legacy.dashboard_016}
                <br />
                <em>{en.legacy.dashboard_017}</em>
              </>
            )}
          </h2>
          <p>{farmer ? en.legacy.dashboard_018 : en.legacy.dashboard_019}</p>
          <button
            className="button light"
            onClick={() => navigate(farmer ? "new" : "reports")}
          >
            {farmer ? en.legacy.dashboard_020 : en.legacy.dashboard_021}
            <Icon name="arrow" size={16} />
          </button>
        </div>
        <div className="hero-index">
          <span>{en.legacy.dashboard_022}</span>
          <span>{en.legacy.dashboard_023}</span>
          <span>{en.legacy.dashboard_024}</span>
        </div>
      </section>
      <section className="dashboard-stats">
        <StatCard
          label={en.legacy.dashboard_025}
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
          label={en.legacy.dashboard_026}
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
          label={en.legacy.dashboard_027}
          value={counts.Closed}
          detail="Review marked as complete"
          icon="check"
        />
      </section>
      <div className="dashboard-columns">
        <section className="surface-card recent-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">{en.legacy.dashboard_028}</p>
              <h2>{en.legacy.dashboard_029}</h2>
            </div>
            <button className="text-button" onClick={() => navigate("reports")}>
              {en.legacy.dashboard_030}
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
                      {r.community}
                      {en.legacy.dashboard_031}
                      <DateText value={r.createdAt} />
                    </small>
                  </span>
                  <Badge>{r.status}</Badge>
                  <Icon name="arrow" size={16} />
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title={farmer ? en.legacy.dashboard_032 : en.legacy.dashboard_033}
              description={
                farmer ? en.legacy.dashboard_034 : en.legacy.dashboard_035
              }
              action={
                farmer && (
                  <button
                    className="button outline"
                    onClick={() => navigate("new")}
                  >
                    {en.legacy.dashboard_036}
                  </button>
                )
              }
            />
          )}
        </section>
        <aside className="field-guide-card">
          <div className="field-guide-image">
            <img src="/images/tomatoes.webp" alt={en.legacy.dashboard_037} />
            <span>{en.legacy.dashboard_038}</span>
          </div>
          <div>
            <p className="eyebrow">{en.legacy.dashboard_039}</p>
            <h3>
              {en.legacy.dashboard_040}
              <br />
              {en.legacy.dashboard_041}
            </h3>
            <p>{en.legacy.dashboard_042}</p>
            <span className="guide-tip">
              <Icon name="mic" size={17} />
              {en.legacy.dashboard_043}
            </span>
          </div>
        </aside>
      </div>
      <section className="dashboard-bottom">
        <div className="surface-card distribution">
          <div className="card-heading">
            <h2>{en.legacy.dashboard_044}</h2>
            <span className="eyebrow">{en.legacy.dashboard_045}</span>
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
            <p className="eyebrow">{en.legacy.dashboard_046}</p>
            <h2>{en.legacy.dashboard_047}</h2>
            <div>
              <span>
                <b>{admin.users}</b>
                {en.legacy.dashboard_048}
              </span>
              <span>
                <b>{admin.officers}</b>
                {en.legacy.dashboard_049}
              </span>
              <span>
                <b>{admin.unassigned}</b>
                {en.legacy.dashboard_050}
              </span>
            </div>
            <button className="text-button" onClick={() => navigate("users")}>
              {en.legacy.dashboard_051}
            </button>
          </div>
        ) : (
          <div className="surface-card intelligence-note">
            <span className="ai-symbol">{en.legacy.dashboard_052}</span>
            <p className="eyebrow">{en.legacy.dashboard_053}</p>
            <h2>
              {en.legacy.dashboard_054}
              <br />
              {en.legacy.dashboard_055}
            </h2>
            <p>{en.legacy.dashboard_056}</p>
          </div>
        )}
      </section>
    </>
  );
}
