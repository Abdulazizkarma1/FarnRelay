# FarmRelay

React JavaScript and vanilla CSS for farmer reporting, extension review and Meta AI assistance. Every JSX component has its own CSS file.

## Netlify setup

Use Node 22+. Run `npm ci`, `npm test`, and `npm run build`.

- Build: `npm run build`
- Publish: `dist`
- Functions: `netlify/functions`
- `MODEL_API_KEY`: Meta Model API secret, server-side only.
- `META_MODEL`: optional, defaults to `muse-spark-1.3`.
- `OFFICER_ACCESS_KEY`: a random secret of at least 24 characters for the pilot extension team. Do not use the Meta API key here.

Set environment variables for production Functions and redeploy. Never prefix secrets with VITE_. Netlify Blobs uses the site's automatic runtime credentials. No separate database account is needed. Shared submission remains disabled until officer access is configured. Use `netlify dev` for local server functions. Vite alone serves the frontend only.

## Roles and workflow

The homepage has two entrances:

1. **Farmer space**: capture a photo, optional voice note and context; save a local draft; explicitly send to the extension team; check status and read or send replies.
2. **Extension team**: sign in, review actual submissions, filter the queue, play original audio, request Meta transcription, save a labelled unreviewed transcript, inspect image evidence and send reviewed feedback.

Farmers do not need accounts. Each report has a random 256-bit private token. Its hash is stored server-side. A private recovery code grants access to that report on another device. Anyone with the code can read and reply, so keep it private. It is stored with the local report in IndexedDB and is not put in a URL.

Pilot officers share one access credential. Successful sign-in creates an eight-hour HMAC-signed HttpOnly, Secure, SameSite=Strict cookie. Changing the access key invalidates sessions. This is a pilot team login, not individual staff identity or a full account-management system. Authenticated farmers and officers have distinct reply roles even when both views are used in one browser.

Shared reports use Netlify Blobs with strong consistency. Initial submissions are immutable and retried with the same ID/token to avoid duplicates. Replies and transcripts are separate append-only records. Production uses `farmrelay-live`; deploy previews use `farmrelay-preview`. Protect preview access because previews on the same Netlify site share its storage credentials.

## Voice

Browser MediaRecorder captures up to 30 seconds with playback, replace and remove controls. Supported recording formats depend on the browser. Recording requires HTTPS and microphone permission. Audio is saved locally and is uploaded only when the farmer sends the report.

Officers can request English transcription with `muse-voice-transcribe-1.0` at `/v1/asr/transcribe`. The browser converts the clip to mono 16-bit PCM WAV at 16 kHz before the server sends multipart data to Meta. The server validates the WAV header and duration. A 30-second WAV is approximately 960 KB; the original compressed clip is usually much smaller.

Twi, Dagbani and Hausa are not on Meta's published language list. These recordings remain playable for human listening, with automatic transcription disabled. The app does not claim translation, local-language synthesis or transcription confidence. Transcripts are labelled unreviewed and separate from officer advice. Check the original recording before acting on a transcript.

## Evidence Lab

Muse Spark creates structured observations, unknowns and follow-up questions. SAM 3.1 is connected through the documented Responses API; boxes are rendered when returned, while raster masks are counted but not rendered. On October 27, live Muse text and image calls succeeded; SAM returned upstream HTTP 404. Model access must be verified for the deployed account.

AI output is a review aid, not a diagnosis, pesticide prescription or confirmed outbreak. API errors remain visible. Officer AI analysis stays in the current session. Shared officer replies and explicitly saved transcripts persist on the server. A saved transcript can supply context for a voice-only report.

The separate labelled sample workspace retains the earlier device-local demonstration. It is not the shared officer queue. Synthetic records are never uploaded to the shared queue by that workspace.

## Low connectivity and limitations

- Photo resizing and short compressed recordings reduce upload size.
- Drafts and private receipt codes persist in IndexedDB. Already-loaded pages can save offline.
- Sending, checking for feedback and AI requests need internet. Users explicitly retry; there is no automatic background upload.
- No service worker, offline page reopening, SMS, push alerts or background notifications yet.
- Feedback is checked through the report page. No guaranteed response time or staffed service is implied.
- No editing or attachment upload after submission yet. Farmers can add text updates.
- Clearing browser storage removes local drafts and receipt codes. Save recovery codes separately.
- Queue listing is suitable for a small pilot. It loads all case summaries and event histories; pagination and institutional scoping are future work.
- Function-level rate limits are configured for login, shared reports and transcription. Verify Netlify's deployment logs for rule enforcement. Older sample AI endpoints remain public and require further access controls before a broad public launch.

## Tests and verification

`npm test` covers field scoring, report grouping, SAM geometry parsing, request validation, private token authorization, shared reply flow, immutable retry behavior, officer sessions, WAV validation and the transcription adapter with mocked Meta output. These tests do not call paid APIs. Real browser microphone capture and live Meta voice model access still require a supported HTTPS device and configured officer access.

## Score definition

Crop: 10. Community: 15. Observation date: 15. Specific symptom: 15. Description of at least 25 characters: 20. Own photo: 25. Maximum 100. Field completeness only, not disease risk or model confidence. A recording alone does not award description points. Report groups match crop, community and symptom within seven days; closed and synthetic reports are excluded from the real queue.

## Photos

Illustrative photos are locally packaged JPEGs embedded in SVG containers. They are never presented as farmer evidence.

- https://images.unsplash.com/photo-1500382017468-9049fed747ef
- https://images.unsplash.com/photo-1546094096-0df4bcaaa337

## References

- https://dev.meta.ai/docs/speech-to-text
- https://dev.meta.ai/docs/api-reference/voice/transcribe
- https://dev.meta.ai/docs/api-reference/voice/schemas
- https://dev.meta.ai/docs/sam/overview
- https://docs.netlify.com/build/data-and-storage/netlify-blobs/
