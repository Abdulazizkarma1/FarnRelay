export const photos = {
  landscape: "/images/landscape.svg",
  tomatoes: "/images/tomatoes.svg",
};
export const crops = ["Maize", "Cassava", "Tomato", "Cashew", "Rice", "Other"];
export const symptoms = [
  "Leaf damage",
  "Wilting",
  "Discolouration",
  "Unusual insects",
  "Other",
];
export const statuses = [
  "Needs review",
  "In review",
  "Follow-up needed",
  "Closed",
];
export function seedReports() {
  const now = Date.now();
  return [
    {
      id: "sample-1",
      crop: "Maize",
      community: "Navrongo",
      symptom: "Leaf damage",
      description:
        "Small holes visible on several young leaves. Three rows appear affected. The concern was first noticed yesterday.",
      hours: 2,
      affected: "Three rows",
      status: "Needs review",
    },
    {
      id: "sample-2",
      crop: "Maize",
      community: "Navrongo",
      symptom: "Leaf damage",
      description:
        "Leaf edges appear damaged on a small section of the plot. No insects were recorded in this observation.",
      hours: 7,
      affected: "One section",
      status: "Needs review",
    },
    {
      id: "sample-3",
      crop: "Tomato",
      community: "Tamale",
      symptom: "Wilting",
      description:
        "Some plants are wilting. Water supply has been irregular this week. A field check has been requested.",
      hours: 28,
      affected: "About ten plants",
      status: "In review",
    },
    {
      id: "sample-4",
      crop: "Cassava",
      community: "Bolgatanga",
      symptom: "Discolouration",
      description:
        "Several leaves have yellow patches. The farmer has not yet recorded whether newer leaves are also affected.",
      hours: 52,
      affected: "",
      status: "Follow-up needed",
    },
  ].map(({ hours, ...r }) => ({
    ...r,
    sample: true,
    createdAt: new Date(now - hours * 3600000).toISOString(),
    onset: new Date(now - hours * 3600000).toISOString().slice(0, 10),
  }));
}
export function evidenceChecks(report) {
  return [
    {
      label: "Crop identified",
      weight: 10,
      passed: Boolean(report.crop && report.crop !== "Other"),
    },
    {
      label: "Community recorded",
      weight: 15,
      passed: Boolean(report.community?.trim()),
    },
    { label: "Observation date", weight: 15, passed: Boolean(report.onset) },
    {
      label: "Visible symptom",
      weight: 15,
      passed: Boolean(report.symptom && report.symptom !== "Other"),
    },
    {
      label: "Description of at least 25 characters",
      weight: 20,
      passed: (report.description?.trim().length || 0) >= 25,
    },
    {
      label: "Own crop photo attached",
      weight: 25,
      passed: Boolean(report.photoDataUrl),
    },
  ];
}
export function evidenceScore(report) {
  return evidenceChecks(report)
    .filter((x) => x.passed)
    .reduce((n, x) => n + x.weight, 0);
}
export function matchingGroups(reports, now = Date.now()) {
  const groups = new Map();
  reports
    .filter(
      (r) =>
        r.status !== "Closed" &&
        Number.isFinite(Date.parse(r.createdAt)) &&
        now - Date.parse(r.createdAt) <= 7 * 86400000 &&
        Date.parse(r.createdAt) <= now,
    )
    .forEach((r) => {
      const key = [
        r.crop,
        r.community,
        r.symptom,
        r.sample ? "sample" : "personal",
      ]
        .map((x) => String(x).trim().toLowerCase())
        .join("|");
      groups.set(key, [...(groups.get(key) || []), r]);
    });
  return [...groups.values()].filter((g) => g.length >= 2);
}
export function shortDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? "Date not recorded"
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("farmrelay", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("reports", { keyPath: "id" });
      request.result.createObjectStore("settings");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function readReports() {
  const db = await openDB();
  const existing = await new Promise((resolve, reject) => {
    const tx = db.transaction("reports");
    const r = tx.objectStore("reports").getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  db.close();
  if (existing.length)
    return existing.sort(
      (a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0),
    );
  let old = [];
  try {
    const saved = JSON.parse(
      localStorage.getItem("fieldsignal-reports") || "[]",
    );
    if (Array.isArray(saved)) old = saved.filter((r) => r.id && !r.sample);
  } catch {}
  const initial = [...old, ...seedReports()];
  for (const r of initial) await writeReport(r);
  return initial;
}
export async function writeReport(report) {
  const db = await openDB();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("reports", "readwrite");
      tx.objectStore("reports").put(report);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
export async function prepareImage(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Choose a JPG, PNG or WebP photo.");
  if (file.size > 12 * 1024 * 1024)
    throw Error("Choose a photo smaller than 12 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const photoDataUrl = canvas.toDataURL("image/jpeg", 0.8);
  return {
    photoDataUrl,
    photoWidth: canvas.width,
    photoHeight: canvas.height,
    photoBytes: Math.round((photoDataUrl.split(",")[1].length * 3) / 4),
    originalBytes: file.size,
  };
}
export async function requestAI(endpoint, report) {
  const response = await fetch(`/.netlify/functions/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      crop: report.crop,
      community: report.community,
      symptom: report.symptom,
      onset: report.onset,
      description: report.description,
      photoDataUrl: report.photoDataUrl,
    }),
    signal: AbortSignal.timeout(65000),
  });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json"))
    throw Error("AI functions are unavailable. Use Netlify or netlify dev.");
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "The model request failed.");
  return data;
}
