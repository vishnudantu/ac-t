# Production readiness — current state

This document reflects the verified state of the codebase. Historical completion claims have been
removed; see `README.md` for setup and architecture, and `ISSUES.md` for the detailed checklist.

## Verified

- Prisma schema validates and the client generates.
- `npm run type-check`, `npm run lint`, `npm run build`, and `npm test` (138 tests) pass.
- Browser verification: login → dashboard → requests/matches/inventory/quotas/approvals/
  distribution → logout, with no browser errors.
- Database-backed, revocable sessions; fresh permissions per request; no fallback JWT secret.
- Transactional approval, allocation confirmation, and issuance with concurrency guards.
- Match create/edit/delete (delete blocked when operational records exist).
- Venue capacity editing and inventory quantity adjustment with audit events.
- Live admin users/roles/settings, audit log, and reports with CSV/Excel/print output.

## Remaining before a public launch

1. **Migration review and baselining** — the committed initial migration
   (`prisma/migrations/20261124062341_init`) is **create-only** (new databases only). It has been
   verified against a fresh database but has not had a human SQL review. For an existing populated
   database, either baseline the migration after confirming the schema matches
   (`prisma migrate resolve --applied 20261124062341_init`) or write a transition migration.
   Production deploys with `prisma migrate deploy` — never `db push`.
2. **Secrets and TLS** — provide production `DATABASE_URL`, `JWT_SECRET`, `POSTGRES_PASSWORD`,
   `ADMIN_INITIAL_PASSWORD`, and HTTPS termination. No fallback secrets are permitted.
3. **MFA** — enrollment/verification not implemented; MFA-enabled accounts are refused at login.
4. **Integrations** — SMTP, SMS, WhatsApp, MinIO/S3 are not connected; Compose services are
   opt-in profiles only and the UI states these are unavailable.
5. **Rate limiting** — login limiter is process-local; use a shared limiter for replicas.
6. **Operations** — backups, monitoring, and log aggregation are not configured.
7. **Security review** — no formal OWASP audit or load test has been performed.

## Dependency audit

- `next` 15.5.29, `zod` 4.6.7, `exceljs` 4.4.0 (replacing vulnerable `xlsx`).
- `postcss` pinned to 8.5.23 via an override for the Next.js runtime.
- Remaining: `uuid@8.3.2` transitive through ExcelJS (moderate, `Missing buffer bounds check`).
  The importer does not pass attacker-controlled buffers to UUID; track for a future upgrade.

## Time to launch

Once the migration SQL has been human-reviewed and secrets and TLS are in place, the core
application can be deployed to a single container host. MFA, provider integrations, and
observability are separate workstreams.
