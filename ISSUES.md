# ACA TicketOps — Issue checklist

Consolidated from `PRODUCTION_READINESS.md`, `PROJECT_SUMMARY.md`, and code review. Items are
checked only after the change is implemented **and verified**.

## Boundaries

- Commit/push authorized by the user on 2026-11-24 after verification, on the existing `master`
  branch, excluding secrets and build artifacts.
- Production deployment requires the user's host, domain, TLS, and production credentials.
- No forced audit fixes.

## A. Build and schema — complete

- [x] **1.** Prisma syntax error fixed; duplicate block removed.
- [x] **2.** Repeated `User` relations disambiguated with explicit relation names.
- [x] **3.** Default syntax verified (`now()`, `cuid()`); missing `AuditEvent.eventId` default added.
- [x] **4.** Missing RBAC/session models added (`Role`, `Permission`, `RolePermission`,
      `RoleAssignment`, `SessionToken`) plus seed-required unique keys.
- [x] **5.** `prisma format`, `validate`, `generate` succeed.
- [x] **6–9.** Approval, inventory, quota, and distribution routes typed and implemented
      (`/api/approvals` and `/api/distribution` now exist).
- [x] **10.** Dependency audit: Next 14.2.0 → **15.5.29**, Zod → **4.6.7**, `xlsx` → **ExcelJS
      4.4.0**, PostCSS override 8.5.23. No `audit fix --force`.
- [x] **11.** `type-check`, `lint`, `build`, and 138 tests pass; Compose validated.
- [x] **12.** Database-dependent checks run against an isolated PostgreSQL: schema applied,
      seeded, and APIs exercised.

## B. Application defects found in review — complete

- [x] **36. Authentication.** Login/session/logout endpoints; revocable hashed session tokens;
      no fallback JWT secret; inactive users rejected; permissions reloaded per request;
      middleware page protection; safe internal callbacks.
- [x] **37. API boundaries.** Zod validation on every route; bounded pagination; assignment and
      confirmation permissions enforced; client cannot set privileged statuses.
- [x] **38. Fabricated data removed.** Dashboard, matches, requests, requesters, inventory,
      quotas, allocations, approvals, distribution, reports, audit, admin users/roles/settings
      use real APIs with loading/error/empty states.
- [x] **39. Lifecycle APIs.** Approvals and distribution implemented with serializable
      transactions, guarded counters, and audit events.
- [x] **40. Navigation and usability.** Working mobile sidebar, logout, permission-filtered
      navigation; removed dead links and fake actions.
- [x] **41. Quality checks.** Jest configured; 138 tests across auth, API, validation, lifecycle.

## C. Management and reporting — complete

- [x] **42. Match management.** Create/edit/delete with venue selection; delete blocked when
      operational records exist.
- [x] **43. Venue capacity editing** via `PATCH /api/venues/:id` with audit.
- [x] **44. Inventory adjustment** via `PATCH /api/inventory/:id`; total cannot fall below
      allocated/issued/void; match total kept in sync.
- [x] **45. Reports export and print** — CSV (injection-guarded), Excel (styled), print CSS.
- [x] **46. Administrator identity** changed to `office@andhracricket.com`.

## D. Remaining for public production

- [ ] **47. Migration history.** An initial create-only migration (`20261124062341_init`) exists,
      generated against a scratch database and verified on a fresh one. **Important:** this is a
      create-only migration suitable for new databases. Upgrading an existing populated database
      requires either baselining (`prisma migrate resolve --applied 20261124062341_init`) after
      confirming the schema already matches, or a hand-written transition migration. Production
      still deploys with `prisma migrate deploy` (the Compose `migrate` service refuses `db push`).
- [ ] **48. Production secrets and TLS.** Supply unique secrets and HTTPS termination.
- [ ] **49. MFA enrollment and verification.** MFA-enabled accounts are currently refused at login.
- [ ] **50. Notification and storage integrations.** SMTP, SMS, WhatsApp, MinIO/S3 not connected.
- [ ] **51. Shared rate limiting.** Current limiter is process-local.
- [ ] **52. Observability and backups.** Monitoring, log aggregation, and backup automation.
- [ ] **53. OWASP review and load test** at expected concurrency.
- [ ] **54. Notifications and import/export screens.** These still display sample records; wire
      them to real endpoints or mark unavailable.
- [ ] **55. Residual dependency advisory.** `uuid@8.3.2` via ExcelJS (moderate); track upgrade.
