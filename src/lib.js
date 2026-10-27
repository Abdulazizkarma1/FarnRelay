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
export function newReportId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
