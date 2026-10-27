import { getStore } from "@netlify/blobs";
import { randomUUID } from "node:crypto";
import {
  hash,
  equal,
  isOfficer,
  officerConfigured,
  originAllowed,
  json,
} from "./lib/access.mjs";
const ID = /^[a-f0-9-]{36}$/;
const TOKEN = /^[a-f0-9]{64}$/;
const statuses = ["Needs review", "In review", "Follow-up needed", "Closed"];
export function validateReport(r) {
  if (!r || !ID.test(r.id || "") || !TOKEN.test(r.receiptToken || ""))
    throw Error("Invalid report receipt.");
  const out = { id: r.id };
  for (const key of [
    "crop",
    "community",
    "symptom",
    "onset",
    "description",
    "affected",
    "audioLanguage",
  ]) {
    out[key] = String(r[key] || "")
      .trim()
      .slice(0, key === "description" ? 2000 : 100);
  }
  if (!out.crop || !out.community || (!out.description && !r.audioDataUrl))
    throw Error("Add crop, community and a description or recording.");
  for (const [key, re, max] of [
    [
      "photoDataUrl",
      /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/,
      2000000,
    ],
    [
      "audioDataUrl",
      /^data:audio\/(webm|mp4|ogg|wav)(?:;codecs=[a-zA-Z0-9.,-]+)?;base64,[A-Za-z0-9+/]+=*$/,
      1500000,
    ],
  ]) {
    if (
      r[key] &&
      (typeof r[key] !== "string" || r[key].length > max || !re.test(r[key]))
    )
      throw Error(
        "Unsupported or oversized media. Use a smaller photo or a recording under 30 seconds.",
      );
    if (r[key]) out[key] = r[key];
  }
  return {
    ...out,
    receiptHash: hash(r.receiptToken),
    createdAt: new Date().toISOString(),
    status: "Needs review",
    sample: false,
  };
}
export function createReportsHandler(
  storeFactory = () =>
    getStore({
      name:
        process.env.CONTEXT === "deploy-preview"
          ? "farmrelay-preview"
          : "farmrelay-live",
      consistency: "strong",
    }),
) {
  return async function handler(request) {
    if (request.method !== "POST" || !originAllowed(request))
      return json({ error: "Request not allowed." }, 405);
    if (!officerConfigured())
      return json(
        {
          error:
            "Shared reporting opens after the site owner configures officer access. Your draft can stay on this device.",
        },
        503,
      );
    const raw = await request.text();
    if (raw.length > 3800000)
      return json({ error: "Report is too large. Use smaller media." }, 413);
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid request." }, 400);
    }
    try {
      const store = storeFactory();
      const officer = isOfficer(request) && data.actor !== "farmer";
      async function view(id, media = true) {
        const r = await store.get("reports/" + id, { type: "json" });
        if (!r) return null;
        const { blobs } = await store.list({ prefix: "events/" + id + "/" });
        const events = (
          await Promise.all(
            blobs.map((b) => store.get(b.key, { type: "json" })),
          )
        )
          .filter(Boolean)
          .sort(
            (a, b) =>
              a.createdAt.localeCompare(b.createdAt) ||
              a.id.localeCompare(b.id),
          );
        const safe = {
          ...r,
          events,
          status:
            events.filter((e) => e.status).at(-1)?.status || "Needs review",
        };
        delete safe.receiptHash;
        if (!media) {
          delete safe.photoDataUrl;
          delete safe.audioDataUrl;
          safe.hasPhoto = !!r.photoDataUrl;
          safe.hasAudio = !!r.audioDataUrl;
        }
        return safe;
      }
      if (data.action === "submit") {
        let report;
        try {
          report = validateReport(data.report);
        } catch (e) {
          return json({ error: e.message }, 400);
        }
        const existing = await store.get("reports/" + report.id, {
          type: "json",
        });
        if (existing && !equal(existing.receiptHash, report.receiptHash))
          return json({ error: "Report ID already exists." }, 409);
        if (!existing)
          await store.setJSON("reports/" + report.id, report, {
            onlyIfNew: true,
          });
        const confirmed = await store.get("reports/" + report.id, {
          type: "json",
        });
        if (!confirmed || !equal(confirmed.receiptHash, report.receiptHash))
          return json(
            { error: "Could not confirm submission. Please retry." },
            409,
          );
        return json({ report: await view(report.id) });
      }
      if (data.action === "list") {
        if (!officer) return json({ error: "Officer sign-in required." }, 401);
        const { blobs } = await store.list({ prefix: "reports/" });
        const items = await Promise.all(
          blobs.map((b) => view(b.key.slice(8), false)),
        );
        return json({
          reports: items
            .filter(Boolean)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        });
      }
      if (!ID.test(data.id || ""))
        return json({ error: "Invalid report code." }, 400);
      const original = await store.get("reports/" + data.id, { type: "json" });
      if (
        !original ||
        (!officer &&
          (!TOKEN.test(data.token || "") ||
            !equal(original.receiptHash, hash(data.token))))
      )
        return json(
          { error: "Report not found or private code incorrect." },
          404,
        );
      if (data.action === "read") return json({ report: await view(data.id) });
      if (data.action === "reply" || data.action === "transcript") {
        if (data.action === "transcript" && !officer)
          return json({ error: "Officer sign-in required." }, 401);
        const text = String(data.text || "").trim();
        if (!text || text.length > 2000)
          return json({ error: "Write a reply of 1 to 2000 characters." }, 400);
        if (officer && data.status && !statuses.includes(data.status))
          return json({ error: "Invalid review status." }, 400);
        const event = {
          id: randomUUID(),
          createdAt: new Date().toISOString(),
          role:
            data.action === "transcript"
              ? "transcript"
              : officer
                ? "officer"
                : "farmer",
          text,
          ...(officer && data.status ? { status: data.status } : {}),
        };
        await store.setJSON("events/" + data.id + "/" + event.id, event);
        return json({ report: await view(data.id) });
      }
      return json({ error: "Unknown action." }, 400);
    } catch {
      return json(
        {
          error:
            "Shared storage is unavailable. Keep your draft and retry. Check Netlify function logs if this persists.",
        },
        503,
      );
    }
  };
}
export default createReportsHandler();
export const config = {
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
