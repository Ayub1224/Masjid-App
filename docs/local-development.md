# Run everything locally

Requirements: Docker Desktop running. No Supabase account, cloud API key, CAPTCHA service, or external email provider is needed. Docker downloads dependencies on the first build; runtime services and records stay on this machine.

From the repository directory:

```sh
node scripts/local-setup.mjs
docker compose up --build -d
```

Open http://localhost:3000. The initial super administrator is aaayyub30@gmail.com, phone +91 7415216315. This machine has a seeded password hash in ignored Docker settings; use the password supplied during setup. Source code contains no plaintext password. On fresh installations without that hash, activate through the local inbox at http://localhost:8025. Messages are captured locally and are not sent to Gmail.

Login starts with email or phone, then shows the required credential. Super administrators and the owner use a password (12–128 characters) and MFA. Admins use six-digit PINs; members use four-digit PINs. Local ten-digit Indian phone numbers and +91 numbers are supported. The login lookup reveals only the credential format and is rate limited. PIN failures share a database counter across email and phone aliases. Recovery links are captured in the local inbox.

Only the super administrator can invite/manage the single owner. The super administrator and owner can invite/manage up to four admins, including their permissions. Admins can invite members only with the members permission. Admins do not require MFA. Owner/super-admin privileged operations require MFA in the database as well as the UI. Admin operations are limited to their granted permissions. No sample members, admins, financial entries or timetable are seeded.

The database starts with an administrator and empty business records. Set the mosque timetable, receiving QR, and opening balances through the app. Invitations, confirmations and recovery all use the local inbox. The CAPTCHA dependency is replaced by local database-backed attempt limits. Session cookies are HttpOnly and SameSite=Strict. The HTTP configuration is restricted to localhost. This development stack is not a public deployment configuration.

```sh
docker compose logs --tail=60 app  # startup diagnostics
docker compose stop              # stop, preserving data
docker compose up -d             # resume
docker compose up --build -d     # rebuild after source changes
```

PostgreSQL, uploaded files, and mail use separate persistent Docker volumes. Do not run `docker compose down -v` unless you intend to erase local data. `.env.docker` contains generated local secrets and is ignored by Git and the Docker build context. Preserve it with your local backups; the setup script never replaces an existing file. `.env.local` and any hosted credentials are not copied into the image.

The app container runs Node 24, a local Node API, and Vite on port 3000. The API uses PostgreSQL transactions with the existing `anon` and `authenticated` database roles for record access and commands. The `auth` and `storage` SQL schemas are local compatibility schemas, not Supabase services. The historical SQL migrations are reused from `supabase/migrations` to retain the audited financial rules. The original hosted API files are not used in this Docker path.

Only app port 3000 and inbox port 8025 are published, both on 127.0.0.1. PostgreSQL is accessible only inside the Docker network. Uploaded images are private files in the Docker volume, served after session and database policy checks. Host disk encryption and backups remain the machine owner's responsibility.

## Administrator invitations

Choose the role before entering contact details. Owner invitations require email, Indian mobile number and address; admin invitations require Indian mobile number and address, with email optional. Mobile numbers must start with 6–9 and contain ten national digits; +91 is accepted and stored canonically. Field validation is shared with the local backend.

Owners start with every listed permission enabled; the super administrator can turn each permission on or off. Admin payment permissions (record contributions, verify payments, expenses, receiving details) are always off and cannot be granted through the API or database command. Existing owners retain their permissions on migration. Admin financial access is denied even if older records contain those grants.

For admins without email, share the private invitation link directly. The recipient enters the invited mobile number and creates a six-digit PIN; accepting the single-use link activates their account. This proves possession of the invitation, not ownership of the phone through SMS. No placeholder email or outgoing SMS is generated. Email-based recovery requires an email address; phone-only account recovery still needs an operator workflow before public deployment.

## Invitation and expense regression checks

Invitation links open a personalized greeting and role-specific password/PIN setup. The server validates and consumes the invitation atomically with account activation and membership creation. There is no second email-confirmation screen or manual token field. Administrators and owners still complete MFA before managing records. Legacy signup confirmation links also finish the pending invitation automatically. Revoked, expired and used links give distinct messages.

Expenses show the selected account’s current recorded balance. Drafts do not affect the ledger. Paid expenses and posting a draft require sufficient funds in that account; the server checks this transactionally. Insufficient funds highlight the amount field, and failed posting reports the actual cause. Record genuine opening funds/receipts before posting expenses; do not invent balances to bypass this check. Posted expenses preserve history through reversals.

Run `docker exec mosque-local-app-1 node --import tsx local/verify-journeys.ts` for isolated invitation, people CRUD and expense API checks. Run `docker exec mosque-local-app-1 node --import tsx local/verify.ts` for authentication, MFA, RLS and payment checks. Both create and remove disposable databases. Use the named main container when a separate browser QA container is running.
