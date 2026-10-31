# Build verification

Implementation checked on 30 October 2026. Release 3.0.0.

## Local checks

| Check                         | Result                        | Scope                                                                          |
| ----------------------------- | ----------------------------- | ------------------------------------------------------------------------------ |
| Automated suite               | 32 passing tests              | Embedded PostgreSQL and mocked model/function contracts                        |
| Configured production build   | Passed                        | Vite build with placeholder public Supabase configuration                      |
| Dependency audit              | Zero reported vulnerabilities | `npm audit --audit-level=high` on the committed lockfile                       |
| Public browser walkthrough    | Checked                       | Landing page, crop entry, evidence step, field context and review state        |
| JSX/CSS pairing and dash scan | Checked                       | Every JSX screen has a paired CSS file; no long dash characters in source/docs |

The configured build's entry script is approximately 479 KB uncompressed and 138 KB gzip. Routes are lazy-loaded. This measurement is not the total transfer size; fonts, route chunks and illustrative photographs add bytes.

## What the tests cover

Both ordered SQL migrations execute in PGlite against test-only Supabase Auth/Storage contracts. Scenarios cover role injection, direct-write denial, ownership, MFA, assignments, revoked sessions, idempotency, evidence ownership, committed-media deletion protection, answers, optimistic review conflicts, transactional notifications, queue scoping, AI deduplication, stale evidence, revoked in-flight access and internal-session-field exclusion.

Function tests check authorization before paid calls, server-only persistence, structured citations, supplied-photo citations, duplicate questions, malformed WAV/SAM output, upstream failure and superseded-result responses. Meta requests are mocked. Evaluation tests verify coverage, denominators, missing observations, medians and invalid imports.

## Hosted staging checks

The existing FarmRelay project became visible in the connected account after the organisation was confirmed. Both reviewed migrations were applied successfully on 30 October 2026. Their repository filenames now match the migration versions recorded by the connected tool, with SQL content unchanged.

Hosted transactional smoke checks passed for report idempotency, direct role-write denial, farmer isolation, assigned-officer access, admin MFA and rejection of AI persistence after reassignment. All synthetic fixture writes were rolled back; zero users and reports remained afterward. The reusable test is `supabase/tests/hosted-smoke.sql`.

Public HTTP checks passed for denied anonymous table/workflow access and hidden private helper/schema. Email signup is enabled and confirmation is required. These checks did not send email or establish a signed-in Auth session.

All nine application tables have RLS enabled. The crop-evidence bucket is private with a 1,500,000-byte limit and MIME allowlist. Security advisors reported one informational notice for the intentionally inaccessible private rate-limit table. Performance advisors reported unused indexes on the newly created empty database; indexes were retained.

## Not yet verified

No live frontend cutover is claimed. End-to-end hosted Auth, SMTP email links, Storage HTTP/signed links, Realtime delivery, real microphone capture and actual Meta/SAM/voice calls still need the staging acceptance steps in DEPLOYMENT.md. Field correctness, local-language transcription, farmer adoption and crop outcomes are unmeasured.

The officer screen compiles, but a full hosted multi-account browser walkthrough remains pending. The browser preview became unavailable when resuming the final visual check; no successful officer browser test is claimed.

CI status must be read from the pull request's actual workflow run. Local success does not guarantee a remote run has completed.
