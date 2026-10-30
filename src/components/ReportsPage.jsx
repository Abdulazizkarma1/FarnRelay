import { useLiveRefresh } from "../useLiveRefresh.js";
import React, { useEffect, useState, useCallback } from "react";
import { api, navigate } from "../api.js";
import { getDrafts, removeDraft, saveDraft } from "../drafts.js";
import { submitCase, submitEvidenceDraft } from "../investigation.js";
import ReportForm from "./ReportForm.jsx";
import Icon from "./Icon.jsx";
import {
  PageTitle,
  Badge,
  ErrorNotice,
  Loading,
  Empty,
  Pagination,
  DateText,
} from "./UI.jsx";
import "./ReportsPage.css";
export function NewReport({ user, onNotice, initialReport }) {
  const [progress, setProgress] = useState(null);
  const persist = useCallback((r) => saveDraft(user.id, r), [user.id]);
  async function save(r) {
    await saveDraft(user.id, r);
    if (!navigator.onLine || !user.verified) {
      onNotice(
        "Saved on this device. Reconnect and verify your account before sending.",
      );
      navigate("drafts");
      return;
    }
    try {
      const id = await submitCase(user.id, r, setProgress);
      await removeDraft(r.id);
      onNotice(
        "Case and attachments submitted. You can now request guided questions.",
      );
      navigate("reports/" + id);
    } catch (e) {
      setProgress(null);
      onNotice(
        "Your draft is saved. Retry to reuse completed uploads. " + e.message,
      );
      navigate("drafts");
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="NEW FIELD OBSERVATION"
        title="Bring the field into focus."
        description="Share what changed. You do not need to know the cause."
      />
      <ReportForm
        initialReport={initialReport}
        onDraft={persist}
        progress={progress}
        onSave={save}
        onCancel={() => navigate("drafts")}
        submitLabel="Submit report"
        reviewCopy="Submitting shares this report, photo and recording with authorised extension staff. Meta AI may assist their review. A local draft is kept if the connection fails."
      />
    </>
  );
}
export default function ReportsPage({ user, initialQuery = "" }) {
  const liveVersion = useLiveRefresh();
  const [query, setQuery] = useState(initialQuery),
    [search, setSearch] = useState(initialQuery),
    [status, setStatus] = useState(""),
    [queue, setQueue] = useState("all"),
    [page, setPage] = useState(1),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setBusy(true);
    setError("");
    api(
      "/reports?" +
        new URLSearchParams({
          q: search,
          page,
          queue,
          ...(status ? { status } : {}),
        }),
      { signal: controller.signal },
    )
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [search, status, page, queue, liveVersion]);
  return (
    <>
      <PageTitle
        eyebrow={
          user.role === "farmer"
            ? "YOUR FIELD JOURNAL"
            : "SHARED CASE WORKSPACE"
        }
        title={
          user.role === "farmer"
            ? "Every observation matters."
            : "From evidence to a response."
        }
        description={
          user.role === "farmer"
            ? "Track your submitted reports and continue the conversation."
            : user.role === "officer"
              ? "Only cases assigned to you appear in this workspace."
              : "Review reports and assign an extension officer to each case."
        }
      >
        {user.role === "farmer" && (
          <button className="button primary" onClick={() => navigate("new")}>
            <Icon name="plus" size={17} />
            New report
          </button>
        )}
      </PageTitle>
      <div className="queue-tabs" aria-label="Case queues">
        {[
          ["all", "All cases"],
          ["due", "Follow-up due"],
          ["waiting", "Waiting for information"],
          ["recent", "Updated in 24h"],
          ...(user.role === "admin" ? [["unassigned", "Unassigned"]] : []),
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={queue === value}
            onClick={() => {
              setQueue(value);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="report-controls">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(query);
            setPage(1);
          }}
        >
          <Icon name="search" size={17} />
          <input
            aria-label="Search crop or community"
            placeholder="Search crop or community..."
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="text-button">Search</button>
        </form>
        <label>
          <span className="sr-only">Review status</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {["Needs review", "In review", "Follow-up needed", "Closed"].map(
              (s) => (
                <option key={s}>{s}</option>
              ),
            )}
          </select>
        </label>
      </div>
      <ErrorNotice error={error} />
      {busy ? (
        <Loading text="Loading crop reports..." />
      ) : data?.items.length ? (
        <>
          <div className="case-register">
            <div className="case-register-head">
              <span>Crop observation</span>
              <span>Community</span>
              <span>
                {user.role === "farmer" ? "Assigned officer" : "Reported by"}
              </span>
              <span>Review status</span>
              <span />
            </div>
            {data.items.map((r) => (
              <button
                className="case-register-row"
                key={r._id}
                onClick={() => navigate("reports/" + r._id)}
              >
                <span className="case-crop-cell">
                  <span className="crop-avatar">
                    <Icon name="leaf" />
                  </span>
                  <span>
                    <strong>{r.crop}</strong>
                    <small>
                      {r.symptom} · <DateText value={r.createdAt} />
                    </small>
                    {r.followupDue && <small>Follow-up: {r.followupDue}</small>}
                    {r.evidenceCount > 0 && (
                      <small>{r.evidenceCount} evidence attachments</small>
                    )}
                    {r.audio?.bytes > 0 && (
                      <em>
                        <Icon name="mic" size={11} />
                        Voice note
                      </em>
                    )}
                  </span>
                </span>
                <span>{r.community}</span>
                <span>
                  {user.role === "farmer"
                    ? r.assignedTo?.name || "Awaiting assignment"
                    : r.owner?.name || "Farmer"}
                </span>
                <Badge>{r.status}</Badge>
                <Icon name="arrow" size={16} />
              </button>
            ))}
          </div>
          <Pagination {...data} onChange={setPage} />
        </>
      ) : (
        <Empty
          title="No reports in this view."
          description="Try another filter, or return when a report is submitted or assigned."
        />
      )}
    </>
  );
}
export function DraftsPage({ user, onNotice }) {
  const [drafts, setDrafts] = useState(null),
    [selected, setSelected] = useState(null),
    [error, setError] = useState("");
  async function load() {
    try {
      setDrafts(await getDrafts(user.id));
    } catch (e) {
      setError("Device storage is unavailable.");
    }
  }
  useEffect(() => {
    load();
  }, [user.id]);
  async function discard(r) {
    if (
      !window.confirm(
        "Remove this unsent draft and its attachments from this device?",
      )
    )
      return;
    try {
      await removeDraft(r.id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  if (selected)
    return (
      <NewReport user={user} onNotice={onNotice} initialReport={selected} />
    );
  return (
    <>
      <PageTitle
        eyebrow="SAVED ON THIS DEVICE"
        title="Ready when your connection is."
        description="These drafts have not been confirmed as submitted. They are private to this account on this browser."
      />
      <ErrorNotice error={error} />
      {drafts === null ? (
        <Loading />
      ) : !drafts.length ? (
        <Empty
          title="No unsent drafts."
          description="If a report cannot be sent, it stays here so you can try again."
          action={
            <button className="button outline" onClick={() => navigate("new")}>
              Start a report
            </button>
          }
        />
      ) : (
        <div className="draft-grid">
          {drafts.map((r) => (
            <article className="draft-card" key={r.id}>
              {(r.evidence?.find((e) => e.kind === "photo")?.dataUrl ||
                r.photoDataUrl) && (
                <img
                  src={
                    r.evidence?.find((e) => e.kind === "photo")?.dataUrl ||
                    r.photoDataUrl
                  }
                  alt="Draft crop photograph"
                />
              )}
              <div>
                <Badge tone="amber">Device draft</Badge>
                <h2>{r.crop}</h2>
                <p>
                  {r.community} · <DateText value={r.savedAt} />
                </p>
                <p className="draft-description">
                  {r.description || "Voice recording attached"}
                </p>
                <div className="draft-actions">
                  <button
                    className="button primary"
                    onClick={async () => {
                      if (r.type !== "attachment" && !r.reportId) {
                        setSelected(r);
                        return;
                      }
                      try {
                        if (r.type === "attachment")
                          await submitEvidenceDraft(user.id, r);
                        else await submitCase(user.id, r);
                        await removeDraft(r.id);
                        navigate("reports/" + r.reportId);
                      } catch (e) {
                        setError(e.message);
                      }
                    }}
                  >
                    {r.reportId ? "Retry saved submission" : "Review & send"}
                  </button>
                  <button className="button subtle" onClick={() => discard(r)}>
                    Remove
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="draft-note">
        Drafts are not available on other devices. Clearing this browser’s
        storage removes them. Submitted reports are stored securely on the
        server.
      </p>
    </>
  );
}
