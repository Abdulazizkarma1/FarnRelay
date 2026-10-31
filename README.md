![FarmRelay: A clearer picture. A better next step.](docs/assets/banner.svg)

<h1 align="center">FarmRelay</h1>
<p align="center"><strong>From field observation to a reviewed next step.</strong></p>
<p align="center">A browser workspace for farmers and extension officers, built for interrupted connections.</p>
<p align="center"><a href="docs/DEPLOYMENT.md">Deploy</a> · <a href="docs/ARCHITECTURE.md">Architecture</a> · <a href="docs/EVALUATION.md">Evaluation</a> · <a href="docs/VERIFICATION.md">Verification</a> · <a href="docs/DEMO.md">Demo guide</a></p>

![Checks](https://github.com/Abdulazizkarma1/FarnRelay/actions/workflows/ci.yml/badge.svg?branch=farmrelay-investigation)
![React](https://img.shields.io/badge/React-JavaScript-286447)
![CSS](https://img.shields.io/badge/Styling-Vanilla_CSS-286447)
![Release](https://img.shields.io/badge/Release-3.0.0-286447)

## The problem

A photograph alone rarely tells an extension officer everything needed to understand a crop concern. The wider plant, when the change started, how widely it appears and the farmer's explanation can be missing. FarmRelay organises that evidence and keeps the response and follow-up in the same case.

The first AI scope is **maize evidence assistance**. Other crop reports can receive human review. This is a working software implementation awaiting hosted integration and field validation, not a validated diagnostic service.

## What's in this build

| Farmer                                     | Extension officer                                 | Administrator                        |
| ------------------------------------------ | ------------------------------------------------- | ------------------------------------ |
| Four-step reporting flow                   | Assigned-case workspace                           | Verified account and role management |
| Labelled photographs and short voice notes | Inspect photographs, compare dates and listen     | Assign and reassign cases            |
| Device drafts and upload checkpoints       | Meta evidence brief with source links             | Review queues and audit history      |
| Guided questions and answers               | SAM region overlays and English transcription     | MFA required for data actions        |
| Reviewed advice and field follow-up        | Ask questions, correct transcripts, record advice | Suspend accounts and revoke access   |

**Shared:** status history, notifications, due queues, evidence versions, private media, analysis history and a local evaluation importer. The public About page includes a clearly labelled interface walkthrough without account creation or AI calls.

## How AI contributes

- **Muse Spark:** proposes missing-evidence questions and a structured officer brief. Every observation must cite an available source. Visible observations must cite photographs actually supplied to the model.
- **SAM:** returns plant-region geometry displayed over the source image. A region is not a disease finding.
- **Voice transcription:** produces an explicitly unreviewed English transcript. Twi, Dagbani, Hausa and other recordings remain playable for human listening or translation.
- **Human review:** officers send advice themselves. AI output is never automatically published as reviewed advice.

Results are tied to an evidence version. New evidence makes old output outdated. Permission and assignment checks run before paid calls and again before saving. Model access, exact provider behavior and costs must be verified with the deployment's credentials.

## Run locally

Requires Node 22.19 or later and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set the public Supabase URL and publishable key in `.env.local`. Apply both migrations in filename order to a staging project. For Meta Functions, run `npx netlify dev` with the server variables from `.env.example`; set `APP_ORIGIN` to that exact local origin. Plain Vite does not serve Netlify Functions.

Without Supabase configuration, the public About page and interface walkthrough still open. Authentication and cloud actions show configuration errors.

```sh
npm test
npm run build
npm audit --audit-level=high
```

## Deploy on Netlify and Supabase

Follow the complete [deployment guide](docs/DEPLOYMENT.md): migrations, SMTP and verification templates, environment variables, administrator bootstrap, MFA and staging acceptance. Railway, Express and MongoDB are not required.

**Release status:** local tests and compilation are recorded in [verification](docs/VERIFICATION.md). Both database migrations and transactional hosted SQL smoke checks now pass. End-to-end Auth, Storage, Realtime, SMTP and real Meta requests remain deployment checks. See [staging setup](docs/STAGING.md). The existing [prototype](https://farmrelay.netlify.app) may run an earlier build; it is not proof that this branch is deployed.

## Project map

```text
src/components/       React screens, each with a matching CSS file
src/investigation.js  Case actions, upload checkpoints and AI requests
src/drafts.js         Per-account IndexedDB drafts
src/evaluation.js     Reviewed-result metrics with explicit denominators
netlify/functions/    Server-side Meta adapters and authorisation
supabase/migrations/  Ordered schema, policies and workflow RPCs
tests/                PostgreSQL access and function contract tests
docs/                 Deployment, architecture, evaluation and demo guides
```

## Connectivity and privacy

Photographs are resized and compressed before upload. Completed uploads are checkpointed for retries. The production service worker caches app code, not private reports, media or API responses. An already loaded session can keep device drafts during a dropped connection. A cold offline launch cannot authenticate or load cloud cases. Submission, AI and new advice require connectivity. Drafts are account-filtered but not encrypted on a shared browser.

Signed media links expire after five minutes; Refresh case renews them. Uploads and database writes are separate operations: a partially created case can exist while its attachments are still pending. Device drafts remain until confirmation.

## Research and honest measurement

See [evaluation](docs/EVALUATION.md) for the dataset register, leakage controls and review protocol. No dataset benchmark, disease accuracy, crop-loss reduction or adoption claim is shipped. The evaluation page calculates only imported measurements and labels them unverified.

The business hypothesis is organisation-sponsored access for extension programmes and cooperatives. Payments, tenancy isolation, subscriptions and paid service guarantees are outside this build.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changes and [SECURITY.md](SECURITY.md) before reporting an issue. Do not publish farmer recordings, private case data or credentials in issues. Documentation uses ordinary hyphens; JSX components use paired vanilla CSS files.

No software licence has been selected by the repository owner. Do not assume public visibility grants reuse rights.

## Photograph attribution

Illustrative photographs are packaged locally as compressed WebP files and are never presented as farmer evidence:

- [Landscape photograph](https://images.unsplash.com/photo-1500382017468-9049fed747ef)
- [Tomato photograph](https://images.unsplash.com/photo-1546094096-0df4bcaaa337)

## Farmer onboarding update

The next release adds a separate signup/verify-email flow, descriptive officer-access requests, a branded green design system, optimised photography and mobile quality gates. See [ONBOARDING.md](docs/ONBOARDING.md) for the audit, phases, test commands and exact production configuration, and [account email templates](docs/email/README.md) for HTML and plain-text copy.
