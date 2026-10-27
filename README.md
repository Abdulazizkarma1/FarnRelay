# FarmRelay

A React application for crop observations, voice reports and extension support. Supabase provides authentication, PostgreSQL, private media storage and realtime events. Netlify hosts the frontend and server-side Meta AI functions.

## What is included

- Farmer, assigned extension officer and administrator workspaces.
- Database-enforced permissions, authenticated sessions, administrator MFA and audit history.
- Photos, short recordings, local drafts, conversations, assignments and notifications.
- Meta evidence briefs, SAM geometry and English transcription with explicit error states.
- React JavaScript and a matching vanilla CSS file for each JSX component.

## Start locally

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set the Supabase project URL and publishable key, and apply the database migration first. Vite serves the UI and connects directly to Supabase. Use `npx netlify dev` when testing Meta Functions locally, with server secrets in the local environment. Set `APP_ORIGIN` to the exact local URL used for those requests. Do not commit `.env.local`.

```sh
npm test
npm run build
npm audit
```

Tests execute the SQL migration and access policies in embedded PostgreSQL using PGlite with test-only Supabase platform contracts. They also exercise Netlify AI authorization and persistence with mocked upstream calls. They do not replace testing the hosted Supabase Auth, Storage and Realtime services.

## Deploy

Follow [DEPLOYMENT.md](docs/DEPLOYMENT.md). Configure Supabase, apply `supabase/migrations/202610270001_farmrelay.sql`, customize the auth email templates, add Netlify variables, and bootstrap the first administrator after verified signup.

This version replaces the unlaunched MERN migration. Railway, Express, MongoDB, the custom session system and the Netlify API proxy are no longer used. Existing prototype data is not automatically imported. Keep the current live deployment until staging passes.

## Boundaries

AI assists a reviewer; it does not confirm plant disease or prescribe pesticides. Only English is enabled for automatic transcription. Other language recordings remain available for human listening. SAM access still requires live verification with the project key.

Drafts work on an already loaded page, not as a complete offline app. Signed media links expire after five minutes; refresh a report if playback has expired. There are no custom one-time MFA recovery codes. See [SECURITY.md](docs/SECURITY.md) and [VERIFICATION.md](docs/VERIFICATION.md) for deployment gates and operational limits.

## Photo attribution

Illustrative photos are locally packaged JPEGs in SVG containers, never farmer evidence:

- https://images.unsplash.com/photo-1500382017468-9049fed747ef
- https://images.unsplash.com/photo-1546094096-0df4bcaaa337
