# Mosque-app

Minimal, responsive frontend for Gausul wara masjid in Durg. Built with React, TypeScript, Vinext (Next.js-compatible routing), TanStack Query, TanStack Table, shadcn/ui and Tailwind CSS v4.

## Run

For the complete local app, run `node scripts/local-setup.mjs`, then `docker compose up --build -d`. Open http://localhost:3000 and activate your administrator account through the local inbox at http://localhost:8025. No cloud credentials are needed. See [local development](docs/local-development.md) for persistence and restart instructions. Docker supplies Node 24.

## Themes

`config/themes.ts` is the single color configuration. Add a complete palette to `themes`; the theme selector automatically includes it. Colors flow through semantic CSS variables into Tailwind and shadcn. Forest, Ocean and Plum are included. Preferences are stored locally; they are not authentication credentials. `app/globals.css` maps tokens and configures typography, radii and global styles.

## Frontend scope

Use the clearly labelled demo role selector for Guest, Member, Admin, Owner and Super admin journeys. Tables support search, sorting and pagination. Most secondary information stays collapsed. Member-facing language controls support English/Hindi; administrative copy still needs complete Hindi translation.

The Docker setup uses persistent PostgreSQL records, local authentication, private uploads and a local mail inbox. The explicit demo adapter (`lib/data/repository.ts`) remains available only in the older preview path; it is not used by Docker.

The model distinguishes pending donations from verified receipts, bank from cash, drafts from paid expenses, and bank observations from ledger totals. Corrections preserve originals in the demo audit history. Production needs transactional append-only reversals, immutable audit records and reconciliation against historical balances. The current balance-check form explicitly compares against the current demo register. Prayer times are samples; Hijri date remains unconfirmed until configured. Prayer changes apply immediately in the demo.

## Historical hosted backend

The optional Supabase implementation is retained for reference. Docker uses `local/server.ts` with standard PostgreSQL and does not call that service. Deployment planning is deferred; this stack binds only to the local machine.

## Validation

Domain tests cover 11 cases including exact paise parsing, duplicate approvals, excluded pending/draft amounts, transfer conservation, reversal permissions, seat limits and theme completeness. Lint covers application code; generated shadcn primitives and its use-mobile hook are excluded without modifying the vendor components. Local build passes; broad browser/visual testing has not been performed.

## Backend implementation

The active local backend lives in `local/`. It reuses the SQL business rules in `supabase/migrations` on standard PostgreSQL. The optional historical hosted implementation remains in `app/api/backend` and `lib/server`. Older notes in `docs/backend-security.md` describe that hosted path; see `docs/local-development.md` for the current Docker runtime.
# Local Docker setup

Run `node scripts/local-setup.mjs`, then `docker compose up --build -d`.
Open http://localhost:3000 and the activation email in http://localhost:8025.
All services and data run locally; cloud keys are unnecessary.
See [local setup and persistence](docs/local-development.md).
The historical hosted-backend notes above describe the optional Supabase path.
