# Deploy FarmRelay

## 1. Provision the backend

Create a Railway service from this repository and select the migration branch for staging. Keep the project root as the build context. The repository Dockerfile builds the React assets and installs the API production dependencies. `railway.json` configures `/api/health` as the health check. The process listens on Railway's `PORT` and `0.0.0.0`.

Provision MongoDB with durable storage, authenticated credentials, backups and monitoring. Use a private Railway connection where available, or a managed MongoDB service with a restricted network policy. Do not expose an unauthenticated MongoDB port.

Set Railway variables:

| Variable           | Value                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------- |
| `NODE_ENV`         | `production`                                                                                        |
| `MONGODB_URI`      | Authenticated MongoDB connection URI                                                                |
| `APP_ORIGIN`       | Exact public frontend origin, such as `https://farmrelay.netlify.app`, without trailing slash       |
| `APP_SECRET`       | Random secret of at least 32 characters; generate with a password manager or `openssl rand -hex 32` |
| `SMTP_URL`         | Authenticated SMTP URL from the mail provider; percent-encode credentials                           |
| `MAIL_FROM`        | Verified sender, such as `FarmRelay <support@your-domain.example>`                                  |
| `MODEL_API_KEY`    | Meta credential, backend only                                                                       |
| `META_MODEL`       | `muse-spark-1.3`, or an explicitly tested compatible model                                          |
| `TRUST_PROXY_HOPS` | Set for the verified proxy path; see below                                                          |
| `SERVE_WEB`        | `false` when using Netlify, `true` for one-origin Railway hosting                                   |

Never put model, database or SMTP credentials in `VITE_*` variables. Production startup rejects missing mail configuration and non-HTTPS `APP_ORIGIN`. Meta can be unconfigured while the core reporting workflow remains available.

### Proxy trust

Rate limiting uses `req.ip`. Railway and Netlify may each add proxy hops. Inspect the deployed ingress chain in staging and configure only the trusted path length. Do not blindly increase `TRUST_PROXY_HOPS`: trusting attacker-supplied forwarding headers can defeat IP limits. Account and authenticated user limits are also enforced in MongoDB. If a single numeric hop count cannot safely represent all ingress paths, add a provider-specific trusted proxy policy before public launch.

## 2. Connect the Netlify frontend

Set Netlify build variable `API_PROXY_TARGET` to the HTTPS Railway public origin, without a path. The build script generates a forced `/api/*` proxy before the SPA fallback. Configure `APP_ORIGIN` on Railway to the exact Netlify public origin. Keep frontend calls relative to `/api`; do not change them to cross-site fetches.

Netlify build: `npm ci && npm run build`. Publish: `dist`. Node: 22. A Netlify build deliberately fails when `API_PROXY_TARGET` is missing. Deploy previews need their own staging API/origin configuration; the production API does not accept arbitrary preview origins.

Sessions use host-only HttpOnly Secure SameSite=Lax cookies through the public frontend origin. Verify login, cookie forwarding, Origin forwarding, CSRF and logout through the actual Netlify proxy before launch. A successful `/api/health` alone is insufficient.

Alternatively, use Railway for the frontend too: set `SERVE_WEB=true` and `APP_ORIGIN` to the Railway/custom domain origin. The Docker image already contains the frontend build.

## 3. Bootstrap the first administrator

Run in a secure environment with access to the production database:

```sh
npm run bootstrap --prefix server
```

Provide `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME`, and `BOOTSTRAP_ADMIN_PASSWORD` through your secret environment. The password must contain at least 12 characters. The script refuses to run when an administrator already exists. It creates a verified admin and an audit entry. Remove bootstrap variables immediately after use.

Sign in, open Account & security, enable an authenticator, and store the eight recovery codes privately. People & access and assignment require MFA enrollment. Have officers register and verify their email, then promote the appropriate accounts. Do not share an administrator login.

## 4. Verify staging before cutover

1. Run CI successfully, including Mongo-backed tests. Use a separate staging database.
2. Create two farmers, two officers and one administrator. Verify that each farmer sees only their own reports and that officers see only assigned cases, including attachment URLs and conversations.
3. Submit a real photo and short recording from supported Android and iOS browsers. Check playback, denied microphone permission, failed upload, local draft recovery and retry idempotency.
4. Test verification, reset, MFA, recovery-code reuse rejection, logout-all and immediate session revocation after suspension.
5. Assign a case, reply, change status and test two simultaneous reviewers receiving a conflict instead of overwriting changes.
6. Run paid Meta calls with the deployed key. Confirm actual model access, errors and billing. Verify English transcription against the original recording. SAM access was previously unresolved; do not claim it works until a successful live call.
7. Confirm headers, proxy behavior, TLS, health checks, graceful restart, backups and a restore into a separate database. Establish uptime/error alerts and budget alerts.
8. Load-test against expected concurrent usage. The current service uses synchronous model calls with a 45-second upstream timeout, not a background job queue.

## 5. Migration and rollback

Keep the existing main branch and live prototype intact until staging passes. The previous Netlify Blobs data uses receipt-based access and cannot safely be assigned by matching names. Export and retain a backup, establish verified ownership, and explicitly migrate with an approved mapping if historical records are needed. There is no automatic import in this release.

Switch Netlify to the migration commit only after API configuration and staging checks pass. For rollback, restore the previous frontend commit and its previous Netlify environment. Preserve the new MongoDB database and backups for investigation. Do not delete records to roll back code.

## Maintenance

Configure MongoDB backup retention and test restoration regularly. Monitor database size because photos and audio are stored in report documents with strict size limits. Define a retention and deletion policy before collecting real farmer data. Export/delete workflows require an operator procedure in this release. Reconcile and reassign cases if an officer is suspended. Renew sender/domain settings, rotate credentials carefully, and run dependency updates with the test suite.
