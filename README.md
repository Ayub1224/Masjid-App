# Mosque-app

Minimal, responsive frontend for Gausul wara masjid in Durg. Built with React, TypeScript, Vinext (Next.js-compatible routing), TanStack Query, TanStack Table, shadcn/ui and Tailwind CSS v4.

## Run

Use Node 22 or later. Run `npm install`, then `npm run dev`. Validation: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

## Themes

`config/themes.ts` is the single color configuration. Add a complete palette to `themes`; the theme selector automatically includes it. Colors flow through semantic CSS variables into Tailwind and shadcn. Forest, Ocean and Plum are included. Preferences are stored locally; they are not authentication credentials. `app/globals.css` maps tokens and configures typography, radii and global styles.

## Frontend scope

Use the clearly labelled demo role selector for Guest, Member, Admin, Owner and Super admin journeys. Tables support search, sorting and pagination. Most secondary information stays collapsed. Member-facing language controls support English/Hindi; administrative copy still needs complete Hindi translation.

All data is sample data in an in-memory adapter (`lib/data/repository.ts`) consumed by TanStack Query. Refresh resets records. Screenshots stay in browser memory and are never uploaded. No real payments, email delivery, authentication, signed invitations or database connection are implemented. Never enter actual payment details into this demo. Demo permissions demonstrate UI behavior and are not a security boundary.

The model distinguishes pending donations from verified receipts, bank from cash, drafts from paid expenses, and bank observations from ledger totals. Corrections preserve originals in the demo audit history. Production needs transactional append-only reversals, immutable audit records and reconciliation against historical balances. The current balance-check form explicitly compares against the current demo register. Prayer times are samples; Hijri date remains unconfirmed until configured. Prayer changes apply immediately in the demo.

## Backend next

Integrate Supabase Auth email verification, expiring single-use invitations, server-enforced role permissions and row-level security; private evidence storage; transactional donation verification and ledger entries; timezone-aware prayer publishing and locally confirmed Hijri dates. Complete Hindi copy and accessibility/device acceptance testing before release. Rotate any credential previously shared in chat and supply new secrets only through protected environment configuration.

## Validation

Domain tests cover 11 cases including exact paise parsing, duplicate approvals, excluded pending/draft amounts, transfer conservation, reversal permissions, seat limits and theme completeness. Lint covers application code; generated shadcn primitives and its use-mobile hook are excluded without modifying the vendor components. Local build passes; broad browser/visual testing has not been performed.

## Backend implementation

The Supabase backend lives in `app/api/backend`, `lib/server` and `supabase/migrations`. See [backend security and launch status](docs/backend-security.md) for API usage, threat boundaries, secure configuration, migration/bootstrap steps, verification limits and outstanding release blockers. The frontend still uses its isolated demo adapter; the new backend is not yet deployed or connected to it. Do not use the demo as a live donation register.
