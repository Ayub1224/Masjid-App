# Backend setup and verification

The application defaults to the live API. It does not silently fall back to demo members, donations or balances. The optional `MOSQUE_DEMO_MODE=true` preview is ignored in production.

## Local configuration

Use Node 24 LTS. Copy `.env.example` to your ignored local environment file. For the Cloudflare Worker development runtime, configure secrets in an ignored `.dev.vars` file (or protected runtime bindings); never put secret values in `VITE_` / `NEXT_PUBLIC_` variables. Configure the same values through protected hosting settings for deployment.

- `SUPABASE_URL`: the project's HTTPS URL.
- `SUPABASE_PUBLISHABLE_KEY`: current `sb_publishable_…` key. A database password or service-role key is not used by the running app.
- `APP_ORIGIN`: the exact HTTPS application origin, without a trailing slash. Use an HTTPS development proxy for authenticated local testing. The existing HTTP localhost preview can display the UI but is not a configured authenticated production environment.
- `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`: register the actual hostname in Cloudflare Turnstile.
- `PIN_PEPPER`, `LOGIN_GATE_SECRET`, `INVITATION_SECRET`: independent cryptographically random secrets of at least 64 characters. Generate locally with `openssl rand -hex 32`. Do not paste them into chat or commit them. Back them up securely; changing the PIN pepper invalidates existing PIN credentials. Invitation key rotation affects retries of old invite requests.

Configure all nine migrations in filename order using the Supabase CLI or protected SQL editor. Migration 006 also replaces the legacy command implementation, so upgrades receive the news-column ambiguity fix. Back up an existing production database first.

Register the login gate hash through the protected SQL editor. Compute the SHA-256 digest of `LOGIN_GATE_SECRET` locally and insert only its hexadecimal digest:

```sql
insert into mosque_private.login_config(singleton, secret_hash)
values (true, decode('REPLACE_WITH_64_CHARACTER_SHA256_HEX_DIGEST', 'hex'))
on conflict(singleton) do update set secret_hash=excluded.secret_hash;
```

Enable email confirmation, custom SMTP, secure password changes/reauthentication, Supabase Auth rate limits, and TOTP MFA. Do not disable email verification to bypass onboarding. Keep `mosque_private` out of the exposed PostgREST schemas. Confirm the private storage buckets and policies from the migrations.

Set email templates to send token hashes back to the application, not browser-local access tokens:

- Signup: `{{ .SiteURL }}/invite?token_hash={{ .TokenHash }}&type=signup`
- Recovery: `{{ .SiteURL }}/forgot-password?token_hash={{ .TokenHash }}&type=recovery`

The user confirms their email, then returns to the original invitation link. Invitation fragments are not stored in server access logs. A PIN account is still backed by Supabase Auth: the server derives a strong credential from email + PIN + a secret pepper. The gateway applies five attempts per canonical email per 15 minutes, shared with phone aliases, plus Turnstile and Supabase limits. Phone matching requires the full country code and exactly one active profile; it is an alias, not proof of ownership. Ambiguous phone numbers cannot sign in.

Bootstrap Ayub's email-confirmed Auth user through the protected Supabase dashboard, then run `supabase/bootstrap-super-admin.sql` once. Use the app's email recovery flow to set the initial PIN. Enroll TOTP before inviting the owner and four administrators. The owner can set opening bank/cash balances before the first ledger transaction. Administrators publish the actual mosque timetable and configure receiving details; no sample timetable is automatically posted.

## API reference

- Swagger-compatible OpenAPI 3.1 JSON: `public/openapi.json`, served at `/openapi.json`.
- Browse the endpoints at `/api-docs`.
- Regenerate after contract changes: `npm run api:spec`.
- Writes use `POST /api/backend/command` with a UUID `Idempotency-Key` and a `type` discriminator. Money is integer INR paise. Reuse the identical body and key after an uncertain result.
- Financial deletes are intentionally unavailable: posted entries use owner-authorized reversals; drafts can be edited/deleted. Member deletion is deactivation, preserving history. Bulk review is atomic, with up to 25 pending IDs.

## Page-to-API map

| Pages | Operations |
|---|---|
| Public home | `public` timetable and published news |
| Login, invite, recovery | `auth/*`, `accept-invite` command, Turnstile |
| Member home, profile | `me`, own RLS profile, `auth/logout` |
| Contribute, submission | receiving records, private QR URL, evidence upload, `submit` |
| Contributions | own RLS payment records, receipt download |
| Finances | ledger aggregates and posted expense categories |
| Admin overview | permitted records and `activity` |
| Members, super-admin | invitation list/create/revoke/accept, edit, deactivate/reactivate, grants |
| Payments | records, evidence URL, review, bulk-review, reversal, CSV |
| Cash | member selection and `cash` command |
| Expenses | create, draft update/delete, post, reverse |
| Balance | opening, observation, cash-to-bank transfer |
| Prayer editor | immediate timetable update |
| News | create, edit, publish/unpublish, delete, optional HTTPS image URL |
| Receiving | private QR upload and settings update |

## Verification boundary

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. Database tests apply the real migrations to isolated PGlite/PostgreSQL, including RLS and transactional financial flows. Auth/storage metadata is modeled locally; these tests do not prove a live GoTrue, SMTP, Turnstile, or Storage service works. Client integration tests use mocked HTTP and check wire contracts, identity isolation, and retry keys.

Before launch, run a staging flow with configured services: invite → receive email → confirm → set PIN → accept invite → sign in using email and phone → enroll/verify admin MFA → upload QR → member payment/evidence → another admin review → bulk conflict rollback → cash → draft expense → post/reverse → reconciliation → logout/revoked session. Test two members for cross-account isolation. Verify emailed recovery and expired invitation handling, private signed-file expiry, and admin permissions after revocation. Test on the actual mobile browsers used by members.

Live testing and deployment are pending until protected settings, migrations, and the initial account are configured. Do not describe this as production-certified solely because local tests pass.
