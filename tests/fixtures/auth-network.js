// Synthetic network fixture for UI tests. Never creates accounts or sends email.
const id = "11111111-1111-4111-8111-111111111111";
export function createAuthFixture() {
  let verified = false;
  const user = () => ({
    id,
    email: "farmer@example.test",
    aud: "authenticated",
    role: "authenticated",
    email_confirmed_at: verified ? "2026-10-31T00:00:00Z" : null,
    confirmed_at: verified ? "2026-10-31T00:00:00Z" : null,
    user_metadata: { name: "Test Farmer" },
    app_metadata: { provider: "email" },
    created_at: "2026-10-31T00:00:00Z",
    factors: [],
  });
  const profile = () => ({
    id,
    email: "farmer@example.test",
    name: "Test Farmer",
    role: "farmer",
    verified,
    mfaEnabled: false,
    active: true,
    community: "",
  });
  const token = () => {
    const b64 = (value) =>
      btoa(JSON.stringify(value))
        .replace(/=/g, "")
        .replace(/\+/g, "-")
        .replace(/\//g, "_");
    return (
      b64({ alg: "HS256", typ: "JWT" }) +
      "." +
      b64({
        sub: id,
        aud: "authenticated",
        role: "authenticated",
        aal: "aal1",
        amr: [],
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        session_id: "22222222-2222-4222-8222-222222222222",
      }) +
      ".c3ludGhldGlj"
    );
  };
  const session = () => ({
    access_token: token(),
    refresh_token: "synthetic-test-refresh",
    token_type: "bearer",
    expires_in: 3600,
    user: user(),
  });
  return async function handle(input) {
    const { url, method = "GET", body = {} } = input;
    const u = new URL(url, "http://fixture.test");
    if (u.pathname === "/.netlify/functions/auth") {
      if (body.operation === "signup")
        return { status: 200, body: { user: user(), session: null } };
      if (body.operation === "resend" || body.operation === "recover")
        return { status: 200, body: {} };
      if (body.operation === "login")
        return verified
          ? { status: 200, body: session() }
          : {
              status: 400,
              body: { code: "email_not_confirmed", msg: "Email not confirmed" },
            };
    }
    if (u.pathname.endsWith("/auth/v1/token")) {
      verified = true;
      return { status: 200, body: session() };
    }
    if (u.pathname.endsWith("/auth/v1/user"))
      return { status: 200, body: user() };
    if (u.pathname.endsWith("/auth/v1/logout"))
      return { status: 204, body: null };
    if (u.pathname.endsWith("/rest/v1/rpc/farmrelay_api")) {
      const path = body.p_path;
      return {
        status: 200,
        body:
          path === "/auth/me"
            ? { user: profile() }
            : path === "/reports/summary"
              ? { total: 0, counts: {}, recent: [] }
              : path === "/notifications"
                ? { unread: 0, items: [] }
                : path === "/reports"
                  ? { total: 0, items: [], page: 1, pages: 1 }
                  : {},
      };
    }
    return null;
  };
}
