let csrf = "";
export function setCsrf(value) {
  csrf = value || "";
}
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export async function api(path, { method = "GET", body, signal } = {}) {
  let response;
  try {
    response = await fetch("/api" + path, {
      method,
      credentials: "same-origin",
      headers: {
        ...(body instanceof Blob
          ? { "Content-Type": body.type }
          : body !== undefined
            ? { "Content-Type": "application/json" }
            : {}),
        ...(!["GET", "HEAD"].includes(method) && csrf
          ? { "X-CSRF-Token": csrf }
          : {}),
      },
      body:
        body instanceof Blob
          ? body
          : body !== undefined
            ? JSON.stringify(body)
            : undefined,
      signal: signal || AbortSignal.timeout(60000),
    });
  } catch (e) {
    throw new ApiError(
      e.name === "TimeoutError"
        ? "The request timed out. Please retry."
        : "Connection unavailable. Your saved drafts are still on this device.",
      0,
    );
  }
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(
      "The API is unavailable. Check the Railway connection.",
      response.status,
    );
  const data = await response.json();
  if (!response.ok) {
    if (data.code === "AUTH_REQUIRED" && path !== "/auth/me")
      window.dispatchEvent(new Event("farmrelay:session-expired"));
    throw new ApiError(
      data.error || "Request failed.",
      response.status,
      data.code,
    );
  }
  if (data.csrf) setCsrf(data.csrf);
  return data;
}
export const mediaUrl = (id, kind) => `/api/reports/${id}/media/${kind}`;
export const navigate = (path) => {
  window.location.hash = path;
  window.scrollTo({ top: 0, behavior: "instant" });
};
