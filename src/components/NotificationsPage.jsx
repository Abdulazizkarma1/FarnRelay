import { en } from "../i18n/en.js";
import { useLiveRefresh } from "../useLiveRefresh.js";
import React, { useEffect, useState } from "react";
import { api, navigate } from "../api.js";
import { PageTitle, ErrorNotice, Loading, Empty, DateText } from "./UI.jsx";
import Icon from "./Icon.jsx";
import "./NotificationsPage.css";
export default function NotificationsPage() {
  const liveVersion = useLiveRefresh();
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    api("/notifications")
      .then(setData)
      .catch((e) => setError(e.message));
  }, [liveVersion]);
  async function open(n) {
    try {
      await api("/notifications/" + n._id + "/read", { method: "POST" });
      navigate("reports/" + n.report);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <PageTitle
        eyebrow={en.legacy.notificationspage_001}
        title={en.legacy.notificationspage_002}
        description={en.legacy.notificationspage_003}
      />
      <ErrorNotice error={error} />
      {!data && !error ? (
        <Loading />
      ) : data?.items.length ? (
        <section className="notification-list">
          {data.items.map((n) => (
            <button
              className={!n.readAt ? "unread" : ""}
              key={n._id}
              onClick={() => open(n)}
            >
              <span className="notification-icon">
                <Icon name="bell" />
              </span>
              <span>
                <strong>{n.text}</strong>
                <small>
                  <DateText value={n.createdAt} />
                  {!n.readAt ? " · Unread" : ""}
                </small>
              </span>
              <Icon name="arrow" size={17} />
            </button>
          ))}
        </section>
      ) : (
        <Empty
          title={en.legacy.notificationspage_004}
          description={en.legacy.notificationspage_005}
        />
      )}
    </>
  );
}
