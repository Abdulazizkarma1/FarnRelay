import { en } from "./i18n/en.js";
// Keep HTTP status when wrapping SDK errors. Supabase treats 5xx as retryable
// and may omit the provider error code for those responses.
export function authErrorStatus(error, code = error?.code) {
  return (
    error?.status ||
    (code === "AUTH_REQUIRED" ? 401 : code === "42501" ? 403 : 400)
  );
}
export function friendlyAuthError(error) {
  const code = error?.code || "",
    status = error?.status;
  if (
    [
      "bad_jwt",
      "invalid_jwt",
      "refresh_token_not_found",
      "session_not_found",
    ].includes(code)
  )
    return en.auth.signedOut;
  if (
    status >= 500 ||
    [
      "service_unavailable",
      "server_credentials_invalid",
      "origin_not_allowed",
    ].includes(code)
  )
    return en.errors.config;
  if (code === "email_not_confirmed") return en.auth.unverified;
  if (code === "MFA_REQUIRED") return en.errors.mfa;
  if (status === 429 || /rate|over_.*limit/.test(code)) return en.errors.rate;
  if (
    error?.name === "AbortError" ||
    error?.name === "TimeoutError" ||
    code === "timeout"
  )
    return en.errors.timeout;
  if (
    error?.name === "TypeError" ||
    error?.name === "AuthRetryableFetchError" ||
    globalThis.navigator?.onLine === false
  )
    return en.errors.network;
  if (code === "invalid_credentials" || code === "user_not_found")
    return en.errors.credentials;
  if (
    [
      "otp_expired",
      "flow_state_expired",
      "flow_state_not_found",
      "bad_code_verifier",
    ].includes(code)
  )
    return en.errors.expired;
  if (code === "weak_password") return en.errors.passwordCommon;
  if (code === "validation_failed") return en.errors.generic;
  if (code === "service_unavailable" || /configured/.test(error?.message || ""))
    return en.errors.config;
  return en.errors.generic;
}
