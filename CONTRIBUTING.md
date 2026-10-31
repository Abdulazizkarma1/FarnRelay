# Contributing

## Development

Use Node 22.12 or later. Run `npm ci`, configure `.env.local`, then `npm run dev`. Use a separate staging Supabase project for integration checks. Netlify Functions need `npx netlify dev` and matching `APP_ORIGIN`.

Use React JavaScript, vanilla CSS and a matching CSS file for every JSX file. Keep farmer instructions simple. Do not add invented scores, fake model results, long dash characters or untranslated language-support claims.

## Changes

1. Create a feature branch from the current integration branch.
2. Keep UI, server authorisation and database contracts consistent.
3. Use a new timestamped migration for already deployed database changes. Never rewrite an applied migration.
4. Add meaningful regression coverage for access checks, paid requests, concurrency and data loss risks.
5. Run `npm test`, `npm run build` and `npm audit --audit-level=high`.
6. Describe what changed, how it was checked and what remains unverified in the pull request.

Never use production farmer data as test fixtures. Never expose secret keys through `VITE_` variables. Keep private media private and `app_private` outside the exposed API schemas. Review [security boundaries](docs/SECURITY.md) and [deployment](docs/DEPLOYMENT.md) before changing Auth or policies.
