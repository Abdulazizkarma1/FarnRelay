import { en } from "../i18n/en.js";
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
        eyebrow={en.legacy.reportspage_001}
        title={en.legacy.reportspage_002}
        description={en.legacy.reportspage_003}
      />
      <ReportForm
        initialReport={initialReport}
        onDraft={persist}
        progress={progress}
        onSave={save}
        onCancel={() => navigate("drafts")}
        submitLabel={en.legacy.reportspage_004}
        reviewCopy={en.legacy.reportspage_005}
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
            ? en.legacy.reportspage_006
            : en.legacy.reportspage_007
        }
        title={
          user.role === "farmer"
            ? en.legacy.reportspage_008
            : en.legacy.reportspage_009
        }
        description={
          user.role === "farmer"
            ? en.legacy.reportspage_010
            : user.role === "officer"
              ? en.legacy.reportspage_011
              : en.legacy.reportspage_012
        }
      >
        {user.role === "farmer" && (
          <button className="button primary" onClick={() => navigate("new")}>
            <Icon name="plus" size={17} />
            {en.legacy.reportspage_013}
          </button>
        )}
      </PageTitle>
      <div className="queue-tabs" aria-label={en.legacy.reportspage_014}>
        {[
          ["all", en.legacy.reportspage_015],
          ["due", en.legacy.reportspage_016],
          ["waiting", en.legacy.reportspage_017],
          ["recent", en.legacy.reportspage_018],
          ...(user.role === "admin"
            ? [["unassigned", en.legacy.reportspage_019]]
            : []),
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
            aria-label={en.legacy.reportspage_020}
            placeholder={en.legacy.reportspage_021}
            maxLength={100}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="text-button">{en.legacy.reportspage_022}</button>
        </form>
        <label>
          <span className="sr-only">{en.legacy.reportspage_023}</span>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{en.legacy.reportspage_024}</option>
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
        <Loading text={en.legacy.reportspage_025} />
      ) : data?.items.length ? (
        <>
          <div className="case-register">
            <div className="case-register-head">
              <span>{en.legacy.reportspage_026}</span>
              <span>{en.legacy.reportspage_027}</span>
              <span>
                {user.role === "farmer"
                  ? en.legacy.reportspage_028
                  : en.legacy.reportspage_029}
              </span>
              <span>{en.legacy.reportspage_030}</span>
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
                      {r.symptom}
                      {en.legacy.reportspage_031}
                      <DateText value={r.createdAt} />
                    </small>
                    {r.followupDue && (
                      <small>
                        {en.legacy.reportspage_032}
                        {r.followupDue}
                      </small>
                    )}
                    {r.evidenceCount > 0 && (
                      <small>
                        {r.evidenceCount}
                        {en.legacy.reportspage_033}
                      </small>
                    )}
                    {r.audio?.bytes > 0 && (
                      <em>
                        <Icon name="mic" size={11} />
                        {en.legacy.reportspage_034}
                      </em>
                    )}
                  </span>
                </span>
                <span>{r.community}</span>
                <span>
                  {user.role === "farmer"
                    ? r.assignedTo?.name || en.legacy.reportspage_035
                    : r.owner?.name || en.legacy.reportspage_036}
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
          title={en.legacy.reportspage_037}
          description={en.legacy.reportspage_038}
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
      setError(en.legacy.reportspage_039);
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
        eyebrow={en.legacy.reportspage_040}
        title={en.legacy.reportspage_041}
        description={en.legacy.reportspage_042}
      />
      <ErrorNotice error={error} />
      {drafts === null ? (
        <Loading />
      ) : !drafts.length ? (
        <Empty
          title={en.legacy.reportspage_043}
          description={en.legacy.reportspage_044}
          action={
            <button className="button outline" onClick={() => navigate("new")}>
              {en.legacy.reportspage_045}
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
                  alt={en.legacy.reportspage_046}
                />
              )}
              <div>
                <Badge tone="amber">{en.legacy.reportspage_047}</Badge>
                <h2>{r.crop}</h2>
                <p>
                  {r.community}
                  {en.legacy.reportspage_048}
                  <DateText value={r.savedAt} />
                </p>
                <p className="draft-description">
                  {r.description || en.legacy.reportspage_049}
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
                    {r.reportId
                      ? en.legacy.reportspage_050
                      : en.legacy.reportspage_051}
                  </button>
                  <button className="button subtle" onClick={() => discard(r)}>
                    {en.legacy.reportspage_052}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="draft-note">{en.legacy.reportspage_053}</p>
    </>
  );
}
