# Branded account emails

- `verification.html`: paste into Supabase Authentication > Email Templates > Confirm signup when template editing is available.
- `password-reset.html`: paste into Reset password.
- `.txt` companions: plain-text fallback copy for an SMTP/template delivery system supporting multipart messages. The app does not automatically install these files or configure multipart delivery.

Both HTML templates use `{{ .ConfirmationURL }}`, preserving Supabase's own single-use/expiry behavior and the app's PKCE redirect. Set Site URL and redirect allowlist first. PKCE links must open in the browser that requested them. Keep click tracking and link rewriting disabled when they consume or alter verification links.

No external image, font or analytics request is included. Verify the sender/domain through your SMTP provider and test delivery in Gmail and Outlook. New free projects using default SMTP may not support template edits; custom SMTP is required for that setup.
