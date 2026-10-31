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
        eyebrow="YOUR UPDATES"
        title="Keep the conversation moving."
        description="Feedback, assignments and report updates. Showing your latest 30 notifications."
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
          title="You’re all caught up."
          description="Report updates will appear here when your team or a farmer responds."
        />
      )}
    </>
  );
}
