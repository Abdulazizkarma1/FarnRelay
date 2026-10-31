import { en } from "./i18n/en.js";
import { requestId } from "./id.js";
import { getSupabase } from "./supabase.js";
import { api, uploadAttachment } from "./api.js";
import { saveDraft } from "./drafts.js";
export const PHOTO_LABELS = [
  "Whole plant",
  "Close view",
  "Additional evidence",
];
export const GUIDANCE = [
  {
    id: "fao-faw",
    title: en.legacy.investigation_1001,
    publisher: "FAO",
    url: "https://www.fao.org/family-farming/detail/en/c/1112643/",
    note: en.legacy.investigation_1002,
  },
  {
    id: "cabi-plantwise",
    title: en.legacy.investigation_1003,
    publisher: "CABI",
    url: "https://www.cabi.org/projects/plantwise/",
    note: en.legacy.investigation_1004,
  },
];
export function evidenceChecklist(report, evidence = []) {
  return [
    {
      label: en.legacy.investigation_1005,
      done: evidence.some(
        (e) => e.kind === "photo" && e.label === "Whole plant",
      ),
    },
    {
      label: en.legacy.investigation_1006,
      done: evidence.some(
        (e) => e.kind === "photo" && e.label === "Close view",
      ),
    },
    {
      label: en.legacy.investigation_1007,
      done: !!report.onset && report.answers?.onsetKnown !== "Unknown",
    },
    {
      label: en.legacy.investigation_1008,
      done: !!(report.answers?.extent || report.affected),
    },
    {
      label: en.legacy.investigation_1009,
      done:
        !!report.description?.trim() ||
        evidence.some((e) => e.kind === "audio"),
    },
  ];
}
export function nextQuestions(report, evidence = []) {
  const questions = [];
  if (!evidence.some((e) => e.label === "Whole plant"))
    questions.push({
      key: "wholePlant",
      question: en.legacy.investigation_1010,
      reason: en.legacy.investigation_1011,
    });
  if (!report.answers?.insects)
    questions.push({
      key: "insects",
      question: en.legacy.investigation_1012,
      reason: en.legacy.investigation_1013,
    });
  if (!report.answers?.extent && !report.affected)
    questions.push({
      key: "extent",
      question: en.legacy.investigation_1014,
      reason: en.legacy.investigation_1015,
    });
  return questions.slice(0, 3);
}
export const attachmentBytes = (items) =>
  items.reduce((n, e) => n + (e.bytes || e.media?.bytes || 0), 0);
function unwrap({ data, error }) {
  if (error) throw Error(error.message);
  return data;
}
export async function caseAction(id, action = "get", body = {}) {
  const data = unwrap(
    await getSupabase().rpc("farmrelay_investigation", {
      p_report_id: id,
      p_action: action,
      p_body: body,
    }),
  );
  return data;
}
export async function signEvidence(items) {
  return Promise.all(
    items.map(async (e) => {
      try {
        const d = unwrap(
          await getSupabase()
            .storage.from("crop-evidence")
            .createSignedUrl(e.media.path, 300),
        );
        return { ...e, url: d.signedUrl };
      } catch {
        return { ...e, url: "", unavailable: true };
      }
    }),
  );
}
// Upload checkpoints live with the draft. A retry reuses completed objects and RPC IDs.
export async function submitCase(userId, draft, onProgress = () => {}) {
  const r = structuredClone(draft);
  r.uploads ||= {};
  r.evidenceRequestId ||= requestId();
  r.answersRequestId ||= requestId();
  await saveDraft(userId, r);
  const created = await api("/reports", {
    method: "POST",
    body: {
      clientId: r.id,
      crop: r.crop,
      community: r.community,
      symptom: r.symptom,
      onset: r.onset,
      description:
        r.description || "Voice recording attached for human review.",
      affected: r.answers?.extent || "",
    },
  });
  r.reportId = created.report._id;
  await saveDraft(userId, r);
  const items = r.evidence || [];
  for (let i = 0; i < items.length; i++) {
    const e = items[i];
    onProgress({
      state: "uploading",
      label: e.label,
      completed: i,
      total: items.length,
    });
    if (!r.uploads[e.id]) {
      r.uploads[e.id] = await uploadAttachment(
        userId,
        r.id,
        e.dataUrl,
        e.kind,
        e.kind === "photo" ? { width: e.width, height: e.height } : {},
      );
      await saveDraft(userId, r);
    }
  }
  if (items.length)
    await caseAction(r.reportId, "evidence", {
      clientId: r.evidenceRequestId,
      items: items.map((e) => ({
        clientId: e.id,
        kind: e.kind,
        label: e.label,
        language: e.language,
        media: r.uploads[e.id],
      })),
    });
  await caseAction(r.reportId, "answers", {
    clientId: r.answersRequestId,
    answers: r.answers || {},
  });
  onProgress({
    state: "submitted",
    completed: items.length,
    total: items.length,
  });
  return r.reportId;
}
export async function runAnalysis(id, kind, body) {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session) throw Error("Please sign in again.");
  const response = await fetch("/.netlify/functions/investigate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "X-Report-Id": id,
      "X-AI-Action": kind,
      "Content-Type": body instanceof Blob ? body.type : "application/json",
    },
    body: body instanceof Blob ? body : "{}",
    signal: AbortSignal.timeout(65000),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw Error("AI functions require the configured Netlify deployment.");
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "Analysis could not complete.");
  return result;
}

export async function submitEvidenceDraft(userId, draft) {
  const r = structuredClone(draft);
  await saveDraft(userId, r);
  if (!r.uploaded) {
    r.uploaded = await uploadAttachment(
      userId,
      r.clientId,
      r.attachment.dataUrl,
      r.attachment.kind,
      r.attachment.kind === "photo"
        ? { width: r.attachment.width, height: r.attachment.height }
        : {},
    );
    await saveDraft(userId, r);
  }
  return caseAction(r.reportId, "evidence", {
    clientId: r.id,
    items: [
      {
        clientId: r.attachment.id,
        kind: r.attachment.kind,
        label: r.attachment.label,
        language: r.attachment.language,
        media: r.uploaded,
      },
    ],
  });
}
