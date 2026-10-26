export function outputText(data) {
  return (
    data.output_text ||
    data.output
      ?.flatMap((item) => item.content || [])
      .filter((item) => item.type === "output_text")
      .map((item) => item.text)
      .join("\n") ||
    ""
  );
}
export async function readObservation(request) {
  const raw = await request.text();
  if (raw.length > 2500000)
    throw new Error("Report is too large. Choose a smaller photo.");
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Invalid report format.");
  }
  if (
    !data ||
    typeof data !== "object" ||
    typeof data.description !== "string" ||
    !data.description.trim() ||
    data.description.length > 2000
  )
    throw new Error("A description of 1 to 2000 characters is required.");
  const facts = Object.fromEntries(
    ["crop", "community", "symptom", "onset"].map((key) => [
      key,
      String(data[key] || "").slice(0, 100),
    ]),
  );
  facts.description = data.description;
  let photoDataUrl = null;
  if (data.photoDataUrl) {
    if (
      typeof data.photoDataUrl !== "string" ||
      !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(
        data.photoDataUrl,
      )
    )
      throw new Error("Photo must be a JPG, PNG or WebP data URL.");
    photoDataUrl = data.photoDataUrl;
  }
  return { facts, photoDataUrl };
}
export async function callMeta(body) {
  const start = Date.now();
  const response = await fetch("https://api.meta.ai/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.MODEL_API_KEY}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    if (response.status === 401 || response.status === 403)
      throw new Error(
        "Meta rejected the key or model access. Check your Netlify settings.",
      );
    if (response.status === 429)
      throw new Error("Meta rate or usage limit reached. Please try later.");
    throw new Error(
      `Meta could not complete this request (HTTP ${response.status}).`,
    );
  }
  return { data: await response.json(), elapsedMs: Date.now() - start };
}
export function setupError(request) {
  if (request.method !== "POST")
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { Allow: "POST" } },
    );
  if (!process.env.MODEL_API_KEY)
    return Response.json(
      {
        error:
          "Meta is not configured. Add MODEL_API_KEY in Netlify environment variables and redeploy.",
      },
      { status: 503 },
    );
  return null;
}
export function cleanText(value) {
  return String(value)
    .replace(/[\u2013\u2014]/g, ", ")
    .slice(0, 4000);
}
