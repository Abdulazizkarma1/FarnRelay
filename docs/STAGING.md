# FarmRelay staging

## Connected project

- Name: FarmRelay
- Organisation: Abdulazizkarma1's Org
- Project reference: `fyssbtadzjqvmxglowdf`
- API URL: `https://fyssbtadzjqvmxglowdf.supabase.co`
- Region: `eu-west-3`
- [Project dashboard](https://supabase.com/dashboard/project/fyssbtadzjqvmxglowdf)

This project already existed when the organisation was confirmed. No additional project or paid plan was created.

## Applied migrations

| Version        | Name                   |
| -------------- | ---------------------- |
| 20261030175537 | farmrelay              |
| 20261030175601 | investigation_workflow |
| 20261031183220 | onboarding_validation |

The local migration filenames match the hosted history. SQL content is unchanged. Do not reapply these migrations to this project.

## Verified

- Both migrations applied successfully.
- Public HTTP checks passed: anonymous table/workflow access denied, private helper unavailable, private schema not exposed, email signup enabled with confirmation required.
- Hosted role/ownership/MFA and revoked-assignment smoke checks passed inside a rolled-back transaction.
- All application tables have RLS. Private evidence storage has the reviewed size/MIME limits.
- No synthetic test users or reports remain.

To reproduce the transactional test, run `supabase/tests/hosted-smoke.sql` through the SQL editor against staging only. To check public HTTP access boundaries, put the URL and active publishable key in ignored `.env.local`, then run `npm run verify:public`. This does not sign anyone in or make model calls.

## Still needed for the frontend

In Netlify, follow DEPLOYMENT.md and set both public build variables and the server-only function variables. Retrieve the publishable and secret keys from the project dashboard. Never put the secret key in a `VITE_` variable or a public document.

Configure custom SMTP, signup/reset token-hash templates, exact Auth Site URL/redirects, 12-character minimum passwords and TOTP. Then bootstrap a verified administrator and complete the multi-account acceptance checks.

A local ignored `.env.local` contains public client configuration for development. It is not committed and contains no Meta or Supabase secret key. The GitHub branch does not automatically configure Netlify secrets.

## Advisor observations

The private `app_private.rate_limits` table deliberately denies client access and has no client policy. Supabase reports this as informational. See [RLS with no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). New indexes are unused until workload arrives, so no index was removed merely for an initial unused-index notice.

The onboarding migration is applied and service-only quota grants were checked. See ONBOARDING.md for the new gateway deployment, provider password policy, forwarded-IP setup and remaining email acceptance checks.
