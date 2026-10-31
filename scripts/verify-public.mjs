// Reads only public client configuration. Never accepts a service-role key.
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key)
  throw Error("Set the public Supabase URL and publishable key.");
const project = new URL(url);
if (
  project.protocol !== "https:" ||
  project.pathname !== "/" ||
  project.search ||
  project.hash
)
  throw Error("Use an HTTPS project origin.");
const headers = { apikey: key, "Content-Type": "application/json" };
const checks = [
  [
    "anonymous table read",
    "/rest/v1/reports?select=id",
    { headers },
    [401, 403],
  ],
  [
    "anonymous workflow",
    "/rest/v1/rpc/farmrelay_api",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        p_path: "/reports",
        p_method: "GET",
        p_body: {},
        p_query: {},
      }),
    },
    [401, 403],
  ],
  [
    "private helper exposure",
    "/rest/v1/rpc/case_snapshot",
    { method: "POST", headers, body: "{}" },
    [404],
  ],
];
for (const [name, path, options, expected] of checks) {
  const response = await fetch(project.origin + path, {
    ...options,
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.json().catch(() => ({}));
  console.log(
    JSON.stringify({
      check: name,
      status: response.status,
      code: body.code || null,
    }),
  );
  if (!expected.includes(response.status))
    throw Error(`${name}: unexpected status ${response.status}`);
}
const privateSchema = await fetch(project.origin + "/rest/v1/reports?select=id", {
  headers: { ...headers, "Accept-Profile": "app_private" },
  signal: AbortSignal.timeout(15000),
});
const privateSchemaBody = await privateSchema.json().catch(() => ({}));
console.log(
  JSON.stringify({
    check: "private schema exposure",
    status: privateSchema.status,
    code: privateSchemaBody.code || null,
  }),
);
if (privateSchema.status !== 406 || privateSchemaBody.code !== "PGRST106")
  throw Error("Private schema exposure check failed.");
const response = await fetch(project.origin + "/auth/v1/settings", {
  headers,
  signal: AbortSignal.timeout(15000),
});
if (!response.ok)
  throw Error(`Auth settings unavailable (${response.status}).`);
const settings = await response.json();
if (
  !settings.external?.email ||
  settings.mailer_autoconfirm !== false ||
  settings.disable_signup
)
  throw Error("Email signup/confirmation settings do not match the app.");
console.log(
  "Public API checks passed. Email delivery, sessions and signed-in workflows are separate checks.",
);
