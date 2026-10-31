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
    title: "Integrated management of fall armyworm on maize",
    publisher: "FAO",
    url: "https://www.fao.org/family-farming/detail/en/c/1112643/",
    note: "Background on systematic observation and integrated pest management. Human review required.",
  },
  {
    id: "cabi-plantwise",
    title: "Plantwise crop advisory resources",
    publisher: "CABI",
    url: "https://www.cabi.org/projects/plantwise/",
    note: "Reference material for crop advisers. Verify local applicability before giving advice.",
  },
];
export function evidenceChecklist(report, evidence = []) {
  return [
    {
      label: "Whole plant photograph",
      done: evidence.some(
        (e) => e.kind === "photo" && e.label === "Whole plant",
      ),
    },
    {
      label: "Close view of concern",
      done: evidence.some(
        (e) => e.kind === "photo" && e.label === "Close view",
      ),
    },
    {
      label: "When it started",
      done: !!report.onset && report.answers?.onsetKnown !== "Unknown",
    },
    {
      label: "Extent across the field",
      done: !!(report.answers?.extent || report.affected),
    },
    {
      label: "Farmer explanation",
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
      question: "Can you add a photograph of the whole plant?",
      reason: "A wider view gives the officer context.",
    });
  if (!report.answers?.insects)
    questions.push({
      key: "insects",
      question: "Have you seen insects on the affected plants?",
      reason: "Record what you actually saw, including no insects or unsure.",
    });
  if (!report.answers?.extent && !report.affected)
    questions.push({
      key: "extent",
      question: "How widely is the concern present?",
      reason: "One plant, several plants, much of the field, or unsure.",
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
  r.evidenceRequestId ||= crypto.randomUUID();
  r.answersRequestId ||= crypto.randomUUID();
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
