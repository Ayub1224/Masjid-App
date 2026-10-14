# Bulk member management

The local PostgreSQL backend supports batches of 1–100 members at **Admin → Members → Add bulk members**. Enter rows or paste tab-separated spreadsheet columns in the order **phone, name, address, PIN** (no header). The PIN column is optional and defaults to `0000`. Review the batch before saving. No emails or messages are sent automatically.

Every new account is a member, requires a unique Indian phone number, and must change its temporary PIN on first login. Members can subsequently change their PIN from Profile by proving their current PIN. PIN changes rotate sessions. Shared default PINs remain guessable until changed; administrators can set a distinct temporary PIN per row and should hand it to the intended member personally. This flow does not verify ownership of the phone number.

Owner access requires MFA and the members permission. Administrators require the members permission. All rows commit together or none do. Duplicate phones, pending invitations and invalid rows reject the batch. Idempotency keys make unchanged retries safe; PIN hashes and keyed request fingerprints are stored, not plaintext PINs.

Individual edits use the existing member editor. Select active members in the table and choose **Remove selected** to deactivate up to 100 at a time. Confirmation is required. Sessions are revoked; member profiles, contributions and audit records are retained. Reactivation remains an individual action.

## API and verification

- `POST /api/backend/members/bulk-add` — `{ members: [{ phone, name, address, pin }] }`
- `POST /api/backend/members/bulk-remove` — `{ ids: [uuid] }`
- `POST /api/backend/auth/change-pin` — `{ currentPin, pin }`

Both bulk endpoints require a UUID `Idempotency-Key` header. See `public/openapi.json` or `/api-docs` for schemas. Bulk APIs enforce server-side permissions. Accounts using temporary credentials can access only their own session identity, PIN change and logout. Database read policies independently enforce the restriction.

Run `npm run local:start` to apply the local migration, then `docker compose exec -T app node --import tsx local/verify-bulk-members.ts`. The integration script creates and drops its own test database; it never creates or removes real members. Standard checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Hosting boundary

These endpoints use the project's local Node/PostgreSQL authentication server. They are not implemented by the separate Supabase/Cloudflare route in `app/api/backend/[...path]/route.ts`. The existing Sites URL remains the original frontend preview. A frontend-only publication will not enable bulk member creation there. Deploying the Node backend securely, or porting this flow to Supabase with equivalent account creation, PIN enforcement and permissions, is required before enabling this feature on that hosted app.
