// Explicit callbacks keep default Supabase PKCE emails compatible with hash routes.
export function authRedirect(origin, action) {
  if (!["signup", "recovery"].includes(action))
    throw Error("Unsupported email action.");
  const url = new URL(origin);
  if (
    url.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(url.hostname)
  )
    throw Error("Authentication requires HTTPS.");
  return url.origin + "/?auth_action=" + action;
}
export function readAuthCallback(href) {
  const url = new URL(href);
  if (!url.searchParams.has("code") && !url.searchParams.has("error"))
    return null;
  const action = url.searchParams.get("auth_action") || "signup";
  const code = url.searchParams.get("code") || "";
  return {
    code,
    action,
    error: url.searchParams.has("error")
      ? "This email link has expired or could not be verified. Request a new email."
      : !["signup", "recovery"].includes(action) || !code || code.length > 2048
        ? "This email link is invalid. Request a new email."
        : "",
  };
}
export async function exchangeEmailCode(auth, code) {
  if (typeof code !== "string" || !code || code.length > 2048)
    throw Error("Invalid email code.");
  const { data, error } = await auth.exchangeCodeForSession(code);
  if (error || !data?.session)
    throw Error(
      "This link could not be completed. Open it in the same browser used to request it, or request a fresh email. If your email is already verified, try signing in.",
    );
  return data;
}
