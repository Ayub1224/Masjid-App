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
