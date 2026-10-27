import { setupError, cleanText } from "./lib/meta.mjs";
import { originAllowed, isOfficer, json } from "./lib/access.mjs";
export function validateWav(bytes) {
  const b = Buffer.from(bytes);
  if (
    b.length < 44 ||
    b.length > 1000000 ||
    b.toString("ascii", 0, 4) !== "RIFF" ||
    b.toString("ascii", 8, 12) !== "WAVE" ||
    b.toString("ascii", 12, 16) !== "fmt " ||
    b.readUInt32LE(16) !== 16 ||
    b.readUInt16LE(20) !== 1 ||
    b.readUInt16LE(22) !== 1 ||
    b.readUInt32LE(24) !== 16000 ||
    b.readUInt16LE(34) !== 16 ||
    b.toString("ascii", 36, 40) !== "data" ||
    b.readUInt32LE(40) !== b.length - 44
  )
    throw Error("Use a mono 16 kHz PCM WAV recording of up to 30 seconds.");
  if (b.length - 44 > 960000) throw Error("Recording exceeds 30 seconds.");
  return b;
}
export default async function handler(request) {
  const blocked = setupError(request);
  if (blocked) return blocked;
  if (!isOfficer(request))
    return json({ error: "Officer sign-in required for transcription." }, 401);
  if (!originAllowed(request))
    return json({ error: "Request not allowed." }, 403);
  try {
    const bytes = validateWav(await request.arrayBuffer());
    const form = new FormData();
    form.append(
      "request",
      JSON.stringify({
        model: "muse-voice-transcribe-1.0",
        audioEncoding: "WAV",
        mode: "PUSH_TO_TALK",
        languageBias: ["English"],
        keywords: ["maize", "cassava", "tomato", "Tamale", "Navrongo"],
      }),
    );
    form.append(
      "audio",
      new Blob([bytes], { type: "audio/wav" }),
      "recording.wav",
    );
    const start = Date.now();
    const response = await fetch("https://api.meta.ai/v1/asr/transcribe", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MODEL_API_KEY}`,
        Accept: "application/json",
      },
      body: form,
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok)
      return json(
        {
          error: `Meta transcription is unavailable (HTTP ${response.status}). You can still play the recording and write a manual transcript.`,
        },
        502,
      );
    const data = await response.json();
    if (typeof data.transcript !== "string")
      return json(
        {
          error:
            "Meta returned an unreadable transcript. The recording is still available.",
        },
        502,
      );
    return json({
      transcript: cleanText(data.transcript),
      model: "muse-voice-transcribe-1.0",
      elapsedMs: Date.now() - start,
      audioDurationMs: data.audioDurationMs,
    });
  } catch (e) {
    return json(
      {
        error:
          e.name === "TimeoutError"
            ? "Transcription timed out. Keep the recording and retry."
            : e.message,
      },
      400,
    );
  }
}
export const config = {
  rateLimit: { windowLimit: 10, windowSize: 60, aggregateBy: ["ip", "domain"] },
};
