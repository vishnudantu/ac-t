# ACA TicketOps

Internal ticket operations platform for the Andhra Cricket Association. It manages the full
lifecycle of a ticket request: request intake → multi-level approval → inventory allocation →
ticket issuance → reconciliation, with role-based access control and a complete audit trail.

> **Production status:** the application builds, authenticates, and runs against PostgreSQL.
> External integrations (SMTP, SMS, WhatsApp, object storage, MFA enrollment) are **not yet
> connected**. See [Production readiness](#production-readiness) before going live.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15.5 (App Router), React 18, TypeScript (strict) |
| UI | Tailwind CSS, shadcn/ui-style components on Radix primitives |
| Database | PostgreSQL 16 with Prisma ORM 5.22 |
| Auth | JWT session cookie (jose, HS256) + database-backed, revocable session tokens; bcrypt password hashing |
| Validation | Zod 4 at every API boundary |
| Spreadsheets | ExcelJS 4.4 (manifest import, Excel export) |
| Testing | Jest + ts-jest (unit, validation, auth, lifecycle); Playwright available |
| Deployment | Multi-stage Docker, Docker Compose, one-command script |

## Quick start (local)

Prerequisites: Node.js 20+, Docker Desktop.

```bash
npm install
# 1. Start an isolated PostgreSQL for local work
docker compose up -d postgres
# 2. Create the local database, role, schema and seed data
#    (writes generated credentials to git-ignored .env.demo)
node scripts/demo-db.cjs
# 3. Build and start
npm run build
node scripts/start-demo.cjs
```

Open <http://localhost:3000> and sign in with the administrator account printed in `.env.demo`
(`office@andhracricket.com`). Change that password immediately in any shared environment.

### Everyday development

```bash
npm run dev          # development server
npm run type-check   # tsc --noEmit
npm test             # Jest suites
npm run lint         # ESLint
npm run build        # production build
```

## Architecture

```
Browser (React Server/Client Components)
   │
   ├── middleware.ts ── verifies the session cookie for protected pages
   │
   ├── Pages: dashboard, matches, requests, requesters, approvals,
   │          allocations, distribution, inventory, quotas, reports,
   │          audit, notifications, admin/*
   │
   └── API routes (/api/**)
         │  withApiHandler → getSession() → hasPermission()
         │  Zod validation → Prisma transaction → audit event
         ▼
      PostgreSQL (Prisma schema, 40+ models)
```

### Authentication and authorization

- Login verifies bcrypt hash, rejects inactive accounts, and refuses MFA-enabled accounts until
  an MFA challenge exists.
- A random session ID is signed into a short JWT; only its SHA-256 hash is stored in
  `SessionToken`. Logout deletes the stored token, so copied cookies stop working.
- `getSession()` reloads the user, active GLOBAL roles, and permissions from the database on
  **every** request — deactivation or role revocation takes effect immediately.
- `JWT_SECRET` is mandatory (32+ chars). There is no production fallback secret.
- Login is rate-limited per IP+email. The limiter is process-local; a shared limiter is required
  for multi-replica production.

### Request lifecycle

1. **Request** created as `DRAFT` or `SUBMITTED`. Submitting selects the match's active approval
   workflow, creates its steps, and activates the first step.
2. **Approval** steps are strictly sequential. Decisions are transactional and guarded against
   concurrent edits; full/partial approval, rejection, and return-for-clarification are supported.
3. **Allocation** reserves approved stock against inventory pools and quota pools. It is created
   as `DRAFT` and must be confirmed by a user with `allocations:confirm`.
4. **Issuance** is only possible from confirmed allocations. Inventory, request-item, allocation,
   and batch counters are updated under a serializable transaction with conditional writes.
5. **Audit** events are written in the same transaction as each material change.

### Directory layout

```
prisma/            schema.prisma, seed.ts
scripts/           database bootstrap, local start, browser verification
src/app/           pages and API routes (App Router)
src/components/    ui primitives, layout, operations, lifecycle, matches
src/lib/           auth, prisma client, validation, lifecycle rules, exports
tests/             Jest suites (auth, API, validation, lifecycle)
```

## Roles

Seeded roles: `SUPER_ADMIN`, `MATCH_ADMIN`, `REQUEST_DESK_OPERATOR`, `DEPARTMENT_COORDINATOR`,
`APPROVAL_AUTHORITY`, `QUOTA_CONTROLLER`, `TICKET_ALLOCATION_OFFICER`, `DISTRIBUTION_OFFICER`,
`SENIOR_MANAGEMENT`, `AUDITOR`. Roles and permissions are managed at **Administration → Roles &
Permissions**; users at **Administration → Users**.

## Reporting

**Reports & analytics** shows live database aggregates with a match filter, and can:

- export CSV (formula-injection guarded),
- export Excel (two styled sheets),
- print a clean, chrome-free page with repeating table borders.

## Production readiness

Complete before exposing the application publicly:

- [ ] Review the initial Prisma migration (`20261124062341_init`). It is create-only: new databases
      apply it directly; existing populated databases must baseline with
      `prisma migrate resolve --applied 20261124062341_init` after confirming the schema matches,
      or use a hand-written transition migration. Production uses `prisma migrate deploy`
      (the `migrate` Compose service refuses to run `db push`).
- [ ] Provide unique production secrets: `DATABASE_URL`, `JWT_SECRET` (32+ chars),
      `POSTGRES_PASSWORD`, and an initial `ADMIN_INITIAL_PASSWORD` for first seeding only.
- [ ] Put TLS in front of the app (load balancer or reverse proxy) and serve over HTTPS.
- [ ] Implement MFA enrollment/verification before enabling MFA accounts (currently refused).
- [ ] Connect notification providers (SMTP/SMS/WhatsApp) and object storage if required.
- [ ] Replace the process-local login limiter with a shared rate limiter.
- [ ] Configure backups, monitoring, and log aggregation.
- [ ] Run an OWASP review and a load test at expected concurrency.

## Security notes

- Never commit `.env`, `.env.demo`, or credentials. They are git-ignored.
- Secrets are read from the environment at runtime and are not baked into Docker images
  (`.dockerignore` excludes environment files).
- API responses never include password hashes or MFA secrets.
- Database services are not published in the production Compose configuration.

## Scripts

| Command | Purpose |
|---|---|
| `node scripts/demo-db.cjs` | Create local DB/role, apply schema, seed, write `.env.demo` |
| `node scripts/start-demo.cjs` | Start the production build with `.env.demo` |
| `node scripts/check-demo.cjs` | Playwright login/dashboard/navigation/logout verification |
| `./deploy.sh check` | Validate Compose configuration |
| `./deploy.sh build` | Build application and migration images (no services started) |

## License

Internal project for the Andhra Cricket Association.
