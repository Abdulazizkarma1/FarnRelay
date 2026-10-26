import {
  outputText,
  readObservation,
  callMeta,
  setupError,
} from "./lib/meta.mjs";
export function parseBoxes(text) {
  const matches = [
    ...text.matchAll(
      /<\|box;x1=([\d.]+);y1=([\d.]+);x2=([\d.]+);y2=([\d.]+);w=([\d.]+);h=([\d.]+)\|>/g,
    ),
  ];
  return matches
    .map((m) =>
      Object.fromEntries(
        ["x1", "y1", "x2", "y2", "w", "h"].map((key, i) => [
          key,
          Number(m[i + 1]),
        ]),
      ),
    )
    .filter(
      (b) =>
        b.w > 0 &&
        b.h > 0 &&
        b.x2 > b.x1 &&
        b.y2 > b.y1 &&
        b.x1 >= 0 &&
        b.y1 >= 0 &&
        b.x2 <= b.w &&
        b.y2 <= b.h,
    )
    .slice(0, 100);
}
export default async function handler(request) {
  const blocked = setupError(request);
  if (blocked) return blocked;
  let input;
  try {
    input = await readObservation(request);
    if (!input.photoDataUrl)
      throw new Error("Attach your own crop photo to run SAM.");
  } catch (e) {
    return Response.json({ error: e.message }, { status: 400 });
  }
  try {
    const model = "sam-3.1";
    const { data, elapsedMs } = await callMeta({
      model,
      input: [
        {
          type: "message",
          role: "user",
          content: [
            { type: "input_text", text: "plant leaf" },
            { type: "input_image", image_url: input.photoDataUrl },
          ],
        },
      ],
      stream: false,
    });
    const text = outputText(data);
    const boxes = parseBoxes(text);
    if (text.trim() && !boxes.length && text.includes("box;"))
      throw new Error(
        "SAM returned geometry this version cannot display. No regions have been inferred.",
      );
    return Response.json(
      {
        model,
        elapsedMs,
        boxes,
        maskCount: (text.match(/<\|mask;/g) || []).length,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e.name === "TimeoutError"
            ? "SAM took too long. Please retry."
            : e.message || "Segmentation failed.",
      },
      { status: 502 },
    );
  }
}
