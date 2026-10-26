# FieldSignal
React and vanilla CSS browser prototype for crop incident reporting.

## Run
Use Node 20 or later. Run `npm install`, then `npm run dev`.
Run `npm run build` for production assets.

## Netlify
Import this folder as a repository. Build command: `npm run build`. Publish folder: `dist`. Functions folder: `netlify/functions`.
Set MODEL_API_KEY and optionally META_MODEL in Netlify environment settings. Do not put secrets in frontend code. Netlify CLI `netlify dev` is needed to test functions locally.

## Implemented
Responsive workspace, report form, browser-local text persistence, status editing, synthetic sample records, simple matching groups, and a server-side Muse Spark brief adapter.

## Limitations
This is an initial prototype, not a production deployment. Data are local to one browser. It does not have authentication, shared database sync, service-worker offline loading, photo uploads, SAM segmentation or voice input yet. Matching groups do not apply distance or time windows and are not outbreak alerts. The live Meta integration has not been tested with credentials. Add authentication, authorization and rate limiting before exposing the billable function publicly. Do not store sensitive farmer data in this prototype.

## Data
All seeded records are synthetic. Sample and personal observations are grouped separately. Browser storage can be cleared by the user or browser. No dataset is bundled.
