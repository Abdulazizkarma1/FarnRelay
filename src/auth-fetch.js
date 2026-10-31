// Preserve Supabase SDK PKCE generation/storage while validating sensitive forms server-side.
export function createAuthFetch(fetcher = fetch) {
  return async (input, init) => {
    const request = new Request(input, init),
      url = new URL(request.url);
    let operation;
    if (request.method === "POST") {
      const action = url.pathname.split("/").at(-1);
      if (["signup", "resend", "recover"].includes(action)) operation = action;
      if (
        action === "token" &&
        url.searchParams.get("grant_type") === "password"
      )
        operation = "login";
    }
    if (!operation)
      return fetcher(input, {
        ...init,
        signal: init?.signal || AbortSignal.timeout(25000),
      });
    return fetcher("/.netlify/functions/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        operation,
        redirect: url.searchParams.get("redirect_to"),
        body: await request.json(),
      }),
      signal: AbortSignal.timeout(25000),
    });
  };
}
