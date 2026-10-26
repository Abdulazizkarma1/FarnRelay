# FarmRelay
A React and vanilla CSS workspace for crop observation evidence and human review.

## Run and deploy
Use Node 22 or later. Run `npm ci`, then `npm run dev`. Run `npm test` for the core logic tests and `npm run build` for production assets.

Connect this repository to Netlify. Build command: `npm run build`. Publish directory: `dist`. Functions directory: `netlify/functions`. Use `netlify dev` to test server functions locally.

Set `MODEL_API_KEY` in Netlify environment variables. Optionally set `META_MODEL` (default `muse-spark-1.3`). Never prefix the secret with VITE_. Redeploy after configuring the key. No secrets are included in this repository.

## Implemented in v0.2
- Responsive dashboard with crop photography and reduced-motion-aware transitions.
- Three-step observation capture with photo upload, resizing and a review checklist.
- IndexedDB storage for local reports and photos. Old non-sample localStorage reports are imported on first database use.
- Evidence Lab with explicit user-triggered SAM 3.1 and Muse Spark calls.
- SAM returned object boxes overlaid on the submitted photo. Pixel masks are counted, not rendered.
- Muse Spark structured observation brief, missing information and follow-up questions.
- Visible success, skip and failure states with server-measured API request duration.
- Weighted report completeness score, explicitly not diagnostic confidence.
- Grouping by crop, normalised community, symptom and a seven-day window. Closed reports excluded. Synthetic and personal reports never mix.
- Review status updates and report search/filtering.

## Score definition
Crop identified: 10. Community: 15. Observation date: 15. Specific symptom: 15. Description of at least 25 characters: 20. Own photo: 25. Maximum: 100. This measures field presence only, not photo quality, diagnosis accuracy or disease risk.

## Honest boundaries
This remains a prototype. Reports are stored in one browser, not in a shared officer database. An already loaded page can save locally while offline, but service-worker offline reopening and server sync are not implemented. There is no authentication or access control. Add authentication, authorization and server-side rate limits before enabling public billable AI access. Voice transcription and local-language speech support are not implemented.

No disease diagnosis, pesticide prescription or confirmed outbreak claims are made. Grouping is not geospatial modelling or spread prediction. Meta calls require an eligible key and model access. Live API compatibility still needs verification with deployment credentials; tests use fixtures and do not call paid APIs.

## Images and samples
Seed records are synthetic and contain no crop photos. The landscape and tomato photographs are illustrative UI assets, never presented as submitted evidence. Illustrative photos are self-hosted as SVG containers embedding the original JPEG data. They are not required for reporting or model analysis.
Sources:
- https://images.unsplash.com/photo-1500382017468-9049fed747ef
- https://images.unsplash.com/photo-1546094096-0df4bcaaa337

## Structure
- `src/App.jsx` and `src/App.css`: application shell and workspace views.
- `src/components/ReportForm.jsx` and `.css`: capture wizard.
- `src/components/EvidenceLab.jsx` and `.css`: model workflow and evidence inspection.
- `src/lib.js`: storage, scoring, image preparation and grouping.
- `netlify/functions/`: server-side API adapters. Keys stay here.
- `tests/core.test.mjs`: scoring, grouping, geometry parsing and input validation.

## API references
- https://dev.meta.ai/docs/sam/overview
- https://dev.meta.ai/docs/overview
