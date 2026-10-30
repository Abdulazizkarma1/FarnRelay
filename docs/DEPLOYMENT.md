# Supabase and Netlify deployment

## 1. Create a staging Supabase project

Use a separate staging project before switching the live frontend. Apply every SQL file in `supabase/migrations/` in filename order through the connected Supabase migration tool or SQL editor. Apply each migration once and record its version. The base migration creates accounts infrastructure; the investigation migration adds evidence, case events, versioned AI runs and queues. Existing staging projects with the base migration need only the new migration. It creates the application tables, role checks, private `crop-evidence` bucket, Storage policies, RPCs and Realtime publication entries. Never apply `supabase/tests/platform.sql` to a hosted project; it is a test fixture only.

Keep Row Level Security enabled. Keep `crop-evidence` private. Do not add broad public policies or expose `app_private` through the Data API. Public registration ignores role metadata and creates farmers only. The browser must never receive a secret/service-role key.

## 2. Configure Supabase Auth

Enable email/password accounts and email confirmation. Set a minimum password length of 12 in Auth settings, not just in the frontend. Enable TOTP MFA. Set the Site URL to the exact frontend origin. Add only trusted staging/production redirect origins. Configure custom SMTP and test delivery before signup. New free Supabase projects using default SMTP cannot edit email templates, so custom SMTP is required for the token-hash templates below. The default mail service is not a production mail setup. Configure Auth rate limits and bot protection for the expected audience.

The app uses token-hash verification links and does not automatically process arbitrary URL sessions. Set these templates in Supabase Auth:

**Confirm signup link:**

```html
<a href="{{ .SiteURL }}/#verify?token={{ .TokenHash }}"
  >Verify your FarmRelay email</a
>
```

**Reset password link:**

```html
<a href="{{ .SiteURL }}/#reset?token={{ .TokenHash }}"
  >Reset your FarmRelay password</a
>
```

These templates are required for the implemented flow. The app consumes the token with `verifyOtp` after the user presses the confirmation button. Fragments are not sent to Netlify in the HTTP request. Never put analytics scripts on these pages.

Configure session lifetime and inactivity settings according to the selected Supabase plan. The app does not claim a fixed eight-hour or 30-minute timeout. Account suspension and access changes block existing app sessions immediately through the database profile check; refreshing the same old Supabase session does not undo that revocation.

## 3. Set Netlify variables

Build command: `npm ci && npm run build`. Publish directory: `dist`. Functions directory: `netlify/functions`. Node version: 22. Deploy branch `farmrelay-investigation` for staging.

| Variable                        | Scope             | Purpose                                                                 |
| ------------------------------- | ----------------- | ----------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`             | Build, public     | Supabase HTTPS project origin                                           |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Build, public     | Publishable key, or legacy anon key                                     |
| `SUPABASE_URL`                  | Functions         | Same project origin                                                     |
| `SUPABASE_PUBLISHABLE_KEY`      | Functions         | Same public key                                                         |
| `SUPABASE_SECRET_KEY`           | Functions, secret | Secret key, or legacy service-role key, for saving validated AI results |
| `MODEL_API_KEY`                 | Functions, secret | Meta model credential                                                   |
| `META_MODEL`                    | Functions         | Optional, defaults to `muse-spark-1.3`                                  |
| `APP_ORIGIN`                    | Functions         | Exact frontend origin, without trailing slash                           |

Remove the old `API_PROXY_TARGET`, `DEV_API_TARGET`, `MONGODB_URI`, `APP_SECRET` and shared officer credentials from this migration's environment. SMTP settings now belong in Supabase, not Netlify.

A rebuild is required after changing public Vite variables. The build generates a CSP allowing only the configured Supabase HTTP/WebSocket origin in addition to this app. A build without public configuration succeeds but displays a configuration error at runtime; this is not a working backend preview. Do not point an untrusted deploy preview at the production database or give it production secrets. Each staging environment must have a matching Auth Site URL and `APP_ORIGIN`.

## 4. Bootstrap the administrator

Register the intended admin through the app and verify email. In `supabase/bootstrap-admin.sql`, replace `REPLACE_WITH_VERIFIED_ADMIN_EMAIL` with that account's exact email, then run it through the Supabase SQL editor. It refuses to create an additional admin if one already exists and records an audit entry.

Sign in again after promotion. The app opens Account & security. Enroll the authenticator; every administrator data action requires an actual `aal2` session. Have extension officers register and verify email, then promote them in People & access. Role changes invalidate their current app sessions, so they must sign in again.

Supabase authenticator recovery is an operator process here. Verify the person's identity before resetting factors through trusted Supabase administration. Never disable MFA merely because someone can name an email address. Keep project-owner account recovery and a documented incident procedure available.

## 5. Staging acceptance

- Sign up and confirm from the real email link. Test expired/reused links, password reset, TOTP, logout and cross-tab state.
- Use two farmers, two officers and an admin to check reports, conversations, notification ownership and direct Storage access. Check admin access is denied before MFA.
- Suspend an officer while signed in. Confirm further data and AI requests fail. Reassign their reports separately.
- Submit a real photo and recording from Android and iOS browsers. Test denied microphone permission, slow upload, retry, local draft recovery and five-minute media-link expiry.
- Confirm Realtime updates for conversations, report lists and notifications across two browsers. Check unavailable WebSocket behavior; Refresh remains available for report details.
- Run actual Meta calls. The function uses caller RLS to authorize and download evidence, then a server secret to save results with a second permission check. Confirm model access, billing, function timeout limits and errors. SAM and voice model availability remain unverified until successful live calls.
- Test backup restoration, account recovery, retention/deletion operations and expected load before collecting real farmer data.

## 6. Cutover and rollback

Merge only after staging works. Deploy the frontend with the corresponding Supabase project and secrets. Existing Netlify Blobs receipt-based reports and the previous Mongo schema do not have an automatic importer. Any import needs a backup and verified account-to-record ownership mapping first.

Rollback code to the prior deployment and its matching environment. Preserve the new database and Storage objects for recovery; do not delete them as part of a code rollback. SQL changes after initial deployment should be new migrations, not edits to an already-applied migration.

## Maintenance

Configure database and object-storage backups separately and prove restoration. Set retention, export/deletion procedures, error monitoring, SMTP alerts, storage quotas and Meta spending limits. Failed uploads can leave unreferenced objects when cleanup cannot run. Clean only objects proven unreferenced by reports, after a grace period and backup. Check both legacy report media and `case_evidence`; `app_private.media_referenced(path)` includes both. Record bulk operator actions. RLS is access control, not a malware scanner or a diagnostic accuracy guarantee.

## Migration inventory

- `202610270001_farmrelay.sql`: profiles, roles, reports, messages, notifications, audit, Auth/Storage policies and initial RPCs.
- `20261030123752_investigation_workflow.sql`: labelled evidence, answers, timeline, follow-up dates/outcomes, versioned analysis, source snapshots and server-filtered queues.

Use Supabase CLI `db push` on a linked staging project or the connected migration tool with the SQL files. Back up existing data first. Never run `supabase/tests/platform.sql` on hosted Supabase. It replaces platform contracts only for embedded tests.

## Offline behavior

The production build generates `sw.js` from its exact asset manifest. It caches app code and fonts, not authenticated requests, reports or recordings. Cold offline authentication is unavailable. Test shell updates on a previously installed version and close/reopen tabs to activate a waiting worker. Device drafts are not a server backup.

## Provider checks

Confirm the configured Meta response model, SAM and voice model are enabled for the project before the demonstration. Model defaults are adapter configuration, not a promise of access. Netlify must allow function duration long enough for the 45-second upstream timeout; the browser waits at most 65 seconds. A shorter host timeout can leave a processing run until the two-minute interruption window permits retry. Set spending controls in the provider account.
