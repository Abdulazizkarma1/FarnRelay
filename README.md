# FarmRelay

A MERN crop reporting and extension support workspace. Farmers submit observations and recordings. Assigned officers review evidence, use Meta assistance, and reply. Administrators manage access and assignments.

## Stack

- React 19 with JavaScript and matching vanilla CSS files for each JSX component.
- Express 5 and Node.js 22.12+.
- MongoDB with Mongoose, private attachments, session storage and audit history.
- Railway Docker deployment for the API. Netlify can serve the frontend through a same-origin API proxy. Railway can also serve both from one origin.
- Forest green, warm ivory and amber interface with locally hosted typography and real photographic assets.

## Local development

```sh
npm ci
npm ci --prefix server
cp server/.env.example server/.env
```

Set `MONGODB_URI`, `APP_ORIGIN=http://localhost:5173`, a random `APP_SECRET`, and a development SMTP account in `server/.env`. Start MongoDB independently, then run these in separate terminals:

```sh
npm run dev:api
npm run dev
```

Registration creates farmer accounts only. Verify email before submitting or reviewing reports. Bootstrap the first admin using the documented CLI, then enable an authenticator and promote verified accounts to officers.

## Checks

```sh
npm test
node --test server/test/unit.test.js
npm run test:api
npm run build
npm audit --prefix server --omit=dev
```

The complete API suite starts an isolated MongoDB through `mongodb-memory-server`. It needs an environment allowed to download and run MongoDB. No real Meta calls or outgoing email are made by tests. GitHub Actions runs the suite on Ubuntu.

## Deployment and operation

Read [deployment](docs/DEPLOYMENT.md), [architecture](docs/ARCHITECTURE.md), [security](docs/SECURITY.md), and [verification status](docs/VERIFICATION.md).

This migration replaces the earlier Netlify Functions prototype. Do not merge or switch the live Netlify build until the Railway API, MongoDB, SMTP and origin configuration are ready. Existing prototype receipt codes and reports are not silently imported into authenticated accounts.

## Product boundaries

- Meta output is labelled as unreviewed assistance. Officers send human feedback separately.
- Photo completeness is not diagnostic confidence. No fabricated accuracy or outbreak scores.
- Automatic transcription currently accepts English recordings only. Twi, Dagbani, Hausa and other recordings remain available for human listening.
- SAM access depends on the Meta account and model availability. Unsupported calls show an error; there is no simulated fallback.
- Drafts can be saved locally from an already loaded authenticated page. Fresh offline sign-in and a fully offline application are not implemented.
- This code is a deployment candidate, not a claim of audited or operationally verified production security.
