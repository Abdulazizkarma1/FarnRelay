# Farmer onboarding release

## Audit and implementation phases

The audited base used React 19, Vite, JavaScript, paired vanilla CSS files, hash routing, Supabase Auth/Postgres/Storage/Realtime and Netlify Functions. Signup success remained above the same form, with no waiting page, cooldown, pending state, field errors or focus handling. The landing page had small text, indirect copy and a large embedded photograph. Existing role/RLS and MFA boundaries were retained.

### Phase 1: account flow

- `/signup`, `/verify-email`, `/login`, `/forgot-password` and `/auth/verified` work as public routes. Existing hash links and token-hash reset links remain compatible.
- AuthScreen validates on blur and submit, with password-only live guidance. Invalid fields have linked errors. Submitting disables the button and locks concurrent calls. A focused summary stays with the form. Success clears the password and opens a separate waiting page.
- VerifyEmail stores only pending email, requested role and resend timing in sessionStorage. It has a 60-second cooldown and three resend attempts per 15-minute browser window. A server IP quota supplements this UX limit. Same-origin Auth events, visibility and focus checks detect verification when a session becomes available.
- Standard PKCE callbacks require the requesting browser. Custom token-hash templates can support a different browser. No implicit access-token URL handling is enabled.
- Requested Extension Officer access is descriptive metadata only. Public registration still creates a farmer. A verified administrator must approve the actual role. The admin editor displays the request.
- Unverified sessions cannot open the workspace. Database verification/RLS checks remain authoritative. Signup, login, resend and recovery requests pass through server validation and time-bounded requests. Supabase still manages tokens and refresh sessions in browser storage; this is not an app-managed cookie system.

### Phase 2: visual system

- Green scale anchored at #163d2b, readable neutrals/semantic colours, spacing/radius/shadow/type tokens.
- Reusable Button, Input, PasswordInput, Select, Checkbox, Alert, Toast, Card, native dialog Modal, Spinner, Skeleton and EmptyState in Primitives.
- A task-led landing hero, one main account CTA, three plain steps, human-review/privacy signals and a clear footer.
- Photos converted to WebP. Mobile landscape image: approximately 14 KB, compared with the previous 368 KB SVG container. The full landscape is approximately 53 KB.
- One font family, three weights. Auth and reporting walkthrough routes load only when needed. Vendor chunks can be cached separately. No production dependency was added for styling.

### Phase 3: quality

- English interface copy is centralised in `src/i18n/en.js`, including migrated legacy screens. User-generated content and backend enum identifiers are not translated. Add label mappings for enum values when adding a locale; never translate values sent to the database.
- Visible focus, large controls, skip link, route heading focus, live status messages, reduced motion, linked field errors, accessible native dialog and a 404 page.
- Node regression tests for validation, request IDs, pending state, throttles, gateway validation, PKCE forwarding and database permissions. Browser tests use synthetic network fixtures and never send email or create real accounts.
- Mobile CI checks use axe with WCAG AA tags and a production-bundle Lighthouse audit. Thresholds are performance 90, accessibility 95 and SEO 90. Only actual reports establish whether these targets passed; automated checks do not certify WCAG compliance or field-device performance.

## Files and commands

Core flow: `src/components/AuthScreen.jsx`, `VerifyEmail.jsx`, `AuthCallback.jsx`, `AuthLayout.jsx`; each has paired CSS. State/validation: `src/auth-state.js`, `auth-errors.js`, `auth-fetch.js`, `shared/auth-validation.js`. Server: `netlify/functions/auth.js`. Copy/tokens: `src/i18n/en.js`, `src/main.css`. Email templates: `docs/email/`.

```sh
npm ci
npm run lint
npm test
npm run build
npm audit --audit-level=high
npm run test:e2e
npm run audit:mobile
```

Node 22.19 or later is required for the current audit tooling. Browser checks need Playwright Chromium installed. GitHub Actions installs it and runs against synthetic credentials, not the production project. The Lighthouse script needs an existing production build and starts its own short-lived preview. Error reporting to Lighthouse/Sentry is disabled.

## Deployment requirements

1. The onboarding migration adds a service-only quota RPC and a descriptive requestedRole field in the existing user DTO. It does not grant staff access. It has been applied to the connected FarmRelay project. Match the repository migration filename to the hosted migration history; do not reapply it.
2. Netlify Functions need `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and exact `APP_ORIGIN`. The browser needs VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY at build time. Meta variables remain separate. Never prefix secret keys with `VITE_`.
3. For the gateway, prefer a modern `sb_secret_` key. In Supabase Authentication > Rate Limits, enable IP Address Forwarding. Only Netlify Context.ip is forwarded, never a client-supplied header. Legacy service_role keys cannot enable Supabase's forwarded-IP behavior. Without forwarding, provider limits may group multiple users behind a function egress IP.
4. Set Supabase Site URL to https://farmrelay.netlify.app and allow https://farmrelay.netlify.app/ plus https://farmrelay.netlify.app/**. Keep localhost in a separate development project. Set the equivalent exact origins for staging.
5. Enable email confirmation, set the provider password minimum to 15, and enable leaked-password protection where supported by the chosen plan. The hosted advisor currently reports leaked-password protection disabled. The local common-password examples are not a breached-password database. Public Supabase endpoints remain accessible with the publishable key, so provider-side password policy, rate limits and bot protection must also be configured.
6. Configure a verified SMTP sender, delivery quotas and monitoring. Install the branded HTML templates if custom template editing is available. Plain-text companions are supplied for a provider supporting multipart messages; supplying a text file does not automatically configure Supabase multipart delivery.
7. Confirm operator contact details and retention/deletion policy in the terms/data notice before broad public use. Do not claim response-time guarantees or validated diagnosis.
8. Deploy the branch, then request fresh emails. Complete real signup, verification, resend, login, MFA recovery, password reset, logout, suspension, report upload and Meta-call acceptance checks. Do not reuse an old localhost link.

## Boundaries

No real email delivery, inbox click, production account registration, Meta inference or field trial is established by synthetic tests. Sessions remain in Supabase browser storage, protected by RLS/session checks and CSP, not httpOnly app cookies. Device drafts are account-filtered but not encrypted. Server validation and quotas supplement Supabase Auth; they do not turn a public client API key into a secret.

Development-only packages add linting, browser tests, axe and Lighthouse. They are not imported by the farmer-facing bundle. Dependency audit findings must distinguish runtime dependencies from development tooling; no blanket zero-vulnerability claim is made.

## Quality notes recorded during implementation

- Source-level contrast tests cover the primary, muted, error and info text pairs at 4.5:1 or better. Browser axe tests cover more DOM-level rules. Manual keyboard, screen-reader and field-device checks remain necessary.
- A real browser walkthrough against an isolated synthetic network verified the new screen transition and found a missing `crypto.randomUUID` fallback. The fallback uses secure random bytes, and Realtime startup failure no longer crashes the shell.
- Authentication requests, passwords and verification codes are not logged. The pending-email record never contains a password. A timeout does not automatically retry a signup and risk generating duplicate emails.
- Browser tests do not establish SMTP delivery, role approval operations or real Meta model access. Record hosted acceptance separately.

The final isolated browser walkthrough passed signup, the actual resend cooldown, resend success feedback, explicit verification success, clean dashboard loading and logout. The temporary browser fixture entry was removed before commit.
