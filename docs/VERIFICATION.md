# Supabase migration verification

Implementation date: 2026-10-27.

## Local checks

- Production frontend compilation.
- 16 automated tests: 2 evidence tests, 9 database scenarios, 5 Netlify/Meta adapter tests.
- The SQL migration is executed in PGlite, an embedded PostgreSQL runtime, against test-only Auth/Storage contracts.
- Database scenarios cover role-metadata injection, direct-write denial, report isolation, idempotency, MFA, assignment, version conflicts, transactional messages, private Storage access, service-only AI persistence and revoked sessions.
- Function tests verify origin/token checks, authorization before paid requests, server-only persistence credentials, failure handling, WAV and SAM parsing. Meta calls are mocked.

## Still requiring a connected project

Tests do not prove hosted Supabase Auth, Storage HTTP, SMTP, signed URL behavior or Realtime delivery. Apply the migration to staging, configure email templates, and run the acceptance steps in DEPLOYMENT.md. Real microphone capture, live Meta calls, SAM access, load testing, backups and recovery also need deployment verification.

The earlier MERN CI results do not validate this migration. This branch has its own workflow and test suite. No hosted Supabase migration or live cutover is claimed until those actions are completed and verified.
