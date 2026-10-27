# Security boundaries

Supabase Auth owns passwords, refresh tokens and authenticator factors. The app uses its browser SDK, so session credentials are in browser storage and are accessible to JavaScript on the origin. This is not an HttpOnly-cookie architecture. Keep dependencies updated and the Content Security Policy restrictive. There is no model-generated HTML insertion or third-party analytics script.

PostgreSQL policies and security-definer functions enforce roles using `public.profiles`, not JWT user metadata. Public signup creates farmers only. All application tables use RLS. Direct client writes are denied. Functions have fixed empty search paths and explicit grants. `app_private` must not be exposed through PostgREST.

All administrator data operations require `aal2`; enrollment alone is insufficient. Enrolled non-admin users also need an MFA challenge before data access. Account-profile reads and enrollment remain possible before the data gate. Custom one-time recovery codes from the MERN version no longer exist. Establish a verified operator recovery process in Supabase before public launch.

The service/secret key is restricted to Netlify Functions and never uses a `VITE_` prefix. It can bypass RLS, so its confidentiality is critical. Ordinary requests use the caller's public-key client and JWT. AI persistence uses a service-only function that checks access again. Meta and Supabase secrets must not be logged or pasted into issue descriptions.

App access checks include the authoritative Supabase session row, active-account status and a revocation cutoff. Revoking app access does not delete the Supabase Auth account. Signed media links remain usable until their five-minute expiry, even after suspension. Previously downloaded data cannot be recalled.

Auth abuse protection is configured in Supabase. Database rate counters limit application requests and AI calls. Storage bucket limits enforce file size and MIME allowlists, not full content decoding or malware scanning. Configure infrastructure quotas and monitoring; counters are not a complete denial-of-service defense.

The application is not a validated plant diagnosis system, security audit or compliance certification. Local drafts are account-filtered but not encrypted. Define privacy notices, recording consent, retention, export/deletion and incident response before real-world use.
