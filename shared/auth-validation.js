export const MIN_PASSWORD_LENGTH = 15;
export const MAX_PASSWORD_LENGTH = 128;
export const TERMS_VERSION = "2026-10-31";
const common = new Set([
  "123456789012345",
  "passwordpassword",
  "passwordpasswordpassword",
  "farmrelayfarmrelay",
]);
export const normalizeEmail = (email) =>
  String(email || "")
    .trim()
    .toLowerCase();
export function passwordIssue(value, email = "") {
  if (typeof value !== "string") return "passwordRequired";
  const length = [...value].length;
  if (length < MIN_PASSWORD_LENGTH) return "passwordShort";
  if (length > MAX_PASSWORD_LENGTH) return "passwordLong";
  if (
    common.has(value.toLowerCase()) ||
    value.toLowerCase() === normalizeEmail(email)
  )
    return "passwordCommon";
  return "";
}
export function validateAuth(mode, data) {
  const errors = {};
  if (
    ["register", "login", "forgot", "resend"].includes(mode) &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(data.email))
  )
    errors.email = "emailInvalid";
  if (mode === "register") {
    if (
      typeof data.name !== "string" ||
      data.name.trim().length < 2 ||
      data.name.trim().length > 100
    )
      errors.name = "nameInvalid";
    if (!["farmer", "officer"].includes(data.role)) errors.role = "roleInvalid";
    if (data.terms !== true) errors.terms = "termsRequired";
  }
  if (["register", "reset"].includes(mode)) {
    const issue = passwordIssue(data.password, data.email);
    if (issue) errors.password = issue;
  }
  if (mode === "login" && (typeof data.password !== "string" || !data.password))
    errors.password = "passwordRequired";
  if (data.email?.length > 254) errors.email = "emailInvalid";
  return errors;
}
export function passwordGuidance(password, email = "") {
  const length = [...password].length,
    issue = passwordIssue(password, email);
  return {
    length,
    valid: !issue,
    level: issue ? 0 : length >= 24 ? 3 : length >= 20 ? 2 : 1,
  };
}
