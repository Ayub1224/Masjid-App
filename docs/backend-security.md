# Backend security and launch status

## Status

Backend implementation and local PostgreSQL/HTTP tests are present. **Not certified production-ready and not connected to hosted Supabase yet.** The published frontend still uses its explicit sample-data adapter. Backend routes fail closed with HTTP 503 when configuration is absent. Do not present the role demo or its records as live operations.

## Architecture

`/api/backend/*` uses a request-scoped Supabase publishable-key client with the caller's JWT. No service-role credential exists in runtime code. PostgreSQL row-level security controls reads; authenticated clients have no direct table write grants. The `mosque_command` RPC validates identity, current membership, permissions, MFA assurance, amounts and state transitions inside a transaction. Cookie browser clients require an exact trusted Origin for every mutation; bearer clients support future mobile integration without ambient cookies. API responses are private/no-store and errors omit database details and input values.

Sessions use secure HttpOnly host-only cookies. The API verifies the identity with Supabase Auth on every authenticated request. Database helpers also check that the signed JWT's session exists, has not expired, and belongs to a confirmed user. Role decisions come from database rows, never user-editable Auth metadata or request fields. MFA AAL2 is required for all privileged reads/actions. A newly accepted admin can obtain their own profile at AAL1 to enroll TOTP. Losing TOTP requires a separately reviewed operator recovery process; there is no role-based bypass.

Invites use 256-bit random tokens, expire in 48 hours, reserve admin seats, and bind to a confirmed email. Only token hashes are stored; the returned link carries the token in a fragment. The super admin alone invites one owner and up to four admins. Public signup creates an Auth user, never a mosque profile; membership requires consuming a valid invite. Configure email confirmation as mandatory. Revoke unused links through `revoke-invite`.

## Financial integrity

Amounts are integer paise. Pending receipts and draft expenses have no ledger effect. All mutations run under a transaction-scoped mosque advisory lock, serializing concurrent seat allocations, approvals, transfers and spend checks. Request UUIDs are idempotent for the same actor and exact payload. Changed payloads with a reused key conflict. The ledger and audit have triggers preventing UPDATE/DELETE; owner corrections append compensating entries. A reversed UPI reference remains reserved. A reviewer cannot approve their own UPI submission. Cash is a trusted admin-recorded receipt. Transfers move funds between cash and bank without increasing total funds. Bank observations store an as-of ledger snapshot without changing funds. Opening balances must be established once by the owner before any other posting. PostgreSQL operators/service-role administrators are outside this application trust boundary and require audited operational access.

Invitations return their raw token only once. Retrying an invitation creation after an uncertain response currently produces a safe conflict because a fresh token has a different fingerprint. Do not keep retrying: inspect outstanding invitations through `GET invitations` and revoke the relevant record through `revoke-invite` before issuing a replacement. Wire this listing/revoke workflow to the admin UI before launch.

## Evidence

Separate private buckets hold evidence and receiving QR files. RLS restricts writes to the current user's UUID folder and permits no client overwrite/delete. Evidence reads require ownership or verification permission; QR reads require active membership and the configured path. Upload routes accept at most 5 MiB, check magic bytes and MIME agreement, and only issue random filenames. Downloads use 60-second signed attachment URLs. These URLs are bearer secrets until expiration; do not put them in analytics/logs. Bucket policies also bound declared MIME and size and include a per-user daily upload guard. Signature checks are not complete image decoding or malware scanning. Before launch add a quarantined decoder/re-encoder/scanner, especially if changing downloads to inline views. Audit any pre-existing Storage policies: permissive policies are OR-combined and must not bypass these rules.

## Protected configuration

Populate `.env.local` locally, or the host's secret manager, from `.env.example`. Never paste secrets in chat or commit them. Runtime requires the project HTTPS URL, publishable key, exact HTTPS APP_ORIGIN and Turnstile secret. No database password is needed in runtime. Set a Turnstile widget for the exact origin; auth endpoints fail closed without CAPTCHA validation. Keep Supabase built-in auth rate limits enabled. Add per-IP ingress limits for login, recovery, confirmation, refresh and upload routes in the production gateway; database command limiting does not replace ingress protection.

Apply `supabase/migrations/*.sql` in order to a fresh staging Supabase project using its protected SQL editor or CLI. They are additive, unapplied local migrations; once applied, do not rewrite them. Test against a clean project and inspect migration history first. Create Ayub's Auth account using protected operator tooling; after email verification, run `supabase/bootstrap-super-admin.sql` once. Ayub must enroll TOTP before inviting the owner/admins. This bootstrap must never become a public API or automatic email-based role assignment.

Supabase settings required: email confirmations on, secure password change/reauthentication on, strong password policy and compromised-password checks where supported, exact redirect allowlist, custom SMTP with SPF/DKIM, TOTP MFA, short access-token lifetime and bounded session lifetime. Configure signup/recovery email templates to hand the token hash to a frontend confirmation form which POSTs `auth/confirm`; never exchange tokens on a GET that mail scanners might follow. Email templates and redirects have not been tested against the hosted project.

## API surface

All routes below are under `/api/backend`:

- `GET public`: published prayer/news data.
- `POST auth/login`, `auth/register`, `auth/recover`: CAPTCHA-gated password/email operations.
- `POST auth/confirm`: consume signup/recovery token hash; returns HttpOnly session cookies.
- `POST auth/refresh`, `auth/logout`, `auth/password`: session rotation, global signout, password update.
- `GET auth/mfa`, `POST auth/mfa/enroll`, `auth/mfa/verify`: TOTP flow.
- `GET me`, `invitations`, `records?table=mosque_payments&page=0`, `finances`: RLS-filtered reads; records are capped at 50 per page.
- `POST command`: validated command body plus a UUID `Idempotency-Key` header. Commands: submit, cash, review, expense, post-expense, reverse, transfer, opening, balance-check, invite, accept-invite, revoke-invite, deactivate, permissions, prayers, notice, toggle-notice, receiving.
- `POST files/upload?bucket=payment-evidence`: raw PNG/JPEG/WebP bytes.
- `POST files/download`: `{bucket,path}`; returns short-lived download URL.

Frontend binding remains a separate integration step: replace the demo adapter, remove demo role switches from live mode, wire CAPTCHA, signup/confirmation/invite acceptance, TOTP setup/challenge, recovery and session refresh with cross-tab coordination. Member/admin data models must use real authenticated UUIDs and server ledger totals; never carry forward demo `m1` identities or hardcoded opening amounts. Until then this backend is exercised through automated tests, not the sample UI.

## Release blockers

1. Rotate all credentials previously disclosed in chat; configure the correct protected project settings.
2. Apply and exercise migrations in hosted staging with real Supabase Auth and Storage. Local PGlite tests run PostgreSQL with minimal Auth/Storage fixtures; they do not certify GoTrue, Storage HTTP behavior, concurrent distributed requests or deployment middleware.
3. Complete live frontend binding, Hindi copy, invitation management, MFA recovery and operator support flows.
4. Validate concurrent approvals and seat allocation with multiple connections, transactional rollback, denial across every role/permission, expired/revoked sessions, email matching and expiry, upload overwrite/cross-user attacks, signed-link expiry and rate limits end to end.
5. Resolve dependency advisories, verify proxy cache isolation and cookies, add production CSP nonces for framework HTML, abuse controls and upload quarantine/scanning.
6. Enable backups, prove restore, define receipt/evidence retention and operator audit access, set alerting/error correlation without PII, run accessibility/device and independent security review before collecting real donations.

Sources used: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [database functions](https://supabase.com/docs/guides/database/functions), [server-side auth](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

Dependency maintenance: patched React/RSC, Vinext, Vite, Vitest and Cloudflare tooling. `miniflare` pins an affected Sharp patch, so a scoped override uses Sharp 0.35.4. Retest and remove that override once the upstream dependency includes the patch. Node 22 LTS/24 LTS or newer supported even-numbered runtime is required by the test runner.

## Local verification result (2026-09-09)

38 automated tests pass (11 demo-domain, 19 PostgreSQL/RLS and adversarial cases, 8 HTTP boundary cases). TypeScript, lint and production build pass on Node 24.19.0. The final dependency installation reports zero known npm audit vulnerabilities. This does not replace live Supabase integration and independent release review.
