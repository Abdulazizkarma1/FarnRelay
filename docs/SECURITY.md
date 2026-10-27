# Security and operating boundaries

Implemented controls include salted scrypt passwords, hashed random session tokens, absolute eight-hour and 30-minute inactivity limits, HttpOnly cookies, exact write-origin checks, per-session CSRF tokens, Mongo-backed rate limits, strict input allowlists, resource ownership checks and private media routes. Password resets and access changes revoke existing sessions. Email action tokens expire and are consumed once.

Authenticator secrets use AES-256-GCM with `APP_SECRET`; recovery codes are hashed and consumed once. Keep this secret stable and backed up securely. Replacing it without a planned migration makes stored authenticator secrets unreadable. There is no public MFA-disable endpoint. A lost authenticator uses a saved recovery code. Loss of both requires an operator identity-verification and audited recovery procedure, which must be established before launch.

MFA enrollment is required for administrator access-management and assignment operations. Other authenticated administrator report views are available before enrollment. Do not describe this as a universal administrator MFA gate.

Logs omit request bodies, authorization headers and cookies. Reset links use URL fragments. There is no third-party analytics script. Browser rendering uses React text escaping; no model-generated HTML is inserted.

Local drafts are account-filtered, not encrypted. Anyone with access to the browser profile or developer tools may read local data. Submitted reports remain on the server when local drafts are deleted. Use trusted devices for sensitive recordings and define your privacy notice, retention, data export, deletion and incident response processes before real-world launch.

Media checks validate allowed MIME types, file signatures and sizes, not full image decoding, malware scanning or agronomic image quality. FarmRelay is a triage and communication tool, not a validated diagnostic service. Local-language automatic transcription and scientific accuracy claims require separate evaluation.

This release is not a security audit, penetration test, legal compliance certification or uptime guarantee. CI tests, staging verification, monitoring, backups and operational ownership are required for production readiness. Report suspected vulnerabilities privately to the repository owner; never include credentials or farmer recordings in public issues.
