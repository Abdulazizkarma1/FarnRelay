export async function api(endpoint, data) {
  const response = await fetch("/.netlify/functions/" + endpoint, {
    method: data ? "POST" : "GET",
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "same-origin",
    signal: AbortSignal.timeout(65000),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw Error(
      "Server functions are unavailable. Open the deployed Netlify site.",
    );
  const result = await response.json();
  if (!response.ok)
    throw Error(result.error || "Request failed. Please retry.");
  return result;
}
export function receiptToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export function encodeWav(samples) {
  const buffer = new ArrayBuffer(44 + samples.length * 2),
    v = new DataView(buffer);
  const text = (offset, s) => {
    for (let i = 0; i < s.length; i++) v.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, 16000, true);
  v.setUint32(28, 32000, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, "data");
  v.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    const n = Math.max(-1, Math.min(1, sample));
    v.setInt16(44 + i * 2, n < 0 ? n * 32768 : n * 32767, true);
  });
  return new Blob([buffer], { type: "audio/wav" });
}
export async function recordingToWav(dataUrl) {
  const response = await fetch(dataUrl);
  const bytes = await response.arrayBuffer();
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(bytes);
    if (decoded.duration > 30.5)
      throw Error("Use a recording of 30 seconds or less.");
    const offline = new OfflineAudioContext(
      1,
      Math.min(480000, Math.ceil(decoded.duration * 16000)),
      16000,
    );
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    return encodeWav((await offline.startRendering()).getChannelData(0));
  } finally {
    await context.close();
  }
}
export async function transcribeAudio(audioDataUrl) {
  const wav = await recordingToWav(audioDataUrl);
  const response = await fetch("/.netlify/functions/transcribe", {
    method: "POST",
    headers: { "Content-Type": "audio/wav" },
    body: wav,
    signal: AbortSignal.timeout(65000),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw Error("Transcription service unavailable.");
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Transcription failed.");
  return data;
}
