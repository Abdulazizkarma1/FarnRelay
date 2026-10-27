# Architecture

The browser uses one public origin. `/api` is served by Express directly or proxied from Netlify to Railway. Express validates origin, sessions, CSRF, roles and resource ownership before accessing MongoDB or Meta.

| Role    | Capabilities                                                                                    |
| ------- | ----------------------------------------------------------------------------------------------- |
| Farmer  | Own reports and attachments, own conversations, local drafts, own notifications and account     |
| Officer | Assigned reports and attachments, review status, conversations and Meta assistance              |
| Admin   | All reports, assignments, users and audit history; access management and assignment require MFA |

Public registration always creates a farmer. Administrator creation is an operator-only bootstrap operation. The API rejects role fields submitted through profile or registration forms. UI navigation reflects permissions, but the API is the authority.

## Data

Users, sessions, single-use email action tokens, rate counters, reports, conversations, notifications and audit entries are separate collections. Photos and audio are bounded private buffers nested within reports, excluded from normal queries. Media is fetched through the same report scope as the report itself. No public attachment URLs are generated.

Reports use a unique account/client UUID for retry idempotency. Conversations use a unique report/client UUID. Status and assignment writes require the current version number. Admin changes revoke active sessions through both deletion and an account version counter.

Notifications and audit writes are separate database operations from the primary change. They do not currently use transactions or a durable outbox. A side-effect failure can occur after a primary write succeeds; clients retain idempotency identifiers for retry. A durable outbox and queue are appropriate next steps for higher operational guarantees.

## AI

Staff initiate server-side reasoning, segmentation or transcription. The server stores returned model identifiers, timing and results. Reasoning uses submitted context, photo and saved transcript. Segmentation renders only returned boxes. English audio is converted in the browser to mono 16 kHz PCM WAV and validated by the API before forwarding. An authorized reviewer supplies that conversion; it is not a cryptographic proof that the WAV matches the original recording. Preserve the original for comparison.

There are no fabricated model results. Errors remain visible. Automated text is not sent to farmers as officer advice. Officers write their own responses in the conversation.

## Connectivity

Images are resized to a maximum dimension of 1200 pixels. Recordings are short and capped by size. Drafts are saved in IndexedDB under the signed-in account ID before an upload is attempted. They remain on that device until successful submission or explicit deletion. This does not encrypt browser storage or guarantee offline app launch. The browser must already have the app loaded and the account context available.

## Interface

Responsive sidebar and mobile menu, role-specific overview, paginated case register, case conversation and AI workbench, notifications, account security and administrator access management. Shared UI primitives use vanilla CSS. Motion respects reduced-motion preferences. Photography is illustrative and never presented as submitted farmer evidence.
